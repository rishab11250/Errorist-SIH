from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import db, main
from app.auth.passwords import hash_password
from app.auth.sessions import issue_session
from app.db import SessionRow, User
from app.main import app

ADMIN_PASSWORD = "Strong admin password 123!"


def _client_for_role(tmp_path, monkeypatch, role: str) -> Iterator[TestClient]:
    monkeypatch.setattr(main, "DB_PATH", tmp_path / f"{role}.db")
    with TestClient(app) as client:
        assert db.SessionLocal is not None
        with db.SessionLocal() as session:
            session.add(
                User(
                    username_normalized=role,
                    display_name=role.title(),
                    password_hash=hash_password(ADMIN_PASSWORD),
                    role=role,
                )
            )
            session.commit()
        assert (
            client.post(
                "/api/auth/login",
                json={"username": role, "password": ADMIN_PASSWORD},
            ).status_code
            == 200
        )
        yield client


@pytest.fixture
def admin_client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    yield from _client_for_role(tmp_path, monkeypatch, "admin")


@pytest.fixture
def inspector_client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    yield from _client_for_role(tmp_path, monkeypatch, "inspector")


def test_inspector_cannot_list_users(inspector_client: TestClient) -> None:
    response = inspector_client.get("/api/users")
    assert response.status_code == 403
    assert response.json()["error"] == "forbidden"


def test_admin_can_create_and_deactivate_inspector(admin_client: TestClient) -> None:
    created = admin_client.post(
        "/api/users",
        json={
            "username": "Inspector.One",
            "display_name": "Inspector One",
            "password": "Strong demo password 123!",
            "role": "inspector",
        },
    )
    assert created.status_code == 201
    assert "password_hash" not in created.json()
    user_id = created.json()["id"]
    updated = admin_client.patch(f"/api/users/{user_id}", json={"is_active": False})
    assert updated.status_code == 200
    assert updated.json()["is_active"] is False


def test_duplicate_normalized_username_is_conflict(admin_client: TestClient) -> None:
    payload = {
        "username": "Inspector.One",
        "display_name": "Inspector One",
        "password": "Strong demo password 123!",
        "role": "inspector",
    }
    assert admin_client.post("/api/users", json=payload).status_code == 201
    payload["username"] = "  INSPECTOR.ONE  "
    response = admin_client.post("/api/users", json=payload)
    assert response.status_code == 409
    assert response.json()["error"] == "duplicate_username"


@pytest.mark.parametrize(
    "password",
    ["short", "Password containing inspector.one is not allowed"],
)
def test_weak_password_is_rejected(admin_client: TestClient, password: str) -> None:
    response = admin_client.post(
        "/api/users",
        json={
            "username": "inspector.one",
            "display_name": "Inspector One",
            "password": password,
            "role": "inspector",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"] in {"validation_error", "weak_password"}


def test_final_active_admin_cannot_be_demoted(admin_client: TestClient) -> None:
    admin_id = admin_client.get("/api/auth/me").json()["user"]["id"]
    response = admin_client.patch(f"/api/users/{admin_id}", json={"role": "inspector"})
    assert response.status_code == 409
    assert response.json()["error"] == "last_admin_required"


def test_password_reset_revokes_active_sessions(admin_client: TestClient) -> None:
    created = admin_client.post(
        "/api/users",
        json={
            "username": "inspector.one",
            "display_name": "Inspector One",
            "password": "Strong demo password 123!",
            "role": "inspector",
        },
    ).json()
    assert db.SessionLocal is not None
    with db.SessionLocal() as session:
        user = session.get(User, created["id"])
        assert user is not None
        issue_session(
            session,
            user,
            now=datetime(2026, 9, 7, tzinfo=UTC),
            ttl=timedelta(hours=8),
        )
        session.commit()

    response = admin_client.patch(
        f"/api/users/{created['id']}",
        json={"password": "Replacement password 456!"},
    )
    assert response.status_code == 200
    with db.SessionLocal() as session:
        rows = session.scalars(select(SessionRow).where(SessionRow.user_id == created["id"])).all()
        assert rows and all(row.revoked_at is not None for row in rows)
