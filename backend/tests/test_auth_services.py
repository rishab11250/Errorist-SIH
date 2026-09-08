from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.auth.models import normalize_username
from app.auth.passwords import hash_password, verify_password
from app.auth.sessions import issue_session, resolve_session, revoke_session
from app.db import SessionRow, User
from app.migrations import upgrade_database
from app.settings import AuthSettings

NOW = datetime(2026, 9, 7, 10, 30, tzinfo=UTC)


@pytest.fixture
def db_session(tmp_path):
    path = tmp_path / "auth.db"
    upgrade_database(path)
    engine = create_engine(f"sqlite:///{path}")
    with Session(engine, expire_on_commit=False) as session:
        yield session
    engine.dispose()


@pytest.fixture
def inspector(db_session: Session) -> User:
    user = User(
        username_normalized="inspector",
        display_name="Inspector",
        password_hash="unused-in-session-tests",
        role="inspector",
    )
    db_session.add(user)
    db_session.commit()
    return user


def test_password_hash_is_argon2_and_verifies() -> None:
    encoded = hash_password("Correct Horse Battery Staple!")
    assert encoded.startswith("$argon2id$")
    assert verify_password(encoded, "Correct Horse Battery Staple!")
    assert not verify_password(encoded, "wrong")


def test_username_normalization_is_nfkc_casefolded_and_trimmed() -> None:
    assert normalize_username("  ＡdMin  ") == "admin"


def test_session_database_contains_hash_not_cookie(db_session: Session, inspector: User) -> None:
    issued = issue_session(db_session, inspector, now=NOW, ttl=timedelta(hours=8))
    db_session.flush()
    row = db_session.scalar(select(SessionRow))
    assert row is not None
    assert issued.token not in row.token_hash
    assert len(row.token_hash) == 64
    assert issued.expires_at == NOW + timedelta(hours=8)
    assert resolve_session(db_session, issued.token, now=NOW) == inspector


def test_expired_and_revoked_sessions_do_not_resolve(
    db_session: Session,
    inspector: User,
) -> None:
    issued = issue_session(db_session, inspector, now=NOW, ttl=timedelta(seconds=1))
    assert resolve_session(db_session, issued.token, now=NOW + timedelta(seconds=2)) is None

    second = issue_session(db_session, inspector, now=NOW, ttl=timedelta(hours=1))
    assert revoke_session(db_session, second.token, now=NOW)
    assert resolve_session(db_session, second.token, now=NOW) is None


def test_inactive_user_session_does_not_resolve(db_session: Session, inspector: User) -> None:
    issued = issue_session(db_session, inspector, now=NOW, ttl=timedelta(hours=1))
    inspector.is_active = False
    db_session.flush()
    assert resolve_session(db_session, issued.token, now=NOW) is None


def test_auth_settings_load_defaults(monkeypatch) -> None:
    for name in (
        "LMPC_SESSION_HOURS",
        "LMPC_COOKIE_SECURE",
        "LMPC_COOKIE_NAME",
        "LMPC_MAX_UPLOAD_BYTES",
        "LMPC_MAX_IMAGE_PIXELS",
        "LMPC_DB_PATH",
        "LMPC_BACKEND_ORIGIN",
        "LMPC_ALLOWED_BROWSER_ORIGINS",
    ):
        monkeypatch.delenv(name, raising=False)

    settings = AuthSettings.from_env()
    assert settings.session_hours == 8
    assert settings.cookie_secure is False
    assert settings.cookie_name == "lmpc_session"
    assert settings.max_upload_bytes == 10_000_000
    assert settings.max_image_pixels == 24_000_000
    assert str(settings.database_path) == "lmpc.db"
    assert settings.backend_origin == "http://127.0.0.1:8000"
    assert settings.allowed_browser_origins == (
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    )


@pytest.mark.parametrize("value", ["yes", "on", "", "TRUE "])
def test_auth_settings_reject_invalid_boolean(monkeypatch, value: str) -> None:
    monkeypatch.setenv("LMPC_COOKIE_SECURE", value)
    with pytest.raises(ValidationError, match="true/false/1/0"):
        AuthSettings.from_env()
