"""End-to-end tests for the scan API."""

from __future__ import annotations

import base64
import io
from datetime import datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app import db, main
from app.db import Scan, VerdictRow
from app.exports.view_model import load_report_model
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


def _offline_sync_payload(*, local_id: str | None = None) -> dict:
    payload = _payload()
    rule_version = "device-rules-2026-08"
    return {
        "local_id": local_id or str(uuid4()),
        "captured_at": "2026-08-31T18:45:00+05:30",
        "rule_version": rule_version,
        "image_b64": payload["image_b64"],
        "ocr_payload": payload["ocr_payload"],
        "scan_context": payload["scan_context"],
        "verdicts": [
            {
                "rule_id": "r6_1_e_mrp",
                "status": "fail",
                "severity": "critical",
                "citation": "Rule 6(1)(e)",
                "evidence": "MRP missing",
                "evidence_bboxes": [[0.10, 0.32, 0.20, 0.07]],
                "confidence": 0.91,
                "reasoning": "The on-device snapshot found no valid declaration.",
                "measurement_method": "direct_metadata",
                "failure_message": "MRP is required.",
                "rule_version": rule_version,
            },
            {
                "rule_id": "r6_1_c_net_quantity",
                "status": "pass",
                "severity": "critical",
                "citation": "Rule 6(1)(c)",
                "evidence": "500 g",
                "evidence_bboxes": [[0.16, 0.24, 0.10, 0.06]],
                "confidence": 0.96,
                "reasoning": "The quantity and unit are present.",
                "measurement_method": "direct_metadata",
                "failure_message": None,
                "rule_version": rule_version,
            },
        ],
    }


def test_offline_sync_persists_capture_time_snapshot_without_reanalysis(
    client: TestClient,
    monkeypatch,
) -> None:
    def fail_if_reanalyzed(*args, **kwargs):
        raise AssertionError("offline verdict snapshots must not be recomputed")

    monkeypatch.setattr("app.scan_routes.analyze_scan", fail_if_reanalyzed)
    payload = _offline_sync_payload()
    assert client.get("/api/health").json()["rules_version"] != payload["rule_version"]

    response = client.post("/api/scan/sync", json=payload)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body == {
        "scan_id": body["scan_id"],
        "local_id": payload["local_id"],
        "processing_status": "complete",
        "rule_version": payload["rule_version"],
        "created": True,
    }
    assert UUID(body["local_id"]) == UUID(payload["local_id"])

    stored = client.get(f"/api/scan/{body['scan_id']}")
    assert stored.status_code == 200
    stored_body = stored.json()
    assert stored_body["scan"]["local_id"] == payload["local_id"]
    assert stored_body["scan"]["created_at"] == "2026-08-31T13:15:00"
    assert stored_body["scan"]["overall_status"] == "fail"
    assert {item["rule_version"] for item in stored_body["verdicts"]} == {
        payload["rule_version"]
    }
    assert {item["rule_id"] for item in stored_body["verdicts"]} == {
        "r6_1_e_mrp",
        "r6_1_c_net_quantity",
    }

    history = client.get("/api/history").json()["items"]
    synced_item = next(item for item in history if item["scan_id"] == body["scan_id"])
    assert synced_item["local_id"] == payload["local_id"]
    assert synced_item["rule_version"] == payload["rule_version"]
    assert synced_item["rule_versions"] == [payload["rule_version"]]

    assert db.SessionLocal is not None
    with db.SessionLocal() as session:
        scan = session.get(Scan, body["scan_id"])
        assert scan is not None
        assert scan.created_at == datetime(2026, 8, 31, 13, 15)
        assert scan.analysis_version == "offline-ts-engine"
        assert scan.image_meta["width"] == 400
        assert scan.image_meta["height"] == 600
        rows = session.query(VerdictRow).filter_by(scan_id=scan.id).all()
        assert {row.rule_version for row in rows} == {payload["rule_version"]}
        report = load_report_model(session, scan.owner, scan.id)
        assert report is not None
        assert report.rules_versions == (payload["rule_version"],)


