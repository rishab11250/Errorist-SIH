"""Extract metric dimensional declarations."""

from __future__ import annotations

from app.domain import ExtractedField, ImageMeta, OCRWord
from app.extractors.base import extract_labeled_field

PATTERN = (
    r"(?i)\b(?:dimensions?|size)\s*[:\-]?\s*"
    r"(\d+(?:\.\d+)?\s*(?:mm|cm|m)"
    r"(?:\s*[x×]\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)){1,2})"
)


def extract_dimensions(
    ocr_words: list[OCRWord],
    image_meta: ImageMeta,  # noqa: ARG001
) -> ExtractedField:
    return extract_labeled_field(ocr_words, name="dimensions", pattern=PATTERN)
