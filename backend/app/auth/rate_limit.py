"""In-memory rate limiter for authentication attempts."""

from __future__ import annotations

import threading
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from app.errors import AppError

MAX_LOGIN_ATTEMPTS = 5
LOGIN_ATTEMPT_WINDOW = timedelta(minutes=15)

_lock = threading.Lock()
_failed_attempts: dict[str, list[datetime]] = defaultdict(list)


def check_login_rate_limit(username: str, now: datetime | None = None) -> None:
    """Check whether the username has exceeded the allowed failed login attempts."""
    if now is None:
        now = datetime.now(UTC)
    cutoff = now - LOGIN_ATTEMPT_WINDOW
    with _lock:
        timestamps = [t for t in _failed_attempts.get(username, []) if t > cutoff]
        _failed_attempts[username] = timestamps
        if len(timestamps) >= MAX_LOGIN_ATTEMPTS:
            raise AppError(
                429,
                "too_many_attempts",
                "Too many failed login attempts. Please try again later.",
            )


def record_login_failure(username: str, now: datetime | None = None) -> None:
    """Record a failed login attempt for the username."""
    if now is None:
        now = datetime.now(UTC)
    cutoff = now - LOGIN_ATTEMPT_WINDOW
    with _lock:
        timestamps = [t for t in _failed_attempts.get(username, []) if t > cutoff]
        timestamps.append(now)
        _failed_attempts[username] = timestamps


def record_login_success(username: str) -> None:
    """Clear failed login attempts for the username upon successful authentication."""
    with _lock:
        _failed_attempts.pop(username, None)


def reset_login_attempts() -> None:
    """Reset all recorded login attempts (primarily for test isolation)."""
    with _lock:
        _failed_attempts.clear()
