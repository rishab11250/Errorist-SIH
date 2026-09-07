"""Opaque session issue, lookup, and revocation primitives."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.models import IssuedSession
from app.db import SessionRow, User


def token_digest(token: str) -> str:
    """Return the fixed-width digest persisted instead of the cookie token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_session(
    session: Session,
    user: User,
    *,
    now: datetime,
    ttl: timedelta,
) -> IssuedSession:
    """Create an opaque session row and return its one-time raw token."""
    if ttl <= timedelta(0):
        raise ValueError("session ttl must be positive")
    token = secrets.token_urlsafe(32)
    expires_at = now + ttl
    session.add(
        SessionRow(
            user_id=user.id,
            token_hash=token_digest(token),
            created_at=now,
            expires_at=expires_at,
            last_seen_at=now,
        )
    )
    session.flush()
    return IssuedSession(token=token, expires_at=expires_at)


def resolve_session(session: Session, token: str, *, now: datetime) -> User | None:
    """Resolve a valid active token and update its last-seen timestamp."""
    if not token:
        return None
    row = session.scalar(
        select(SessionRow).where(
            SessionRow.token_hash == token_digest(token),
            SessionRow.revoked_at.is_(None),
            SessionRow.expires_at > now,
        )
    )
    if row is None or not row.user.is_active:
        return None
    row.last_seen_at = now
    return row.user


def revoke_session(session: Session, token: str, *, now: datetime) -> bool:
    """Revoke a token if present; repeated or unknown revocations are harmless."""
    if not token:
        return False
    row = session.scalar(select(SessionRow).where(SessionRow.token_hash == token_digest(token)))
    if row is None or row.revoked_at is not None:
        return False
    row.revoked_at = now
    session.flush()
    return True
