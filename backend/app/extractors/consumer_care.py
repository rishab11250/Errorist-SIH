"""Extract consumer care details per Rule 6(2) — name, address, phone, email."""
from __future__ import annotations

import re

from app.domain import ExtractedField, ImageMeta, OCRWord
from app.extractors.base import avg_confidence, find_word_with_text, merge_bboxes

SECTION_KEYWORDS = re.compile(
    r"\b(?:customer\s+care|consumer\s+care|for\s+complaints|feedback|contact\s+us|grievance|"
    r"write\s+to|reach\s+us)\b",
    re.IGNORECASE,
)


def extract_consumer_care(
    ocr_words: list[OCRWord],
    image_meta: ImageMeta,  # noqa: ARG001
    email_regex: str,
    phone_regex: str,
) -> ExtractedField | None:
    """Find the consumer-care block when name, address, phone, and email are present."""
    email_re = re.compile(email_regex)
    phone_re = re.compile(phone_regex)

    email_words = [word for word in ocr_words if email_re.search(word.text)]
    phone_words = [word for word in ocr_words if phone_re.search(word.text)]

    if not email_words or not phone_words:
        return ExtractedField(
            name="consumer_care", value=None, bbox=None, confidence=0.0, evidence_spans=[]
        )

    section_words = find_word_with_text(ocr_words, SECTION_KEYWORDS)
    section_y = min(word.bbox[1] for word in section_words) if section_words else min(
        min(word.bbox[1] for word in email_words), min(word.bbox[1] for word in phone_words)
    )

    block = [word for word in ocr_words if 0 <= word.bbox[1] - section_y <= 200]
    block_text = " ".join(word.text for word in block)
    has_email = bool(email_re.search(block_text))
    has_phone = bool(phone_re.search(block_text))
    has_name_address = len(block) >= 4

    if not (has_email and has_phone and has_name_address):
        return ExtractedField(
            name="consumer_care",
            value=None,
            bbox=merge_bboxes(email_words + phone_words),
            confidence=avg_confidence(email_words + phone_words),
            evidence_spans=[email_words[0].bbox],
        )

    return ExtractedField(
        name="consumer_care",
        value=block_text,
        bbox=merge_bboxes(block),
        confidence=avg_confidence(block),
        evidence_spans=[email_words[0].bbox, phone_words[0].bbox],
    )
