from __future__ import annotations

from app.domain import OCRWord
from app.visual_analysis.product_consistency import (
    extract_product_anchors,
    verify_product_consistency,
)


def _words(text_list: list[str]) -> list[OCRWord]:
    return [OCRWord(t, 0.95, (0.1, 0.1, 0.1, 0.02)) for t in text_list]


def test_extract_anchors():
    sec = _words([
        "Sunfeast", "YiPPee!", "Noodles",
        "Lic.", "No.", "10012031000312",
        "8901725005955",
        "Batch", "BP41766",
    ])
    anchors = extract_product_anchors(sec)
    assert "sunfeast" in anchors["brands"]
    assert "yippee" in anchors["brands"]
    assert "10012031000312" in anchors["fssai"]
    assert "8901725005955" in anchors["barcodes"]
    assert "BP41766" in anchors["batches"]


def test_consistent_sections():
    # Section 1: Front / Brand
    sec1 = _words(["Sunfeast", "YiPPee!", "Instant", "Noodles"])
    # Section 2: FSSAI & Barcode
    sec2 = _words(["Lic.", "No.", "10012031000312", "8901725005955"])
    # Section 3: Flap with MRP and Batch
    sec3 = _words(["Net", "Weight", "420g", "MRP", "Rs", "90.00", "B.No:", "BP41766"])

    valid, reason = verify_product_consistency([sec1, sec2, sec3])
    assert valid is True
    assert reason is None


def test_conflicting_brands_rejected():
    sec1 = _words(["Sunfeast", "YiPPee!", "Noodles"])
    sec2 = _words(["Maggi", "2-Minute", "Noodles"])

    valid, reason = verify_product_consistency([sec1, sec2])
    assert valid is False
    assert "Incompatible brands detected" in reason


def test_conflicting_fssai_rejected():
    sec1 = _words(["Lic.", "No.", "10012031000312"])
    sec2 = _words(["Lic.", "No.", "10015042000123"])

    valid, reason = verify_product_consistency([sec1, sec2])
    assert valid is False
    assert "Conflicting FSSAI license numbers" in reason


def test_conflicting_barcodes_rejected():
    sec1 = _words(["8901725005955"])
    sec2 = _words(["8901030865421"])

    valid, reason = verify_product_consistency([sec1, sec2])
    assert valid is False
    assert "Conflicting barcodes" in reason
