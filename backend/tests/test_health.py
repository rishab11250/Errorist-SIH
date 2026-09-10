"""Tests for the health endpoint."""

import pytest
from fastapi.testclient import TestClient

from app import db, main
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "test.db")
    with TestClient(app) as test_client:
        yield test_client


def test_health_returns_ok(client: TestClient) -> None:
    """Health endpoint reports 'ok' when the database is reachable."""
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["rules_version"] == "2026-09"


def test_health_returns_degraded_when_database_is_unavailable(
    client: TestClient,
    monkeypatch,
) -> None:
    class BrokenSession:
        def __enter__(self):
            raise RuntimeError("database unavailable")

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(db, "SessionLocal", lambda: BrokenSession())

    response = client.get("/api/health")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "rules_version": "2026-09"}


def test_root_returns_service_info(client: TestClient) -> None:
    """Root endpoint returns service metadata."""
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "lmpc-backend"
    assert "version" in body
