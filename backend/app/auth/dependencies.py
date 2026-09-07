"""FastAPI dependencies for local session and role enforcement."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.auth.sessions import resolve_session
from app.db import User, get_session
from app.errors import AppError
from app.settings import AuthSettings


def get_auth_settings(request: Request) -> AuthSettings:
    settings = getattr(request.app.state, "auth_settings", None)
    if not isinstance(settings, AuthSettings):
        raise RuntimeError("authentication settings were not initialized")
    return settings


def require_user(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[AuthSettings, Depends(get_auth_settings)],
) -> User:
    token = request.cookies.get(settings.cookie_name)
    if not token:
        raise AppError(401, "authentication_required", "Sign in to continue.")
    user = resolve_session(session, token, now=datetime.now(UTC))
    if user is None:
        raise AppError(401, "session_expired", "Your session is no longer valid. Sign in again.")
    session.commit()
    return user


def require_admin(user: Annotated[User, Depends(require_user)]) -> User:
    if user.role != "admin":
        raise AppError(403, "forbidden", "Administrator access is required.")
    return user
