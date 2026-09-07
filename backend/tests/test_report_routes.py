"""Tests for the PDF report endpoint."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import db, main
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_file = tmp_path / "test.db"
    monkeypatch.setattr(main, "DB_PATH", db_file)
    db.init_db(db_file)
    assert db._engine is not None
    db.Base.metadata.drop_all(db._engine)
    db.Base.metadata.create_all(db._engine)
    with TestClient(app) as test_client:
        yield test_client


def _make_scan() -> int:
    if db.SessionLocal is None:
        raise RuntimeError("DB not initialized")
    session = db.SessionLocal()
    try:
        scan = db.Scan(
            mode="retail_image",
            category="non_food",
            image_b64="iVBORw0KGgo=",
            image_meta={"width": 100, "height": 100, "dpi": 72, "orientation": 1},
            ocr_payload=[],
            overall_status="fail",
            verdicts=[
                db.VerdictRow(
                    rule_id="r6_1_e_mrp",
                    status="fail",
                    severity="critical",
                    citation="Rule 6(1)(e) of LMPC Rules 2011",
                    evidence="MRP Rs.99",
                    evidence_bboxes=[[0.05, 0.30, 0.20, 0.05]],
                    failure_message="MRP missing tax-inclusive phrase",
                    rule_version="2026-09",
                )
            ],
        )
        session.add(scan)
        session.commit()
        session.refresh(scan)
        return scan.id
    finally:
        session.close()


def test_report_returns_pdf_bytes(client: TestClient) -> None:
    response = client.get(f"/api/report/{_make_scan()}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content[:4] == b"%PDF"


def test_report_404_for_missing_scan(client: TestClient) -> None:
    assert client.get("/api/report/99999").status_code == 404


def test_report_content_disposition_header(client: TestClient) -> None:
    scan_id = _make_scan()
    response = client.get(f"/api/report/{scan_id}")
    assert "attachment" in response.headers["content-disposition"]
    assert f"lmpc-scan-{scan_id}.pdf" in response.headers["content-disposition"]
