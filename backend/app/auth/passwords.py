"""Argon2id password hashing with one application-wide configuration."""

from __future__ import annotations

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError

from app.auth.models import normalize_username

_PASSWORD_HASHER = PasswordHasher(
    time_cost=3,
    memory_cost=65_536,
    parallelism=4,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)


def hash_password(password: str) -> str:
    """Hash a non-empty password with the configured Argon2id profile."""
    if not password:
        raise ValueError("password must not be empty")
    return _PASSWORD_HASHER.hash(password)


def verify_password(encoded: str, password: str) -> bool:
    """Verify a password without leaking malformed-hash or mismatch details."""
    try:
        return _PASSWORD_HASHER.verify(encoded, password)
    except (InvalidHashError, VerificationError):
        return False


def password_policy_error(password: str, username: str) -> str | None:
    """Return a user-safe explanation when a new password is unacceptable."""
    if not 12 <= len(password) <= 128:
        return "Password must contain between 12 and 128 characters."
    normalized_username = normalize_username(username)
    if normalized_username and normalized_username in normalize_username(password):
        return "Password must not contain the username."
    return None
