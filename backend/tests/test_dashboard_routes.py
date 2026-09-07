"""Tests for history and dashboard routes."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import db
from app import main
from app.main import app
from scripts.seed_demo import main as seed_main


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_file = tmp_path / "test.db"
    monkeypatch.setattr(main, "DB_PATH", db_file)
    seed_main(str(db_file))
    with TestClient(app) as test_client:
        yield test_client


def test_history_returns_seeded_scans(client: TestClient) -> None:
    response = client.get("/api/history")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 3
    assert body[0]["overall_status"] == "pass"


def test_history_respects_limit(client: TestClient) -> None:
    response = client.get("/api/history?limit=2")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_dashboard_aggregates(client: TestClient) -> None:
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    body = response.json()
    assert body["total_scans"] == 3
    assert body["pass_rate"] == 1 / 3
    assert body["top_failed_rule"] == "r6_1_e_mrp"
    assert len(body["recent_activity"]) == 3
