from __future__ import annotations

import base64
import io

import numpy as np
import pytest
from PIL import Image, ImageDraw

from app import analysis_pipeline
from app.analysis_pipeline import analyze_scan, normalize_ocr
from app.errors import AppError
from app.models import ScanRequest
from app.rules_loader import load_rules


def _image_b64(*, flat: bool = False) -> str:
    image = Image.new("RGB", (300, 200), (128, 128, 128) if flat else (30, 30, 30))
    if not flat:
        drawing = ImageDraw.Draw(image)
        drawing.rectangle((20, 20, 280, 180), fill=(220, 220, 220), width=4)
        for y in range(40, 175, 20):
            drawing.line((35, y, 260, y), fill=(30, 30, 30), width=3)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode("ascii")


def _low_sharpness_image_b64() -> str:
    gradient = np.tile(np.linspace(40, 210, 300, dtype=np.uint8), (200, 1))
    image = Image.fromarray(gradient, mode="L").convert("RGB")
    output = io.BytesIO()
    image.save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode("ascii")


def _request(**overrides) -> ScanRequest:
    values = {
        "schema_version": 2,
        "image_b64": _image_b64(),
        "image_meta": {"width": 300, "height": 200, "orientation": 1},
        "ocr_payload": [
            {"text": "Common", "confidence": 0.95, "bbox": [0.1, 0.2, 0.15, 0.05]},
            {"text": "name:", "confidence": 0.95, "bbox": [0.26, 0.2, 0.12, 0.05]},
            {"text": "Tea", "confidence": 0.95, "bbox": [0.39, 0.2, 0.10, 0.05]},
        ],
        "ocr_lines": [
            {
                "word_indexes": [0, 1, 2],
                "bbox": [0.1, 0.2, 0.39, 0.05],
                "median_character_height": 0.05,
            }
        ],
    }
    values.update(overrides)
    return ScanRequest(**values)


def test_normalize_ocr_uses_valid_version_two_lines() -> None:
    words, lines = normalize_ocr(_request())
    assert len(words) == 3
    assert lines[0].word_indexes == (0, 1, 2)
    assert lines[0].median_character_height == 0.05


def test_normalize_ocr_reconstructs_lines_for_version_one() -> None:
    request = _request(schema_version=1, ocr_lines=[])
    _, lines = normalize_ocr(request)
    assert len(lines) == 1
    assert lines[0].word_indexes == (0, 1, 2)


def test_out_of_range_line_index_is_rejected() -> None:
    request = _request(
        ocr_lines=[
            {
                "word_indexes": [3],
                "bbox": [0.1, 0.2, 0.2, 0.05],
                "median_character_height": 0.05,
            }
        ]
    )
    with pytest.raises(AppError) as caught:
        normalize_ocr(request)
    assert caught.value.error == "invalid_ocr_lines"


def test_blank_words_are_removed_without_shifting_line_indexes() -> None:
    request = _request(
        ocr_payload=[
            {"text": "", "confidence": 0.2, "bbox": [0.02, 0.2, 0.05, 0.05]},
            {"text": "Tea", "confidence": 0.95, "bbox": [0.1, 0.2, 0.1, 0.05]},
        ],
        ocr_lines=[
            {
                "word_indexes": [0, 1],
                "bbox": [0.02, 0.2, 0.18, 0.05],
                "median_character_height": 0.05,
            }
        ],
    )
    words, lines = normalize_ocr(request)
    assert [word.text for word in words] == ["Tea"]
    assert lines[0].word_indexes == (0,)


def test_analysis_runs_complete_v2_sequence() -> None:
    result = analyze_scan(_request(), load_rules("app/rules.yaml"))
    assert result.analysis_version == "inspection-v2"
    assert result.extracted["common_name"] is not None
    assert result.extracted["common_name"].value == "Tea"
    assert result.verdicts


def test_empty_ocr_has_stable_application_error() -> None:
    with pytest.raises(AppError) as caught:
        analyze_scan(_request(ocr_payload=[], ocr_lines=[]), load_rules("app/rules.yaml"))
    assert caught.value.status_code == 422
    assert caught.value.error == "no_text_extracted"


def test_unreadable_image_stops_before_verdicts() -> None:
    with pytest.raises(AppError) as caught:
        analyze_scan(_request(image_b64=_image_b64(flat=True)), load_rules("app/rules.yaml"))
    assert caught.value.status_code == 422
    assert caught.value.error == "image_unreadable"


def test_unsupported_image_maps_to_invalid_image() -> None:
    image = Image.new("RGB", (20, 20), "red")
    output = io.BytesIO()
    image.save(output, format="GIF")
    request = _request(image_b64=base64.b64encode(output.getvalue()).decode("ascii"))
    with pytest.raises(AppError) as caught:
        analyze_scan(request, load_rules("app/rules.yaml"))
    assert caught.value.status_code == 400
    assert caught.value.error == "invalid_image"


def test_oversized_image_maps_to_payload_too_large(monkeypatch) -> None:
    monkeypatch.setattr(analysis_pipeline, "MAX_IMAGE_BYTES", 10)
    with pytest.raises(AppError) as caught:
        analyze_scan(_request(), load_rules("app/rules.yaml"))
    assert caught.value.status_code == 413
    assert caught.value.error == "image_too_large"


def test_low_quality_image_returns_guidance_without_false_failure() -> None:
    result = analyze_scan(
        _request(image_b64=_low_sharpness_image_b64()),
        load_rules("app/rules.yaml"),
    )
    assert result.quality.status == "retake_recommended"
    assert result.quality.guidance
    assert result.overall_status == "manual_review"
    assert "fail" not in {verdict.status for verdict in result.verdicts}


def test_listing_mode_skips_physical_only_checks() -> None:
    result = analyze_scan(
        _request(
            scan_context={
                "mode": "ecommerce_listing",
                "category": "non_food",
                "imported": False,
            }
        ),
        load_rules("app/rules.yaml"),
    )
    verdicts = {verdict.rule_id: verdict for verdict in result.verdicts}
    assert verdicts["r6_1_d_mfg_date"].status == "na"
    assert verdicts["r6_1_f_dimensions"].status == "na"
    assert verdicts["r7_font_size"].status == "na"
