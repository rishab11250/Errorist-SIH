"""Extract MRP per Rule 6(1)(e), verifying 'Inclusive of all taxes' is nearby."""

from __future__ import annotations

import re

from app.domain import ExtractedField, ImageMeta, OCRWord
from app.extractors.base import avg_confidence, merge_bboxes

PRICE_PATTERN = re.compile(
    r"(?:MRP|Max\.?\s*Retail\s*Price|₹|Rs\.?|Rs|price)\s*[:\-]?\s*([0-9,]+(?:\.\d{1,2})?)", re.I
)


def extract_mrp(
    ocr_words: list[OCRWord],
    image_meta: ImageMeta,
    phrase_regex: str,
    vertical_tolerance_px: float = 200.0,
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
    nearby = [w for w in ocr_words if abs(w.bbox[1] - price_word.bbox[1]) <= vertical_tolerance_px]
    joined = " ".join(w.text for w in nearby)
    if not phrase.search(joined):
        return ExtractedField(
            "mrp", None, price_word.bbox, price_word.confidence, [price_word.bbox]
        )
    return ExtractedField(
        "mrp",
        value,
        merge_bboxes([price_word, *nearby]),
        avg_confidence([price_word, *nearby]),
        [price_word.bbox, *[w.bbox for w in nearby if w is not price_word]],
    )
