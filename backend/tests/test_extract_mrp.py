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


def test_mrp_evidence_bboxes_excludes_far_words():
    consumer_care_bbox = (0.02, 0.85, 0.20, 0.05)
    words = [
        OCRWord("MRP", 0.95, (0.02, 0.30, 0.08, 0.04)),
        OCRWord("Rs.199", 0.94, (0.11, 0.30, 0.12, 0.04)),
        OCRWord("Inclusive", 0.92, (0.24, 0.30, 0.14, 0.04)),
        OCRWord("of", 0.95, (0.39, 0.30, 0.04, 0.04)),
        OCRWord("all", 0.95, (0.44, 0.30, 0.05, 0.04)),
        OCRWord("taxes", 0.93, (0.50, 0.30, 0.08, 0.04)),
        OCRWord("Customer", 0.90, (0.02, 0.80, 0.15, 0.04)),
        OCRWord("care@acme.com", 0.92, consumer_care_bbox),
    ]
    result = extract_mrp(words, ImageMeta(1000, 1000), PHRASE)
    assert result is not None
    assert result.value == "199"
    assert consumer_care_bbox not in result.evidence_spans
    assert len(result.evidence_spans) <= 6


def test_extracts_mrp_spaced_prefix_and_ocr_digit_noise():
    words = [
        _w("M", 0.92, 10, 100),
        _w("R", 0.93, 25, 100),
        _w("P", 0.94, 40, 100),
        _w(":", 0.90, 55, 100),
        _w("Rs.", 0.92, 70, 100),
        _w("5O.OO", 0.88, 100, 100),
        _w("Incl.", 0.91, 150, 100),
        _w("of", 0.95, 190, 100),
        _w("all", 0.95, 215, 100),
        _w("taxes", 0.92, 245, 100),
    ]
    result = extract_mrp(words, _meta(), PHRASE)
    assert result.value == "50.00"
    assert result.confidence > 0.8
