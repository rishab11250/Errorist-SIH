"""Confidence-aware LMPC rule engine."""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import date

from app.domain import (
    AnalysisInput,
    ApplicabilityDecision,
    CheckConfig,
    ExtractedField,
    MeasurementMethod,
    OverallStatus,
    PlacementResult,
    QualitySummary,
    ReadabilityAssessment,
    RulesConfig,
    ScanContext,
    Verdict,
    VerdictStatus,
)


def _context_value(context: ScanContext, name: str) -> object | None:
    value = getattr(context, name, None)
    if name == "category" and value == "unknown":
        return None
    return value


def _applicability(check: CheckConfig, context: ScanContext) -> ApplicabilityDecision:
    applies_when = check.applies_when
    required = applies_when.get("context_required", [])
    missing_context = [
        name for name in required if isinstance(name, str) and _context_value(context, name) is None
    ]
    if missing_context:
        return ApplicabilityDecision(
            has_required_context=False,
            skipped=False,
            reasoning=f"Required applicability context is unknown: {', '.join(missing_context)}.",
        )

    if check.skipped_when_category_in and context.category in check.skipped_when_category_in:
        return ApplicabilityDecision(True, True, "Rule is not applicable to this product category.")
    if check.skipped_when_mode and context.mode == check.skipped_when_mode:
        return ApplicabilityDecision(True, True, "Rule is not applicable to this evidence mode.")

    mode_in = applies_when.get("mode_in")
    if isinstance(mode_in, list) and context.mode not in mode_in:
        return ApplicabilityDecision(True, True, "Rule is not applicable to this evidence mode.")
    category_in = applies_when.get("category_in")
    if isinstance(category_in, list) and context.category not in category_in:
        return ApplicabilityDecision(True, True, "Rule is not applicable to this product category.")
    required_imported = applies_when.get("imported")
    if isinstance(required_imported, bool) and context.imported is not required_imported:
        return ApplicabilityDecision(True, True, "Rule is not applicable to this import status.")

    if check.effective_from:
        inspection_date = context.inspection_date or date.today()
        if inspection_date < date.fromisoformat(check.effective_from):
            return ApplicabilityDecision(
                True,
                True,
                f"Rule takes effect on {check.effective_from}.",
            )
    return ApplicabilityDecision(True, False, "Rule is applicable to the supplied context.")


