"""Extract country-of-origin and imported responsible-party evidence."""

from __future__ import annotations

from app.domain import ExtractedField, ImageMeta, OCRWord
from app.extractors.base import extract_labeled_field

COUNTRY_PATTERN = (
    r"(?i)\b(?:country\s+of\s+origin|made|manufactured)\s*(?:in\s*)?[:\-]?\s*"
    r"([A-Za-z][A-Za-z .'-]+)$"
)
IMPORTER_PATTERN = r"(?i)\bimported\s+by\s*[:\-]?\s*(.+)$"


def extract_country_origin(
    ocr_words: list[OCRWord],
    image_meta: ImageMeta,  # noqa: ARG001
) -> ExtractedField:
    return extract_labeled_field(
        ocr_words,
        name="country_origin",
        pattern=COUNTRY_PATTERN,
    )


def extract_importer_address(
    ocr_words: list[OCRWord],
    image_meta: ImageMeta,  # noqa: ARG001
) -> ExtractedField:
    return extract_labeled_field(
        ocr_words,
        name="importer_address",
        pattern=IMPORTER_PATTERN,
    )
