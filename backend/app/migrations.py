from __future__ import annotations

import os
import sys
import time
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from pathlib import Path

if sys.platform == "win32":
    import msvcrt
else:
    import fcntl

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.sqlite import create_sqlite_engine

BASELINE_REVISION = "0001_legacy_schema"
HEAD_REVISION = "0005_product_identity_and_inspections"
LOCK_TIMEOUT_SECONDS = 10.0

LEGACY_SCHEMA = {
    "scans": {
        "id": ("INTEGER", True),
        "created_at": ("NUMERIC", True),
        "mode": ("TEXT", True),
        "category": ("TEXT", True),
        "image_b64": ("TEXT", True),
        "image_meta": ("NUMERIC", True),
        "ocr_payload": ("NUMERIC", True),
        "overall_status": ("TEXT", True),
    },
    "verdicts": {
        "id": ("INTEGER", True),
        "scan_id": ("INTEGER", True),
        "rule_id": ("TEXT", True),
        "status": ("TEXT", True),
        "severity": ("TEXT", True),
        "citation": ("TEXT", True),
        "evidence": ("TEXT", True),
        "evidence_bboxes": ("NUMERIC", True),
        "failure_message": ("TEXT", False),
        "rule_version": ("TEXT", True),
        "created_at": ("NUMERIC", True),
    },
}


class LegacySchemaError(RuntimeError):
    """Raised when an unversioned database is unsafe to adopt."""


class MigrationLockTimeout(TimeoutError):
    """Raised when another process holds a database migration lock too long."""


def _sqlite_affinity(declared_type: str) -> str:
    normalized = declared_type.upper()
    if "INT" in normalized:
        return "INTEGER"
    if any(token in normalized for token in ("CHAR", "CLOB", "TEXT")):
        return "TEXT"
    if not normalized or "BLOB" in normalized:
        return "BLOB"
    if any(token in normalized for token in ("REAL", "FLOA", "DOUB")):
        return "REAL"
    return "NUMERIC"


@contextmanager
def _database_lock(db_path: Path, timeout_seconds: float = LOCK_TIMEOUT_SECONDS) -> Iterator[None]:
    lock_path = db_path if sys.platform != "win32" else db_path.parent / f"{db_path.name}.lock"
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    deadline = time.monotonic() + timeout_seconds
    try:
        while True:
            try:
                if sys.platform == "win32":
                    msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
                else:
                    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except (BlockingIOError, OSError) as error:
                if time.monotonic() >= deadline:
                    raise MigrationLockTimeout(
                        f"timed out after {timeout_seconds:g}s waiting to migrate {db_path}"
                    ) from error
                time.sleep(0.05)
        yield
    finally:
        if sys.platform == "win32":
            with suppress(OSError):
                msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
        else:
            fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def _config(db_path: str | Path) -> Config:
    root = Path(__file__).resolve().parent.parent
    config = Config(root / "alembic.ini")
    config.set_main_option("script_location", str(root / "migrations"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{Path(db_path)}")
    return config


def upgrade_database(db_path: str | Path) -> None:
    path = Path(db_path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    with _database_lock(path):
        config = _config(path)
        engine = create_sqlite_engine(path)
        try:
            inspector = inspect(engine)
            tables = set(inspector.get_table_names())
            legacy_tables = tables & LEGACY_SCHEMA.keys()
            if legacy_tables and legacy_tables != LEGACY_SCHEMA.keys():
                raise LegacySchemaError(
                    "unversioned legacy database must contain both scans and verdicts tables"
                )
            if legacy_tables and "alembic_version" not in tables:
                with engine.connect() as connection:
                    table_info = {
                        table: connection.exec_driver_sql(f'PRAGMA table_info("{table}")')
                        .mappings()
                        .all()
                        for table in LEGACY_SCHEMA
                    }
                    foreign_key_violations = connection.exec_driver_sql(
                        "PRAGMA foreign_key_check"
                    ).all()
                actual_names = {
                    table: {column["name"] for column in columns}
                    for table, columns in table_info.items()
                }
                name_mismatches = {
                    table: {
                        "missing": sorted(schema.keys() - actual_names[table]),
                        "extra": sorted(actual_names[table] - schema.keys()),
                    }
                    for table, schema in LEGACY_SCHEMA.items()
                    if actual_names[table] != schema.keys()
                }
                if name_mismatches:
                    raise LegacySchemaError(
                        "incompatible unversioned legacy schema; column mismatch: "
                        f"{name_mismatches}"
                    )
                affinity_mismatches = {
                    f"{table}.{column['name']}": (
                        _sqlite_affinity(column["type"]),
                        LEGACY_SCHEMA[table][column["name"]][0],
                    )
                    for table, columns in table_info.items()
                    for column in columns
                    if _sqlite_affinity(column["type"]) != LEGACY_SCHEMA[table][column["name"]][0]
                }
                if affinity_mismatches:
                    raise LegacySchemaError(
                        "incompatible unversioned legacy schema; type affinity mismatch: "
                        f"{affinity_mismatches}"
                    )
                nullability_mismatches = {
                    f"{table}.{column['name']}": (
                        bool(column["notnull"]),
                        LEGACY_SCHEMA[table][column["name"]][1],
                    )
                    for table, columns in table_info.items()
                    for column in columns
                    if bool(column["notnull"]) != LEGACY_SCHEMA[table][column["name"]][1]
                }
                if nullability_mismatches:
                    raise LegacySchemaError(
                        "incompatible unversioned legacy schema; nullability mismatch: "
                        f"{nullability_mismatches}"
                    )
                primary_key_mismatches = {
                    table: inspector.get_pk_constraint(table).get("constrained_columns")
                    for table in LEGACY_SCHEMA
                    if inspector.get_pk_constraint(table).get("constrained_columns") != ["id"]
                }
                if primary_key_mismatches:
                    raise LegacySchemaError(
                        "incompatible unversioned legacy schema; expected id primary keys: "
                        f"{primary_key_mismatches}"
                    )
                foreign_keys = inspector.get_foreign_keys("verdicts")
                has_scan_foreign_key = any(
                    foreign_key.get("constrained_columns") == ["scan_id"]
                    and foreign_key.get("referred_table") == "scans"
                    and foreign_key.get("referred_columns") == ["id"]
                    for foreign_key in foreign_keys
                )
                if not has_scan_foreign_key:
                    raise LegacySchemaError(
                        "incompatible unversioned legacy schema; expected verdicts.scan_id "
                        "foreign key to scans.id"
                    )
                if foreign_key_violations:
                    raise LegacySchemaError(
                        "incompatible unversioned legacy schema; foreign key check failed: "
                        f"{foreign_key_violations}"
                    )
        finally:
            engine.dispose()
        if legacy_tables and "alembic_version" not in tables:
            command.stamp(config, BASELINE_REVISION)
        command.upgrade(config, "head")
