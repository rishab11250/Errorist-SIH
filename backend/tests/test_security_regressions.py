"""Regression coverage for browser, session, image, and export boundaries."""

from __future__ import annotations

import base64
import io
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import db, main
from app.auth.sessions import issue_session
from app.db import Scan, User
from app.exports.csv import safe_csv_cell
from app.main import app
from app.visual_analysis.image_io import ImageDecodeError, decode_image


@pytest.fixture
def security_context(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "security.db")
    monkeypatch.setenv(
        "LMPC_ALLOWED_BROWSER_ORIGINS",
        "http://127.0.0.1:3000,http://localhost:3000",
    )
    with TestClient(app) as client:
        assert db.SessionLocal is not None
        with db.SessionLocal() as session:
            inspector = User(
                username_normalized="inspector",
                display_name="Inspector",
                password_hash="unused",
                role="inspector",
            )
            other = User(
                username_normalized="other",
                display_name="Other Inspector",
                password_hash="unused",
                role="inspector",
            )
            session.add_all([inspector, other])
            session.flush()
            token = issue_session(
                session,
                inspector,
                now=datetime.now(UTC),
                ttl=timedelta(hours=8),
            ).token
            other_scan = Scan(
                owner_user_id=other.id,
                mode="retail_image",
                category="unknown",
                image_b64="invalid-but-not-rendered",
                image_meta={"width": 1, "height": 1},
                ocr_payload=[],
                quality_summary={},
                overall_status="manual_review",
                analysis_version="inspection-v2",
            )
            session.add(other_scan)
            session.commit()
            context = {
                "client": client,
                "token": token,
                "inspector_id": inspector.id,
                "other_scan_id": other_scan.id,
            }
        yield context


def test_json_mutations_reject_wrong_content_type_and_cross_origin(security_context) -> None:
    client = security_context["client"]
    wrong_type = client.post(
        "/api/auth/login",
        content='{"username":"x","password":"y"}',
        headers={"Content-Type": "text/plain"},
    )
    assert wrong_type.status_code == 415
    assert wrong_type.json()["error"] == "unsupported_media_type"

    cross_origin = client.post(
        "/api/auth/login",
        json={"username": "x", "password": "y"},
        headers={"Origin": "https://attacker.example"},
    )
    assert cross_origin.status_code == 403
    assert cross_origin.json()["error"] == "cross_origin_request"

    fetch_metadata = client.post(
        "/api/auth/login",
        json={"username": "x", "password": "y"},
        headers={"Sec-Fetch-Site": "cross-site"},
    )
    assert fetch_metadata.status_code == 403
    assert client.post("/api/auth/logout").status_code == 204


def test_valid_local_origin_reaches_the_route(security_context) -> None:
    response = security_context["client"].post(
        "/api/auth/login",
        json={"username": "missing", "password": "wrong"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 401
    assert response.json()["error"] == "invalid_credentials"


def test_invalid_cookie_and_inactive_user_sessions_are_rejected(security_context) -> None:
    client = security_context["client"]
    client.cookies.set("lmpc_session", "not-a-valid-session")
    assert client.get("/api/auth/me").status_code == 401

    assert db.SessionLocal is not None
    with db.SessionLocal() as session:
        inspector = session.get(User, security_context["inspector_id"])
        assert inspector is not None
        inspector.is_active = False
        session.commit()
    client.cookies.set("lmpc_session", security_context["token"])
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"] == "session_expired"


def test_oversized_and_decompression_bomb_images_are_rejected() -> None:
    image = Image.new("RGB", (20, 20), "white")
    output = io.BytesIO()
    image.save(output, format="PNG")
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    with pytest.raises(ImageDecodeError, match="image_too_large"):
        decode_image(encoded, max_bytes=10_000, max_pixels=100)
    with pytest.raises(ImageDecodeError, match="image_too_large"):
        decode_image(encoded, max_bytes=10, max_pixels=1_000)


def test_csv_formula_payloads_are_neutralized() -> None:
    assert safe_csv_cell('=HYPERLINK("https://attacker.example")').startswith("'=")
    assert safe_csv_cell("+1+1").startswith("'+")
    assert safe_csv_cell("@SUM(A1:A2)").startswith("'@")


def test_inspector_cannot_export_another_users_scan(security_context) -> None:
    client = security_context["client"]
    client.cookies.set("lmpc_session", security_context["token"])
    scan_id = security_context["other_scan_id"]
    assert client.get(f"/api/exports/scans/{scan_id}.pdf").status_code == 404
    assert client.get(f"/api/exports/scans/{scan_id}.docx").status_code == 404
