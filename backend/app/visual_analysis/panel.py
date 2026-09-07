"""Estimate the principal declaration panel in a product image."""

from __future__ import annotations

import cv2
import numpy as np

from app.domain import DecodedImage, OCRWord, PanelEstimate


def _ordered_corners(points: np.ndarray) -> np.ndarray:
    points = points.reshape(4, 2).astype(np.float32)
    ordered = np.empty((4, 2), dtype=np.float32)
    totals = points.sum(axis=1)
    differences = np.diff(points, axis=1).ravel()
    ordered[0] = points[np.argmin(totals)]
    ordered[2] = points[np.argmax(totals)]
    ordered[1] = points[np.argmin(differences)]
    ordered[3] = points[np.argmax(differences)]
    return ordered


def _word_centers(words: tuple[OCRWord, ...], width: int, height: int) -> list[tuple[float, float]]:
    return [
        ((word.bbox[0] + word.bbox[2] / 2) * width, (word.bbox[1] + word.bbox[3] / 2) * height)
        for word in words
    ]


def estimate_panel(decoded: DecodedImage, words: tuple[OCRWord, ...] = ()) -> PanelEstimate:
    """Find the largest plausible quadrilateral that contains the OCR evidence."""

    image = decoded.image
    if image.size == 0 or decoded.width <= 0 or decoded.height <= 0:
        return PanelEstimate(bbox=(0.0, 0.0, 1.0, 1.0), confidence=0.0)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 40, 140)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    image_area = float(decoded.width * decoded.height)
    centers = _word_centers(words, decoded.width, decoded.height)
    candidates: list[tuple[float, np.ndarray, float, float, float]] = []

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
        x, y, width, height = cv2.boundingRect(polygon)
        rectangularity = min(1.0, area / max(float(width * height), 1.0))
        contained = sum(cv2.pointPolygonTest(polygon, center, False) >= 0 for center in centers)
        containment = contained / len(centers) if centers else 1.0
        if centers and containment < 1.0:
            continue
        coverage_score = min(1.0, coverage / 0.5)
        confidence = 0.55 * rectangularity + 0.25 * containment + 0.20 * coverage_score
        candidates.append((area, polygon, confidence, rectangularity, coverage))

    if not candidates:
        return PanelEstimate(bbox=(0.0, 0.0, 1.0, 1.0), confidence=0.0)

    _, polygon, confidence, _, _ = max(candidates, key=lambda candidate: candidate[0])
    corners_px = _ordered_corners(polygon)
    x_min = float(np.min(corners_px[:, 0]))
    y_min = float(np.min(corners_px[:, 1]))
    x_max = float(np.max(corners_px[:, 0]))
    y_max = float(np.max(corners_px[:, 1]))
    bbox = (
        max(0.0, x_min / decoded.width),
        max(0.0, y_min / decoded.height),
        min(1.0, (x_max - x_min) / decoded.width),
        min(1.0, (y_max - y_min) / decoded.height),
    )
    corners = tuple((float(x / decoded.width), float(y / decoded.height)) for x, y in corners_px)
    return PanelEstimate(
        bbox=bbox,
        confidence=round(float(min(1.0, confidence)), 4),
        corners=corners,
    )
