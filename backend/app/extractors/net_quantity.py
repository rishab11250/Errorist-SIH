"""Extract net quantity per Rule 6(1)(c) + Rule 13."""
from __future__ import annotations
import re
from app.domain import ExtractedField, ImageMeta, OCRWord
PATTERN=re.compile(r"(\d+(?:\.\d+)?)\s*(g|kg|ml|l|gm|GM|Kg|Litre|Liter|litre|liter|mL|ML)\b",re.I)
NON_METRIC=re.compile(r"\b(?:oz|ounce|ounces|lb|lbs|pound|pounds|fl\.?\s*oz)\b",re.I)
def extract_net_quantity(ocr_words:list[OCRWord], image_meta:ImageMeta, allowed_units:list[str])->ExtractedField|None:
    allowed={u.lower() for u in allowed_units}
    for i in range(len(ocr_words)):
        text=" ".join(w.text for w in ocr_words[i:i+2]); m=PATTERN.search(text)
        if m and m.group(2).lower() in allowed:
            ws=ocr_words[i:i+2]; return ExtractedField("net_quantity",m.group(0),ws[0].bbox,sum(w.confidence for w in ws)/len(ws),[w.bbox for w in ws])
    return ExtractedField("net_quantity",None,None,0.0,[])
