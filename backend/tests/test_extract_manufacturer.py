"""Tests for manufacturer address extraction."""
from app.domain import ImageMeta, OCRWord
from app.extractors.manufacturer import extract_manufacturer_address
def _word(text, conf, x, y, w=30, h=18): return OCRWord(text, conf, (float(x),float(y),float(w),float(h)))
def _meta(): return ImageMeta(width=400,height=300)
def test_extracts_address_with_pin():
    words=[_word("ACME",.95,10,10,50),_word("FOODS",.94,65,10,60),_word("PVT",.92,10,35,40),_word("LTD",.93,55,35,35),_word("Mfg:",.90,10,60,40),_word("Plot",.91,55,60,35),_word("12",.95,95,60,20),_word("Mumbai",.90,120,60,60),_word("400001",.95,185,60,55),_word("India",.9,245,60,45)]
    result=extract_manufacturer_address(words,_meta(),r"\b([1-9][0-9]{5})\b"); assert result.value is not None; assert "400001" in result.value; assert "ACME" in result.value; assert result.confidence>.8; assert len(result.evidence_spans)==1
def test_returns_none_value_when_pin_missing():
    result=extract_manufacturer_address([_word("ACME",.95,10,10),_word("FOODS",.94,65,10),_word("Mfg:",.9,10,35),_word("Somewhere",.9,50,35)],_meta(),r"\b([1-9][0-9]{5})\b"); assert result.value is None; assert result.confidence==0.0
def test_no_role_keyword_returns_empty_field():
    result=extract_manufacturer_address([_word("Random",.9,10,10),_word("Label",.9,50,10),_word("Text",.9,90,10),_word("400001",.9,130,10)],_meta(),r"\b([1-9][0-9]{5})\b"); assert result.value is None; assert result.confidence==0.0
def test_marks_packed_by_keyword():
    result=extract_manufacturer_address([_word("Packed",.92,10,10,55),_word("by:",.92,70,10,25),_word("Beta",.92,10,35,40),_word("Co",.92,55,35,25),_word("110001",.95,85,35,55)],_meta(),r"\b([1-9][0-9]{5})\b"); assert result.value is not None; assert "110001" in result.value
def test_marks_imported_by_keyword():
    result=extract_manufacturer_address([_word("Imported",.92,10,10,70),_word("by:",.92,85,10,25),_word("Gamma",.92,10,35,50),_word("Imports",.92,65,35,60),_word("Delhi",.9,130,35,50),_word("110002",.95,10,60,55)],_meta(),r"\b([1-9][0-9]{5})\b"); assert result.value is not None; assert "110002" in result.value
