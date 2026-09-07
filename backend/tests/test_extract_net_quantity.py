from app.domain import ImageMeta, OCRWord
from app.extractors.net_quantity import extract_net_quantity
def _w(t,c,x=0,y=0):return OCRWord(t,c,(float(x),float(y),30.,18.))
def _meta():return ImageMeta(400,300)
def test_extracts_metric_grams():assert extract_net_quantity([_w("Net",.95),_w("Wt:",.95),_w("500",.96),_w("g",.94)],_meta(),["g","kg","ml","l"]).value=="500 g"
def test_extracts_kilograms():assert extract_net_quantity([_w("Net",.9),_w("Wt:",.9),_w("2.5",.92),_w("kg",.93)],_meta(),["g","kg"]).value=="2.5 kg"
def test_extracts_millilitres():assert extract_net_quantity([_w("Net",.9),_w("Qty:",.9),_w("750",.95),_w("ml",.93)],_meta(),["ml","l"]).value=="750 ml"
def test_accepts_litre_capitalization_variants():assert "Litre" in extract_net_quantity([_w("1",.9),_w("Litre",.9)],_meta(),["Litre"]).value
def test_no_quantity_returns_none_value():
 r=extract_net_quantity([_w("Hello",.9),_w("World",.9)],_meta(),["g"]);assert r.value is None;assert r.confidence==0
