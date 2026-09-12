from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import db, main
from app.main import app


@pytest.fixture
def insp_client(tmp_path, monkeypatch, login_client):
    db_file = tmp_path / "test_insp.db"
    monkeypatch.setattr(main, "DB_PATH", db_file)
    with TestClient(app) as test_client:
        user = login_client(test_client, role="inspector", username="inspector1")
        yield test_client, user


@pytest.fixture
def admin_client(tmp_path, monkeypatch, login_client):
    db_file = tmp_path / "test_admin.db"
    monkeypatch.setattr(main, "DB_PATH", db_file)
    with TestClient(app) as test_client:
        user = login_client(test_client, role="admin", username="admin1")
        yield test_client, user


def test_create_and_get_inspection(insp_client):
    client, user = insp_client

    # 1. Create inspection
    resp = client.post(
        "/api/inspections",
        json={"company_name": "ABC Foods Pvt Ltd", "location": "Ahmedabad", "notes": "Routine"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["company_name"] == "ABC Foods Pvt Ltd"
    assert data["status"] == "open"
    assert data["summary"]["product_count"] == 0
    insp_id = data["id"]

    # 2. Get inspection
    resp = client.get(f"/api/inspections/{insp_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == insp_id
    assert resp.json()["status"] == "open"


def test_complete_inspection_lifecycle(insp_client):
    client, user = insp_client

    resp = client.post(
        "/api/inspections",
        json={"company_name": "Haldiram", "location": "Nagpur"},
    )
    insp_id = resp.json()["id"]

    # Complete
    resp = client.post(f"/api/inspections/{insp_id}/complete")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"
    assert resp.json()["completed_at"] is not None

    # Complete again -> rejects with INVALID_INSPECTION_STATE
    resp = client.post(f"/api/inspections/{insp_id}/complete")
    assert resp.status_code == 400
    assert resp.json()["error"] == "INVALID_INSPECTION_STATE"


def test_inspection_authorization_and_admin_access(tmp_path, monkeypatch, login_client):
    db_file = tmp_path / "test_auth_insp.db"
    monkeypatch.setattr(main, "DB_PATH", db_file)

    with TestClient(app) as client_1, TestClient(app) as client_2, TestClient(app) as client_admin:
        login_client(client_1, role="inspector", username="insp_owner")
        login_client(client_2, role="inspector", username="other_insp")
        login_client(client_admin, role="admin", username="admin_boss")

        resp = client_1.post(
            "/api/inspections",
            json={"company_name": "Private Firm", "location": "Surat"},
        )
        insp_id = resp.json()["id"]

        # Other inspector cannot view
        resp = client_2.get(f"/api/inspections/{insp_id}")
        assert resp.status_code == 403

        # Admin CAN view
        resp = client_admin.get(f"/api/inspections/{insp_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == insp_id
