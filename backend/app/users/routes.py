"""Administrator-only local user management API."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import require_admin
from app.auth.models import normalize_username
from app.auth.passwords import hash_password, password_policy_error
from app.db import SessionRow, User, get_session
from app.errors import AppError

router = APIRouter(prefix="/api/users", tags=["users"])
Role = Literal["inspector", "admin"]
BoundedName = Annotated[str, StringConstraints(min_length=1, max_length=120)]


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    display_name: BoundedName
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    role: Role


class UserPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: Annotated[str, StringConstraints(min_length=1, max_length=80)] | None = None
    display_name: BoundedName | None = None
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)] | None = None
    role: Role | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    id: int
    username: str
    display_name: str
    role: Role
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None


def _out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username_normalized,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        last_login_at=user.last_login_at,
    )


def _duplicate(session: Session, username: str, *, excluding: int | None = None) -> bool:
    query = select(User.id).where(User.username_normalized == username)
    if excluding is not None:
        query = query.where(User.id != excluding)
    return session.scalar(query) is not None


def _revoke_user_sessions(session: Session, user_id: int, now: datetime) -> None:
    session.execute(
        update(SessionRow)
        .where(SessionRow.user_id == user_id, SessionRow.revoked_at.is_(None))
        .values(revoked_at=now)
    )


@router.get("", response_model=list[UserOut])
def list_users(
    session: Annotated[Session, Depends(get_session)],
    _admin: Annotated[User, Depends(require_admin)],
) -> list[UserOut]:
    users = session.scalars(select(User).order_by(User.username_normalized, User.id)).all()
    return [_out(user) for user in users]


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    body: UserCreate,
    session: Annotated[Session, Depends(get_session)],
    _admin: Annotated[User, Depends(require_admin)],
) -> UserOut:
    username = normalize_username(body.username)
    if not username:
        raise AppError(422, "validation_error", "Username must not be blank.")
    policy_error = password_policy_error(body.password, username)
    if policy_error:
        raise AppError(422, "weak_password", policy_error)
    if _duplicate(session, username):
        raise AppError(409, "duplicate_username", "That username already exists.")
    user = User(
        username_normalized=username,
        display_name=body.display_name.strip(),
        password_hash=hash_password(body.password),
        role=body.role,
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise AppError(409, "duplicate_username", "That username already exists.") from exc
    session.refresh(user)
    return _out(user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UserPatch,
    session: Annotated[Session, Depends(get_session)],
    _admin: Annotated[User, Depends(require_admin)],
) -> UserOut:
    if not body.model_fields_set:
        raise AppError(422, "empty_patch", "Provide at least one user field to update.")
    user = session.get(User, user_id)
    if user is None:
        raise AppError(404, "user_not_found", "User not found.")

    username = (
        normalize_username(body.username)
        if "username" in body.model_fields_set and body.username is not None
        else user.username_normalized
    )
    if not username:
        raise AppError(422, "validation_error", "Username must not be blank.")
    if username != user.username_normalized and _duplicate(session, username, excluding=user.id):
        raise AppError(409, "duplicate_username", "That username already exists.")
    if body.password is not None:
        policy_error = password_policy_error(body.password, username)
        if policy_error:
            raise AppError(422, "weak_password", policy_error)

    new_role = body.role if body.role is not None else user.role
    new_active = body.is_active if body.is_active is not None else user.is_active
    removes_active_admin = (
        user.role == "admin" and user.is_active and (new_role != "admin" or not new_active)
    )
    if removes_active_admin:
        active_admins = session.scalar(
            select(func.count(User.id)).where(User.role == "admin", User.is_active.is_(True))
        )
        if active_admins == 1:
            raise AppError(409, "last_admin_required", "At least one active admin is required.")

    now = datetime.now(UTC)
    user.username_normalized = username
    if body.display_name is not None:
        user.display_name = body.display_name.strip()
    user.role = new_role
    user.is_active = new_active
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    if body.password is not None or body.is_active is False:
        _revoke_user_sessions(session, user.id, now)
    user.updated_at = now
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise AppError(409, "duplicate_username", "That username already exists.") from exc
    session.refresh(user)
    return _out(user)
