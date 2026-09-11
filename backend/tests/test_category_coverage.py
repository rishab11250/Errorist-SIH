"""Tests for category-specific rule engine behavior, applicability, and exemptions.

Covers:
- Food: skips mfg_date, requires best_before, skips dimensions
- Cosmetics: skips mfg_date, skips best_before, skips dimensions
- Seeds: skips mfg_date, skips best_before, skips dimensions
- Non-food: requires mfg_date, skips best_before, requires dimensions in retail mode
- Imported goods: requires country_origin and importer_address; skipped when imported=False
- E-commerce mode: skips mfg_date, skips font size, enforces aggregate visibility
- Small-pack USP exemptions: <=10g/ml exempts unit_sale_price across categories
"""

from __future__ import annotations

from datetime import date

import pytest

from app.domain import (
    AnalysisInput,
    ExtractedField,
    PlacementResult,
    QualitySummary,
    ReadabilityAssessment,
    RulesConfig,
    ScanContext,
    Verdict,
)
from app.engine import run_engine
from app.rules_loader import load_rules

RULES_PATH = "backend/app/rules.yaml"


@pytest.fixture(scope="module")
def rules() -> RulesConfig:
    return load_rules(RULES_PATH)


def _ext(name: str, value: str | None, conf: float = 0.9) -> ExtractedField:
    return ExtractedField(
        name=name,
        value=value,
        bbox=(0.1, 0.1, 0.3, 0.05),
        confidence=conf,
        evidence_spans=[(0.1, 0.1, 0.3, 0.05)],
    )


def _complete_extracted() -> dict[str, ExtractedField | None]:
    return {
        "mrp": _ext("mrp", "MRP Rs.99.00 (Inclusive of all taxes)"),
        "net_quantity": _ext("net_quantity", "500 g"),
        "manufacturer_address": _ext(
            "manufacturer_address",
            "ACME Ltd, Plot 12 Industrial Area, Mumbai 400001",
        ),
        "consumer_care": _ext(
            "consumer_care",
            "ACME Care Manager, Plot 12 Mumbai, care@acme.com +91 9876543210",
        ),
        "mfg_date": _ext("mfg_date", "Mfg: 03/2026"),
        "common_name": _ext("common_name", "Washing Powder"),
        "best_before": _ext("best_before", "Best before 12 months from manufacture"),
        "dimensions": _ext("dimensions", "10 cm x 5 cm x 2 cm"),
        "country_origin": _ext("country_origin", "India"),
        "importer_address": _ext(
            "importer_address",
            "Global Import Ltd, 5th Floor, Nariman Point, Mumbai 400021",
        ),
        "unit_price": _ext("unit_price", "Rs. 0.20 / g"),
    }


def _analysis(
    *,
    extracted: dict[str, ExtractedField | None] | None = None,
    quality: str = "acceptable",
    score: float = 95.0,
    readability: dict[str, ReadabilityAssessment] | None = None,
    placement: dict[str, PlacementResult] | None = None,
) -> AnalysisInput:
    return AnalysisInput(
        extracted=extracted if extracted is not None else _complete_extracted(),
        quality=QualitySummary(quality, score, (), ()),
        readability=readability or {},
        placement=placement or {},
    )


def _by_id(verdicts: list[Verdict]) -> dict[str, Verdict]:
    return {verdict.rule_id: verdict for verdict in verdicts}


# ============================================================================
# Cosmetics Category Tests
# ============================================================================


