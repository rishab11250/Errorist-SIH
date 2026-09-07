"""Extract a labeled best-before, use-by, or expiry declaration."""

from __future__ import annotations

from app.domain import ExtractedField, ImageMeta, OCRWord
from app.extractors.base import extract_labeled_field

PATTERN = r"(?i)\b(?:best\s+before|use\s+by|expiry|expires?)\s*[:\-]?\s*(.+)$"


def extract_best_before(
    ocr_words: list[OCRWord],
    image_meta: ImageMeta,  # noqa: ARG001
) -> ExtractedField:
    return extract_labeled_field(ocr_words, name="best_before", pattern=PATTERN)
