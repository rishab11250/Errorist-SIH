"""Deterministic, bounded image-quality scoring."""

from __future__ import annotations

import cv2
import numpy as np

from app.domain import DecodedImage, OCRWord, QualitySummary, VisualMetric

QUALITY_THRESHOLDS = {
    "sharpness_warn": 80.0,
    "sharpness_retake": 35.0,
    "contrast_warn": 30.0,
    "contrast_retake": 15.0,
    "glare_warn_fraction": 0.08,
    "glare_retake_fraction": 0.18,
    "skew_warn_degrees": 8.0,
    "skew_retake_degrees": 18.0,
    "ocr_confidence_median_retake": 60.0,
    "ocr_confidence_median_warn": 70.0,
    "ocr_confidence_lower_quartile_retake": 35.0,
}

_GUIDANCE = {
    "sharpness": "Hold the camera steady and tap to focus on the declaration panel.",
    "contrast": "Use even lighting so the declaration text stands out from its background.",
    "glare": "Tilt the package or light source to remove reflections from the label.",
    "skew": "Position the camera parallel to the declaration panel.",
    "ocr_confidence": "Hold the camera closer and steady so the printed text is sharp and legible.",
}


def _metric(
    name: str, value: float, unit: str, method: str, confidence: float = 1.0
) -> VisualMetric:
    return VisualMetric(
        name=name,
        value=round(float(np.clip(value, 0.0, 100.0)), 4),
        unit=unit,
        confidence=round(float(np.clip(confidence, 0.0, 1.0)), 4),
        method=method,
    )


def _skew_degrees(gray: np.ndarray) -> tuple[float, float]:
    edges = cv2.Canny(gray, 50, 150)
    points = cv2.findNonZero(edges)
    if points is None or len(points) < 20:
        return 0.0, 0.0
    (_, _), (_, _), angle = cv2.minAreaRect(points)
    skew = abs(((float(angle) + 45.0) % 90.0) - 45.0)
    confidence = min(1.0, len(points) / max(gray.size * 0.02, 1.0))
    return skew, confidence


def _perspective_score(gray: np.ndarray) -> tuple[float, float]:
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 40, 140)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    image_area = float(gray.shape[0] * gray.shape[1])
    best_score = 0.0
    best_confidence = 0.0
    for contour in contours:
        perimeter = cv2.arcLength(contour, True)
        if perimeter <= 0:
            continue
        polygon = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(polygon) != 4 or not cv2.isContourConvex(polygon):
            continue
        area = abs(float(cv2.contourArea(polygon)))
        coverage = area / image_area
        if not 0.10 <= coverage <= 0.98:
            continue
        _, _, width, height = cv2.boundingRect(polygon)
        rectangularity = min(1.0, area / max(float(width * height), 1.0))
        score = rectangularity * 100.0
        if area > best_confidence:
            best_score = score
            best_confidence = area
    return best_score, min(1.0, best_confidence / max(image_area * 0.5, 1.0))


def _clamped_boxes(words: tuple[OCRWord, ...]) -> list[tuple[float, float, float, float]]:
    boxes: list[tuple[float, float, float, float]] = []
    for word in words:
        x, y, width, height = word.bbox
        left = float(np.clip(x, 0.0, 1.0))
        top = float(np.clip(y, 0.0, 1.0))
        right = float(np.clip(x + max(width, 0.0), 0.0, 1.0))
        bottom = float(np.clip(y + max(height, 0.0), 0.0, 1.0))
        if right > left and bottom > top:
            boxes.append((left, top, right, bottom))
    return boxes


def _union_area(boxes: list[tuple[float, float, float, float]]) -> float:
    if not boxes:
        return 0.0
    x_points = sorted({coordinate for box in boxes for coordinate in (box[0], box[2])})
    area = 0.0
    for left, right in zip(x_points, x_points[1:], strict=False):
        if right <= left:
            continue
        intervals = sorted(
            (top, bottom)
            for box_left, top, box_right, bottom in boxes
            if box_left < right and box_right > left
        )
        if not intervals:
            continue
        merged_height = 0.0
        current_top, current_bottom = intervals[0]
        for top, bottom in intervals[1:]:
            if top <= current_bottom:
                current_bottom = max(current_bottom, bottom)
            else:
                merged_height += current_bottom - current_top
                current_top, current_bottom = top, bottom
        merged_height += current_bottom - current_top
        area += (right - left) * merged_height
    return area


