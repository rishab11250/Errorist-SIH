"""Helpers shared by all extractors."""
from __future__ import annotations
import re
from typing import Iterable
from app.domain import OCRWord
def words_to_text(words: Iterable[OCRWord]) -> str:
    return " ".join(w.text for w in words)
def find_word_with_text(words: list[OCRWord], pattern: str | re.Pattern[str]) -> list[OCRWord]:
    pattern = re.compile(pattern, re.IGNORECASE) if isinstance(pattern, str) else re.compile(pattern.pattern, re.IGNORECASE)
    return [w for w in words if pattern.search(w.text)]
def avg_confidence(words: list[OCRWord]) -> float:
    return sum(w.confidence for w in words) / len(words) if words else 0.0
def merge_bboxes(words: list[OCRWord]) -> tuple[float, float, float, float] | None:
    if not words: return None
    xs, ys = [w.bbox[0] for w in words], [w.bbox[1] for w in words]
    xe, ye = [w.bbox[0]+w.bbox[2] for w in words], [w.bbox[1]+w.bbox[3] for w in words]
    return min(xs), min(ys), max(xe)-min(xs), max(ye)-min(ys)
