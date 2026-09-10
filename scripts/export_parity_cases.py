"""
Parity test harness: runs test cases through the Python implementation and exports
the exact inputs and outputs to JSON so the TypeScript test suite can assert
byte-for-byte and verdict-for-verdict parity.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Ensure backend root is on sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.domain import (
    AnalysisInput,
    ExtractedField,
    ImageMeta,
    OCRWord,
    PlacementResult,
    QualitySummary,
    ReadabilityAssessment,
    RulesConfig,
    ScanContext,
    Verdict,
)
from app.engine import overall_status, run_engine, _validate_unit_sale_price
from app.extractors.consumer_care import extract_consumer_care
from app.extractors.country_origin import extract_country_origin, extract_importer_address
from app.extractors.common_name import extract_common_name
from app.extractors.best_before import extract_best_before
from app.extractors.dimensions import extract_dimensions
from app.extractors.manufacturer import extract_manufacturer_address
from app.extractors.mfg_date import extract_mfg_date
from app.extractors.mrp import extract_mrp
from app.extractors.net_quantity import extract_net_quantity
from app.extractors.registry import extract_all
from app.extractors.unit_price import extract_unit_price
from app.rules_loader import load_rules
from app.visual_analysis.quality import (
    _confidence_distribution,
    _union_area,
    _clamped_boxes,
    analyze_quality,
)

def serialize_extracted_field(f: ExtractedField | None) -> dict | None:
    if f is None:
        return None
    return {
        "name": f.name,
        "value": f.value,
        "bbox": list(f.bbox) if f.bbox else None,
        "confidence": round(float(f.confidence), 4),
        "evidence_spans": [list(b) for b in f.evidence_spans],
    }

def serialize_verdict(v: Verdict) -> dict:
    return {
        "rule_id": v.rule_id,
        "status": v.status,
        "severity": v.severity,
        "citation": v.citation,
        "evidence": v.evidence,
        "evidence_bboxes": [list(b) for b in v.evidence_bboxes],
        "failure_message": v.failure_message,
        "rule_version": v.rule_version,
        "confidence": round(float(v.confidence), 4),
        "reasoning": v.reasoning,
        "measurement_method": v.measurement_method,
    }

def main():
    rules_path = backend_dir / "app" / "rules.yaml"
    rules = load_rules(rules_path)

    cases = {
        "mrp": [],
        "manufacturer": [],
        "consumer_care": [],
        "net_quantity": [],
        "mfg_date": [],
        "extended": [],
        "engine": [],
        "quality": [],
        "unit_sale_price": [],
    }

    # 1. MRP test cases
    phrase = r"(?i)\b(?:incl\.?|inclusive)\s*(?:of\s+)?all\s+taxes?\b"
    mrp_inputs = [
        # Standard with inclusive
        {
            "name": "with_inclusive_phrase",
            "words": [
                ("MRP", 0.95, [10, 100, 60, 22]),
                ("Rs.99.00", 0.93, [50, 100, 60, 22]),
                ("(Incl.", 0.91, [135, 100, 60, 22]),
                ("of", 0.95, [185, 100, 60, 22]),
                ("all", 0.95, [210, 100, 60, 22]),
                ("taxes)", 0.92, [240, 100, 60, 22]),
            ],
            "meta": [400, 300],
            "phrase": phrase,
        },
        # Without phrase
        {
            "name": "without_phrase",
            "words": [
                ("MRP", 0.95, [10, 100, 60, 22]),
                ("Rs.99", 0.93, [50, 100, 60, 22]),
            ],
            "meta": [400, 300],
            "phrase": phrase,
        },
        # Rupee symbol
        {
            "name": "rupee_symbol",
            "words": [
                ("₹99.00", 0.95, [10, 100, 60, 22]),
                ("Inclusive", 0.92, [80, 100, 60, 22]),
                ("of", 0.95, [145, 100, 60, 22]),
                ("all", 0.95, [170, 100, 60, 22]),
                ("taxes", 0.92, [200, 100, 60, 22]),
            ],
            "meta": [400, 300],
            "phrase": phrase,
        },
        # Spaced prefix with digit noise (MRP bug 1 fix)
        {
            "name": "spaced_prefix_ocr_noise",
            "words": [
                ("M", 0.92, [10, 100, 60, 22]),
                ("R", 0.93, [25, 100, 60, 22]),
                ("P", 0.94, [40, 100, 60, 22]),
                (":", 0.90, [55, 100, 60, 22]),
                ("Rs.", 0.92, [70, 100, 60, 22]),
                ("5O.OO", 0.88, [100, 100, 60, 22]),
                ("Incl.", 0.91, [150, 100, 60, 22]),
                ("of", 0.95, [190, 100, 60, 22]),
                ("all", 0.95, [215, 100, 60, 22]),
                ("taxes", 0.92, [245, 100, 60, 22]),
            ],
            "meta": [400, 300],
            "phrase": phrase,
        },
        # Spaced prefix without currency symbol
        {
            "name": "spaced_prefix_no_currency",
            "words": [
                ("M", 0.95, [10, 100, 60, 22]),
                ("R", 0.95, [25, 100, 60, 22]),
                ("P", 0.95, [40, 100, 60, 22]),
                (":", 0.95, [55, 100, 60, 22]),
                ("50.00", 0.95, [75, 100, 60, 22]),
                ("Incl.", 0.91, [140, 100, 60, 22]),
                ("of", 0.95, [180, 100, 60, 22]),
                ("all", 0.95, [205, 100, 60, 22]),
                ("taxes", 0.92, [235, 100, 60, 22]),
            ],
            "meta": [400, 300],
            "phrase": phrase,
        },
        # Normalized coords vertical tolerance
        {
            "name": "normalized_coords_evidence_spans",
            "words": [
                ("MRP", 0.95, [0.02, 0.30, 0.08, 0.04]),
                ("Rs.199", 0.94, [0.11, 0.30, 0.12, 0.04]),
                ("Inclusive", 0.92, [0.24, 0.30, 0.14, 0.04]),
                ("of", 0.95, [0.39, 0.30, 0.04, 0.04]),
                ("all", 0.95, [0.44, 0.30, 0.05, 0.04]),
                ("taxes", 0.93, [0.50, 0.30, 0.08, 0.04]),
                ("Customer", 0.90, [0.02, 0.80, 0.15, 0.04]),
                ("care@acme.com", 0.92, [0.02, 0.85, 0.20, 0.05]),
            ],
            "meta": [1000, 1000],
            "phrase": phrase,
        },
    ]

    for item in mrp_inputs:
        ocr_words = [OCRWord(t, c, tuple(b)) for t, c, b in item["words"]]
        meta = ImageMeta(item["meta"][0], item["meta"][1])
        py_res = extract_mrp(ocr_words, meta, item["phrase"])
        cases["mrp"].append({
            "name": item["name"],
            "words": [{"text": w.text, "confidence": w.confidence, "bbox": list(w.bbox)} for w in ocr_words],
            "meta": {"width": meta.width, "height": meta.height},
            "phrase": item["phrase"],
            "expected": serialize_extracted_field(py_res),
        })

    # 2. Manufacturer test cases
    pin_regex = r"\b([1-9][0-9]{5})\b"
    mfg_inputs = [
        {
            "name": "mfg_with_pin",
            "words": [
                ("Mfg:", 0.90, [10, 10, 40, 18]),
                ("by:", 0.90, [55, 10, 25, 18]),
                ("ACME", 0.95, [85, 10, 50, 18]),
                ("FOODS", 0.94, [140, 10, 60, 18]),
                ("PVT", 0.92, [10, 35, 40, 18]),
                ("LTD", 0.93, [55, 35, 35, 18]),
                ("Plot", 0.91, [10, 60, 35, 18]),
                ("12", 0.95, [50, 60, 20, 18]),
                ("Mumbai", 0.90, [75, 60, 60, 18]),
                ("400001", 0.95, [140, 60, 55, 18]),
                ("India", 0.90, [200, 60, 45, 18]),
            ],
            "meta": [400, 300],
            "pin": pin_regex,
        },
        {
            "name": "packed_by_keyword",
            "words": [
                ("Packed", 0.92, [10, 10, 55, 18]),
                ("by:", 0.92, [70, 10, 25, 18]),
                ("Beta", 0.92, [10, 35, 40, 18]),
                ("Co", 0.92, [55, 35, 25, 18]),
                ("110001", 0.95, [85, 35, 55, 18]),
            ],
            "meta": [400, 300],
            "pin": pin_regex,
        },
        {
            "name": "imported_by_keyword",
            "words": [
                ("Imported", 0.92, [10, 10, 70, 18]),
                ("by:", 0.92, [85, 10, 25, 18]),
                ("Gamma", 0.92, [10, 35, 50, 18]),
                ("Imports", 0.92, [65, 35, 60, 18]),
                ("Delhi", 0.90, [130, 35, 50, 18]),
                ("110002", 0.95, [10, 60, 55, 18]),
            ],
            "meta": [400, 300],
            "pin": pin_regex,
        },
        {
            "name": "multi_panel_vertical_composite",
            "words": [
                ("Mfg:", 0.95, [20, 50, 40, 18]),
                ("by:", 0.95, [65, 50, 25, 18]),
                ("ACME", 0.95, [95, 50, 50, 18]),
                ("Plot", 0.92, [20, 80, 40, 18]),
                ("12", 0.95, [65, 80, 20, 18]),
                ("Mumbai", 0.92, [90, 80, 60, 18]),
                ("400001", 0.95, [155, 80, 55, 18]),
                ("MRP", 0.95, [20, 1100, 40, 18]),
                ("Rs.", 0.95, [65, 1100, 30, 18]),
                ("99.00", 0.95, [100, 1100, 50, 18]),
            ],
            "meta": [1000, 1450],
            "pin": pin_regex,
        },
        {
            "name": "no_pin_returns_none",
            "words": [
                ("ACME", 0.95, [10, 10, 40, 18]),
                ("FOODS", 0.94, [65, 10, 40, 18]),
                ("Mfg:", 0.90, [10, 35, 40, 18]),
                ("Somewhere", 0.90, [50, 35, 40, 18]),
            ],
            "meta": [400, 300],
            "pin": pin_regex,
        },
    ]

    for item in mfg_inputs:
        ocr_words = [OCRWord(t, c, tuple(b)) for t, c, b in item["words"]]
        meta = ImageMeta(item["meta"][0], item["meta"][1])
        py_res = extract_manufacturer_address(ocr_words, meta, item["pin"])
        cases["manufacturer"].append({
            "name": item["name"],
            "words": [{"text": w.text, "confidence": w.confidence, "bbox": list(w.bbox)} for w in ocr_words],
            "meta": {"width": meta.width, "height": meta.height},
            "pin": item["pin"],
            "expected": serialize_extracted_field(py_res),
        })

    # 3. Consumer Care test cases
    email_re = r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
    phone_re = r"(?:\+91[\s-]?)?[6-9]\d{9}"
    care_inputs = [
        {
            "name": "complete_consumer_care",
            "words": [
                ("Customer", 0.92, [10, 150, 50, 18]),
                ("Care:", 0.93, [85, 150, 50, 18]),
                ("ACME", 0.93, [10, 175, 50, 18]),
                ("Foods", 0.93, [65, 175, 50, 18]),
                ("care@acme.com", 0.95, [10, 200, 50, 18]),
                ("Ph:", 0.90, [125, 200, 50, 18]),
                ("+91", 0.91, [155, 200, 50, 18]),
                ("9876543210", 0.93, [190, 200, 50, 18]),
            ],
            "meta": [400, 400],
            "email": email_re,
            "phone": phone_re,
        },
        {
            "name": "missing_email",
            "words": [
                ("Customer", 0.92, [10, 150, 50, 18]),
                ("Care:", 0.93, [85, 150, 50, 18]),
                ("Ph:", 0.90, [10, 200, 50, 18]),
                ("+91", 0.91, [40, 200, 50, 18]),
                ("9876543210", 0.93, [80, 200, 50, 18]),
            ],
            "meta": [400, 400],
            "email": email_re,
            "phone": phone_re,
        },
    ]

    for item in care_inputs:
        ocr_words = [OCRWord(t, c, tuple(b)) for t, c, b in item["words"]]
        meta = ImageMeta(item["meta"][0], item["meta"][1])
        py_res = extract_consumer_care(ocr_words, meta, item["email"], item["phone"])
        cases["consumer_care"].append({
            "name": item["name"],
            "words": [{"text": w.text, "confidence": w.confidence, "bbox": list(w.bbox)} for w in ocr_words],
            "meta": {"width": meta.width, "height": meta.height},
            "email": item["email"],
            "phone": item["phone"],
            "expected": serialize_extracted_field(py_res),
        })

    # 4. Net Quantity test cases
    qty_inputs = [
        {
            "name": "grams",
            "words": [("Net", 0.95, [0, 0, 30, 18]), ("Wt:", 0.95, [0, 0, 30, 18]), ("500", 0.96, [0, 0, 30, 18]), ("g", 0.94, [0, 0, 30, 18])],
            "meta": [400, 300],
            "units": ["g", "kg", "ml", "l"],
        },
        {
            "name": "kilograms",
            "words": [("Net", 0.9, [0, 0, 30, 18]), ("Wt:", 0.9, [0, 0, 30, 18]), ("2.5", 0.92, [0, 0, 30, 18]), ("kg", 0.93, [0, 0, 30, 18])],
            "meta": [400, 300],
            "units": ["g", "kg"],
        },
        {
            "name": "millilitres",
            "words": [("Net", 0.9, [0, 0, 30, 18]), ("Qty:", 0.9, [0, 0, 30, 18]), ("750", 0.95, [0, 0, 30, 18]), ("ml", 0.93, [0, 0, 30, 18])],
            "meta": [400, 300],
            "units": ["ml", "l"],
        },
    ]

    for item in qty_inputs:
        ocr_words = [OCRWord(t, c, tuple(b)) for t, c, b in item["words"]]
        meta = ImageMeta(item["meta"][0], item["meta"][1])
        py_res = extract_net_quantity(ocr_words, meta, item["units"])
        cases["net_quantity"].append({
            "name": item["name"],
            "words": [{"text": w.text, "confidence": w.confidence, "bbox": list(w.bbox)} for w in ocr_words],
            "meta": {"width": meta.width, "height": meta.height},
            "units": item["units"],
            "expected": serialize_extracted_field(py_res),
        })

    # 5. Mfg date test cases
    date_pattern = r"(?i)\b(?:mfg|mfd|manufactured|packed|pkd)[:\s,.]*((?:0?[1-9]|1[0-2])[\/\-\s]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4})"
    date_inputs = [
        {
            "name": "numeric_mmyyyy",
            "words": [("Mfg:", 0.93, [10, 100, 60, 18]), ("03/2026", 0.94, [55, 100, 60, 18])],
            "meta": [400, 300],
            "pattern": date_pattern,
        },
        {
            "name": "word_month",
            "words": [("Manufactured:January 2026", 0.94, [10, 100, 60, 18])],
            "meta": [400, 300],
            "pattern": date_pattern,
        },
        {
            "name": "pkd_prefix",
            "words": [("PKD", 0.93, [10, 100, 60, 18]), ("12/25", 0.94, [55, 100, 60, 18])],
            "meta": [400, 300],
            "pattern": date_pattern,
        },
    ]

    for item in date_inputs:
        ocr_words = [OCRWord(t, c, tuple(b)) for t, c, b in item["words"]]
        meta = ImageMeta(item["meta"][0], item["meta"][1])
        py_res = extract_mfg_date(ocr_words, meta, item["pattern"])
        cases["mfg_date"].append({
            "name": item["name"],
            "words": [{"text": w.text, "confidence": w.confidence, "bbox": list(w.bbox)} for w in ocr_words],
            "meta": {"width": meta.width, "height": meta.height},
            "pattern": item["pattern"],
            "expected": serialize_extracted_field(py_res),
        })

    # 6. Extended extractors
    extended_tests = [
        ("Common name: Roasted Peanuts", "common_name"),
        ("Country of Origin: India", "country_origin"),
        ("Best Before 9 Months from Packing", "best_before"),
        ("Dimensions 20 cm x 10 cm x 5 cm", "dimensions"),
        ("Unit Sale Price ₹ 0.50/g", "unit_price"),
        ("Imported by Acme India Pvt Ltd Mumbai 400001", "importer_address"),
    ]

    for text, field in extended_tests:
        tokens = text.split()
        width = 0.8 / max(len(tokens), 1)
        ocr_words = [
            OCRWord(token, 0.95, (0.1 + idx * width, 0.1, width * 0.9, 0.04))
            for idx, token in enumerate(tokens)
        ]
        meta = ImageMeta(1000, 1000)
        all_py = extract_all(ocr_words, meta, ScanContext(), rules)
        cases["extended"].append({
            "text": text,
            "field": field,
            "words": [{"text": w.text, "confidence": w.confidence, "bbox": list(w.bbox)} for w in ocr_words],
            "meta": {"width": meta.width, "height": meta.height},
            "expected": serialize_extracted_field(all_py[field]),
        })

    # 7. Quality metrics
    quality_cases = [
        {
            "name": "two_words_distribution",
            "words": [
                ("A", 0.9, [0.1, 0.1, 0.2, 0.2]),
                ("B", 0.5, [0.2, 0.2, 0.2, 0.2]),
            ],
        },
        {
            "name": "low_confidence_retake",
            "words": [
                ("garbled1", 0.25, [0.1, 0.1, 0.2, 0.05]),
                ("garbled2", 0.30, [0.3, 0.1, 0.2, 0.05]),
            ],
        },
    ]

    for qc in quality_cases:
        words = tuple(OCRWord(t, c, tuple(b)) for t, c, b in qc["words"])
        med, lq = _confidence_distribution(words)
        boxes = _clamped_boxes(words)
        cov = _union_area(boxes) * 100.0
        cases["quality"].append({
            "name": qc["name"],
            "words": [{"text": w.text, "confidence": w.confidence, "bbox": list(w.bbox)} for w in words],
            "expected_median": round(med, 2),
            "expected_lower_quartile": round(lq, 2),
            "expected_coverage": round(cov, 4),
        })

    # 8. USP Validation test cases
    usp_cases = [
        ("MRP 100", "100 g", "₹ 1.00/g", True),
        ("MRP 100", "200 g", "₹ 1.00/g", False),  # discrepancy: declared 1.00 vs expected 0.50
        ("MRP 50", "1 kg", "₹ 50.00/kg", True),
        ("MRP 50", "500 ml", "₹ 100.00/l", True),
    ]

    for mrp, qty, usp, exp_valid in usp_cases:
        valid, note = _validate_unit_sale_price(mrp, qty, usp)
        cases["unit_sale_price"].append({
            "mrp": mrp,
            "qty": qty,
            "usp": usp,
            "expected_valid": valid,
            "has_note": note is not None,
        })

    # 9. Engine test cases: Pass, Fail, Malformed, Category Exemptions, Mode etc.
    def make_ext(name, val, conf=0.9):
        return ExtractedField(name, val, (0.1, 0.1, 0.3, 0.05), conf, [(0.1, 0.1, 0.3, 0.05)])

    complete_ext = {
        "mrp": make_ext("mrp", "MRP Rs.99.00 (Inclusive of all taxes)"),
        "net_quantity": make_ext("net_quantity", "500 g"),
        "manufacturer_address": make_ext("manufacturer_address", "ACME Plot 12 Mumbai 400001"),
        "consumer_care": make_ext("consumer_care", "ACME care@acme.com +91 9876543210"),
        "mfg_date": make_ext("mfg_date", "Mfg: 03/2026"),
    }

    engine_scenarios = [
        {
            "name": "all_pass_retail",
            "extracted": complete_ext,
            "context": ScanContext(mode="retail_image", category="non_food"),
            "quality": QualitySummary("acceptable", 90.0, (), ()),
        },
        {
            "name": "mrp_missing_tax_phrase",
            "extracted": {
                **complete_ext,
                "mrp": make_ext("mrp", "MRP Rs.99", conf=0.95),
            },
            "context": ScanContext(mode="retail_image", category="non_food"),
            "quality": QualitySummary("acceptable", 90.0, (), ()),
        },
        {
            "name": "low_confidence_malformed_requires_review",
            "extracted": {
                **complete_ext,
                "mrp": make_ext("mrp", "MRP Rs.99", conf=0.65),
            },
            "context": ScanContext(mode="retail_image", category="non_food"),
            "quality": QualitySummary("acceptable", 90.0, (), ()),
        },
        {
            "name": "retake_recommended_quality_triggers_review",
            "extracted": complete_ext,
            "context": ScanContext(mode="retail_image", category="non_food"),
            "quality": QualitySummary("retake_recommended", 45.0, (), ()),
        },
        {
            "name": "ecommerce_listing_mode_with_all_declarations",
            "extracted": {
                **complete_ext,
                "common_name": make_ext("common_name", "Biscuits"),
                "country_origin": make_ext("country_origin", "India"),
                "best_before": make_ext("best_before", "6 months"),
                "unit_price": make_ext("unit_price", "₹ 0.20/g"),
            },
            "context": ScanContext(mode="ecommerce_listing", category="non_food"),
            "quality": QualitySummary("acceptable", 90.0, (), ()),
        },
    ]

    for scen in engine_scenarios:
        analysis_input = AnalysisInput(
            extracted=scen["extracted"],
            quality=scen["quality"],
            readability={},
            placement={},
        )
        verdicts = run_engine(analysis_input, rules, scen["context"])
        overall = overall_status(verdicts)

        serialized_ext = {
            k: serialize_extracted_field(v) for k, v in scen["extracted"].items()
        }

        cases["engine"].append({
            "name": scen["name"],
            "extracted": serialized_ext,
            "context": {
                "mode": scen["context"].mode,
                "category": scen["context"].category,
                "imported": scen["context"].imported,
            },
            "quality": {
                "status": scen["quality"].status,
                "score": scen["quality"].score,
            },
            "expected_verdicts": [serialize_verdict(v) for v in verdicts],
            "expected_overall_status": overall,
        })

    # Save to frontend/tests/fixtures/python_parity_cases.json
    out_dir = Path(__file__).resolve().parent.parent / "frontend" / "tests" / "fixtures"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "python_parity_cases.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(cases, f, indent=2)

    print(f"Exported parity test cases to {out_file}")

if __name__ == "__main__":
    main()
