"""Public authentication values and identity normalization."""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

UserRole = Literal["inspector", "admin"]


def normalize_username(value: str) -> str:
    """Return the single canonical form used for lookup and uniqueness."""
    return unicodedata.normalize("NFKC", value).casefold().strip()


class CurrentUser(BaseModel):
    """Safe current-user value returned by the authentication API."""

    model_config = ConfigDict(from_attributes=True, frozen=True)

    id: int
    username: str
    display_name: str
    role: UserRole


@dataclass(frozen=True, slots=True)
class IssuedSession:
    """One-time raw token plus its server-side expiry."""

    token: str
    expires_at: datetime
