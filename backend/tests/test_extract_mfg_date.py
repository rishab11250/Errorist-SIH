"""Tests for the mfg date extractor."""
from __future__ import annotations

from app.domain import ImageMeta, OCRWord
from app.extractors.mfg_date import extract_mfg_date


def _w(text: str, conf: float, x: int = 0, y: int = 0) -> OCRWord:
    return OCRWord(text=text, confidence=conf, bbox=(float(x), float(y), 60.0, 18.0))


def _meta() -> ImageMeta:
    return ImageMeta(width=400, height=300)


DATE_RE = (
    r"(?i)\b(?:mfg|mfd|manufactured|packed|pkd)"
    r"[:\s,.]*"
    r"("
    r"(?:0?[1-9]|1[0-2])[\/\-\s]\d{2,4}"
    r"|"
    r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}"
    r")"
)


def test_extracts_numeric_mmyyyy() -> None:
    words = [_w("Mfg:", 0.93, x=10, y=100), _w("03/2026", 0.94, x=55, y=100)]
    result = extract_mfg_date(words, _meta(), DATE_RE)
    assert result is not None
    assert result.value == "03/2026"


def test_extracts_word_month() -> None:
    words = [_w("Manufactured:January 2026", 0.94, x=10, y=100)]
    result = extract_mfg_date(words, _meta(), DATE_RE)
    assert result is not None
    assert result.value is not None
    assert "January" in result.value
    assert "2026" in result.value


def test_no_date_returns_none_value() -> None:
    words = [_w("Hello", 0.9), _w("World", 0.9)]
    result = extract_mfg_date(words, _meta(), DATE_RE)
    assert result is not None
    assert result.value is None


def test_extracts_pkd_prefix() -> None:
    words = [_w("PKD", 0.93, x=10, y=100), _w("12/25", 0.94, x=55, y=100)]
    result = extract_mfg_date(words, _meta(), DATE_RE)
    assert result is not None
    assert result.value is not None
    assert "12" in result.value
