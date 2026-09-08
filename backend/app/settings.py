"""Validated local runtime settings."""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AuthSettings(BaseModel):
    """Authentication, storage, and bounded-upload settings."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    session_hours: int = Field(default=8, gt=0, le=24 * 30)
    cookie_secure: bool = False
    cookie_name: str = Field(default="lmpc_session", min_length=1, max_length=80)
    max_upload_bytes: int = Field(default=10_000_000, gt=0)
    max_image_pixels: int = Field(default=24_000_000, gt=0)
    database_path: Path = Path("lmpc.db")
    backend_origin: str = "http://127.0.0.1:8000"
    allowed_browser_origins: tuple[str, ...] = (
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    )

    @field_validator("cookie_secure", mode="before")
    @classmethod
    def parse_strict_boolean(cls, value: object) -> object:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            if value in {"true", "1"}:
                return True
            if value in {"false", "0"}:
                return False
        raise ValueError("must be one of true/false/1/0")

    @field_validator("cookie_name")
    @classmethod
    def validate_cookie_name(cls, value: str) -> str:
        if not value.replace("_", "").replace("-", "").isalnum():
            raise ValueError("must contain only letters, digits, underscores, or hyphens")
        return value

    @field_validator("backend_origin")
    @classmethod
    def validate_backend_origin(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("must be an absolute http or https origin")
        if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            raise ValueError("must not include a path, query, or fragment")
        return value.rstrip("/")

    @field_validator("allowed_browser_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: object) -> object:
        if isinstance(value, str):
            value = tuple(part.strip() for part in value.split(",") if part.strip())
        return value

    @field_validator("allowed_browser_origins")
    @classmethod
    def validate_allowed_origins(cls, values: tuple[str, ...]) -> tuple[str, ...]:
        if not values:
            raise ValueError("must include at least one browser origin")
        normalized: list[str] = []
        for value in values:
            if value == "*":
                raise ValueError("must not contain a wildcard origin")
            parsed = urlsplit(value)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("must contain only absolute http or https origins")
            if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
                raise ValueError("origins must not include a path, query, or fragment")
            origin = value.rstrip("/")
            if origin not in normalized:
                normalized.append(origin)
        return tuple(normalized)

    @classmethod
    def from_env(cls) -> AuthSettings:
        """Load the supported environment variables and validate them together."""
        names = {
            "session_hours": "LMPC_SESSION_HOURS",
            "cookie_secure": "LMPC_COOKIE_SECURE",
            "cookie_name": "LMPC_COOKIE_NAME",
            "max_upload_bytes": "LMPC_MAX_UPLOAD_BYTES",
            "max_image_pixels": "LMPC_MAX_IMAGE_PIXELS",
            "database_path": "LMPC_DB_PATH",
            "backend_origin": "LMPC_BACKEND_ORIGIN",
            "allowed_browser_origins": "LMPC_ALLOWED_BROWSER_ORIGINS",
        }
        values = {
            field: os.environ[environment]
            for field, environment in names.items()
            if environment in os.environ
        }
        return cls.model_validate(values)
