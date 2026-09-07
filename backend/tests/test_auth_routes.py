from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import db, main
from app.auth.passwords import hash_password
from app.db import SessionRow, User
from app.main import app


@pytest.fixture
def inspector_credentials() -> dict[str, str]:
    return {"username": "Inspector.One", "password": "Correct Horse Battery Staple!"}


@pytest.fixture
def client(tmp_path, monkeypatch, inspector_credentials) -> Iterator[TestClient]:
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "auth-routes.db")
    monkeypatch.delenv("LMPC_COOKIE_SECURE", raising=False)
    with TestClient(app) as test_client:
        assert db.SessionLocal is not None
        with db.SessionLocal() as session:
            session.add(
                User(
                    username_normalized="inspector.one",
                    display_name="Inspector One",
                    password_hash=hash_password(inspector_credentials["password"]),
                    role="inspector",
                )
            )
            session.commit()
        yield test_client


def test_login_sets_http_only_cookie(
    client: TestClient,
    inspector_credentials: dict[str, str],
) -> None:
    response = client.post("/api/auth/login", json=inspector_credentials)
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "lmpc_session=" in cookie
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert "Secure" not in cookie
    assert response.json()["user"]["role"] == "inspector"


def test_me_requires_valid_session(client: TestClient) -> None:
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert set(response.json()) == {"error", "detail", "request_id"}
    assert response.json()["error"] == "authentication_required"


def test_me_rejects_unknown_cookie_as_expired_session(client: TestClient) -> None:
    client.cookies.set("lmpc_session", "unknown-session-token")
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"] == "session_expired"


def test_logged_in_user_can_read_safe_identity(
    client: TestClient,
    inspector_credentials: dict[str, str],
) -> None:
    assert client.post("/api/auth/login", json=inspector_credentials).status_code == 200
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json() == {
        "user": {
            "id": 1,
            "username": "inspector.one",
            "display_name": "Inspector One",
            "role": "inspector",
        }
    }


def test_unknown_wrong_and_inactive_users_share_generic_failure(
    client: TestClient,
    inspector_credentials: dict[str, str],
) -> None:
    unknown = client.post(
        "/api/auth/login",
        json={"username": "missing", "password": inspector_credentials["password"]},
    )
    wrong = client.post(
        "/api/auth/login",
        json={"username": inspector_credentials["username"], "password": "wrong"},
    )
    assert db.SessionLocal is not None
    with db.SessionLocal() as session:
        user = session.scalar(select(User).where(User.username_normalized == "inspector.one"))
        assert user is not None
        user.is_active = False
        session.commit()
    inactive = client.post("/api/auth/login", json=inspector_credentials)

    bodies = [response.json() for response in (unknown, wrong, inactive)]
    assert [response.status_code for response in (unknown, wrong, inactive)] == [401, 401, 401]
    assert {body["error"] for body in bodies} == {"invalid_credentials"}
    assert len({body["detail"] for body in bodies}) == 1


def test_login_rotates_previous_session(
    client: TestClient,
    inspector_credentials: dict[str, str],
) -> None:
    assert client.post("/api/auth/login", json=inspector_credentials).status_code == 200
    assert client.post("/api/auth/login", json=inspector_credentials).status_code == 200
    assert db.SessionLocal is not None
    with db.SessionLocal() as session:
        rows = session.scalars(select(SessionRow).order_by(SessionRow.id)).all()
        assert len(rows) == 2
        assert rows[0].revoked_at is not None
        assert rows[1].revoked_at is None


def test_logout_revokes_cookie(
    client: TestClient,
    inspector_credentials: dict[str, str],
) -> None:
    assert client.post("/api/auth/login", json=inspector_credentials).status_code == 200
    response = client.post("/api/auth/logout")
    assert response.status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert "Max-Age=0" in response.headers["set-cookie"]
