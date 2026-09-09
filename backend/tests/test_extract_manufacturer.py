"""Tests for manufacturer address extraction."""

from app.domain import ImageMeta, OCRWord
from app.extractors.manufacturer import extract_manufacturer_address


def _word(text, conf, x, y, w=30, h=18):
    return OCRWord(text, conf, (float(x), float(y), float(w), float(h)))


def _meta():
    return ImageMeta(width=400, height=300)


def test_extracts_address_with_pin():
    words = [
        _word("Mfg:", 0.90, 10, 10, 40),
        _word("by:", 0.90, 55, 10, 25),
        _word("ACME", 0.95, 85, 10, 50),
        _word("FOODS", 0.94, 140, 10, 60),
        _word("PVT", 0.92, 10, 35, 40),
        _word("LTD", 0.93, 55, 35, 35),
        _word("Plot", 0.91, 10, 60, 35),
        _word("12", 0.95, 50, 60, 20),
        _word("Mumbai", 0.90, 75, 60, 60),
        _word("400001", 0.95, 140, 60, 55),
        _word("India", 0.9, 200, 60, 45),
    ]
    result = extract_manufacturer_address(words, _meta(), r"\b([1-9][0-9]{5})\b")
    assert result.value is not None
    assert "400001" in result.value
    assert "ACME" in result.value
    assert result.confidence > 0.8
    assert len(result.evidence_spans) == 1


def test_returns_none_value_when_pin_missing():
    result = extract_manufacturer_address(
        [
            _word("ACME", 0.95, 10, 10),
            _word("FOODS", 0.94, 65, 10),
            _word("Mfg:", 0.9, 10, 35),
            _word("Somewhere", 0.9, 50, 35),
        ],
        _meta(),
        r"\b([1-9][0-9]{5})\b",
    )
    assert result.value is None
    assert result.confidence == 0.0


def test_no_role_keyword_returns_empty_field():
    result = extract_manufacturer_address(
        [
            _word("Random", 0.9, 10, 10),
            _word("Label", 0.9, 50, 10),
            _word("Text", 0.9, 90, 10),
            _word("400001", 0.9, 130, 10),
        ],
        _meta(),
        r"\b([1-9][0-9]{5})\b",
    )
    assert result.value is None
    assert result.confidence == 0.0


def test_marks_packed_by_keyword():
    result = extract_manufacturer_address(
        [
            _word("Packed", 0.92, 10, 10, 55),
            _word("by:", 0.92, 70, 10, 25),
            _word("Beta", 0.92, 10, 35, 40),
            _word("Co", 0.92, 55, 35, 25),
            _word("110001", 0.95, 85, 35, 55),
        ],
        _meta(),
        r"\b([1-9][0-9]{5})\b",
    )
    assert result.value is not None
    assert "110001" in result.value


def test_marks_imported_by_keyword():
    result = extract_manufacturer_address(
        [
            _word("Imported", 0.92, 10, 10, 70),
            _word("by:", 0.92, 85, 10, 25),
            _word("Gamma", 0.92, 10, 35, 50),
            _word("Imports", 0.92, 65, 35, 60),
            _word("Delhi", 0.9, 130, 35, 50),
            _word("110002", 0.95, 10, 60, 55),
        ],
        _meta(),
        r"\b([1-9][0-9]{5})\b",
    )
    assert result.value is not None
    assert "110002" in result.value


def test_manufacturer_below_other_declarations_excludes_prior_lines():
    words = [
        _word("BrandX", 0.95, 10, 10, 60),
        _word("Net", 0.95, 10, 35, 30),
        _word("Qty:", 0.95, 45, 35, 30),
        _word("500g", 0.95, 80, 35, 40),
        _word("MRP", 0.95, 10, 60, 30),
        _word("Rs.99", 0.95, 45, 60, 40),
        _word("Mfg:", 0.90, 10, 85, 40),
        _word("Acme", 0.95, 55, 85, 45),
        _word("Foods", 0.95, 105, 85, 50),
        _word("Plot", 0.91, 10, 110, 35),
        _word("12", 0.95, 50, 110, 20),
        _word("Delhi", 0.90, 75, 110, 50),
        _word("110001", 0.95, 130, 110, 55),
    ]
    result = extract_manufacturer_address(words, _meta(), r"\b([1-9][0-9]{5})\b")
    assert result.value is not None
    assert "110001" in result.value
    assert "Acme" in result.value
    assert "BrandX" not in result.value
    assert "500g" not in result.value
    assert "99" not in result.value


def test_marks_pkd_by_and_district_keywords():
    words = [
        _word("Pkd.", 0.92, 10, 10, 40),
        _word("by:", 0.92, 55, 10, 25),
        _word("Delta", 0.93, 85, 10, 45),
        _word("Agro", 0.93, 135, 10, 40),
        _word("Village", 0.91, 10, 35, 55),
        _word("Rampur,", 0.91, 70, 35, 60),
        _word("Dist", 0.90, 10, 60, 35),
        _word("Thane", 0.90, 50, 60, 45),
        _word("400601", 0.95, 100, 60, 55),
    ]
    result = extract_manufacturer_address(words, _meta(), r"\b([1-9][0-9]{5})\b")
    assert result.value is not None
    assert "400601" in result.value
    assert "Delta" in result.value


def test_vertical_composite_prevents_mrp_cross_panel_contamination():
    h1 = 400
    gap = 650
    h2 = 400
    total_height = h1 + gap + h2
    meta = ImageMeta(width=1000, height=total_height)

    words = [
        _word("Mfg:", 0.95, 20, 50, 40),
        _word("by:", 0.95, 65, 50, 25),
        _word("ACME", 0.95, 95, 50, 50),
        _word("Plot", 0.92, 20, 80, 40),
        _word("12", 0.95, 65, 80, 20),
        _word("Mumbai", 0.92, 90, 80, 60),
        _word("400001", 0.95, 155, 80, 55),
        _word("MRP", 0.95, 20, h1 + gap + 50, 40),
        _word("Rs.", 0.95, 65, h1 + gap + 50, 30),
        _word("99.00", 0.95, 100, h1 + gap + 50, 50),
    ]

    result = extract_manufacturer_address(words, meta, r"\b([1-9][0-9]{5})\b")
    assert result.value is not None
    assert "ACME" in result.value
    assert "400001" in result.value
    assert "99.00" not in result.value
    assert "MRP" not in result.value

