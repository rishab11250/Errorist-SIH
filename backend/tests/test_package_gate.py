"""Tests for packaging semantic anchor verification."""

from __future__ import annotations

from app.domain import OCRWord
from app.visual_analysis.package_gate import assess_package_anchors


def _word(text: str) -> OCRWord:
    return OCRWord(text=text, confidence=0.95, bbox=(0.1, 0.1, 0.2, 0.05))


def test_package_anchors_detected_on_real_label() -> None:
    words = [
        _word("Britannia"),
        _word("Good"),
        _word("Day"),
        _word("MRP"),
        _word("₹30"),
        _word("Net"),
        _word("Qty:"),
        _word("150g"),
        _word("Mfd"),
        _word("by"),
        _word("Britannia"),
    ]
    is_pkg, anchors = assess_package_anchors(words)
    assert is_pkg is True
    assert "pricing" in anchors
    assert "quantity" in anchors
    assert "dates_batch" in anchors
    assert "manufacturer" in anchors


def test_non_package_rejected_when_anchors_absent() -> None:
    words = [
        _word("Chapter"),
        _word("Three"),
        _word("The"),
        _word("quick"),
        _word("brown"),
        _word("fox"),
        _word("jumps"),
        _word("over"),
        _word("lazy"),
        _word("dog"),
    ]
    is_pkg, anchors = assess_package_anchors(words)
    assert is_pkg is False
    assert anchors == []


def test_empty_words_is_not_package() -> None:
    is_pkg, anchors = assess_package_anchors([])
    assert is_pkg is False
    assert anchors == []
