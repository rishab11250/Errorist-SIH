"""Product identity extraction and cross-section consistency verification."""

from __future__ import annotations

import re
from typing import Sequence

from app.domain import OCRWord

KNOWN_BRANDS: set[str] = {
    "sunfeast", "yippee", "maggi", "knorr", "parle", "britannia", "amul", "cadbury",
    "colgate", "dettol", "lifebuoy", "surf excel", "ariel", "rin", "vim", "lizol",
    "harpic", "lays", "kurkure", "doritos", "pringles", "tropicana", "real", "frooti",
    "maaza", "slice", "thums up", "sprite", "coca-cola", "coca cola", "pepsi", "oreo",
    "good day", "marie gold", "bourbon", "5 star", "dairy milk", "kitkat", "munch",
    "perk", "haldiram", "haldiram's", "tata", "nestle", "dabur", "marico", "godrej",
    "patanjali", "fortune", "saffola", "aashirvaad", "bingo", "classmate", "vivel",
    "fiama", "savlon", "eveready", "bikaji", "mccain", "mtr", "everest", "mdh", "catch",
}

BRAND_AFFILIATIONS: dict[str, str] = {
    "sunfeast": "itc",
    "yippee": "itc",
    "aashirvaad": "itc",
    "bingo": "itc",
    "classmate": "itc",
    "vivel": "itc",
    "fiama": "itc",
    "savlon": "itc",
    "maggi": "nestle",
    "kitkat": "nestle",
    "munch": "nestle",
    "nescafe": "nestle",
    "lays": "pepsico",
    "kurkure": "pepsico",
    "doritos": "pepsico",
    "tropicana": "pepsico",
    "oreo": "mondelez",
    "cadbury": "mondelez",
    "dairy milk": "mondelez",
    "5 star": "mondelez",
    "bourbon": "britannia",
    "good day": "britannia",
    "marie gold": "britannia",
    "surf excel": "hul",
    "rin": "hul",
    "vim": "hul",
    "lifebuoy": "hul",
    "dettol": "reckitt",
    "harpic": "reckitt",
    "lizol": "reckitt",
}

FSSAI_REGEX = re.compile(r"\b(?:fssai|lic\.?\s*no\.?)[:\s]*([0-9]{14})\b|\b(1[0-9]{13})\b", re.I)
BARCODE_REGEX = re.compile(r"\b([0-9]{8}|[0-9]{12,14})\b")
BATCH_REGEX = re.compile(r"\b(?:batch|lot|b\.?\s*no\.?)[:\s]*([a-zA-Z0-9\/-]{4,15})\b", re.I)


def extract_product_anchors(words: Sequence[OCRWord]) -> dict[str, list[str]]:
    """Extract brand names, FSSAI licenses, barcodes, and batch numbers from OCR words."""
    joined = " ".join(w.text for w in words)
    lower_text = joined.lower()

    # 1. Brands
    detected_brands: set[str] = set()
    for brand in KNOWN_BRANDS:
        pattern = r"\b" + re.escape(brand) + r"\b"
        if re.search(pattern, lower_text):
            detected_brands.add(brand)

    # 2. FSSAI licenses
    fssai_matches: set[str] = set()
    for m in FSSAI_REGEX.finditer(joined):
        lic = m.group(1) or m.group(2)
        if lic and len(lic) == 14:
            fssai_matches.add(lic)

    # 3. Barcodes
    barcodes: set[str] = set()
    for w in words:
        # Check clean digits
        digits = re.sub(r"\D", "", w.text)
        if digits in BARCODE_REGEX.findall(digits) and len(digits) in (8, 12, 13, 14):
            barcodes.add(digits)

    # 4. Batch numbers
    batches: set[str] = set()
    for m in BATCH_REGEX.finditer(joined):
        b = m.group(1).strip()
        if len(b) >= 4 and not b.isdigit():  # Avoid matching bare numbers
            batches.add(b.upper())

    return {
        "brands": sorted(detected_brands),
        "fssai": sorted(fssai_matches),
        "barcodes": sorted(barcodes),
        "batches": sorted(batches),
    }


def verify_product_consistency(
    sections: Sequence[Sequence[OCRWord]],
) -> tuple[bool, str | None]:
    """Verify that multiple scanned sections belong to the exact same product."""
    if len(sections) <= 1:
        return True, None

    section_anchors = [extract_product_anchors(s) for s in sections]

    # 1. Check FSSAI License conflicts
    fssai_by_sec = [a["fssai"] for a in section_anchors if a["fssai"]]
    if len(fssai_by_sec) > 1:
        first_fssai = set(fssai_by_sec[0])
        for other in fssai_by_sec[1:]:
            other_set = set(other)
            if not first_fssai.intersection(other_set):
                return (
                    False,
                    f"Conflicting FSSAI license numbers detected across sections "
                    f"({', '.join(first_fssai)} vs {', '.join(other_set)}). "
                    "All captured sections must belong to the same package.",
                )

    # 2. Check Barcode conflicts
    barcode_by_sec = [a["barcodes"] for a in section_anchors if a["barcodes"]]
    if len(barcode_by_sec) > 1:
        first_barcodes = set(barcode_by_sec[0])
        for other in barcode_by_sec[1:]:
            other_set = set(other)
            if not first_barcodes.intersection(other_set):
                return (
                    False,
                    f"Conflicting barcodes detected across sections "
                    f"({', '.join(first_barcodes)} vs {', '.join(other_set)}). "
                    "All captured sections must belong to the same package.",
                )

    # 3. Check Batch number conflicts
    batch_by_sec = [a["batches"] for a in section_anchors if a["batches"]]
    if len(batch_by_sec) > 1:
        first_batches = set(batch_by_sec[0])
        for other in batch_by_sec[1:]:
            other_set = set(other)
            if not first_batches.intersection(other_set):
                return (
                    False,
                    f"Conflicting batch numbers detected across sections "
                    f"({', '.join(first_batches)} vs {', '.join(other_set)}). "
                    "All captured sections must belong to the same package.",
                )

    # 4. Check Brand conflicts
    brand_by_sec = [a["brands"] for a in section_anchors if a["brands"]]
    if len(brand_by_sec) > 1:
        for i in range(len(brand_by_sec)):
            for j in range(i + 1, len(brand_by_sec)):
                brands_i = set(brand_by_sec[i])
                brands_j = set(brand_by_sec[j])
                # If they share any brand, they agree
                if brands_i.intersection(brands_j):
                    continue
                # Check if they belong to different parent affiliations
                affils_i = {BRAND_AFFILIATIONS.get(b, b) for b in brands_i}
                affils_j = {BRAND_AFFILIATIONS.get(b, b) for b in brands_j}
                if not affils_i.intersection(affils_j):
                    return (
                        False,
                        f"Incompatible brands detected across sections "
                        f"('{', '.join(brands_i)}' vs '{', '.join(brands_j)}'). "
                        "All captured sections must belong to the same product.",
                    )

    return True, None