def _confidence_distribution(words: tuple[OCRWord, ...]) -> tuple[float, float]:
    if not words:
        return 0.0, 0.0
    values = sorted(float(np.clip(word.confidence, 0.0, 1.0)) for word in words)
    median = float(np.median(values))
    lower_quartile = values[int((len(values) - 1) * 0.25)]
    return median * 100.0, lower_quartile * 100.0


def analyze_quality(
    decoded: DecodedImage,
    words: tuple[OCRWord, ...] = (),
) -> QualitySummary:
    """Measure capture quality and return deterministic retake guidance."""

    gray = cv2.cvtColor(decoded.image, cv2.COLOR_BGR2GRAY)
    sharpness = min(100.0, float(cv2.Laplacian(gray, cv2.CV_64F).var()))
    contrast = min(100.0, float(gray.std()))
    glare_fraction = float(np.mean(gray > 250))
    skew, skew_confidence = _skew_degrees(gray)
    perspective, perspective_confidence = _perspective_score(gray)
    coverage = _union_area(_clamped_boxes(words)) * 100.0
    confidence_median, confidence_lower_quartile = _confidence_distribution(words)

    # Sharp digital documents or screenshots with high OCR confidence have white backgrounds,
    # not camera flash / specular glare that degrades readability.
    is_clean_document = sharpness >= 80.0 and confidence_median >= 80.0
    effective_glare = 0.0 if is_clean_document else glare_fraction

    metrics = (
        _metric("sharpness", sharpness, "score", "laplacian_variance"),
        _metric("contrast", contrast, "score", "grayscale_standard_deviation"),
        _metric("glare", effective_glare * 100.0, "percent", "bright_pixel_fraction"),
        _metric("skew", skew, "degrees", "minimum_area_rectangle", skew_confidence),
        _metric(
            "perspective",
            perspective,
            "score",
            "quadrilateral_rectangularity",
            perspective_confidence,
        ),
        _metric("text_coverage", coverage, "percent", "ocr_bbox_union"),
        _metric("ocr_confidence_distribution", confidence_median, "percent", "median"),
        _metric(
            "ocr_confidence_lower_quartile",
            confidence_lower_quartile,
            "percent",
            "lower_quartile",
        ),
    )

    retake_failures: list[str] = []
    warning_failures: list[str] = []
    if sharpness < QUALITY_THRESHOLDS["sharpness_retake"]:
        retake_failures.append("sharpness")
    elif sharpness < QUALITY_THRESHOLDS["sharpness_warn"]:
        warning_failures.append("sharpness")
    if contrast < QUALITY_THRESHOLDS["contrast_retake"]:
        retake_failures.append("contrast")
    elif contrast < QUALITY_THRESHOLDS["contrast_warn"]:
        warning_failures.append("contrast")
    if effective_glare > QUALITY_THRESHOLDS["glare_retake_fraction"]:
        retake_failures.append("glare")
    elif effective_glare > QUALITY_THRESHOLDS["glare_warn_fraction"]:
        warning_failures.append("glare")
    if skew > QUALITY_THRESHOLDS["skew_retake_degrees"]:
        retake_failures.append("skew")
    elif skew > QUALITY_THRESHOLDS["skew_warn_degrees"]:
        warning_failures.append("skew")

    if words:
        if (
            confidence_median < QUALITY_THRESHOLDS["ocr_confidence_median_retake"]
            or confidence_lower_quartile
            < QUALITY_THRESHOLDS["ocr_confidence_lower_quartile_retake"]
        ):
            retake_failures.append("ocr_confidence")
        elif confidence_median < QUALITY_THRESHOLDS["ocr_confidence_median_warn"]:
            warning_failures.append("ocr_confidence")

    if {"sharpness", "contrast"}.issubset(retake_failures):
        status = "unreadable"
    elif retake_failures:
        status = "retake_recommended"
    elif warning_failures:
        status = "usable_with_warnings"
    else:
        status = "acceptable"

    glare_quality = 100.0 - effective_glare * 100.0
    skew_quality = max(0.0, 100.0 - skew / 45.0 * 100.0)
    score = (
        0.35 * sharpness
        + 0.25 * contrast
        + 0.15 * glare_quality
        + 0.15 * skew_quality
        + 0.10 * perspective
    )
    failed_metrics = dict.fromkeys((*retake_failures, *warning_failures))
    guidance = tuple(_GUIDANCE[name] for name in failed_metrics)
    return QualitySummary(
        status=status,
        score=round(float(np.clip(score, 0.0, 100.0)), 2),
        metrics=metrics,
        guidance=guidance,
    )
