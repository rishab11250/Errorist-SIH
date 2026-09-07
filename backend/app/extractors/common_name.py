"""Extract the labeled common or generic commodity name."""

from __future__ import annotations

from app.domain import ExtractedField, ImageMeta, OCRWord
from app.extractors.base import extract_labeled_field

PATTERN = r"(?i)\b(?:common|generic)\s+name\s*[:\-]?\s*(.+)$"


def extract_common_name(
    ocr_words: list[OCRWord],
    image_meta: ImageMeta,  # noqa: ARG001
) -> ExtractedField:
    return extract_labeled_field(ocr_words, name="common_name", pattern=PATTERN)
