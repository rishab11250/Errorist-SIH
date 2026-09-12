from __future__ import annotations

import io

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app import main
from app.main import app


def _test_image_b64() -> str:
    import base64

    image = Image.new("RGB", (400, 300), color="white")
    draw = ImageDraw.Draw(image)
    draw.text((20, 20), "Nestle Maggi 2-Minute Noodles", fill="black")
    draw.text((20, 60), "Manufactured by: Nestle India Ltd, Plot 10", fill="black")
    draw.text((20, 100), "Net Qty: 70 g", fill="black")
    draw.text((20, 140), "MRP Rs 14.00 (Inclusive of all taxes)", fill="black")
    draw.text((20, 180), "Mfg Date: 01/2026", fill="black")
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _payload(inspection_id: int | None = None) -> dict:
    words = [
        {"text": "Nestle", "confidence": 0.95, "bbox": [0.05, 0.05, 0.15, 0.08]},
        {"text": "Maggi", "confidence": 0.95, "bbox": [0.22, 0.05, 0.15, 0.08]},
        {"text": "Noodles", "confidence": 0.95, "bbox": [0.39, 0.05, 0.18, 0.08]},
        {"text": "Mfg", "confidence": 0.95, "bbox": [0.05, 0.20, 0.10, 0.08]},
        {"text": "by:", "confidence": 0.95, "bbox": [0.16, 0.20, 0.08, 0.08]},
        {"text": "Nestle", "confidence": 0.95, "bbox": [0.25, 0.20, 0.15, 0.08]},
        {"text": "India", "confidence": 0.95, "bbox": [0.42, 0.20, 0.12, 0.08]},
        {"text": "Ltd,", "confidence": 0.95, "bbox": [0.55, 0.20, 0.10, 0.08]},
        {"text": "Net", "confidence": 0.95, "bbox": [0.05, 0.35, 0.08, 0.08]},
        {"text": "Qty:", "confidence": 0.95, "bbox": [0.14, 0.35, 0.08, 0.08]},
        {"text": "70", "confidence": 0.95, "bbox": [0.23, 0.35, 0.06, 0.08]},
        {"text": "g", "confidence": 0.95, "bbox": [0.30, 0.35, 0.04, 0.08]},
        {"text": "MRP", "confidence": 0.95, "bbox": [0.05, 0.50, 0.10, 0.08]},
        {"text": "Rs", "confidence": 0.95, "bbox": [0.16, 0.50, 0.06, 0.08]},
        {"text": "14.00", "confidence": 0.95, "bbox": [0.23, 0.50, 0.12, 0.08]},
        {"text": "Inclusive", "confidence": 0.95, "bbox": [0.36, 0.50, 0.18, 0.08]},
        {"text": "of", "confidence": 0.95, "bbox": [0.55, 0.50, 0.05, 0.08]},
        {"text": "all", "confidence": 0.95, "bbox": [0.61, 0.50, 0.06, 0.08]},
        {"text": "taxes", "confidence": 0.95, "bbox": [0.68, 0.50, 0.10, 0.08]},
        {"text": "Mfg", "confidence": 0.95, "bbox": [0.05, 0.65, 0.08, 0.08]},
        {"text": "Date:", "confidence": 0.95, "bbox": [0.14, 0.65, 0.10, 0.08]},
        {"text": "01/2026", "confidence": 0.95, "bbox": [0.25, 0.65, 0.15, 0.08]},
        # Notice: Consumer Care details are intentionally missing to trigger consumer care violation
    ]
    lines = [
        {
            "word_indexes": [0, 1, 2],
            "bbox": [0.05, 0.05, 0.52, 0.08],
            "median_character_height": 0.08,
        },
        {
            "word_indexes": [3, 4, 5, 6, 7],
            "bbox": [0.05, 0.20, 0.60, 0.08],
            "median_character_height": 0.08,
        },
        {
            "word_indexes": [8, 9, 10, 11],
            "bbox": [0.05, 0.35, 0.29, 0.08],
            "median_character_height": 0.08,
        },
        {
            "word_indexes": [12, 13, 14, 15, 16, 17, 18],
            "bbox": [0.05, 0.50, 0.73, 0.08],
            "median_character_height": 0.08,
        },
        {
            "word_indexes": [19, 20, 21],
            "bbox": [0.05, 0.65, 0.35, 0.08],
            "median_character_height": 0.08,
        },
    ]
    p = {
        "image_b64": _test_image_b64(),
        "image_meta": {"width": 400, "height": 300, "dpi": 72.0, "orientation": 1},
        "ocr_payload": words,
        "ocr_lines": lines,
        "scan_context": {"mode": "retail_image", "category": "food"},
        "schema_version": 2,
    }
    if inspection_id is not None:
        p["inspection_id"] = inspection_id
    return p


