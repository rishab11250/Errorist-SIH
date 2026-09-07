"""Tests for the health endpoint."""
from fastapi.testclient import TestClient

from app.main import app

def test_health_returns_ok() -> None:
    """Health endpoint reports 'ok' and the backend version."""
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["rules_version"] == "2026-09"


def test_root_returns_service_info() -> None:
    """Root endpoint returns service metadata."""
    with TestClient(app) as client:
        response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "lmpc-backend"
    assert "version" in body
