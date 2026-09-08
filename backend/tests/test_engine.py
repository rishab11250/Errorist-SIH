"""Engine tests for applicability, evidence sufficiency, and status precedence."""

from __future__ import annotations

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
from app.engine import overall_status, run_engine
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


def _complete_extracted() -> dict[str, ExtractedField]:
    return {
        "mrp": _ext("mrp", "MRP Rs.99.00 (Inclusive of all taxes)"),
        "net_quantity": _ext("net_quantity", "500 g"),
        "manufacturer_address": _ext("manufacturer_address", "ACME Plot 12 Mumbai 400001"),
        "consumer_care": _ext("consumer_care", "ACME care@acme.com +91 9876543210"),
        "mfg_date": _ext("mfg_date", "Mfg: 03/2026"),
    }


def _analysis(
    *,
    quality: str = "acceptable",
    extracted: dict[str, ExtractedField | None] | None = None,
    readability: dict[str, ReadabilityAssessment] | None = None,
    placement: dict[str, PlacementResult] | None = None,
) -> AnalysisInput:
    return AnalysisInput(
        extracted=extracted if extracted is not None else _complete_extracted(),
        quality=QualitySummary(quality, 90.0 if quality == "acceptable" else 30.0, (), ()),
        readability=readability or {},
        placement=placement or {},
    )


def _by_id(verdicts: list[Verdict]) -> dict[str, Verdict]:
    return {verdict.rule_id: verdict for verdict in verdicts}


def _verdict(status: str) -> Verdict:
    return Verdict(
        rule_id="test",
        status=status,
        severity="warning",
        citation="Rule 1",
        evidence="evidence",
        evidence_bboxes=[],
        failure_message=None,
        rule_version="test",
    )


def test_all_legacy_fields_pass_when_well_formed(rules: RulesConfig) -> None:
    by_id = _by_id(run_engine(_analysis(), rules, ScanContext()))
    assert by_id["r6_1_e_mrp"].status == "pass"
    assert by_id["r6_1_c_net_quantity"].status == "pass"
    assert by_id["r6_1_a_address"].status == "pass"
    assert by_id["r6_2_consumer_care"].status == "pass"
    assert by_id["r6_1_d_mfg_date"].status == "pass"


def test_mrp_fails_when_high_confidence_evidence_lacks_tax_phrase(
    rules: RulesConfig,
) -> None:
    extracted = _complete_extracted()
    extracted["mrp"] = _ext("mrp", "MRP Rs.99", conf=0.95)
    verdict = _by_id(run_engine(_analysis(extracted=extracted), rules, ScanContext()))["r6_1_e_mrp"]
    assert verdict.status == "fail"
    assert "tax_inclusive_phrase" in (verdict.failure_message or "")


