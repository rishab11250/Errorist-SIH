"""Confidence-aware declaration readability and physical-size policy."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import cv2
import numpy as np

from app.domain import (
    DecodedImage,
    ExtractedField,
    OCRLine,
    OCRWord,
    PanelEstimate,
    QualitySummary,
    ReadabilityAssessment,
    RulesConfig,
)

_SCANNER_SOURCES = {"scanner", "flatbed_scanner", "document_scanner"}
_LOCAL_GLARE_LIMIT = 0.18
_CONSISTENCY_WARNING_LIMIT = 0.60
_OVERLAP_WARNING_RATIO = 0.25


def _readability_score(ocr: float, contrast: float, sharpness: float) -> float:
    ocr_score = float(np.clip(ocr, 0.0, 1.0))
    contrast_score = float(np.clip(contrast, 0.0, 100.0)) / 100.0
    sharpness_score = float(np.clip(sharpness, 0.0, 100.0)) / 100.0
    return round(100 * (0.40 * ocr_score + 0.30 * contrast_score + 0.30 * sharpness_score), 1)


def _verified_scanner_dpi(
    dpi: float | tuple[float, float] | Sequence[float] | None,
    dpi_source: str,
) -> float | None:
    if dpi_source.lower() not in _SCANNER_SOURCES:
        return None
    if not isinstance(dpi, Sequence) or isinstance(dpi, (str, bytes)) or len(dpi) < 2:
        return None
    x_dpi, y_dpi = dpi[0], dpi[1]
    if isinstance(x_dpi, bool) or isinstance(y_dpi, bool):
        return None
    if not isinstance(x_dpi, (int, float)) or not isinstance(y_dpi, (int, float)):
        return None
    if not np.isfinite(x_dpi) or not np.isfinite(y_dpi) or x_dpi <= 0 or y_dpi <= 0:
        return None
    return float(y_dpi)


def _measurement_status(
    estimated_mm: float,
    error_mm: float,
    minimum_mm: float,
    scale_confidence: float,
    enforcement_scale_confidence: float,
) -> tuple[str, str]:
    crosses_boundary = estimated_mm - error_mm < minimum_mm <= estimated_mm + error_mm
    if scale_confidence < enforcement_scale_confidence or crosses_boundary:
        return "manual_review", "Measurement uncertainty could change the Rule 7 decision."
    status = "pass" if estimated_mm >= minimum_mm else "fail"
    return status, f"Estimated {estimated_mm:.2f} mm against {minimum_mm:.2f} mm minimum."


def assess_declaration_readability(
    *,
    character_height_px: float,
    image_width_px: int,
    panel_width_px: float,
    physical_panel_width_mm: float | None,
    panel_confidence: float,
    ocr_confidence: float,
    local_contrast: float,
    local_sharpness: float,
    minimum_mm: float,
    dpi: float | tuple[float, float] | Sequence[float] | None = None,
    dpi_source: str = "unknown",
    enforcement_scale_confidence: float = 0.80,
    evidence_bboxes: tuple[tuple[float, float, float, float], ...] = (),
) -> ReadabilityAssessment:
    """Select a defensible measurement method and apply the Rule 7 boundary policy."""

    score = _readability_score(ocr_confidence, local_contrast, local_sharpness)
    panel_confidence = float(np.clip(panel_confidence, 0.0, 1.0))
    scanner_dpi = _verified_scanner_dpi(dpi, dpi_source)

    if scanner_dpi is not None and character_height_px > 0 and image_width_px > 0:
        estimated_mm = character_height_px * 25.4 / scanner_dpi
        scale_confidence = 0.98
        error_mm = estimated_mm * (1.0 - scale_confidence)
        status, reasoning = _measurement_status(
            estimated_mm,
            error_mm,
            minimum_mm,
            scale_confidence,
            enforcement_scale_confidence,
        )
        return ReadabilityAssessment(
            score=score,
            character_height_px=character_height_px,
            estimated_mm=round(estimated_mm, 2),
            error_mm=round(error_mm, 2),
            method="direct_metadata",
            scale_confidence=scale_confidence,
            status=status,
            reasoning=reasoning,
            evidence_bboxes=evidence_bboxes,
        )

    if (
        physical_panel_width_mm is None
        or physical_panel_width_mm <= 0
        or panel_width_px <= 0
        or character_height_px <= 0
    ):
        return ReadabilityAssessment(
            score=score,
            character_height_px=character_height_px,
            estimated_mm=None,
            error_mm=None,
            method="relative_readability",
            scale_confidence=panel_confidence,
            status="manual_review",
            reasoning="Physical scale cannot be established automatically from this image.",
            evidence_bboxes=evidence_bboxes,
        )

    estimated_mm = character_height_px * physical_panel_width_mm / panel_width_px
    error_mm = estimated_mm * (1.0 - panel_confidence)
    status, reasoning = _measurement_status(
        estimated_mm,
        error_mm,
        minimum_mm,
        panel_confidence,
        enforcement_scale_confidence,
    )
    return ReadabilityAssessment(
        score=score,
        character_height_px=character_height_px,
        estimated_mm=round(estimated_mm, 2),
        error_mm=round(error_mm, 2),
        method="geometry_estimate",
        scale_confidence=panel_confidence,
        status=status,
        reasoning=reasoning,
        evidence_bboxes=evidence_bboxes,
    )


def _box_union(
    boxes: Sequence[tuple[float, float, float, float]],
) -> tuple[float, float, float, float] | None:
    if not boxes:
        return None
    left = max(0.0, min(box[0] for box in boxes))
    top = max(0.0, min(box[1] for box in boxes))
    right = min(1.0, max(box[0] + box[2] for box in boxes))
    bottom = min(1.0, max(box[1] + box[3] for box in boxes))
    if right <= left or bottom <= top:
        return None
    return left, top, right - left, bottom - top


def _intersection_ratio(
    first: tuple[float, float, float, float],
    second: tuple[float, float, float, float],
) -> float:
    left = max(first[0], second[0])
    top = max(first[1], second[1])
    right = min(first[0] + first[2], second[0] + second[2])
    bottom = min(first[1] + first[3], second[1] + second[3])
    intersection = max(0.0, right - left) * max(0.0, bottom - top)
    smaller_area = min(first[2] * first[3], second[2] * second[3])
    return intersection / smaller_area if smaller_area > 0 else 0.0


def _word_matches_box(word: OCRWord, box: tuple[float, float, float, float]) -> bool:
    center_x = word.bbox[0] + word.bbox[2] / 2
    center_y = word.bbox[1] + word.bbox[3] / 2
    return box[0] <= center_x <= box[0] + box[2] and box[1] <= center_y <= box[1] + box[3]


def _local_metrics(
    decoded: DecodedImage | None,
    evidence_box: tuple[float, float, float, float] | None,
    quality: QualitySummary,
) -> tuple[float, float, float]:
    if decoded is not None and evidence_box is not None:
        x0 = max(0, int(np.floor(evidence_box[0] * decoded.width)))
        y0 = max(0, int(np.floor(evidence_box[1] * decoded.height)))
        x1 = min(decoded.width, int(np.ceil((evidence_box[0] + evidence_box[2]) * decoded.width)))
        y1 = min(decoded.height, int(np.ceil((evidence_box[1] + evidence_box[3]) * decoded.height)))
        crop = decoded.image[y0:y1, x0:x1]
        if crop.size:
            gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
            contrast = min(100.0, float(gray.std()))
            sharpness = min(100.0, float(cv2.Laplacian(gray, cv2.CV_64F).var()))
            glare = float(np.mean(gray > 250))
            return contrast, sharpness, glare
    values = {metric.name: metric.value for metric in quality.metrics}
    return (
        values.get("contrast", 0.0),
        values.get("sharpness", 0.0),
        values.get("glare", 0.0) / 100.0,
    )


def _minimum_mm(rules: RulesConfig, panel: PanelEstimate, decoded: DecodedImage | None) -> float:
    active = rules.font_size.versions[rules.font_size.default_version]
    if active.table_I is None or not active.table_I.brackets:
        return float(active.letter_min_mm or 1.0)
    if decoded is not None and panel.physical_width_mm and panel.bbox[2] > 0:
        panel_width_px = panel.bbox[2] * decoded.width
        panel_height_px = panel.bbox[3] * decoded.height
        physical_height_mm = panel_height_px * panel.physical_width_mm / panel_width_px
        area_cm2 = panel.physical_width_mm * physical_height_mm / 100.0
        for bracket in active.table_I.brackets:
            if bracket.max_value is None or area_cm2 <= bracket.max_value:
                return bracket.normal_mm
    return active.table_I.brackets[0].normal_mm


def assess_fields(
    extracted: Mapping[str, ExtractedField | None],
    words: tuple[OCRWord, ...],
    lines: tuple[OCRLine, ...],
    quality: QualitySummary,
    panel: PanelEstimate,
    rules: RulesConfig,
    *,
    decoded: DecodedImage | None = None,
) -> dict[str, ReadabilityAssessment]:
    """Assess each detected declaration using its line geometry and local image crop."""

    results: dict[str, ReadabilityAssessment] = {}
    field_boxes = {
        name: _box_union(tuple(field.evidence_spans) or ((field.bbox,) if field.bbox else ()))
        for name, field in extracted.items()
        if field is not None and field.value
    }
    minimum_mm = _minimum_mm(rules, panel, decoded)

    for name, field in extracted.items():
        if field is None or not field.value:
            continue
        evidence = tuple(field.evidence_spans) or ((field.bbox,) if field.bbox else ())
        evidence = tuple(box for box in evidence if box is not None)
        evidence_box = field_boxes.get(name)
        matching_indexes = {
            index
            for index, word in enumerate(words)
            if any(_word_matches_box(word, box) for box in evidence)
        }
        matching_words = [words[index] for index in sorted(matching_indexes)]
        matching_lines = [
            line for line in lines if matching_indexes.intersection(line.word_indexes)
        ]
        image_height = decoded.height if decoded is not None else 0
        if matching_lines and image_height:
            character_height_px = float(
                np.median([line.median_character_height * image_height for line in matching_lines])
            )
        elif matching_words and image_height:
            character_height_px = float(
                np.median([word.bbox[3] * image_height for word in matching_words])
            )
        else:
            character_height_px = 0.0

        local_contrast, local_sharpness, local_glare = _local_metrics(
            decoded, evidence_box, quality
        )
        ocr_confidence = (
            float(np.median([word.confidence for word in matching_words]))
            if matching_words
            else field.confidence
        )
        panel_width_px = panel.bbox[2] * decoded.width if decoded is not None else 0.0
        metadata = decoded.metadata if decoded is not None else {}
        assessment = assess_declaration_readability(
            character_height_px=character_height_px,
            image_width_px=decoded.width if decoded is not None else 0,
            panel_width_px=panel_width_px,
            physical_panel_width_mm=panel.physical_width_mm,
            panel_confidence=panel.confidence,
            ocr_confidence=ocr_confidence,
            local_contrast=local_contrast,
            local_sharpness=local_sharpness,
            minimum_mm=minimum_mm,
            dpi=metadata.get("dpi"),
            dpi_source=str(metadata.get("capture_device", "unknown")),
            enforcement_scale_confidence=rules.font_size.enforcement_scale_confidence,
            evidence_bboxes=evidence,
        )

        warnings: list[str] = []
        if matching_words:
            heights = np.array([word.bbox[3] for word in matching_words], dtype=float)
            median_height = float(np.median(heights))
            mad = float(np.median(np.abs(heights - median_height)))
            consistency = 1.0 - min(1.0, mad / median_height) if median_height > 0 else 0.0
            if consistency < _CONSISTENCY_WARNING_LIMIT:
                warnings.append("Inconsistent character heights reduce readability confidence.")
        if local_glare > _LOCAL_GLARE_LIMIT:
            warnings.append("Severe glare affects this declaration.")
        if evidence_box is not None and any(
            other_name != name
            and other_box is not None
            and _intersection_ratio(evidence_box, other_box) > _OVERLAP_WARNING_RATIO
            for other_name, other_box in field_boxes.items()
        ):
            warnings.append("Declaration evidence overlaps another field.")

        if warnings:
            warning_text = " ".join(warnings)
            status = "warn" if assessment.status == "pass" else assessment.status
            assessment = ReadabilityAssessment(
                score=assessment.score,
                character_height_px=assessment.character_height_px,
                estimated_mm=assessment.estimated_mm,
                error_mm=assessment.error_mm,
                method=assessment.method,
                scale_confidence=assessment.scale_confidence,
                status=status,
                reasoning=f"{assessment.reasoning} Readability warning: {warning_text}",
                evidence_bboxes=assessment.evidence_bboxes,
            )
        results[name] = assessment
    return results
