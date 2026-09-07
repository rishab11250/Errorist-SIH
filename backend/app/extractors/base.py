"""Helpers shared by all declaration extractors."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence

from app.domain import ExtractedField, OCRWord


def words_to_text(words: Iterable[OCRWord]) -> str:
    return " ".join(word.text for word in words)


def find_word_with_text(words: list[OCRWord], pattern: str | re.Pattern[str]) -> list[OCRWord]:
    compiled = re.compile(pattern, re.IGNORECASE) if isinstance(pattern, str) else pattern
    return [word for word in words if compiled.search(word.text)]


def avg_confidence(words: Sequence[OCRWord]) -> float:
    return sum(word.confidence for word in words) / len(words) if words else 0.0


def merge_bboxes(words: Sequence[OCRWord]) -> tuple[float, float, float, float] | None:
    if not words:
        return None
    left = min(word.bbox[0] for word in words)
    top = min(word.bbox[1] for word in words)
    right = max(word.bbox[0] + word.bbox[2] for word in words)
    bottom = max(word.bbox[1] + word.bbox[3] for word in words)
    return left, top, right - left, bottom - top


def group_words_into_lines(words: Sequence[OCRWord]) -> list[list[OCRWord]]:
    """Group normalized OCR words into stable visual lines."""

    ordered = sorted(
        (word for word in words if word.bbox[2] > 0 and word.bbox[3] > 0),
        key=lambda word: (word.bbox[1] + word.bbox[3] / 2, word.bbox[0]),
    )
    lines: list[list[OCRWord]] = []
    for word in ordered:
        center_y = word.bbox[1] + word.bbox[3] / 2
        matching_line = next(
            (
                line
                for line in lines
                if abs(center_y - sum(item.bbox[1] + item.bbox[3] / 2 for item in line) / len(line))
                <= max(word.bbox[3], max(item.bbox[3] for item in line)) * 0.6
            ),
            None,
        )
        if matching_line is None:
            lines.append([word])
        else:
            matching_line.append(word)
    for line in lines:
        line.sort(key=lambda word: word.bbox[0])
    return lines


def empty_field(name: str) -> ExtractedField:
    return ExtractedField(name=name, value=None, bbox=None, confidence=0.0, evidence_spans=[])


def extract_labeled_field(
    words: Sequence[OCRWord],
    *,
    name: str,
    pattern: str | re.Pattern[str],
    max_following_lines: int = 2,
) -> ExtractedField:
    """Match a label in one line or a bounded window of following lines."""

    compiled = re.compile(pattern) if isinstance(pattern, str) else pattern
    lines = group_words_into_lines(words)
    for start in range(len(lines)):
        for following in range(max_following_lines + 1):
            selected_lines = lines[start : start + following + 1]
            if len(selected_lines) != following + 1:
                break
            selected_words = [word for line in selected_lines for word in line]
            match = compiled.search(words_to_text(selected_words))
            if match is None:
                continue
            value = " ".join(match.group(1).split()).strip(" :-")
            if not value:
                continue
            return ExtractedField(
                name=name,
                value=value,
                bbox=merge_bboxes(selected_words),
                confidence=avg_confidence(selected_words),
                evidence_spans=[word.bbox for word in selected_words],
            )
    return empty_field(name)
