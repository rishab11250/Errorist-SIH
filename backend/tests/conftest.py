"""Shared test fixtures."""
from __future__ import annotations
from pathlib import Path
import pytest
from app.rules_loader import load_rules
RULES_PATH = Path(__file__).resolve().parent.parent / "app" / "rules.yaml"
@pytest.fixture(scope="session")
def rules() -> "RulesConfig":  # type: ignore[name-defined]
    return load_rules(RULES_PATH)
@pytest.fixture
def sample_ocr_words() -> list[dict]:
    return [
        {"text": "ACME", "confidence": 0.95, "bbox": (10, 10, 50, 20)}, {"text": "FOODS", "confidence": 0.94, "bbox": (65, 10, 60, 20)}, {"text": "PVT", "confidence": 0.92, "bbox": (10, 35, 40, 18)}, {"text": "LTD", "confidence": 0.93, "bbox": (55, 35, 35, 18)}, {"text": "Plot", "confidence": 0.91, "bbox": (10, 60, 35, 18)}, {"text": "12", "confidence": 0.95, "bbox": (50, 60, 20, 18)}, {"text": "Mumbai", "confidence": 0.90, "bbox": (75, 60, 60, 18)}, {"text": "400001", "confidence": 0.95, "bbox": (140, 60, 55, 18)}, {"text": "Net", "confidence": 0.92, "bbox": (10, 100, 30, 18)}, {"text": "Wt.", "confidence": 0.92, "bbox": (45, 100, 30, 18)}, {"text": "500", "confidence": 0.96, "bbox": (80, 100, 30, 18)}, {"text": "g", "confidence": 0.94, "bbox": (115, 100, 15, 18)}, {"text": "MRP", "confidence": 0.95, "bbox": (10, 130, 35, 22)}, {"text": "Rs.99.00", "confidence": 0.93, "bbox": (50, 130, 80, 22)}, {"text": "(Incl.", "confidence": 0.91, "bbox": (135, 130, 45, 22)}, {"text": "of", "confidence": 0.95, "bbox": (185, 130, 20, 22)}, {"text": "all", "confidence": 0.95, "bbox": (210, 130, 25, 22)}, {"text": "taxes)", "confidence": 0.92, "bbox": (240, 130, 55, 22)}, {"text": "Mfg:", "confidence": 0.93, "bbox": (10, 160, 40, 18)}, {"text": "03/2026", "confidence": 0.94, "bbox": (55, 160, 70, 18)}, {"text": "Customer", "confidence": 0.91, "bbox": (10, 190, 70, 18)}, {"text": "Care:", "confidence": 0.92, "bbox": (85, 190, 40, 18)}, {"text": "care@acme.com", "confidence": 0.95, "bbox": (10, 215, 110, 18)}, {"text": "Ph:", "confidence": 0.90, "bbox": (125, 215, 25, 18)}, {"text": "+91", "confidence": 0.91, "bbox": (155, 215, 30, 18)}, {"text": "9876543210", "confidence": 0.93, "bbox": (190, 215, 90, 18)}]
