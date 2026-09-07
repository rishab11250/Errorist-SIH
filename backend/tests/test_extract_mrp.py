from app.domain import ImageMeta, OCRWord
from app.extractors.mrp import extract_mrp


def _w(t, c, x=0, y=0):
    return OCRWord(t, c, (float(x), float(y), 60.0, 22.0))


def _meta():
    return ImageMeta(400, 300)


PHRASE = r"(?i)\b(?:incl\.?|inclusive)\s*(?:of\s+)?all\s+taxes?\b"


def test_extracts_mrp_with_inclusive_phrase():
    r = extract_mrp(
        [
            _w("MRP", 0.95, 10, 100),
            _w("Rs.99.00", 0.93, 50, 100),
            _w("(Incl.", 0.91, 135, 100),
            _w("of", 0.95, 185, 100),
            _w("all", 0.95, 210, 100),
            _w("taxes)", 0.92, 240, 100),
        ],
        _meta(),
        PHRASE,
    )
    assert r.value == "99.00"
    assert r.confidence > 0.8


def test_mrp_without_phrase_returns_none_value():
    assert (
        extract_mrp([_w("MRP", 0.95, 10, 100), _w("Rs.99", 0.93, 50, 100)], _meta(), PHRASE).value
        is None
    )


def test_extracts_rupee_symbol():
    assert (
        extract_mrp(
            [
                _w("₹99.00", 0.95, 10, 100),
                _w("Inclusive", 0.92, 80, 100),
                _w("of", 0.95, 145, 100),
                _w("all", 0.95, 170, 100),
                _w("taxes", 0.92, 200, 100),
            ],
            _meta(),
            PHRASE,
        ).value
        == "99.00"
    )


def test_no_price_returns_none_value():
    assert extract_mrp([_w("Hello", 0.9), _w("World", 0.9)], _meta(), PHRASE).value is None


def test_phrase_too_far_vertically_misses_match():
    assert (
        extract_mrp(
            [
                _w("MRP", 0.95, 10, 10),
                _w("Rs.99", 0.93, 50, 10),
                _w("Inclusive", 0.92, 80, 300),
                _w("of", 0.95, 145, 300),
                _w("all", 0.95, 170, 300),
                _w("taxes", 0.92, 200, 300),
            ],
            _meta(),
            PHRASE,
        ).value
        is None
    )
