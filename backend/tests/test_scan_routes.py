"""End-to-end tests for the scan API."""

from __future__ import annotations

import base64
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app import db, main
from app.db import Scan
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch, login_client):
    """Use a per-test SQLite file so tests do not share state."""
    db_file = tmp_path / "test.db"
    monkeypatch.setattr(main, "DB_PATH", db_file)
    with TestClient(app) as test_client:
        login_client(test_client)
        yield test_client


def _payload() -> dict:
    words = [
        {"text": "ACME", "confidence": 0.95, "bbox": [0.02, 0.03, 0.10, 0.06]},
        {"text": "FOODS", "confidence": 0.94, "bbox": [0.13, 0.03, 0.12, 0.06]},
        {"text": "PVT", "confidence": 0.92, "bbox": [0.02, 0.10, 0.08, 0.06]},
        {"text": "LTD", "confidence": 0.93, "bbox": [0.11, 0.10, 0.07, 0.06]},
        {"text": "Mfg:", "confidence": 0.90, "bbox": [0.02, 0.17, 0.08, 0.06]},
        {"text": "Plot", "confidence": 0.91, "bbox": [0.11, 0.17, 0.07, 0.06]},
        {"text": "12", "confidence": 0.95, "bbox": [0.19, 0.17, 0.04, 0.06]},
        {"text": "Mumbai", "confidence": 0.90, "bbox": [0.24, 0.17, 0.12, 0.06]},
        {"text": "400001", "confidence": 0.95, "bbox": [0.37, 0.17, 0.11, 0.06]},
        {"text": "Net", "confidence": 0.92, "bbox": [0.02, 0.24, 0.06, 0.06]},
        {"text": "Wt:", "confidence": 0.92, "bbox": [0.09, 0.24, 0.06, 0.06]},
        {"text": "500", "confidence": 0.96, "bbox": [0.16, 0.24, 0.06, 0.06]},
        {"text": "g", "confidence": 0.94, "bbox": [0.23, 0.24, 0.03, 0.06]},
        {"text": "MRP", "confidence": 0.95, "bbox": [0.02, 0.32, 0.07, 0.07]},
        {"text": "Rs.99.00", "confidence": 0.93, "bbox": [0.10, 0.32, 0.20, 0.07]},
        {"text": "(Incl.", "confidence": 0.91, "bbox": [0.31, 0.32, 0.09, 0.07]},
        {"text": "of", "confidence": 0.95, "bbox": [0.41, 0.32, 0.04, 0.07]},
        {"text": "all", "confidence": 0.95, "bbox": [0.46, 0.32, 0.05, 0.07]},
        {"text": "taxes)", "confidence": 0.92, "bbox": [0.52, 0.32, 0.10, 0.07]},
        {"text": "Mfg:", "confidence": 0.93, "bbox": [0.02, 0.40, 0.08, 0.06]},
        {"text": "03/2026", "confidence": 0.94, "bbox": [0.11, 0.40, 0.14, 0.06]},
        {"text": "Customer", "confidence": 0.91, "bbox": [0.02, 0.48, 0.14, 0.06]},
        {"text": "Care:", "confidence": 0.92, "bbox": [0.17, 0.48, 0.08, 0.06]},
        {"text": "care@acme.com", "confidence": 0.95, "bbox": [0.02, 0.55, 0.22, 0.06]},
        {"text": "Ph:", "confidence": 0.90, "bbox": [0.25, 0.55, 0.05, 0.06]},
        {"text": "+91", "confidence": 0.91, "bbox": [0.31, 0.55, 0.06, 0.06]},
        {"text": "9876543210", "confidence": 0.93, "bbox": [0.38, 0.55, 0.18, 0.06]},
    ]
    image = Image.new("RGB", (400, 600), (30, 30, 30))
    drawing = ImageDraw.Draw(image)
    drawing.rectangle((15, 15, 385, 585), fill=(220, 220, 220), outline=(30, 30, 30), width=5)
    for y in range(45, 570, 35):
        drawing.line((35, y, 350, y), fill=(30, 30, 30), width=4)
    encoded = io.BytesIO()
    image.save(encoded, format="PNG")
    return {
        "image_b64": base64.b64encode(encoded.getvalue()).decode("ascii"),
        "image_meta": {"width": 400, "height": 600, "dpi": 72, "orientation": 1},
        "ocr_payload": words,
        "scan_context": {"mode": "retail_image", "category": "non_food"},
    }


def test_scan_endpoint_returns_201_and_verdicts(client: TestClient) -> None:
    response = client.post("/api/scan", json=_payload())
    assert response.status_code == 201, response.text
    body = response.json()
    assert "scan_id" in body
    assert body["overall_status"] in {"pass", "fail", "mixed"}
    assert len(body["verdicts"]) == 5
    by_id = {verdict["rule_id"]: verdict for verdict in body["verdicts"]}
    assert by_id["r6_1_e_mrp"]["status"] == "pass"
    assert by_id["r6_1_c_net_quantity"]["status"] == "pass"


def test_scan_rejects_empty_ocr(client: TestClient) -> None:
    payload = _payload()
    payload["ocr_payload"] = []
    response = client.post("/api/scan", json=payload)
    assert response.status_code == 422
    assert "no_text_extracted" in response.text


def test_get_scan_returns_full_record(client: TestClient) -> None:
    create = client.post("/api/scan", json=_payload())
    assert create.status_code == 201
    scan_id = create.json()["scan_id"]
    response = client.get(f"/api/scan/{scan_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["scan"]["id"] == scan_id
    assert len(body["verdicts"]) == 5


def test_get_scan_404_for_missing(client: TestClient) -> None:
    response = client.get("/api/scan/99999")
    assert response.status_code == 404


def test_scan_v2_returns_and_persists_analysis(client: TestClient) -> None:
    payload = _payload()
    payload["schema_version"] = 2
    payload["ocr_lines"] = [
        {
            "word_indexes": [0, 1],
            "bbox": [0.02, 0.03, 0.23, 0.06],
            "median_character_height": 0.06,
        }
    ]
    response = client.post("/api/scan", json=payload)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["quality"]["status"] in {
        "acceptable",
        "usable_with_warnings",
        "retake_recommended",
    }
    assert body["analysis_version"] == "inspection-v2"
    assert body["processing_status"] == "complete"
    stored = client.get(f"/api/scan/{body['scan_id']}").json()
    assert stored["scan"]["quality_summary"] == body["quality"]
    assert stored["scan"]["extracted_fields"] == body["extracted_fields"]
    assert all("reasoning" in verdict for verdict in body["verdicts"])


def test_bad_image_has_error_envelope_and_failed_audit_row(client: TestClient) -> None:
    payload = _payload()
    payload["schema_version"] = 2
    payload["image_b64"] = "not-base64"
    response = client.post(
        "/api/scan",
        json=payload,
        headers={"X-Request-ID": "bad-image-request"},
    )
    assert response.status_code == 422
    assert set(response.json()) == {"error", "detail", "request_id"}
    assert response.json()["error"] == "image_decode_failed"
    assert db.SessionLocal is not None
    with db.SessionLocal() as session:
        failed = session.query(Scan).filter_by(request_id="bad-image-request").one()
        assert failed.owner_user_id == 1
        assert failed.processing_status == "failed"
        assert failed.failure_stage == "decode_image"
        assert failed.processing_error_code == "image_decode_failed"
        assert failed.verdicts == []
