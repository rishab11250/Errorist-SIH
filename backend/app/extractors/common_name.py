"""Extract common / generic name per Rule 6(1)(b)."""
from __future__ import annotations

from app.domain import ExtractedField, ImageMeta, OCRWord
from app.extractors.base import avg_confidence, merge_bboxes


def extract_common_name(
    ocr_words: list[OCRWord],
    image_meta: ImageMeta,
) -> ExtractedField | None:
    """Return the topmost label words as a placeholder for the common name."""
    if not ocr_words:
        return ExtractedField(name="common_name", value=None, bbox=None, confidence=0.0, evidence_spans=[])
    top_y_threshold = image_meta.height * 0.20
    top_words = [word for word in ocr_words if word.bbox[1] <= top_y_threshold]
    if not top_words:
        top_words = ocr_words[:3]
    return ExtractedField(
        name="common_name",
        value=" ".join(word.text for word in top_words),
        bbox=merge_bboxes(top_words),
        confidence=avg_confidence(top_words),
        evidence_spans=[word.bbox for word in top_words],
    )
