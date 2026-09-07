from app.domain import ImageMeta, OCRWord
from app.extractors.mrp import extract_mrp
def _w(t,c,x=0,y=0):return OCRWord(t,c,(float(x),float(y),60.,22.))
def _meta():return ImageMeta(400,300)
PHRASE=r'(?i)\b(?:incl\.?|inclusive)\s*(?:of\s+)?all\s+taxes?\b'
def test_extracts_mrp_with_inclusive_phrase():
 r=extract_mrp([_w("MRP",.95,10,100),_w("Rs.99.00",.93,50,100),_w("(Incl.",.91,135,100),_w("of",.95,185,100),_w("all",.95,210,100),_w("taxes)",.92,240,100)],_meta(),PHRASE);assert r.value=="99.00";assert r.confidence>.8
def test_mrp_without_phrase_returns_none_value():assert extract_mrp([_w("MRP",.95,10,100),_w("Rs.99",.93,50,100)],_meta(),PHRASE).value is None
def test_extracts_rupee_symbol():assert extract_mrp([_w("₹99.00",.95,10,100),_w("Inclusive",.92,80,100),_w("of",.95,145,100),_w("all",.95,170,100),_w("taxes",.92,200,100)],_meta(),PHRASE).value=="99.00"
def test_no_price_returns_none_value():assert extract_mrp([_w("Hello",.9),_w("World",.9)],_meta(),PHRASE).value is None
def test_phrase_too_far_vertically_misses_match():assert extract_mrp([_w("MRP",.95,10,10),_w("Rs.99",.93,50,10),_w("Inclusive",.92,80,300),_w("of",.95,145,300),_w("all",.95,170,300),_w("taxes",.92,200,300)],_meta(),PHRASE).value is None
