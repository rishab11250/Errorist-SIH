"""Extract country of origin per Rule 6(1)(aa). For MVP: extract only — no rule check."""
from __future__ import annotations

import re

from app.domain import ExtractedField, ImageMeta, OCRWord

PATTERN = re.compile(
    r"(?i)(?:made\s+in|country\s+of\s+origin\s*[:\-]?|manufactured\s+in|origin\s*[:\-]?)\s*"
    r"([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)"
)


def extract_country_origin(
    ocr_words: list[OCRWord],
    image_meta: ImageMeta,  # noqa: ARG001
) -> ExtractedField | None:
    """Find 'Made in X', 'Country of Origin: X', or 'Manufactured in X'."""
    for word in ocr_words:
        match = PATTERN.search(word.text)
        if match:
            return ExtractedField(
                name="country_origin",
                value=match.group(1),
                bbox=word.bbox,
                confidence=word.confidence,
                evidence_spans=[word.bbox],
            )
    return ExtractedField(name="country_origin", value=None, bbox=None, confidence=0.0, evidence_spans=[])
