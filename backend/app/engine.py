"""Rule engine: pure function mapping extracted fields + rules to verdicts."""
from __future__ import annotations

import re
from typing import Any

from app.domain import CheckConfig, ExtractedField, RulesConfig, ScanContext, Verdict


def _check_skipped(check: CheckConfig, ctx: ScanContext) -> bool:
    if check.skipped_when_category_in and ctx.category in check.skipped_when_category_in:
        return True
    return bool(check.skipped_when_mode and ctx.mode == check.skipped_when_mode)


def _subfield_present(check: CheckConfig, field: ExtractedField | None) -> dict[str, bool]:
    """Map a configured check's required subfields to their observed evidence."""
    if field is None or field.value is None:
        return {subfield: False for subfield in check.requires}

    text = field.value
    if check.rule_id == "r6_1_e_mrp":
        return {
            "mrp_value": bool(re.search(r"\d", text)),
            "tax_inclusive_phrase": bool(
                check.tax_inclusive_phrase_regex
                and re.search(check.tax_inclusive_phrase_regex, text)
            ),
        }
    if check.rule_id == "r6_1_c_net_quantity":
        return {
            "net_quantity_value": bool(re.search(r"\d", text)),
            "net_quantity_unit": bool(
                check.requires_unit_in
                and any(
                    unit.lower() == match.group(1).lower()
                    for unit in check.requires_unit_in
                    for match in re.finditer(r"\b([a-zA-Z]+)\b", text)
                )
            ),
        }
    if check.rule_id == "r6_1_a_address":
        return {
            "manufacturer_name": len(text) > 5,
            "address": len(text.split()) >= 3,
            "pin_code": bool(check.pin_code_regex and re.search(check.pin_code_regex, text)),
        }
    if check.rule_id == "r6_2_consumer_care":
        return {
            "consumer_care_name": len(text.split()) >= 2,
            "consumer_care_address": len(text.split()) >= 3,
            "consumer_care_phone": bool(check.phone_regex and re.search(check.phone_regex, text)),
            "consumer_care_email": bool(check.email_regex and re.search(check.email_regex, text)),
        }
    if check.rule_id == "r6_1_d_mfg_date":
        return {"mfg_date_value": bool(re.search(r"\d", text))}
    return {subfield: True for subfield in check.requires}


def _determine_status(subfields: dict[str, bool], confidence: float, thresholds: Any) -> str:
    """Map sub-field presence and OCR confidence to a verdict status."""
    if not all(subfields.values()):
        return "fail"
    if confidence >= thresholds.pass_min:
        return "pass"
    if confidence >= thresholds.warn_min:
        return "warn"
    return "fail"


def _verdict_for_check(
    check: CheckConfig,
    extracted_field: ExtractedField | None,
    ctx: ScanContext,
    rules: RulesConfig,
) -> Verdict:
    if _check_skipped(check, ctx):
        return Verdict(
            rule_id=check.rule_id,
            status="na",
            severity=check.severity,
            citation=check.citation,
            evidence="Rule skipped per statutory exemption",
            evidence_bboxes=[],
            failure_message=None,
            rule_version=rules.version,
        )

    subfields = _subfield_present(check, extracted_field)
    confidence = extracted_field.confidence if extracted_field else 0.0
    status = _determine_status(subfields, confidence, rules.confidence_thresholds)
    missing = [subfield for subfield, present in subfields.items() if not present]
    if status == "fail" and missing:
        message = check.failure_message + f" (missing: {', '.join(missing)})"
    elif status == "warn":
        message = "Soft fail — please retake photo (low OCR confidence)"
    else:
        message = None

    return Verdict(
        rule_id=check.rule_id,
        status=status,
        severity=check.severity,
        citation=check.citation,
        evidence=extracted_field.value if extracted_field else "",
        evidence_bboxes=list(extracted_field.evidence_spans) if extracted_field else [],
        failure_message=message,
        rule_version=rules.version,
    )


def run_engine(
    extracted: dict[str, ExtractedField],
    rules: RulesConfig,
    context: ScanContext,
) -> list[Verdict]:
    """Run each configured check against its extracted field."""
    return [
        _verdict_for_check(check, extracted.get(check.field), context, rules)
        for check in rules.checks
    ]