def test_cosmetics_skips_mfg_date_and_dimensions_and_best_before(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mfg_date"] = None
    extracted["best_before"] = None
    extracted["dimensions"] = None

    ctx = ScanContext(category="cosmetics", mode="retail_image", imported=False)
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    # Rule 6(1)(d) skipped for cosmetics
    assert verdicts["r6_1_d_mfg_date"].status == "na"
    assert "not applicable to this product category" in verdicts["r6_1_d_mfg_date"].reasoning

    # Rule 6(1)(da) best before only applies to food
    assert verdicts["r6_1_da_best_before"].status == "na"

    # Rule 6(1)(f) dimensions only applies to non_food
    assert verdicts["r6_1_f_dimensions"].status == "na"

    # Core mandatory declarations still apply and pass
    assert verdicts["r6_1_e_mrp"].status == "pass"
    assert verdicts["r6_1_c_net_quantity"].status == "pass"
    assert verdicts["r6_1_a_address"].status == "pass"
    assert verdicts["r6_2_consumer_care"].status == "pass"
    assert verdicts["r6_1_b_common_name"].status == "pass"


def test_cosmetics_fails_when_mrp_is_missing(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mrp"] = None

    ctx = ScanContext(category="cosmetics", mode="retail_image", imported=False)
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    assert verdicts["r6_1_e_mrp"].status in ("fail", "manual_review")


# ============================================================================
# Seeds Category Tests
# ============================================================================


def test_seeds_skips_mfg_date_and_dimensions_and_best_before(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mfg_date"] = None
    extracted["best_before"] = None
    extracted["dimensions"] = None

    ctx = ScanContext(category="seeds", mode="retail_image", imported=False)
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    assert verdicts["r6_1_d_mfg_date"].status == "na"
    assert verdicts["r6_1_da_best_before"].status == "na"
    assert verdicts["r6_1_f_dimensions"].status == "na"
    assert verdicts["r6_1_e_mrp"].status == "pass"
    assert verdicts["r6_1_c_net_quantity"].status == "pass"


# ============================================================================
# Food Category Tests
# ============================================================================


def test_food_skips_mfg_date_but_requires_best_before(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mfg_date"] = None
    extracted["best_before"] = _ext("best_before", "Best before 6 months from packaging")

    ctx = ScanContext(category="food", mode="retail_image", imported=False)
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    # Mfg date skipped under FSSAI precedence
    assert verdicts["r6_1_d_mfg_date"].status == "na"

    # Best before applies to food and passes
    assert verdicts["r6_1_da_best_before"].status == "pass"

    # Dimensions skipped for food
    assert verdicts["r6_1_f_dimensions"].status == "na"


def test_food_fails_when_best_before_is_missing(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["best_before"] = None

    ctx = ScanContext(category="food", mode="retail_image", imported=False)
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    assert verdicts["r6_1_da_best_before"].status in ("fail", "manual_review")


# ============================================================================
# Non-Food Category Tests
# ============================================================================


def test_non_food_requires_mfg_date_and_dimensions(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mfg_date"] = _ext("mfg_date", "Mfg: 01/2026")
    extracted["dimensions"] = _ext("dimensions", "15 cm x 10 cm")

    ctx = ScanContext(category="non_food", mode="retail_image", imported=False)
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    # Mfg date applies to non_food
    assert verdicts["r6_1_d_mfg_date"].status == "pass"

    # Dimensions apply to non_food retail products
    assert verdicts["r6_1_f_dimensions"].status == "pass"

    # Best before does NOT apply to non_food
    assert verdicts["r6_1_da_best_before"].status == "na"


def test_non_food_fails_when_mfg_date_missing(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mfg_date"] = None

    ctx = ScanContext(category="non_food", mode="retail_image", imported=False)
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    assert verdicts["r6_1_d_mfg_date"].status in ("fail", "manual_review")


# ============================================================================
# Imported Goods Applicability Tests
# ============================================================================


def test_imported_goods_require_country_of_origin_and_importer_address(
    rules: RulesConfig,
) -> None:
    extracted = _complete_extracted()
    ctx = ScanContext(category="non_food", mode="retail_image", imported=True)
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    assert verdicts["r6_1_aa_country_origin"].status == "pass"
    assert verdicts["r6_1_a_importer_address"].status == "pass"


def test_domestic_goods_skip_country_of_origin_and_importer_address(
    rules: RulesConfig,
) -> None:
    extracted = _complete_extracted()
    ctx = ScanContext(category="non_food", mode="retail_image", imported=False)
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    assert verdicts["r6_1_aa_country_origin"].status == "na"
    assert verdicts["r6_1_a_importer_address"].status == "na"


def test_unknown_imported_status_triggers_manual_review(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    ctx = ScanContext(category="non_food", mode="retail_image", imported=None)
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    assert verdicts["r6_1_aa_country_origin"].status == "manual_review"
    assert "imported" in verdicts["r6_1_aa_country_origin"].reasoning
    assert verdicts["r6_1_a_importer_address"].status == "manual_review"


# ============================================================================
# E-Commerce Mode Applicability Tests
# ============================================================================


def test_ecommerce_mode_skips_mfg_date_and_dimensions_and_font_size(
    rules: RulesConfig,
) -> None:
    extracted = _complete_extracted()
    ctx = ScanContext(category="non_food", mode="ecommerce_listing", imported=False)
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    # Rule 6(1)(d) skipped in ecommerce mode
    assert verdicts["r6_1_d_mfg_date"].status == "na"

    # Rule 6(1)(f) dimensions only applies to retail_image
    assert verdicts["r6_1_f_dimensions"].status == "na"

    # Rule 7 font size only applies to physical retail packages
    assert verdicts["r7_font_size"].status == "na"

    # Rule 6(10) ecommerce aggregate visibility applies
    assert verdicts["r6_10_ecommerce_declarations"].status == "pass"


# ============================================================================
# Small Pack / Single Item Unit Sale Price Exemption Tests
# ============================================================================


@pytest.mark.parametrize(
    ("net_qty_str", "category"),
    [
        ("5 g", "food"),
        ("10 g", "food"),
        ("8 ml", "cosmetics"),
        ("10 ml", "cosmetics"),
        ("5 g", "seeds"),
        ("1 unit", "non_food"),
        ("1 piece", "non_food"),
    ],
)
def test_small_pack_exempt_from_unit_sale_price(
    rules: RulesConfig,
    net_qty_str: str,
    category: str,
) -> None:
    extracted = _complete_extracted()
    extracted["net_quantity"] = _ext("net_quantity", net_qty_str)
    extracted["unit_price"] = None  # No USP declared

    ctx = ScanContext(
        category=category,  # type: ignore[arg-type]
        mode="retail_image",
        imported=False,
        inspection_date=date(2026, 3, 1),
    )
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    usp_verdict = verdicts["r6_11_unit_sale_price"]
    assert usp_verdict.status == "na"
    assert "exempt" in usp_verdict.reasoning.lower()


def test_large_pack_without_unit_sale_price_fails(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["net_quantity"] = _ext("net_quantity", "500 g")
    extracted["unit_price"] = None  # No USP declared on 500g package

    ctx = ScanContext(
        category="food",
        mode="retail_image",
        imported=False,
        inspection_date=date(2026, 3, 1),
    )
    verdicts = _by_id(run_engine(_analysis(extracted=extracted), rules, ctx))

    usp_verdict = verdicts["r6_11_unit_sale_price"]
    assert usp_verdict.status in ("fail", "manual_review")
