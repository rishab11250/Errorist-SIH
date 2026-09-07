"""Extract a labeled Rule 6(11) unit sale price."""

from __future__ import annotations

from app.domain import ExtractedField, ImageMeta, OCRWord
from app.extractors.base import extract_labeled_field

PATTERN = (
    r"(?i)\b(?:unit\s+sale\s+price|price\s+per\s+unit)\s*[:\-]?\s*"
    r"((?:₹|rs\.?|inr)\s*\d+(?:\.\d{1,2})?\s*/\s*(?:g|kg|ml|l|piece|unit))"
)


def extract_unit_price(
    ocr_words: list[OCRWord],
    image_meta: ImageMeta,  # noqa: ARG001
) -> ExtractedField:
    return extract_labeled_field(ocr_words, name="unit_price", pattern=PATTERN)
