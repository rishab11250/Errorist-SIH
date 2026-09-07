"""Login, logout, and current-user API routes."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.dependencies import get_auth_settings, require_user
from app.auth.models import CurrentUser, normalize_username
from app.auth.passwords import hash_password, verify_password
from app.auth.sessions import issue_session, revoke_session
from app.db import SessionRow, User, get_session
from app.errors import AppError
from app.settings import AuthSettings

router = APIRouter(prefix="/api/auth", tags=["authentication"])

Username = Annotated[str, StringConstraints(min_length=1, max_length=80)]
Password = Annotated[str, StringConstraints(min_length=1, max_length=1024)]
_DUMMY_HASH = hash_password("not-a-real-account-password")


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: Username
    password: Password


class UserEnvelope(BaseModel):
    user: CurrentUser


def _public_user(user: User) -> CurrentUser:
    return CurrentUser(
        id=user.id,
        username=user.username_normalized,
        display_name=user.display_name,
        role=user.role,
    )


@router.post("/login", response_model=UserEnvelope)
def login(
    credentials: LoginRequest,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[AuthSettings, Depends(get_auth_settings)],
) -> UserEnvelope:
    now = datetime.now(UTC)
    username = normalize_username(credentials.username)
    user = session.scalar(select(User).where(User.username_normalized == username))
    encoded = user.password_hash if user is not None else _DUMMY_HASH
    password_valid = verify_password(encoded, credentials.password)
    if user is None or not password_valid or not user.is_active:
        raise AppError(401, "invalid_credentials", "Username or password is incorrect.")

    session.execute(
        update(SessionRow)
        .where(SessionRow.user_id == user.id, SessionRow.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    issued = issue_session(
        session,
        user,
        now=now,
        ttl=timedelta(hours=settings.session_hours),
    )
    user.last_login_at = now
    session.commit()
    response.set_cookie(
        key=settings.cookie_name,
        value=issued.token,
        max_age=settings.session_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return UserEnvelope(user=_public_user(user))


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[AuthSettings, Depends(get_auth_settings)],
) -> Response:
    token = request.cookies.get(settings.cookie_name)
    if token:
        revoke_session(session, token, now=datetime.now(UTC))
        session.commit()
    response = Response(status_code=204)
    response.delete_cookie(key=settings.cookie_name, path="/")
    return response


@router.get("/me", response_model=UserEnvelope)
def current_user(user: Annotated[User, Depends(require_user)]) -> UserEnvelope:
    return UserEnvelope(user=_public_user(user))