def _subfield_present(check: CheckConfig, extracted: ExtractedField | None) -> dict[str, bool]:
    """Map configured required subfields to observed content evidence."""

    if extracted is None or extracted.value is None:
        return {subfield: False for subfield in check.requires}

    text = extracted.value
    if check.rule_id == "r6_1_e_mrp":
        return {
            "mrp_value": bool(re.search(r"\d", text)),
            "tax_inclusive_phrase": bool(
                check.tax_inclusive_phrase_regex
                and re.search(check.tax_inclusive_phrase_regex, text)
            ),
        }
    if check.rule_id == "r6_1_c_net_quantity":
        found_units = [m.lower() for m in re.findall(r"[a-zA-Z]+", text)]
        return {
            "net_quantity_value": bool(re.search(r"\d", text)),
            "net_quantity_unit": bool(
                check.requires_unit_in
                and any(unit.lower() in found_units for unit in check.requires_unit_in)
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
    return {subfield: bool(text.strip()) for subfield in check.requires}


UNIT_FACTORS: dict[str, tuple[str, float]] = {
    "g": ("mass", 1.0),
    "gm": ("mass", 1.0),
    "gms": ("mass", 1.0),
    "gram": ("mass", 1.0),
    "grams": ("mass", 1.0),
    "kg": ("mass", 1000.0),
    "kgs": ("mass", 1000.0),
    "kilogram": ("mass", 1000.0),
    "kilograms": ("mass", 1000.0),
    "ml": ("volume", 1.0),
    "millilitre": ("volume", 1.0),
    "milliliter": ("volume", 1.0),
    "l": ("volume", 1000.0),
    "lt": ("volume", 1000.0),
    "ltr": ("volume", 1000.0),
    "liter": ("volume", 1000.0),
    "litre": ("volume", 1000.0),
    "liters": ("volume", 1000.0),
    "litres": ("volume", 1000.0),
    "u": ("count", 1.0),
    "unit": ("count", 1.0),
    "units": ("count", 1.0),
    "piece": ("count", 1.0),
    "pieces": ("count", 1.0),
    "pc": ("count", 1.0),
    "pcs": ("count", 1.0),
    "n": ("count", 1.0),
}


def _validate_unit_sale_price(
    mrp_text: str | None,
    net_qty_text: str | None,
    usp_text: str | None,
    tolerance: float = 0.12,
) -> tuple[bool, str | None]:
    """Compare MRP / Net Quantity against declared USP within a relative tolerance."""
    if not mrp_text or not net_qty_text or not usp_text:
        return True, None

    m_mrp = re.search(r"(\d+(?:\.\d+)?)", mrp_text.replace(",", ""))
    m_qty = re.search(r"(\d+(?:\.\d+)?)\s*([a-zA-Z]+)", net_qty_text)
    m_usp = re.search(r"(\d+(?:\.\d+)?)\s*(?:/|per)\s*([a-zA-Z]+)", usp_text, re.I)
    if not (m_mrp and m_qty and m_usp):
        return True, None

    try:
        mrp_val = float(m_mrp.group(1))
        qty_val = float(m_qty.group(1))
        declared_usp = float(m_usp.group(1))
    except ValueError:
        return True, None

    if mrp_val <= 0 or qty_val <= 0 or declared_usp <= 0:
        return True, None

    qty_unit_raw = m_qty.group(2).lower()
    usp_unit_raw = m_usp.group(2).lower()
    qty_info = UNIT_FACTORS.get(qty_unit_raw)
    usp_info = UNIT_FACTORS.get(usp_unit_raw)
    if not qty_info or not usp_info or qty_info[0] != usp_info[0]:
        return True, None

    qty_in_base = qty_val * qty_info[1]
    expected_usp_in_base = mrp_val / qty_in_base
    expected_declared_usp = expected_usp_in_base * usp_info[1]

    denom = max(declared_usp, expected_declared_usp)
    diff = abs(declared_usp - expected_declared_usp) / denom
    if diff > tolerance:
        return (
            False,
            (
                f"Declared USP (Rs {declared_usp:.2f}/{usp_unit_raw}) differs from "
                f"calculated MRP/Net Qty (Rs {expected_declared_usp:.2f}/{usp_unit_raw})."
            ),
        )
    return True, None


def _legacy_analysis(extracted: dict[str, ExtractedField | None]) -> AnalysisInput:
    return AnalysisInput(
        extracted=extracted,
        quality=QualitySummary(status="acceptable", score=100.0, metrics=(), guidance=()),
        readability={},
        placement={},
    )


def _evidence_boxes(
    extracted: ExtractedField | None,
    readability: ReadabilityAssessment | None,
    placement: PlacementResult | None,
) -> list[tuple[float, float, float, float]]:
    boxes: list[tuple[float, float, float, float]] = []
    if extracted is not None:
        boxes.extend(extracted.evidence_spans)
        if not boxes and extracted.bbox is not None:
            boxes.append(extracted.bbox)
    if readability is not None:
        boxes.extend(readability.evidence_bboxes)
    if placement is not None:
        boxes.extend(placement.evidence_bboxes)
    return list(dict.fromkeys(boxes))


def _weakest_confidence(
    analysis: AnalysisInput,
    extracted: ExtractedField | None,
    readability: ReadabilityAssessment | None,
    placement: PlacementResult | None,
) -> float:
    values = [analysis.quality.score / 100.0]
    if extracted is not None and extracted.value is not None:
        values.append(extracted.confidence)
    if readability is not None:
        values.append(readability.scale_confidence)
    if placement is not None:
        values.append(placement.confidence)
    return round(max(0.0, min(1.0, min(values))), 4)


def _verdict(
    check: CheckConfig,
    rules: RulesConfig,
    *,
    status: VerdictStatus,
    reasoning: str,
    confidence: float,
    evidence: str = "",
    evidence_bboxes: list[tuple[float, float, float, float]] | None = None,
    measurement_method: MeasurementMethod = "not_measurable",
    failure_message: str | None = None,
) -> Verdict:
    return Verdict(
        rule_id=check.rule_id,
        status=status,
        severity=check.severity,
        citation=check.citation,
        evidence=evidence,
        evidence_bboxes=evidence_bboxes or [],
        failure_message=failure_message,
        rule_version=rules.version,
        confidence=max(0.0, min(1.0, confidence)),
        reasoning=reasoning,
        measurement_method=measurement_method,
    )


def _readability_rule_verdict(
    check: CheckConfig,
    analysis: AnalysisInput,
    rules: RulesConfig,
) -> Verdict:
    assessments = list(analysis.readability.values())
    if not assessments:
        return _verdict(
            check,
            rules,
            status="manual_review",
            reasoning="No declaration readability measurements are available.",
            confidence=analysis.quality.score / 100.0,
        )

    statuses = {assessment.status for assessment in assessments}
    if "fail" in statuses:
        status: VerdictStatus = "fail"
        reasoning = "At least one confident physical character-height measurement is below Rule 7."
    elif "manual_review" in statuses:
        status = "manual_review"
        reasoning = "At least one Rule 7 measurement requires manual review."
    elif "warn" in statuses:
        status = "warn"
        reasoning = "At least one declaration has a readability warning."
    else:
        status = "pass"
        reasoning = "All measured declarations satisfy the applicable readability policy."
    methods = {assessment.method for assessment in assessments}
    method: MeasurementMethod = next(iter(methods)) if len(methods) == 1 else "relative_readability"
    boxes = [box for assessment in assessments for box in assessment.evidence_bboxes]
    return _verdict(
        check,
        rules,
        status=status,
        reasoning=reasoning,
        confidence=min(assessment.scale_confidence for assessment in assessments),
        evidence="; ".join(assessment.reasoning for assessment in assessments),
        evidence_bboxes=list(dict.fromkeys(boxes)),
        measurement_method=method,
        failure_message=check.failure_message if status == "fail" else None,
    )


def _aggregate_visibility_rule_verdict(
    check: CheckConfig,
    analysis: AnalysisInput,
    context: ScanContext,
    rules: RulesConfig,
) -> Verdict:
    if context.mode != "ecommerce_listing":
        return _verdict(
            check,
            rules,
            status="na",
            reasoning="Rule is not applicable to this evidence mode.",
            confidence=1.0,
            evidence="Rule not applicable to supplied context",
        )

    core_declarations = ["mrp", "net_quantity", "manufacturer_address"]
    extracted = analysis.extracted
    missing_fields: list[str] = []
    found_evidence: list[str] = []
    boxes: list[tuple[float, float, float, float]] = []
    confidences: list[float] = [analysis.quality.score / 100.0]

    for field_name in core_declarations:
        field = extracted.get(field_name)
        if field is None or not field.value:
            missing_fields.append(field_name)
        else:
            found_evidence.append(f"{field_name}: {field.value}")
            confidences.append(field.confidence)
            if field.bbox is not None:
                boxes.append(field.bbox)
            boxes.extend(field.evidence_spans)

    for extra_field in [
        "consumer_care",
        "best_before",
        "common_name",
        "country_origin",
        "unit_price",
    ]:
        field = extracted.get(extra_field)
        if field is not None and field.value:
            found_evidence.append(f"{extra_field}: {field.value}")
            confidences.append(field.confidence)
            if field.bbox is not None:
                boxes.append(field.bbox)
            boxes.extend(field.evidence_spans)

    confidence = round(max(0.0, min(1.0, min(confidences))), 4)
    boxes = list(dict.fromkeys(boxes))
    evidence = "; ".join(found_evidence)

    if analysis.quality.status in {"retake_recommended", "unreadable"}:
        return _verdict(
            check,
            rules,
            status="manual_review",
            reasoning="Image quality is insufficient to support an automatic compliance decision.",
            confidence=confidence,
            evidence=evidence,
            evidence_bboxes=boxes,
        )

    if missing_fields:
        missing_str = ", ".join(missing_fields)
        return _verdict(
            check,
            rules,
            status="fail",
            reasoning=f"Listing evidence is missing mandatory declarations: {missing_str}.",
            confidence=confidence,
            evidence=evidence,
            evidence_bboxes=boxes,
            failure_message=f"{check.failure_message} (missing: {missing_str})",
        )

    return _verdict(
        check,
        rules,
        status="pass",
        reasoning=(
            "All mandatory e-commerce declarations are present and visible in the "
            "submitted listing."
        ),
        confidence=confidence,
        evidence=evidence,
        evidence_bboxes=boxes,
    )


def _verdict_for_check(
    check: CheckConfig,
    analysis: AnalysisInput,
    context: ScanContext,
    rules: RulesConfig,
) -> Verdict:
    applicability = _applicability(check, context)
    if not applicability.has_required_context:
        return _verdict(
            check,
            rules,
            status="manual_review",
            reasoning=applicability.reasoning,
            confidence=0.0,
        )
    if applicability.skipped:
        return _verdict(
            check,
            rules,
            status="na",
            reasoning=applicability.reasoning,
            confidence=1.0,
            evidence="Rule not applicable to supplied context",
        )
    if check.check_type == "readability":
        return _readability_rule_verdict(check, analysis, rules)
    if check.check_type == "aggregate_visibility":
        return _aggregate_visibility_rule_verdict(check, analysis, context, rules)

    extracted = analysis.extracted.get(check.field)
    readability = analysis.readability.get(check.field)
    placement = analysis.placement.get(check.field)
    subfields = _subfield_present(check, extracted)
    missing = [name for name, present in subfields.items() if not present]
    has_value = extracted is not None and extracted.value is not None
    high_confidence_malformed = bool(
        has_value
        and missing
        and extracted is not None
        and extracted.confidence >= rules.confidence_thresholds.pass_min
    )
    confidence = _weakest_confidence(analysis, extracted, readability, placement)
    method = readability.method if readability is not None else "not_measurable"
    boxes = _evidence_boxes(extracted, readability, placement)
    evidence = extracted.value if has_value and extracted is not None else ""

    if (
        analysis.quality.status in {"retake_recommended", "unreadable"}
        and not high_confidence_malformed
    ):
        return _verdict(
            check,
            rules,
            status="manual_review",
            reasoning="Image quality is insufficient to support an automatic compliance decision.",
            confidence=confidence,
            evidence=evidence,
            evidence_bboxes=boxes,
            measurement_method=method,
        )
    if not has_value and check.exemption:
        return _verdict(
            check,
            rules,
            status="manual_review",
            reasoning="Configured exemption facts are not established by the submitted evidence.",
            confidence=confidence,
            evidence_bboxes=boxes,
        )
    if (
        has_value
        and missing
        and extracted is not None
        and extracted.confidence < rules.confidence_thresholds.pass_min
    ):
        return _verdict(
            check,
            rules,
            status="manual_review",
            reasoning="OCR confidence is too low to prove that the declaration is malformed.",
            confidence=confidence,
            evidence=evidence,
            evidence_bboxes=boxes,
            measurement_method=method,
        )
    if not has_value or missing:
        detail = f" Missing or malformed: {', '.join(missing)}." if missing else ""
        return _verdict(
            check,
            rules,
            status="fail",
            reasoning=f"Sufficient image evidence does not show a compliant declaration.{detail}",
            confidence=confidence,
            evidence=evidence,
            evidence_bboxes=boxes,
            measurement_method=method,
            failure_message=(
                check.failure_message + (f" (missing: {', '.join(missing)})" if missing else "")
            ),
        )
    if extracted is not None and extracted.confidence < rules.confidence_thresholds.warn_min:
        return _verdict(
            check,
            rules,
            status="manual_review",
            reasoning="OCR confidence is below the automatic-decision threshold.",
            confidence=confidence,
            evidence=evidence,
            evidence_bboxes=boxes,
            measurement_method=method,
        )
    if (readability is not None and readability.status == "manual_review") or (
        placement is not None and placement.status == "manual_review"
    ):
        return _verdict(
            check,
            rules,
            status="manual_review",
            reasoning="Readability or placement evidence requires manual review.",
            confidence=confidence,
            evidence=evidence,
            evidence_bboxes=boxes,
            measurement_method=method,
        )
    if (readability is not None and readability.status == "fail") or (
        placement is not None and placement.status == "fail"
    ):
        return _verdict(
            check,
            rules,
            status="fail",
            reasoning=(
                "Confidence-qualified readability or placement evidence proves noncompliance."
            ),
            confidence=confidence,
            evidence=evidence,
            evidence_bboxes=boxes,
            measurement_method=method,
            failure_message=check.failure_message,
        )

    usp_mismatch_note: str | None = None
    if check.rule_id == "r6_11_unit_sale_price" and has_value and extracted is not None:
        mrp_field = analysis.extracted.get("mrp")
        net_qty_field = analysis.extracted.get("net_quantity")
        mrp_text = mrp_field.value if mrp_field else None
        qty_text = net_qty_field.value if net_qty_field else None
        valid, note = _validate_unit_sale_price(mrp_text, qty_text, extracted.value)
        if not valid:
            usp_mismatch_note = note

    warning_present = (
        analysis.quality.status == "usable_with_warnings"
        or (extracted is not None and extracted.confidence < rules.confidence_thresholds.pass_min)
        or (readability is not None and readability.status == "warn")
        or (placement is not None and placement.status == "warn")
        or (usp_mismatch_note is not None)
    )
    if usp_mismatch_note:
        reasoning = f"Declaration present with mathematical discrepancy: {usp_mismatch_note}"
    elif warning_present:
        reasoning = "The declaration is present, but one or more evidence signals carry a warning."
    else:
        reasoning = "The declaration and its available supporting evidence satisfy this rule."

    return _verdict(
        check,
        rules,
        status="warn" if warning_present else "pass",
        reasoning=reasoning,
        confidence=confidence,
        evidence=evidence,
        evidence_bboxes=boxes,
        measurement_method=method,
    )


def run_engine(
    analysis: AnalysisInput | dict[str, ExtractedField | None],
    rules: RulesConfig,
    context: ScanContext,
) -> list[Verdict]:
    """Evaluate every configured check without confusing uncertainty with failure."""

    normalized = _legacy_analysis(analysis) if isinstance(analysis, dict) else analysis
    return [_verdict_for_check(check, normalized, context, rules) for check in rules.checks]


def overall_status(verdicts: Iterable[Verdict]) -> OverallStatus:
    """Aggregate verdicts using the contract's fixed status precedence."""

    statuses = {verdict.status for verdict in verdicts}
    if "fail" in statuses:
        return "fail"
    if "manual_review" in statuses:
        return "manual_review"
    if "warn" in statuses:
        return "mixed"
    return "pass"
