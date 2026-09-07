"""Tests for the consumer care extractor."""
from __future__ import annotations

from app.domain import ImageMeta, OCRWord
from app.extractors.consumer_care import extract_consumer_care


def _w(text: str, conf: float, x: int = 0, y: int = 0) -> OCRWord:
    return OCRWord(text=text, confidence=conf, bbox=(float(x), float(y), 50.0, 18.0))


def _meta() -> ImageMeta:
    return ImageMeta(width=400, height=400)


EMAIL = r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
PHONE = r"(?:\+91[\s-]?)?[6-9]\d{9}"


def test_extracts_complete_consumer_care_block() -> None:
    words = [
        _w("Customer", 0.92, x=10, y=150),
        _w("Care:", 0.93, x=85, y=150),
        _w("ACME", 0.93, x=10, y=175),
        _w("Foods", 0.93, x=65, y=175),
        _w("care@acme.com", 0.95, x=10, y=200),
        _w("Ph:", 0.90, x=125, y=200),
        _w("+91", 0.91, x=155, y=200),
        _w("9876543210", 0.93, x=190, y=200),
    ]
    result = extract_consumer_care(words, _meta(), EMAIL, PHONE)
    assert result is not None
    assert result.value is not None
    assert "care@acme.com" in result.value
    assert "9876543210" in result.value
    assert len(result.evidence_spans) == 2


def test_missing_email_returns_none_value() -> None:
    words = [
        _w("Customer", 0.92, x=10, y=150),
        _w("Care:", 0.93, x=85, y=150),
        _w("ACME", 0.93, x=10, y=175),
        _w("Ph:", 0.90, x=10, y=200),
        _w("+91", 0.91, x=40, y=200),
        _w("9876543210", 0.93, x=80, y=200),
    ]
    result = extract_consumer_care(words, _meta(), EMAIL, PHONE)
    assert result is not None
    assert result.value is None


def test_missing_phone_returns_none_value() -> None:
    words = [
        _w("Customer", 0.92, x=10, y=150),
        _w("Care:", 0.93, x=85, y=150),
        _w("ACME", 0.93, x=10, y=175),
        _w("care@acme.com", 0.95, x=10, y=200),
    ]
    result = extract_consumer_care(words, _meta(), EMAIL, PHONE)
    assert result is not None
    assert result.value is None


def test_no_contact_info_at_all() -> None:
    words = [_w("Hello", 0.9, x=10, y=150), _w("World", 0.9, x=60, y=150)]
    result = extract_consumer_care(words, _meta(), EMAIL, PHONE)
    assert result is not None
    assert result.value is None
    assert result.confidence == 0.0
