"""Packaging semantic anchor verification for LMPC compliance."""

from __future__ import annotations

import re
from collections.abc import Sequence

from app.domain import OCRWord

_PRICE_PATTERN = re.compile(
    r"\b(m\.?r\.?p\.?|max(?:imum)?\s*retail\s*price|incl(?:usive)?\s*(?:of)?\s*all\s*taxes|inr)\b|[₹]|\brs\s*\.?\s*\d+",
    re.IGNORECASE,
)
_QTY_PATTERN = re.compile(
    r"\b(net\s*(?:wt\.?|weight|qty\.?|quantity|vol\.?|volume|contents?)|gross\s*(?:wt\.?|weight))\b|\b\d+(?:\.\d+)?\s*(?:g|gm|gms|kg|kgs|ml|l|ltr|ltrs|pcs|pieces|units|tablets|capsules|N)\b",
    re.IGNORECASE,
)
_DATE_PATTERN = re.compile(
    r"\b(mfd\.?|mfg\.?|packed|pkd\.?|packaging\s*date|packed\s*on|batch(?:\s*no\.?)?|lot(?:\s*no\.?)?|exp(?:iry)?(?:\s*date)?|best\s*before|use\s*by)\b",
    re.IGNORECASE,
)
_MFD_PATTERN = re.compile(
    r"\b(mfd\.?\s*by|mfg\.?\s*by|manufactured\s*by|marketed\s*by|packed\s*by|imported\s*by|mktd\.?\s*by|country\s*of\s*origin|made\s*in)\b",
    re.IGNORECASE,
)
_PIN_PATTERN = re.compile(r"\b[1-9][0-9]{5}\b")
_CARE_REGULATORY_PATTERN = re.compile(
    r"\b(consumer\s*care|customer\s*care|toll\s*free|care\s*cell|helpline|fssai|lic\.?\s*no\.?)\b",
    re.IGNORECASE,
)
_NUTRITION_PATTERN = re.compile(
    r"\b(ingredients?|nutrition(?:al)?(?:\s*information)?|per\s*100\s*(?:g|ml)|energy|protein|carbohydrates?)\b",
    re.IGNORECASE,
)


def assess_package_anchors(words: Sequence[OCRWord]) -> tuple[bool, list[str]]:
    """Detect whether OCR words contain statutory LMPC packaging anchors.

    Returns (is_package, list_of_anchor_categories_found).
    """
    if not words:
        return False, []

    full_text = " ".join(word.text for word in words)
    anchors: list[str] = []

    if _PRICE_PATTERN.search(full_text):
        anchors.append("pricing")
    if _QTY_PATTERN.search(full_text):
        anchors.append("quantity")
    if _DATE_PATTERN.search(full_text):
        anchors.append("dates_batch")
    if _MFD_PATTERN.search(full_text) or _PIN_PATTERN.search(full_text):
        anchors.append("manufacturer")
    if _CARE_REGULATORY_PATTERN.search(full_text):
        anchors.append("consumer_care_regulatory")
    if _NUTRITION_PATTERN.search(full_text):
        anchors.append("ingredients_nutrition")

    return len(anchors) >= 1, anchors
