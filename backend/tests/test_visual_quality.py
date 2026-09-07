from __future__ import annotations

import base64
import io

import cv2
import numpy as np
import pytest
from PIL import Image

from app.domain import DecodedImage, OCRWord
from app.visual_analysis.image_io import ImageDecodeError, decode_image
from app.visual_analysis.panel import estimate_panel
from app.visual_analysis.quality import analyze_quality


def _encoded(image: Image.Image, image_format: str = "PNG") -> str:
    output = io.BytesIO()
    image.save(output, format=image_format)
    return base64.b64encode(output.getvalue()).decode("ascii")


def _decoded(array: np.ndarray) -> DecodedImage:
    height, width = array.shape[:2]
    return DecodedImage(image=array, width=width, height=height, metadata={})


def _metric(result, name: str) -> float:
    return next(metric.value for metric in result.metrics if metric.name == name)


def test_decode_valid_png_and_metadata() -> None:
    checkerboard = np.indices((8, 12)).sum(axis=0) % 2
    pixels = np.where(checkerboard[..., None] == 0, 20, 220).astype(np.uint8)
    source = Image.fromarray(np.repeat(pixels, 3, axis=2), "RGB")
    result = decode_image(_encoded(source), max_bytes=1_000_000, max_pixels=1_000)
    assert (result.width, result.height) == (12, 8)
    assert result.image.shape == (8, 12, 3)
    assert result.metadata["format"] == "PNG"


def test_decode_accepts_matching_data_url() -> None:
    payload = _encoded(Image.new("RGB", (4, 3), "red"))
    result = decode_image(f"data:image/png;base64,{payload}", max_bytes=1_000_000, max_pixels=1_000)
    assert (result.width, result.height) == (4, 3)


@pytest.mark.parametrize("payload", ["%%%", "", base64.b64encode(b"x").decode("ascii")])
def test_invalid_payload_has_stable_error(payload: str) -> None:
    with pytest.raises(ImageDecodeError) as caught:
        decode_image(payload, max_bytes=1_000_000, max_pixels=1_000_000)
    assert caught.value.code in {"image_decode_failed", "invalid_image"}


def test_invalid_base64_is_decode_failure() -> None:
    with pytest.raises(ImageDecodeError, match="image_decode_failed"):
        decode_image("%%%", max_bytes=1_000_000, max_pixels=1_000_000)


def test_byte_and_pixel_limits_are_enforced() -> None:
    payload = _encoded(Image.new("RGB", (20, 20), "red"))
    with pytest.raises(ImageDecodeError, match="image_too_large"):
        decode_image(payload, max_bytes=10, max_pixels=1_000)
    with pytest.raises(ImageDecodeError, match="image_too_large"):
        decode_image(payload, max_bytes=1_000_000, max_pixels=399)


@pytest.mark.parametrize("image_format", ["GIF", "BMP"])
def test_unsupported_decodable_formats_are_rejected(image_format: str) -> None:
    payload = _encoded(Image.new("RGB", (10, 10), "red"), image_format)
    with pytest.raises(ImageDecodeError, match="invalid_image"):
        decode_image(payload, max_bytes=1_000_000, max_pixels=1_000)


def test_declared_mime_must_match_decoded_content() -> None:
    payload = _encoded(Image.new("RGB", (10, 10), "red"), "PNG")
    with pytest.raises(ImageDecodeError, match="invalid_image"):
        decode_image(f"data:image/jpeg;base64,{payload}", max_bytes=1_000_000, max_pixels=1_000)


def test_decompression_bomb_is_rejected(monkeypatch) -> None:
    payload = _encoded(Image.new("RGB", (20, 20), "red"))
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 100)
    with pytest.raises(ImageDecodeError, match="invalid_image"):
        decode_image(payload, max_bytes=1_000_000, max_pixels=1_000)


def test_flat_image_is_not_acceptable() -> None:
    image = np.full((200, 300, 3), 128, dtype=np.uint8)
    result = analyze_quality(_decoded(image), ())
    assert result.status == "unreadable"
    assert {metric.name for metric in result.metrics} >= {
        "sharpness",
        "contrast",
        "glare",
        "skew",
        "perspective",
        "text_coverage",
        "ocr_confidence_distribution",
        "ocr_confidence_lower_quartile",
    }


def test_blur_reduces_sharpness() -> None:
    sharp = np.indices((200, 300)).sum(axis=0) % 2
    sharp = np.where(sharp[..., None] == 0, 20, 220).astype(np.uint8)
    sharp = np.repeat(sharp, 3, axis=2)
    blurred = cv2.GaussianBlur(sharp, (21, 21), 5)
    assert _metric(analyze_quality(_decoded(blurred)), "sharpness") < _metric(
        analyze_quality(_decoded(sharp)), "sharpness"
    )


def test_sharp_high_contrast_image_is_acceptable() -> None:
    image = np.full((200, 300, 3), 30, dtype=np.uint8)
    cv2.rectangle(image, (20, 20), (280, 180), (220, 220, 220), 4)
    for y in range(45, 170, 25):
        cv2.line(image, (45, y), (250, y), (30, 30, 30), 3)
    result = analyze_quality(_decoded(image))
    assert result.status == "acceptable"
    assert result.score >= 60


def test_ocr_coverage_and_confidence_distribution_are_recorded() -> None:
    image = np.full((100, 100, 3), 128, dtype=np.uint8)
    words = (
        OCRWord("A", 0.9, (0.1, 0.1, 0.2, 0.2)),
        OCRWord("B", 0.5, (0.2, 0.2, 0.2, 0.2)),
    )
    result = analyze_quality(_decoded(image), words)
    assert _metric(result, "text_coverage") == pytest.approx(7.0)
    assert _metric(result, "ocr_confidence_distribution") == pytest.approx(70.0)
    assert _metric(result, "ocr_confidence_lower_quartile") == pytest.approx(50.0)


def test_panel_estimate_uses_quadrilateral_and_ocr_containment() -> None:
    image = np.zeros((200, 300, 3), dtype=np.uint8)
    cv2.rectangle(image, (30, 20), (270, 180), (240, 240, 240), -1)
    words = (OCRWord("MRP", 0.95, (0.2, 0.3, 0.2, 0.1)),)
    panel = estimate_panel(_decoded(image), words)
    assert panel.confidence >= 0.8
    assert panel.bbox[0] == pytest.approx(0.1, abs=0.03)
    assert panel.bbox[2] == pytest.approx(0.8, abs=0.04)
    assert len(panel.corners) == 4


def test_panel_falls_back_when_no_plausible_contour_exists() -> None:
    image = np.zeros((100, 100, 3), dtype=np.uint8)
    panel = estimate_panel(_decoded(image), ())
    assert panel.bbox == (0.0, 0.0, 1.0, 1.0)
    assert panel.confidence == 0.0
