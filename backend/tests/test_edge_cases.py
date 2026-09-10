from __future__ import annotations

import pytest

from app.domain import ExtractedField, ImageMeta, OCRWord, ScanContext
from app.engine import _is_small_pack_exempt, run_engine
from app.extractors.mrp import extract_mrp
from app.rules_loader import load_rules

RULES_PATH = "app/rules.yaml"


@pytest.fixture
def rules():
    return load_rules(RULES_PATH)


def test_is_small_pack_exempt():
    # Weight <= 10g
    exempt, reason = _is_small_pack_exempt("5 g")
    assert exempt is True
    assert "5g <= 10g" in reason

    exempt, _ = _is_small_pack_exempt("10 g")
    assert exempt is True

    exempt, _ = _is_small_pack_exempt("10.00 gm")
    assert exempt is True

    # Weight > 10g
    exempt, _ = _is_small_pack_exempt("15 g")
    assert exempt is False

    exempt, _ = _is_small_pack_exempt("500 g")
    assert exempt is False

    # Volume <= 10ml
    exempt, reason = _is_small_pack_exempt("8 ml")
    assert exempt is True
    assert "8ml <= 10ml" in reason

    exempt, _ = _is_small_pack_exempt("10 mL")
    assert exempt is True

    # Volume > 10ml
    exempt, _ = _is_small_pack_exempt("15 ml")
    assert exempt is False

    exempt, _ = _is_small_pack_exempt("500 ml")
    assert exempt is False

    # Count == 1
    exempt, reason = _is_small_pack_exempt("1 N")
    assert exempt is True
    assert "single unit/piece" in reason

    exempt, _ = _is_small_pack_exempt("1 piece")
    assert exempt is True

    exempt, _ = _is_small_pack_exempt("1 U")
    assert exempt is True

    # Count > 1
    exempt, _ = _is_small_pack_exempt("2 N")
    assert exempt is False

    exempt, _ = _is_small_pack_exempt("5 units")
    assert exempt is False

    # Empty or invalid
    exempt, _ = _is_small_pack_exempt(None)
    assert exempt is False

    exempt, _ = _is_small_pack_exempt("")
    assert exempt is False


def test_usp_exemption_in_engine(rules):
    # Package with 5g net quantity and no USP declared -> must be 'na' (exempt)
    extracted = {
        "mrp": ExtractedField("mrp", "MRP Rs 10 Inclusive of all taxes", (0, 0, 10, 10), 0.9),
        "net_quantity": ExtractedField("net_quantity", "5 g", (0, 0, 10, 10), 0.9),
        "manufacturer_address": ExtractedField("manufacturer_address", "ACME Plot 12 Mumbai 400001", (0, 0, 10, 10), 0.9),
        "consumer_care": ExtractedField("consumer_care", "ACME care@acme.com +91 9876543210", (0, 0, 10, 10), 0.9),
        "mfg_date": ExtractedField("mfg_date", "Mfg: 03/2026", (0, 0, 10, 10), 0.9),
    }
    verdicts = {v.rule_id: v for v in run_engine(extracted, rules, ScanContext())}
    usp_verdict = verdicts["r6_11_unit_sale_price"]
    assert usp_verdict.status == "na"
    assert "exempt" in usp_verdict.reasoning.lower()
    assert "Rule 6(11) Second Proviso" in usp_verdict.reasoning

    # Package with 500g net quantity and no USP declared -> must NOT be exempt (manual_review)
    extracted["net_quantity"] = ExtractedField("net_quantity", "500 g", (0, 0, 10, 10), 0.9)
    verdicts = {v.rule_id: v for v in run_engine(extracted, rules, ScanContext())}
    usp_verdict = verdicts["r6_11_unit_sale_price"]
    assert usp_verdict.status == "manual_review"


def test_dual_mrp_detection_extractor():
    image_meta = ImageMeta(width=1000, height=1000)
    phrase_regex = r"(?i)\b(?:incl\.?|inclusive)\s*(?:of\s+)?(?:all)?\s*taxes?\b"

    # Words with original MRP 100 and tampered/over-stickered MRP 120
    ocr_words = [
        OCRWord("MRP", 0.95, (0.1, 0.1, 0.05, 0.02)),
        OCRWord("Rs", 0.95, (0.16, 0.1, 0.03, 0.02)),
        OCRWord("100", 0.95, (0.2, 0.1, 0.05, 0.02)),
        OCRWord("Inclusive", 0.95, (0.26, 0.1, 0.08, 0.02)),
        OCRWord("of", 0.95, (0.35, 0.1, 0.02, 0.02)),
        OCRWord("all", 0.95, (0.38, 0.1, 0.03, 0.02)),
        OCRWord("taxes", 0.95, (0.42, 0.1, 0.05, 0.02)),
        # Sticker nearby with conflicting MRP 120
        OCRWord("MRP", 0.92, (0.6, 0.1, 0.05, 0.02)),
        OCRWord("Rs", 0.92, (0.66, 0.1, 0.03, 0.02)),
        OCRWord("120", 0.92, (0.7, 0.1, 0.05, 0.02)),
    ]

    result = extract_mrp(ocr_words, image_meta, phrase_regex)
    assert result is not None
    assert result.value in ("100", "120")
    assert len(result.conflicting_values) == 2
    assert "100" in result.conflicting_values
    assert "120" in result.conflicting_values


def test_dual_mrp_warning_in_engine(rules):
    # ExtractedField with conflicting MRPs
    mrp_field = ExtractedField(
        name="mrp",
        value="MRP Rs 100 (Inclusive of all taxes)",
        bbox=(0.1, 0.1, 0.1, 0.02),
        confidence=0.95,
        evidence_spans=[(0.1, 0.1, 0.1, 0.02), (0.6, 0.1, 0.1, 0.02)],
        conflicting_values=["100", "120"],
    )
    extracted = {
        "mrp": mrp_field,
        "net_quantity": ExtractedField("net_quantity", "500 g", (0, 0, 10, 10), 0.9),
        "manufacturer_address": ExtractedField("manufacturer_address", "ACME Plot 12 Mumbai 400001", (0, 0, 10, 10), 0.9),
        "consumer_care": ExtractedField("consumer_care", "ACME care@acme.com +91 9876543210", (0, 0, 10, 10), 0.9),
        "mfg_date": ExtractedField("mfg_date", "Mfg: 03/2026", (0, 0, 10, 10), 0.9),
        "unit_price": ExtractedField("unit_price", "Rs 0.20/g", (0, 0, 10, 10), 0.9),
    }

    verdicts = {v.rule_id: v for v in run_engine(extracted, rules, ScanContext())}
    mrp_verdict = verdicts["r6_1_e_mrp"]
    assert mrp_verdict.status == "warn"
    assert "Rule 18(2)" in mrp_verdict.reasoning
    assert "conflicting MRP declarations" in mrp_verdict.reasoning