def test_offline_sync_retry_is_idempotent(client: TestClient) -> None:
    payload = _offline_sync_payload()

    first = client.post("/api/scan/sync", json=payload)
    retry = client.post("/api/scan/sync", json=payload)

    assert first.status_code == 201
    assert retry.status_code == 200
    assert retry.json() == {
        "scan_id": first.json()["scan_id"],
        "local_id": payload["local_id"],
        "processing_status": "complete",
        "rule_version": payload["rule_version"],
        "created": False,
    }
    assert db.SessionLocal is not None
    with db.SessionLocal() as session:
        assert session.query(Scan).filter_by(client_local_id=payload["local_id"]).count() == 1


def test_offline_sync_rejects_reused_local_id_for_changed_snapshot(client: TestClient) -> None:
    payload = _offline_sync_payload()
    assert client.post("/api/scan/sync", json=payload).status_code == 201
    payload["verdicts"][0]["status"] = "pass"

    response = client.post("/api/scan/sync", json=payload)

    assert response.status_code == 409
    assert response.json()["error"] == "sync_conflict"


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda payload: payload["verdicts"][0].update(rule_version="server-current"),
            "must match capture rule_version",
        ),
        (
            lambda payload: payload["verdicts"].append(dict(payload["verdicts"][0])),
            "rule_id values must be unique",
        ),
    ],
)
def test_offline_sync_rejects_ambiguous_verdict_snapshots(
    client: TestClient,
    mutate,
    message: str,
) -> None:
    payload = _offline_sync_payload()
    mutate(payload)

    response = client.post("/api/scan/sync", json=payload)

    assert response.status_code == 422
    assert message in response.json()["detail"]


def test_offline_sync_requires_uuid_and_timezone_aware_capture_time(client: TestClient) -> None:
    payload = _offline_sync_payload(local_id="not-a-uuid")
    payload["captured_at"] = "2026-08-31T13:15:00"

    response = client.post("/api/scan/sync", json=payload)

    assert response.status_code == 422
    assert response.json()["error"] == "validation_error"


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


def test_scan_rejects_oversized_ocr_payload(client: TestClient) -> None:
    from app.settings import DEFAULT_MAX_OCR_WORDS

    payload = _payload()
    word = {"text": "word", "confidence": 0.9, "bbox": [0.01, 0.01, 0.05, 0.02]}
    payload["ocr_payload"] = [word] * (DEFAULT_MAX_OCR_WORDS + 1)
    response = client.post("/api/scan", json=payload)
    assert response.status_code == 422
    body = response.json()
    assert body["error"] == "validation_error"
    assert "exceeds" in body["detail"] and "maximum allowed limit" in body["detail"]


def test_real_test_fixtures_fit_under_max_ocr_words() -> None:
    import json
    from pathlib import Path

    from app.settings import DEFAULT_MAX_OCR_WORDS

    labels_dir = Path(__file__).resolve().parents[2] / "real_test_labels"
    e2e_path = labels_dir / "e2e_real_test_results.json"
    stress_path = labels_dir / "off_stress_test_results.json"

    if not e2e_path.exists():
        pytest.skip("real_test_labels not found")

    e2e_data = json.loads(e2e_path.read_text(encoding="utf-8"))
    e2e_counts = [item.get("ocr", {}).get("wordCount", 0) for item in e2e_data]
    assert e2e_counts, "No test cases found in e2e fixtures"
    e2e_max = max(e2e_counts)
    assert e2e_max <= 368
    assert e2e_max < DEFAULT_MAX_OCR_WORDS

    assert stress_path.exists(), "off_stress_test_results.json must exist"
    stress_data = json.loads(stress_path.read_text(encoding="utf-8"))
    stress_counts = []
    for item in stress_data:
        stress_counts.append(item.get("freeform", {}).get("wordsCount", 0))
        stress_counts.append(item.get("guided", {}).get("wordsCount", 0))
    assert stress_counts, "No test cases found in stress fixtures"
    stress_max = max(stress_counts)
    assert stress_max <= 1315
    assert stress_max < DEFAULT_MAX_OCR_WORDS

    overall_max = max(e2e_max, stress_max)
    assert (DEFAULT_MAX_OCR_WORDS - overall_max) / overall_max >= 0.50


def test_concurrent_scans_succeed_under_wal_mode(client: TestClient) -> None:
    import concurrent.futures

    payload = _payload()

    def send_scan(req_id: int):
        return client.post(
            "/api/scan",
            json=payload,
            headers={"X-Request-ID": f"concurrent-{req_id}"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(send_scan, i) for i in range(4)]
        results = [f.result() for f in futures]

    assert all(r.status_code == 201 for r in results)
