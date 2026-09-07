"""Confidence-aware spatial evaluation for declaration evidence."""

from __future__ import annotations

from collections.abc import Mapping

from app.domain import (
    ExtractedField,
    Mode,
    PanelEstimate,
    PlacementResult,
    RulesConfig,
    ScanContext,
)
from app.placement.geometry import BBox, area, edge_distance, inside_ratio, intersection, union

MIN_PANEL_CONFIDENCE = 0.80
INSIDE_RATIO_PASS = 0.98
EDGE_CLIP_TOLERANCE = 0.01
RELATED_GAP_MAX = 0.08
UNRELATED_OVERLAP_IOU_WARN = 0.25


def _evidence_box(field: ExtractedField) -> BBox | None:
    boxes = _raw_evidence_boxes(field)
    if not boxes:
        return None
    result = boxes[0]
    for box in boxes[1:]:
        result = union(result, box)
    return result


def _raw_evidence_boxes(field: ExtractedField) -> list[BBox]:
    boxes = list(field.evidence_spans)
    if not boxes and field.bbox is not None:
        boxes = [field.bbox]
    return boxes


def _complete_in_viewport(box: BBox) -> bool:
    x, y, width, height = box
    return width > 0 and height > 0 and x >= 0 and y >= 0 and x + width <= 1 and y + height <= 1


def _image_edge_distance(box: BBox) -> float:
    x, y, width, height = box
    return min(x, y, 1.0 - (x + width), 1.0 - (y + height))


def _iou(first: BBox, second: BBox) -> float:
    overlap = area(intersection(first, second))
    combined = area(first) + area(second) - overlap
    return overlap / combined if combined > 0 else 0.0


def _result(
    *,
    status: str,
    relationship: str,
    confidence: float,
    reasoning: str,
    evidence: tuple[BBox, ...],
) -> PlacementResult:
    return PlacementResult(
        status=status,
        relationship=relationship,
        confidence=max(0.0, min(1.0, confidence)),
        reasoning=reasoning,
        evidence_bboxes=evidence,
    )


def evaluate_placement(
    field: ExtractedField,
    panel: PanelEstimate | None,
    related_fields: Mapping[str, ExtractedField | None],
    mode: Mode,
    *,
    unrelated_fields: Mapping[str, ExtractedField | None] | None = None,
) -> PlacementResult:
    """Evaluate visibility, clipping, association, and possible obscuring."""

    field_box = _evidence_box(field)
    if field_box is None:
        return _result(
            status="manual_review",
            relationship="evidence_position_unknown",
            confidence=field.confidence,
            reasoning="No normalized evidence box is available for placement analysis.",
            evidence=(),
        )

    if mode == "ecommerce_listing":
        complete = all(_complete_in_viewport(box) for box in _raw_evidence_boxes(field))
        return _result(
            status="pass" if complete else "fail",
            relationship="visible_in_submitted_screenshot",
            confidence=field.confidence,
            reasoning=(
                "The complete declaration is visible in the submitted screenshot."
                if complete
                else (
                    "The declaration is clipped by the submitted screenshot; "
                    "no claim is made about the live listing."
                )
            ),
            evidence=(field_box,),
        )

    if panel is None or panel.confidence < MIN_PANEL_CONFIDENCE:
        confidence = panel.confidence if panel is not None else 0.0
        return _result(
            status="manual_review",
            relationship="inside_visible_panel",
            confidence=confidence,
            reasoning=(
                "The visible package panel could not be estimated with sufficient confidence."
            ),
            evidence=(field_box,),
        )

    panel_containment = inside_ratio(field_box, panel.bbox)
    if panel_containment < INSIDE_RATIO_PASS:
        return _result(
            status="fail",
            relationship="inside_visible_panel",
            confidence=min(field.confidence, panel.confidence),
            reasoning=(
                f"Only {panel_containment:.1%} of the declaration evidence lies "
                "inside the visible panel."
            ),
            evidence=(field_box, panel.bbox),
        )

    if any(
        partner is None or _evidence_box(partner) is None for partner in related_fields.values()
    ):
        missing = ", ".join(
            name
            for name, partner in related_fields.items()
            if partner is None or _evidence_box(partner) is None
        )
        return _result(
            status="manual_review",
            relationship="associated_with_related_declaration",
            confidence=min(field.confidence, panel.confidence),
            reasoning=f"Required related evidence is unavailable: {missing}.",
            evidence=(field_box,),
        )

    related_boxes = tuple(
        partner_box
        for partner in related_fields.values()
        if partner is not None and (partner_box := _evidence_box(partner)) is not None
    )
    if related_boxes:
        closest_gap = min(edge_distance(field_box, partner_box) for partner_box in related_boxes)
        if closest_gap > RELATED_GAP_MAX:
            return _result(
                status="warn",
                relationship="associated_with_related_declaration",
                confidence=min(field.confidence, panel.confidence),
                reasoning=(
                    f"Related label/value evidence is {closest_gap:.3f} normalized units apart; "
                    f"the tolerance is {RELATED_GAP_MAX:.2f}."
                ),
                evidence=(field_box, *related_boxes),
            )

    for other in (unrelated_fields or {}).values():
        if other is None or (other_box := _evidence_box(other)) is None:
            continue
        overlap = _iou(field_box, other_box)
        if overlap > UNRELATED_OVERLAP_IOU_WARN:
            return _result(
                status="warn",
                relationship="unobscured_declaration",
                confidence=min(field.confidence, other.confidence, panel.confidence),
                reasoning=(
                    f"Unrelated declaration evidence overlaps by IoU {overlap:.2f}; "
                    "review for obscuring."
                ),
                evidence=(field_box, other_box),
            )

    distance_to_edge = _image_edge_distance(field_box)
    if distance_to_edge <= EDGE_CLIP_TOLERANCE:
        return _result(
            status="warn",
            relationship="clear_of_image_edge",
            confidence=min(field.confidence, panel.confidence),
            reasoning="The declaration lies at or within 1% of an image edge and may be clipped.",
            evidence=(field_box,),
        )

    relationship = (
        "associated_with_related_declaration" if related_boxes else "inside_visible_panel"
    )
    return _result(
        status="pass",
        relationship=relationship,
        confidence=min(field.confidence, panel.confidence),
        reasoning="Declaration placement is supported by the submitted evidence.",
        evidence=(field_box, *related_boxes),
    )


def assess_placements(
    extracted: Mapping[str, ExtractedField | None],
    panel: PanelEstimate | None,
    context: ScanContext,
    rules: RulesConfig,
) -> dict[str, PlacementResult]:
    """Evaluate all detected declarations using configured related-field names."""

    results: dict[str, PlacementResult] = {}
    for name, field in extracted.items():
        if field is None or not field.value:
            continue
        check = next((candidate for candidate in rules.checks if candidate.field == name), None)
        placement = getattr(check, "placement", None) if check is not None else None
        related_names = tuple(placement.get("related_fields", ())) if placement else ()
        related = {related_name: extracted.get(related_name) for related_name in related_names}
        unrelated = {
            other_name: other
            for other_name, other in extracted.items()
            if other_name != name and other_name not in related_names
        }
        results[name] = evaluate_placement(
            field,
            panel,
            related,
            context.mode,
            unrelated_fields=unrelated,
        )
    return results