def test_end_to_end_inspection_product_history_flow(tmp_path, monkeypatch, login_client):
    db_file = tmp_path / "test_flow.db"
    monkeypatch.setattr(main, "DB_PATH", db_file)

    with TestClient(app) as client:
        login_client(client, role="inspector", username="officer_flow")

        # Step 1: Create Inspection #1
        resp = client.post(
            "/api/inspections",
            json={"company_name": "Nestle Retailer", "location": "Sector 18"},
        )
        assert resp.status_code == 201
        insp1_id = resp.json()["id"]

        # Step 2: Post Scan #1 into Inspection #1
        resp = client.post("/api/scan", json=_payload(inspection_id=insp1_id))
        assert resp.status_code == 201
        scan1_data = resp.json()
        assert scan1_data["inspection_id"] == insp1_id
        assert scan1_data["product_match_status"] == "auto_matched"
        product_id = scan1_data["product_id"]
        assert product_id is not None
        # Consumer care should fail
        consumer_verdicts = [
            v for v in scan1_data["verdicts"] if v["rule_id"] == "r6_2_consumer_care"
        ]
        assert len(consumer_verdicts) == 1
        assert consumer_verdicts[0]["status"] == "fail"
        # Since this is the first inspection, no previous inspection exists
        assert scan1_data["previous_inspection"] is None
        assert scan1_data["historical_alert"] is None

        # Step 3: Post Scan #2 of same product in Inspection #1 (evidence retake)
        resp = client.post("/api/scan", json=_payload(inspection_id=insp1_id))
        assert resp.status_code == 201
        scan2_data = resp.json()
        assert scan2_data["product_id"] == product_id
        # In the same inspection, repeated scans DO NOT trigger repeated non-compliance alert
        assert scan2_data["historical_alert"] is None

        # Step 4: Check Inspection #1 summary
        resp = client.get(f"/api/inspections/{insp1_id}")
        assert resp.status_code == 200
        sum1 = resp.json()["summary"]
        assert sum1["product_count"] == 1
        assert sum1["scan_count"] == 2
        assert sum1["fail_count"] == 1
        assert sum1["repeated_non_compliance_count"] == 0

        # Step 5: Complete Inspection #1
        resp = client.post(f"/api/inspections/{insp1_id}/complete")
        assert resp.status_code == 200
        assert resp.json()["status"] == "completed"

        # Step 6: Verify posting to completed Inspection #1 is rejected
        resp = client.post("/api/scan", json=_payload(inspection_id=insp1_id))
        assert resp.status_code == 400
        assert resp.json()["error"] == "INVALID_INSPECTION_STATE"

        # Step 7: Create Inspection #2 (future visit)
        resp = client.post(
            "/api/inspections",
            json={"company_name": "Nestle Retailer", "location": "Sector 18", "notes": "Follow-up"},
        )
        assert resp.status_code == 201
        insp2_id = resp.json()["id"]

        # Step 8: Post Scan into Inspection #2 for the same Product
        resp = client.post("/api/scan", json=_payload(inspection_id=insp2_id))
        assert resp.status_code == 201
        scan3_data = resp.json()
        assert scan3_data["product_id"] == product_id
        # Previous inspection detected!
        assert scan3_data["previous_inspection"] is not None
        assert scan3_data["previous_inspection"]["inspection_id"] == str(insp1_id)
        # Consumer care is repeated non-compliance!
        cc_deltas = [d for d in scan3_data["comparison"] if d["rule_id"] == "r6_2_consumer_care"]
        assert len(cc_deltas) == 1
        assert cc_deltas[0]["repeated_non_compliance"] is True
        assert cc_deltas[0]["direction"] == "unchanged"
        assert scan3_data["historical_alert"] is not None
        assert scan3_data["historical_alert"]["type"] == "repeated_non_compliance"

        # Step 9: Verify Inspection #2 summary reflects repeated non-compliance
        resp = client.get(f"/api/inspections/{insp2_id}")
        assert resp.status_code == 200
        sum2 = resp.json()["summary"]
        assert sum2["product_count"] == 1
        assert sum2["scan_count"] == 1
        assert sum2["fail_count"] == 1
        assert sum2["repeated_non_compliance_count"] == 1
