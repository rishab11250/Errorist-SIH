"""Extract net quantity per Rule 6(1)(c) + Rule 13."""

from __future__ import annotations

import re

from app.domain import ExtractedField, ImageMeta, OCRWord

PATTERN = re.compile(
    r"(\d+(?:\.\d+)?)\s*(g|kg|ml|l|gm|GM|Kg|Litre|Liter|litre|liter|mL|ML)\b", re.I
)
NON_METRIC = re.compile(r"\b(?:oz|ounce|ounces|lb|lbs|pound|pounds|fl\.?\s*oz)\b", re.I)

NET_QTY_ANCHOR = re.compile(
    r"\b(?:net\s*(?:wt\.?|weight|qty\.?|quantity|vol\.?|volume|contents?)|gross\s*(?:wt\.?|weight)|quantity)\b",
    re.I,
)

NUTRITION_EXCLUSION = re.compile(
    r"\b(?:protein|energy|carbohydrate|carbs?|fat|sugar|sodium|cholesterol|nutrition|nutritional|nutrients?|per\s+100\s*g|serve\s+size|serving)\b",
    re.I,
)

BARCODE_PATTERN = re.compile(r"\b\d{8,}\b")

NON_STANDARD_UNIT_PATTERN = re.compile(
    r"\b\d+(?:\.\d+)?\s*(?:gm|gms|g\.|\bkg\.|\bkgs\b|ml\.|lt|ltr)\b",
    re.I,
)


def extract_net_quantity(
    ocr_words: list[OCRWord], image_meta: ImageMeta, allowed_units: list[str]
) -> ExtractedField | None:
    allowed = {u.lower() for u in allowed_units}
    best_candidate: tuple[ExtractedField, int] | None = None  # (field, priority)

    for i in range(len(ocr_words)):
        # Filter out barcode numbers (>= 8 consecutive digits)
        token_text = ocr_words[i].text
        if BARCODE_PATTERN.search(token_text):
            continue

        ws = ocr_words[i : i + 2]
        text = " ".join(w.text for w in ws)
        m = PATTERN.search(text)
        if not (m and m.group(2).lower() in allowed):
            continue

        # Check surrounding context for nutrition table keywords (skip 8g protein, 50g carbs, etc.)
        context_start = max(0, i - 4)
        context_end = min(len(ocr_words), i + 4)
        context_text = " ".join(w.text for w in ocr_words[context_start:context_end])
        is_nutrition = bool(NUTRITION_EXCLUSION.search(context_text))

        # Check if preceded by a statutory Net Quantity anchor keyword
        has_anchor = bool(NET_QTY_ANCHOR.search(context_text))

        candidate = ExtractedField(
            "net_quantity",
            m.group(0),
            ws[0].bbox,
            sum(w.confidence for w in ws) / len(ws),
            [w.bbox for w in ws],
        )

        # Priority 3: Labeled anchor (highest priority)
        # Priority 2: Not in nutrition table
        # Priority 1: In nutrition table (lowest priority fallback)
        priority = 3 if has_anchor else (2 if not is_nutrition else 1)

        if best_candidate is None or priority > best_candidate[1]:
            best_candidate = (candidate, priority)
            if priority == 3:
                break

    if best_candidate is not None:
        return best_candidate[0]

    return ExtractedField("net_quantity", None, None, 0.0, [])
