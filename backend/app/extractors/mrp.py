"""Extract MRP per Rule 6(1)(e), verifying 'Inclusive of all taxes' is nearby."""

from __future__ import annotations

import re

from app.domain import ExtractedField, ImageMeta, OCRWord
from app.extractors.base import avg_confidence, merge_bboxes

PRICE_PATTERN = re.compile(
    r"(?:(?:M\.?\s*R\.?\s*P\.?|Max(?:imum)?\.?\s*Retail\s*Price)\s*[:\-]?[₹$X\.\s]*"
    r"(?:(?:₹|Rs\.?|Rs|price)\s*[:\-]?[₹$X\.\s]*)?|(?:₹|Rs\.?|Rs|price)\s*[:\-]?[₹$X\.\s]*)"
    r"([0-9,oOlI]+(?:\.[0-9,oOlI]{1,2})?)",
    re.I,
)
MRP_PREFIX_BRANCH = re.compile(
    r"^(?:M\.?\s*R\.?\s*P\.?|Max(?:imum)?\.?\s*Retail\s*Price)\s*[:\-]?",
    re.I,
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
        sample_text = " ".join(w.text for w in ocr_words[i : min(i + 4, len(ocr_words))])
        m = PRICE_PATTERN.match(sample_text)
        if not m and MRP_PREFIX_BRANCH.match(sample_text) and not re.search(r"\d", sample_text):
            sample_text = " ".join(w.text for w in ocr_words[i : min(i + 8, len(ocr_words))])
            m = PRICE_PATTERN.match(sample_text)
        if m:
            raw_val = m.group(1)
            cleaned = (
                raw_val.replace("o", "0").replace("O", "0").replace("l", "1").replace("I", "1")
            )
            if re.search(r"\d", cleaned):
                price_word = ocr_words[i]
                value = cleaned
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
