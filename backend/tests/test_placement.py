from __future__ import annotations

import pytest

from app.domain import ExtractedField, PanelEstimate, ScanContext
from app.placement.evaluator import assess_placements, evaluate_placement
from app.placement.geometry import (
    area,
    edge_distance,
    inside_ratio,
    intersection,
    intersection_ratio,
    union,
)
from app.rules_loader import load_rules


def _field(name: str, bbox: tuple[float, float, float, float]) -> ExtractedField:
    return ExtractedField(
        name=name,
        value=name,
        bbox=bbox,
        confidence=0.95,
        evidence_spans=[bbox],
    )


def test_geometry_operations_clamp_normalized_boxes() -> None:
    first = (-0.1, 0.1, 0.4, 0.4)
    second = (0.2, 0.2, 0.4, 0.4)
    assert area(first) == pytest.approx(0.12)
    assert intersection(first, second) == pytest.approx((0.2, 0.2, 0.1, 0.3))
    assert intersection_ratio(first, second) == pytest.approx(0.03 / 0.12)
    assert union(first, second) == pytest.approx((0.0, 0.1, 0.6, 0.5))
    assert inside_ratio((0.2, 0.2, 0.1, 0.1), second) == pytest.approx(1.0)
    assert edge_distance((0.0, 0.0, 0.1, 0.1), (0.2, 0.0, 0.1, 0.1)) == pytest.approx(0.1)


def test_clipped_declaration_fails_with_sufficient_panel_confidence() -> None:
    result = evaluate_placement(
        field=_field("mrp", (0.92, 0.4, 0.12, 0.05)),
        panel=PanelEstimate((0.05, 0.05, 0.9, 0.9), confidence=0.95),
        related_fields={},
        mode="retail_image",
    )
    assert result.status == "fail"
    assert result.relationship == "inside_visible_panel"


def test_uncertain_panel_requires_review_instead_of_failure() -> None:
    result = evaluate_placement(
        field=_field("mrp", (0.92, 0.4, 0.12, 0.05)),
        panel=PanelEstimate((0.05, 0.05, 0.9, 0.9), confidence=0.5),
        related_fields={},
        mode="retail_image",
    )
    assert result.status == "manual_review"


def test_listing_mode_uses_viewport_visibility() -> None:
    result = evaluate_placement(
        field=_field("country_origin", (0.1, 0.2, 0.3, 0.04)),
        panel=None,
        related_fields={},
        mode="ecommerce_listing",
    )
    assert result.status == "pass"
    assert result.relationship == "visible_in_submitted_screenshot"


def test_listing_clipping_fails_only_for_submitted_viewport() -> None:
    result = evaluate_placement(
        field=_field("country_origin", (0.95, 0.2, 0.10, 0.04)),
        panel=None,
        related_fields={},
        mode="ecommerce_listing",
    )
    assert result.status == "fail"
    assert "submitted screenshot" in result.reasoning.lower()


def test_listing_checks_every_evidence_span_for_clipping() -> None:
    field = _field("country_origin", (0.1, 0.2, 0.3, 0.04))
    field.evidence_spans.append((0.98, 0.2, 0.04, 0.04))
    result = evaluate_placement(
        field=field,
        panel=None,
        related_fields={},
        mode="ecommerce_listing",
    )
    assert result.status == "fail"


def test_related_pair_distance_and_missing_partner_policy() -> None:
    field = _field("mrp_value", (0.2, 0.2, 0.2, 0.05))
    panel = PanelEstimate((0.0, 0.0, 1.0, 1.0), confidence=0.95)
    nearby = evaluate_placement(
        field=field,
        panel=panel,
        related_fields={"mrp_label": _field("mrp_label", (0.1, 0.2, 0.08, 0.05))},
        mode="retail_image",
    )
    missing = evaluate_placement(
        field=field,
        panel=panel,
        related_fields={"mrp_label": None},
        mode="retail_image",
    )
    assert nearby.status == "pass"
    assert nearby.relationship == "associated_with_related_declaration"
    assert missing.status == "manual_review"


def test_unrelated_overlap_warns_and_includes_both_boxes() -> None:
    field = _field("mrp", (0.2, 0.2, 0.3, 0.2))
    obscuring = _field("manufacturer", (0.25, 0.22, 0.3, 0.2))
    result = evaluate_placement(
        field=field,
        panel=PanelEstimate((0.0, 0.0, 1.0, 1.0), confidence=0.95),
        related_fields={},
        unrelated_fields={"manufacturer": obscuring},
        mode="retail_image",
    )
    assert result.status == "warn"
    assert result.relationship == "unobscured_declaration"
    assert len(result.evidence_bboxes) == 2


def test_declaration_near_image_edge_warns() -> None:
    result = evaluate_placement(
        field=_field("mrp", (0.005, 0.2, 0.2, 0.05)),
        panel=PanelEstimate((0.0, 0.0, 1.0, 1.0), confidence=0.95),
        related_fields={},
        mode="retail_image",
    )
    assert result.status == "warn"
    assert result.relationship == "clear_of_image_edge"


def test_assess_placements_returns_each_detected_field() -> None:
    extracted = {
        "mrp": _field("mrp", (0.2, 0.2, 0.2, 0.05)),
        "missing": None,
    }
    results = assess_placements(
        extracted,
        PanelEstimate((0.0, 0.0, 1.0, 1.0), confidence=0.95),
        ScanContext(),
        load_rules("app/rules.yaml"),
    )
    assert set(results) == {"mrp"}
    assert results["mrp"].status == "pass"
