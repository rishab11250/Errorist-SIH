"""Product identity normalization, fingerprinting, and matching engine."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from rapidfuzz import fuzz
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import Product

AUTO_MATCH_THRESHOLD: float = 90.0
SUGGESTED_MATCH_THRESHOLD: float = 75.0
MAX_SUGGESTED_CANDIDATES: int = 3

_PUNCTUATION_RE = re.compile(r"[^\w\s]", re.UNICODE)
_WHITESPACE_RE = re.compile(r"\s+")
_NET_QUANTITY_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(g|kg|ml|l|gm|gms|Kg|KG|L|mL|ML|litre|liter|litres|liters)\b",
    re.IGNORECASE,
)
_MFG_PREFIX_RE = re.compile(
    r"^(?:manufactured\s+by|mfd(?:\.|\s+by)?|mfg(?:\.|\s+by)?|marketed\s+by|packed\s+by|pkg(?:\.|\s+by)?|mktd(?:\.|\s+by)?|imported\s+by|produced\s+by|brand\s+owner|licensor|processor)\s*[:\-]?\s*",
    re.IGNORECASE,
)


def normalize_identity_string(value: str | None) -> str:
    """Lowercase, normalize punctuation and whitespace, collapse internal spaces."""
    if not value:
        return ""
    # Normalize unicode to NFKD
    text = unicodedata.normalize("NFKD", value)
    text = text.lower().strip()
    # Replace punctuation with single space
    text = _PUNCTUATION_RE.sub(" ", text)
    # Collapse multiple spaces
    text = _WHITESPACE_RE.sub(" ", text)
    return text.strip()


def parse_net_quantity(raw_value: str | None) -> tuple[float | None, str | None]:
    """Parse net quantity into numeric value and normalized metric unit."""
    if not raw_value:
        return None, None
    match = _NET_QUANTITY_RE.search(raw_value)
    if not match:
        return None, None
    val_str, unit_str = match.groups()
    try:
        val = float(val_str)
    except ValueError:
        return None, None

    u = unit_str.lower()
    if u in ("g", "gm", "gms"):
        unit = "g"
    elif u == "kg":
        unit = "kg"
    elif u in ("ml", "millilitre", "milliliter"):
        unit = "ml"
    elif u in ("l", "litre", "liter", "litres", "liters"):
        unit = "l"
    else:
        unit = u

    return val, unit


def clean_manufacturer_name(raw_mfg: str | None) -> str:
    """Extract clean manufacturer/brand company name from address string."""
    if not raw_mfg:
        return ""
    text = raw_mfg.strip()
    # Strip common leading prefix
    text = _MFG_PREFIX_RE.sub("", text).strip()
    # Cut off at first comma, newline, or typical address keywords
    split_parts = re.split(
        r",|\n|;|\b(?:at|plot\s+no|survey\s+no|village|road|post|dist|district|pin|regd\.?\s*off)\b",
        text,
        flags=re.IGNORECASE,
    )
    first_part = split_parts[0].strip() if split_parts else text
    return first_part or text


def compute_fingerprint(
    manufacturer_name: str | None,
    common_name: str | None,
    net_quantity_value: float | None,
    net_quantity_unit: str | None,
    category: str | None,
) -> tuple[str, str]:
    """Calculate exact SHA-256 fingerprint and normalized search key from identity fields.

    Comparison fields (MRP, consumer care, mfg date, batch, etc.) MUST NOT be included.
    """
    norm_mfg = normalize_identity_string(manufacturer_name)
    norm_name = normalize_identity_string(common_name)
    norm_val = f"{net_quantity_value:g}" if net_quantity_value is not None else ""
    norm_unit = normalize_identity_string(net_quantity_unit)
    norm_cat = normalize_identity_string(category)

    # Canonical fixed-order representation
    canonical_repr = f"{norm_mfg}|{norm_name}|{norm_val}|{norm_unit}|{norm_cat}"
    fingerprint_exact = hashlib.sha256(canonical_repr.encode("utf-8")).hexdigest()

    # Search key for fuzzy token matching
    tokens = [part for part in (norm_mfg, norm_name, f"{norm_val}{norm_unit}".strip(), norm_cat) if part]
    search_key = " ".join(tokens)

    return fingerprint_exact, search_key


@dataclass
class IdentityCandidate:
    product: Product
    score: float


def resolve_product_identity(
    session: Session,
    *,
    manufacturer_name: str | None,
    common_name: str | None,
    net_quantity_value: float | None,
    net_quantity_unit: str | None,
    category: str | None,
    auto_match_threshold: float = AUTO_MATCH_THRESHOLD,
    suggested_threshold: float = SUGGESTED_MATCH_THRESHOLD,
    max_candidates: int = MAX_SUGGESTED_CANDIDATES,
) -> tuple[Product | None, str, list[dict[str, Any]]]:
    """Resolve product identity per PRD Section 15.

    Returns:
        (product, match_status, candidates_list)
        where match_status in ('auto_matched', 'suggested', 'unmatched')
    """
    fingerprint_exact, search_key = compute_fingerprint(
        manufacturer_name=manufacturer_name,
        common_name=common_name,
        net_quantity_value=net_quantity_value,
        net_quantity_unit=net_quantity_unit,
        category=category,
    )

    # Step 1 — Exact match
    exact_product = session.scalar(
        select(Product).where(Product.fingerprint_exact == fingerprint_exact)
    )
    if exact_product is not None:
        return exact_product, "auto_matched", []

    # Step 2 — Candidate filtering (filter by quantity or category or manufacturer to avoid table scans)
    candidate_query = select(Product)
    filters = []
    if net_quantity_value is not None and net_quantity_unit:
        filters.append(
            (Product.net_quantity_value == net_quantity_value)
            & (Product.net_quantity_unit == net_quantity_unit)
        )
    if category and category != "unknown":
        filters.append(Product.category == category)

    if filters:
        candidate_query = candidate_query.where(or_(*filters))

    # Limit candidate pool
    candidates = session.scalars(candidate_query.limit(100)).all()

    # Step 3 — Fuzzy matching
    scored_candidates: list[IdentityCandidate] = []
    if search_key:
        for cand in candidates:
            score = float(fuzz.token_sort_ratio(search_key, cand.search_key))
            if score >= suggested_threshold:
                scored_candidates.append(IdentityCandidate(product=cand, score=score))

    scored_candidates.sort(key=lambda item: item.score, reverse=True)

    # Check top candidate for auto-match (>= 90)
    if scored_candidates and scored_candidates[0].score >= auto_match_threshold:
        return scored_candidates[0].product, "auto_matched", []

    # Check for suggested candidates (75 <= score < 90)
    if scored_candidates:
        top_candidates = scored_candidates[:max_candidates]
        candidate_dicts = [
            {
                "product_id": str(item.product.id),
                "score": round(item.score, 1),
                "similarity_score": round(item.score, 1),
                "id": str(item.product.id),
                "manufacturer": item.product.manufacturer_name,
                "common_name": item.product.common_name,
                "quantity": f"{item.product.net_quantity_value:g}" if item.product.net_quantity_value is not None else None,
                "unit": item.product.net_quantity_unit,
                "category": item.product.category,
                "scan_count": item.product.scan_count,
            }
            for item in top_candidates
        ]
        return None, "suggested", candidate_dicts

    # Score < 75 -> Create new Product
    new_product = Product(
        fingerprint_exact=fingerprint_exact,
        search_key=search_key,
        manufacturer_name=clean_manufacturer_name(manufacturer_name) or manufacturer_name,
        common_name=common_name,
        net_quantity_value=net_quantity_value,
        net_quantity_unit=net_quantity_unit,
        category=category,
        scan_count=0,
    )
    session.add(new_product)
    try:
        session.flush()
    except IntegrityError:
        # Concurrency safety (PRD Section 45): re-query on duplicate fingerprint
        session.rollback()
        existing = session.scalar(
            select(Product).where(Product.fingerprint_exact == fingerprint_exact)
        )
        if existing is not None:
            return existing, "auto_matched", []
        raise

    return new_product, "auto_matched", []
