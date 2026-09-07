from app.domain import ImageMeta, OCRWord
from app.extractors.net_quantity import extract_net_quantity


def _w(t, c, x=0, y=0):
    return OCRWord(t, c, (float(x), float(y), 30.0, 18.0))


def _meta():
    return ImageMeta(400, 300)


def test_extracts_metric_grams():
    assert (
        extract_net_quantity(
            [_w("Net", 0.95), _w("Wt:", 0.95), _w("500", 0.96), _w("g", 0.94)],
            _meta(),
            ["g", "kg", "ml", "l"],
        ).value
        == "500 g"
    )


def test_extracts_kilograms():
    assert (
        extract_net_quantity(
            [_w("Net", 0.9), _w("Wt:", 0.9), _w("2.5", 0.92), _w("kg", 0.93)], _meta(), ["g", "kg"]
        ).value
        == "2.5 kg"
    )


def test_extracts_millilitres():
    assert (
        extract_net_quantity(
            [_w("Net", 0.9), _w("Qty:", 0.9), _w("750", 0.95), _w("ml", 0.93)], _meta(), ["ml", "l"]
        ).value
        == "750 ml"
    )


def test_accepts_litre_capitalization_variants():
    assert (
        "Litre" in extract_net_quantity([_w("1", 0.9), _w("Litre", 0.9)], _meta(), ["Litre"]).value
    )


def test_no_quantity_returns_none_value():
    r = extract_net_quantity([_w("Hello", 0.9), _w("World", 0.9)], _meta(), ["g"])
    assert r.value is None
    assert r.confidence == 0
