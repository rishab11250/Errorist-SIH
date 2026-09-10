from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.migrations import HEAD_REVISION, upgrade_database


def _inspection_v2_database(path: Path) -> Path:
    root = Path(__file__).resolve().parent.parent
    config = Config(root / "alembic.ini")
    config.set_main_option("script_location", str(root / "migrations"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")
    command.upgrade(config, "0002_inspection_v2")
    with sqlite3.connect(path) as connection:
        connection.execute(
            """
            INSERT INTO scans
              (id, created_at, mode, category, image_b64, image_meta, ocr_payload,
               overall_status, schema_version, processing_status, quality_summary,
               extracted_fields, analysis_version)
            VALUES
              (7, CURRENT_TIMESTAMP, 'retail_image', 'unknown', 'aGVsbG8=', '{}', '[]',
               'pass', 2, 'complete', '{}', '{}', 'inspection-v2')
            """
        )
    return path


def test_operations_migration_creates_auth_and_review_tables(tmp_path) -> None:
    path = tmp_path / "fresh.db"
    upgrade_database(path)
    engine = create_engine(f"sqlite:///{path}")
    try:
        inspector = inspect(engine)
        assert {"users", "sessions", "review_actions"} <= set(inspector.get_table_names())
        assert "owner_user_id" in {column["name"] for column in inspector.get_columns("scans")}

        scan_foreign_keys = inspector.get_foreign_keys("scans")
        assert any(
            key["constrained_columns"] == ["owner_user_id"] and key["referred_table"] == "users"
            for key in scan_foreign_keys
        )

        index_names = {
            table: {index["name"] for index in inspector.get_indexes(table)}
            for table in ("sessions", "scans", "verdicts", "review_actions")
        }
        assert "ix_sessions_expires_at" in index_names["sessions"]
        assert "ix_scans_owner_created_at" in index_names["scans"]
        assert "ix_verdicts_rule_status" in index_names["verdicts"]
        assert "ix_review_actions_scan_created_at" in index_names["review_actions"]
    finally:
        engine.dispose()


def test_existing_inspection_scan_remains_unowned_after_operations_migration(tmp_path) -> None:
    path = _inspection_v2_database(tmp_path / "inspection-v2.db")
    upgrade_database(path)
    with sqlite3.connect(path) as connection:
        assert connection.execute(
            "SELECT id, owner_user_id FROM scans WHERE id = 7"
        ).fetchone() == (7, None)
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == (
            HEAD_REVISION,
        )
