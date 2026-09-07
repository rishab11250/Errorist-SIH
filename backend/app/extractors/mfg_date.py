"""Extract manufacture / packing date per Rule 6(1)(d)."""

from __future__ import annotations

import re

from app.domain import ExtractedField, ImageMeta, OCRWord
from app.extractors.base import merge_bboxes

DATE_PATTERN = re.compile(
    r"(?i)\b(?:mfg|mfd|manufactured|packed|pkd|pkd\.?|mfg\.?)"
    r"[:\s,.]*"
    r"("
    r"(?:0?[1-9]|1[0-2])[\/\-\s]\d{2,4}"
    r"|"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}"
    r")"
)


def extract_mfg_date(
    ocr_words: list[OCRWord],
    image_meta: ImageMeta,  # noqa: ARG001
    date_regex: str,
) -> ExtractedField | None:
    """Find manufacture dates in a single OCR token or adjacent OCR words."""
    date_re = re.compile(date_regex, re.IGNORECASE)
    text = " ".join(word.text for word in ocr_words)
    match = date_re.search(text)
    if match is None:
        return ExtractedField(
            name="mfg_date", value=None, bbox=None, confidence=0.0, evidence_spans=[]
        )

    matched_words = [
        word
        for word in ocr_words
        if match.start() <= text.find(word.text) + len(word.text)
        and text.find(word.text) <= match.end()
    ]
    if not matched_words:
        return ExtractedField(
            name="mfg_date", value=None, bbox=None, confidence=0.0, evidence_spans=[]
        )

    return ExtractedField(
        name="mfg_date",
        value=match.group(1).strip() if match.lastindex else match.group(0).strip(),
        bbox=merge_bboxes(matched_words),
        confidence=sum(word.confidence for word in matched_words) / len(matched_words),
        evidence_spans=[word.bbox for word in matched_words],
    )


__all__ = ["extract_mfg_date", "DATE_PATTERN"]
