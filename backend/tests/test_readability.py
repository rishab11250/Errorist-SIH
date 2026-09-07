from __future__ import annotations

import cv2
import numpy as np
import pytest

from app.domain import (
    DecodedImage,
    ExtractedField,
    OCRLine,
    OCRWord,
    PanelEstimate,
    QualitySummary,
)
from app.rules_loader import load_rules
from app.visual_analysis.readability import assess_declaration_readability, assess_fields


@pytest.mark.parametrize(
    ("physical_width_mm", "panel_confidence", "expected_method", "expected_status"),
    [
        (100.0, 0.95, "geometry_estimate", "pass"),
        (100.0, 0.60, "geometry_estimate", "manual_review"),
        (None, 0.95, "relative_readability", "manual_review"),
    ],
)
def test_scale_policy(
    physical_width_mm: float | None,
    panel_confidence: float,
    expected_method: str,
    expected_status: str,
) -> None:
    assessment = assess_declaration_readability(
        character_height_px=30,
        image_width_px=1000,
        panel_width_px=800,
        physical_panel_width_mm=physical_width_mm,
        panel_confidence=panel_confidence,
        ocr_confidence=0.95,
        local_contrast=80,
        local_sharpness=90,
        minimum_mm=2.5,
    )
    assert assessment.method == expected_method
    assert assessment.status == expected_status


def test_camera_dpi_alone_never_creates_millimetres() -> None:
    assessment = assess_declaration_readability(
        character_height_px=30,
        image_width_px=1000,
        panel_width_px=800,
        physical_panel_width_mm=None,
        panel_confidence=1.0,
        ocr_confidence=0.95,
        local_contrast=80,
        local_sharpness=90,
        minimum_mm=2.5,
        dpi=300,
        dpi_source="camera",
    )
    assert assessment.estimated_mm is None
    assert assessment.status == "manual_review"
    assert assessment.method == "relative_readability"


def test_verified_scanner_resolution_can_create_direct_measurement() -> None:
    assessment = assess_declaration_readability(
        character_height_px=30,
        image_width_px=1000,
        panel_width_px=800,
        physical_panel_width_mm=None,
        panel_confidence=1.0,
        ocr_confidence=0.95,
        local_contrast=80,
        local_sharpness=90,
        minimum_mm=2.0,
        dpi=(300.0, 300.0),
        dpi_source="scanner",
    )
    assert assessment.method == "direct_metadata"
    assert assessment.estimated_mm == pytest.approx(2.54)
    assert assessment.status == "pass"


def test_boundary_uncertainty_requires_manual_review() -> None:
    assessment = assess_declaration_readability(
        character_height_px=20,
        image_width_px=1000,
        panel_width_px=800,
        physical_panel_width_mm=100,
        panel_confidence=0.95,
        ocr_confidence=0.95,
        local_contrast=80,
        local_sharpness=90,
        minimum_mm=2.5,
    )
    assert assessment.estimated_mm == 2.5
    assert assessment.error_mm is not None
    assert assessment.status == "manual_review"


def test_confident_measurement_below_minimum_fails() -> None:
    assessment = assess_declaration_readability(
        character_height_px=10,
        image_width_px=1000,
        panel_width_px=800,
        physical_panel_width_mm=100,
        panel_confidence=0.99,
        ocr_confidence=0.95,
        local_contrast=80,
        local_sharpness=90,
        minimum_mm=2.5,
    )
    assert assessment.status == "fail"


def test_field_assessment_records_local_readability_warning() -> None:
    image = np.full((100, 200, 3), 128, dtype=np.uint8)
    cv2.rectangle(image, (20, 20), (180, 70), (135, 135, 135), -1)
    decoded = DecodedImage(image=image, width=200, height=100, metadata={})
    words = (
        OCRWord("MRP", 0.95, (0.10, 0.20, 0.20, 0.02)),
        OCRWord("100", 0.90, (0.32, 0.20, 0.20, 0.10)),
        OCRWord("taxes", 0.90, (0.54, 0.20, 0.20, 0.20)),
    )
    lines = (
        OCRLine(
            word_indexes=(0, 1, 2),
            bbox=(0.10, 0.20, 0.64, 0.20),
            median_character_height=0.10,
        ),
    )
    extracted = {
        "mrp": ExtractedField(
            name="mrp",
            value="MRP 100 inclusive of taxes",
            bbox=(0.10, 0.20, 0.64, 0.20),
            confidence=0.92,
            evidence_spans=[word.bbox for word in words],
        )
    }
    result = assess_fields(
        extracted,
        words,
        lines,
        QualitySummary("acceptable", 90.0, (), ()),
        PanelEstimate((0.0, 0.0, 1.0, 1.0), confidence=0.9),
        load_rules("app/rules.yaml"),
        decoded=decoded,
    )
    assert result["mrp"].character_height_px == pytest.approx(10.0)
    assert result["mrp"].status == "manual_review"
    assert "inconsistent character heights" in result["mrp"].reasoning.lower()