def test_low_confidence_malformed_evidence_requires_review(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mrp"] = _ext("mrp", "MRP Rs.99", conf=0.55)
    verdict = _by_id(run_engine(_analysis(extracted=extracted), rules, ScanContext()))["r6_1_e_mrp"]
    assert verdict.status == "manual_review"


def test_consumer_care_fails_when_high_confidence_email_is_missing(
    rules: RulesConfig,
) -> None:
    extracted = _complete_extracted()
    extracted["consumer_care"] = _ext("consumer_care", "ACME Ph +91 9876543210", conf=0.95)
    verdict = _by_id(run_engine(_analysis(extracted=extracted), rules, ScanContext()))[
        "r6_2_consumer_care"
    ]
    assert verdict.status == "fail"


def test_mfg_date_is_skipped_for_food(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mfg_date"] = _ext("mfg_date", None)
    verdict = _by_id(
        run_engine(_analysis(extracted=extracted), rules, ScanContext(category="food"))
    )["r6_1_d_mfg_date"]
    assert verdict.status == "na"


def test_mfg_date_is_skipped_for_ecommerce(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mfg_date"] = _ext("mfg_date", None)
    verdict = _by_id(
        run_engine(
            _analysis(extracted=extracted),
            rules,
            ScanContext(mode="ecommerce_listing"),
        )
    )["r6_1_d_mfg_date"]
    assert verdict.status == "na"


def test_warns_between_ocr_confidence_thresholds(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mrp"] = _ext("mrp", "MRP Rs.99 (Inclusive of all taxes)", conf=0.65)
    verdict = _by_id(run_engine(_analysis(extracted=extracted), rules, ScanContext()))["r6_1_e_mrp"]
    assert verdict.status == "warn"


def test_low_ocr_confidence_requires_review(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mrp"] = _ext("mrp", "MRP Rs.99 (Inclusive of all taxes)", conf=0.55)
    verdict = _by_id(run_engine(_analysis(extracted=extracted), rules, ScanContext()))["r6_1_e_mrp"]
    assert verdict.status == "manual_review"


def test_missing_field_with_unreadable_evidence_requires_review(rules: RulesConfig) -> None:
    result = run_engine(_analysis(quality="retake_recommended", extracted={}), rules, ScanContext())
    assert _by_id(result)["r6_1_e_mrp"].status == "manual_review"


def test_missing_field_with_good_evidence_fails(rules: RulesConfig) -> None:
    result = run_engine(_analysis(quality="acceptable", extracted={}), rules, ScanContext())
    assert _by_id(result)["r6_1_e_mrp"].status == "fail"


def test_unknown_import_status_requires_review_for_import_only_rule(
    rules: RulesConfig,
) -> None:
    verdict = _by_id(run_engine(_analysis(), rules, ScanContext(imported=None)))[
        "r6_1_aa_country_origin"
    ]
    assert verdict.status == "manual_review"
    assert "context" in verdict.reasoning.lower()


def test_domestic_product_skips_import_only_rule(rules: RulesConfig) -> None:
    verdict = _by_id(run_engine(_analysis(), rules, ScanContext(imported=False)))[
        "r6_1_aa_country_origin"
    ]
    assert verdict.status == "na"


def test_readability_or_placement_uncertainty_requires_review(rules: RulesConfig) -> None:
    readability = ReadabilityAssessment(
        score=70,
        character_height_px=20,
        estimated_mm=None,
        error_mm=None,
        method="relative_readability",
        scale_confidence=0.5,
        status="manual_review",
        reasoning="Scale unavailable",
    )
    placement = PlacementResult(
        status="pass",
        relationship="inside_visible_panel",
        confidence=0.95,
        reasoning="Inside panel",
    )
    verdict = _by_id(
        run_engine(
            _analysis(readability={"mrp": readability}, placement={"mrp": placement}),
            rules,
            ScanContext(),
        )
    )["r6_1_e_mrp"]
    assert verdict.status == "manual_review"
    assert verdict.measurement_method == "relative_readability"


def test_every_verdict_has_reasoning_and_bounded_confidence(rules: RulesConfig) -> None:
    verdicts = run_engine(_analysis(), rules, ScanContext())
    assert all(verdict.reasoning for verdict in verdicts)
    assert all(0.0 <= verdict.confidence <= 1.0 for verdict in verdicts)


def test_overall_precedence() -> None:
    assert overall_status([_verdict("warn"), _verdict("manual_review")]) == "manual_review"
    assert overall_status([_verdict("manual_review"), _verdict("fail")]) == "fail"
    assert overall_status([_verdict("pass"), _verdict("warn")]) == "mixed"
    assert overall_status([_verdict("pass"), _verdict("na")]) == "pass"


def test_legacy_extracted_mapping_remains_supported(rules: RulesConfig) -> None:
    verdict = _by_id(run_engine(_complete_extracted(), rules, ScanContext()))["r6_1_e_mrp"]
    assert verdict.status == "pass"


def test_net_quantity_accepts_unit_attached_to_digits(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["net_quantity"] = _ext("net_quantity", "70g", conf=0.95)
    verdict = _by_id(run_engine(_analysis(extracted=extracted), rules, ScanContext()))[
        "r6_1_c_net_quantity"
    ]
    assert verdict.status == "pass"


def test_ecommerce_aggregate_visibility_passes_when_core_declarations_present(
    rules: RulesConfig,
) -> None:
    extracted = _complete_extracted()
    verdict = _by_id(
        run_engine(
            _analysis(extracted=extracted),
            rules,
            ScanContext(mode="ecommerce_listing"),
        )
    )["r6_10_ecommerce_declarations"]
    assert verdict.status == "pass"
    assert "All mandatory e-commerce declarations" in verdict.reasoning


def test_ecommerce_aggregate_visibility_fails_when_core_declaration_missing(
    rules: RulesConfig,
) -> None:
    extracted = _complete_extracted()
    extracted["mrp"] = _ext("mrp", None)
    verdict = _by_id(
        run_engine(
            _analysis(extracted=extracted),
            rules,
            ScanContext(mode="ecommerce_listing"),
        )
    )["r6_10_ecommerce_declarations"]
    assert verdict.status == "fail"
    assert "missing: mrp" in (verdict.failure_message or "")
