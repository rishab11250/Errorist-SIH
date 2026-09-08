"""Extract MRP per Rule 6(1)(e), verifying 'Inclusive of all taxes' is nearby."""

from __future__ import annotations

import re

from app.domain import ExtractedField, ImageMeta, OCRWord
from app.extractors.base import avg_confidence, merge_bboxes

PRICE_PATTERN = re.compile(
    r"(?:MRP|Max\.?\s*Retail\s*Price|₹|Rs\.?|Rs|price)\s*[:\-]?[₹$X\.\s]*([0-9,]+(?:\.\d{1,2})?)", re.I
)


def extract_mrp(
    ocr_words: list[OCRWord],
    image_meta: ImageMeta,
    phrase_regex: str,
    vertical_tolerance: float = 0.06,
) -> ExtractedField | None:
    phrase = re.compile(phrase_regex, re.I)
    price_word = None
    value = None
    for i in range(len(ocr_words)):
        m = PRICE_PATTERN.search(" ".join(w.text for w in ocr_words[i : i + 2]))
        if m:
            price_word = ocr_words[i]
            value = m.group(1)
            break
    if not price_word:
        return ExtractedField("mrp", None, None, 0.0, [])
    is_normalized = bool(
        ocr_words
        and all(
            w.bbox[0] <= 1.0 and w.bbox[1] <= 1.0 and w.bbox[2] <= 1.0 and w.bbox[3] <= 1.0
            for w in ocr_words
        )
    )
    vert_tol = (
        vertical_tolerance
        if is_normalized
        else vertical_tolerance * (image_meta.height if image_meta.height > 0 else 1000.0)
    )
    nearby = [w for w in ocr_words if abs(w.bbox[1] - price_word.bbox[1]) <= vert_tol]
    joined = " ".join(w.text for w in nearby)
    match = phrase.search(joined)
    if not match:
        return ExtractedField(
            "mrp", None, price_word.bbox, price_word.confidence, [price_word.bbox]
        )
    pos = 0
    phrase_words: list[OCRWord] = []
    for w in nearby:
        start = pos
        end = start + len(w.text)
        if not (end < match.start() or start > match.end()):
            phrase_words.append(w)
        pos = end + 1
    evidence_words = (
        [price_word] + [w for w in phrase_words if w is not price_word]
        if phrase_words
        else [price_word, *nearby]
    )
    return ExtractedField(
        "mrp",
        value,
        merge_bboxes(evidence_words),
        avg_confidence(evidence_words),
        [price_word.bbox, *[w.bbox for w in evidence_words if w is not price_word]],
    )
