"""Shared SQLite engine configuration."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine


def _enable_foreign_keys(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
    finally:
        cursor.close()


def enable_sqlite_foreign_keys(engine: Engine) -> Engine:
    """Enable SQLite foreign-key enforcement on every connection from an engine."""
    event.listen(engine, "connect", _enable_foreign_keys)
    return engine


def create_sqlite_engine(db_path: str | Path, **kwargs: Any) -> Engine:
    """Create an SQLite engine with foreign-key enforcement installed before first use."""
    engine = create_engine(f"sqlite:///{Path(db_path)}", **kwargs)
    return enable_sqlite_foreign_keys(engine)
