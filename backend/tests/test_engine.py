"""Engine tests covering pass, fail, warn, na states."""
from __future__ import annotations

import pytest

from app.domain import ExtractedField, RulesConfig, ScanContext
from app.engine import run_engine
from app.rules_loader import load_rules

RULES_PATH = "backend/app/rules.yaml"


@pytest.fixture(scope="module")
def rules() -> RulesConfig:
    return load_rules(RULES_PATH)


def _ext(name: str, value: str | None, conf: float = 0.9) -> ExtractedField:
    return ExtractedField(name=name, value=value, bbox=(0, 0, 100, 20), confidence=conf, evidence_spans=[])


def _complete_extracted() -> dict[str, ExtractedField]:
    return {
        "mrp": _ext("mrp", "MRP Rs.99.00 (Inclusive of all taxes)"),
        "net_quantity": _ext("net_quantity", "500 g"),
        "manufacturer_address": _ext("manufacturer_address", "ACME Plot 12 Mumbai 400001"),
        "consumer_care": _ext("consumer_care", "ACME care@acme.com +91 9876543210"),
        "mfg_date": _ext("mfg_date", "Mfg: 03/2026"),
    }


def test_all_pass_when_all_fields_well_formed(rules: RulesConfig) -> None:
    verdicts = run_engine(_complete_extracted(), rules, ScanContext())
    by_id = {verdict.rule_id: verdict for verdict in verdicts}
    assert by_id["r6_1_e_mrp"].status == "pass"
    assert by_id["r6_1_c_net_quantity"].status == "pass"
    assert by_id["r6_1_a_address"].status == "pass"
    assert by_id["r6_2_consumer_care"].status == "pass"
    assert by_id["r6_1_d_mfg_date"].status == "pass"


def test_mrp_fail_when_no_tax_inclusive_phrase(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mrp"] = _ext("mrp", "MRP Rs.99")
    by_id = {verdict.rule_id: verdict for verdict in run_engine(extracted, rules, ScanContext())}
    assert by_id["r6_1_e_mrp"].status == "fail"
    assert "tax_inclusive_phrase" in (by_id["r6_1_e_mrp"].failure_message or "")


def test_consumer_care_fail_when_email_missing(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["consumer_care"] = _ext("consumer_care", "ACME Ph +91 9876543210")
    by_id = {verdict.rule_id: verdict for verdict in run_engine(extracted, rules, ScanContext())}
    assert by_id["r6_2_consumer_care"].status == "fail"


def test_mfg_date_skipped_for_food(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mfg_date"] = _ext("mfg_date", None)
    by_id = {verdict.rule_id: verdict for verdict in run_engine(extracted, rules, ScanContext(category="food"))}
    assert by_id["r6_1_d_mfg_date"].status == "na"


def test_mfg_date_skipped_for_ecommerce(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mfg_date"] = _ext("mfg_date", None)
    by_id = {
        verdict.rule_id: verdict
        for verdict in run_engine(extracted, rules, ScanContext(mode="ecommerce_listing"))
    }
    assert by_id["r6_1_d_mfg_date"].status == "na"


def test_warn_when_confidence_between_thresholds(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mrp"] = _ext("mrp", "MRP Rs.99 (Inclusive of all taxes)", conf=0.65)
    by_id = {verdict.rule_id: verdict for verdict in run_engine(extracted, rules, ScanContext())}
    assert by_id["r6_1_e_mrp"].status == "warn"


def test_fail_when_confidence_below_warn_threshold(rules: RulesConfig) -> None:
    extracted = _complete_extracted()
    extracted["mrp"] = _ext("mrp", "MRP Rs.99 (Inclusive of all taxes)", conf=0.55)
    by_id = {verdict.rule_id: verdict for verdict in run_engine(extracted, rules, ScanContext())}
    assert by_id["r6_1_e_mrp"].status == "fail"
