"""Extract manufacturer / packer / importer address per Rule 6(1)(a) + Rule 10."""

from __future__ import annotations

import re

from app.domain import ExtractedField, ImageMeta, OCRWord
from app.extractors.base import avg_confidence, merge_bboxes

ROLE_KEYWORDS = re.compile(
    r"\b(?:mfg|mfd|pkd|mktd|mfg\.?|mfd\.?|pkd\.?|mktd\.?|"
    r"(?:mfg|mfd)\.?\s*(?:&|and)\s*pkd\.?\s*(?:by)?:?|"
    r"manufactured\s+by:?|packed\s+by:?|pkd\.?\s*by:?|mktd\.?\s*by:?|"
    r"imported\s+by:?|marketed\s+by:?|manufactured\s+for:?|"
    r"imported\s+and\s+packed\s+by:?|manufacturer:?|packer:?)\b",
    re.IGNORECASE,
)
ADDRESS_HINT = re.compile(
    r"\b(?:pvt|ltd|limited|private|company|co\.|india|industries|foods|plot|road|street|"
    r"sector|phase|marg|nagar|colony|estate|complex|tel|phone|email|pin|"
    r"taluk|dist|district|village|khasra|survey|post|state|regd|office)\b",
    re.IGNORECASE,
)


def _group_into_lines(words: list[OCRWord], y_tolerance: float = 10.0) -> list[list[OCRWord]]:
    if not words:
        return []
    sorted_w = sorted(words, key=lambda w: (w.bbox[1], w.bbox[0]))
    lines = [[sorted_w[0]]]
    for w in sorted_w[1:]:
        if abs(w.bbox[1] - lines[-1][-1].bbox[1]) <= y_tolerance:
            lines[-1].append(w)
        else:
            lines.append([w])
    return lines


def _line_text(line: list[OCRWord]) -> str:
    return " ".join(w.text for w in line)


def _line_is_address(line: list[OCRWord], pin_regex: re.Pattern[str]) -> bool:
    return bool(pin_regex.search(_line_text(line)) or ADDRESS_HINT.search(_line_text(line)))


def extract_manufacturer_address(
    ocr_words: list[OCRWord], image_meta: ImageMeta, pin_regex: str
) -> ExtractedField | None:
    pin_re = re.compile(pin_regex)
    is_normalized = bool(
        ocr_words
        and all(
            w.bbox[0] <= 1.0 and w.bbox[1] <= 1.0 and w.bbox[2] <= 1.0 and w.bbox[3] <= 1.0
            for w in ocr_words
        )
    )
    if is_normalized:
        y_tol = (
            max(10.0, float(image_meta.height // 100)) / image_meta.height
            if image_meta.height > 0
            else 0.02
        )
    else:
        y_tol = float(max(10, image_meta.height // 100))
    lines = _group_into_lines(ocr_words, y_tol)
    start_idx = next(
        (i for i, line in enumerate(lines) if ROLE_KEYWORDS.search(_line_text(line))), None
    )
    if start_idx is None:
        return ExtractedField("manufacturer_address", None, None, 0.0, [])
    block_lines = lines[start_idx : start_idx + 1]
    has_pin = any(pin_re.search(w.text) for w in block_lines[0])
    if not has_pin:
        for j in range(start_idx + 1, min(start_idx + 7, len(lines))):
            if _line_is_address(lines[j], pin_re):
                block_lines.append(lines[j])
                if any(pin_re.search(w.text) for w in lines[j]):
                    break
            elif len(block_lines) >= 2:
                break
    block_words = [w for line in block_lines for w in line]
    pin_bbox = next((w.bbox for w in block_words if pin_re.search(w.text)), None)
    return ExtractedField(
        "manufacturer_address",
        " ".join(_line_text(line) for line in block_lines) if pin_bbox else None,
        merge_bboxes(block_words),
        avg_confidence(block_words) if pin_bbox else 0.0,
        [pin_bbox] if pin_bbox else [],
    )
