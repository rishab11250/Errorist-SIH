from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.migrations import HEAD_REVISION, upgrade_database


def _offline_sync_database(path: Path) -> Path:
    root = Path(__file__).resolve().parent.parent
    config = Config(root / "alembic.ini")
    config.set_main_option("script_location", str(root / "migrations"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")
    command.upgrade(config, "0004_offline_sync")
    with sqlite3.connect(path) as connection:
        connection.execute(
            """
            INSERT INTO scans
              (id, created_at, mode, category, image_b64, image_meta, ocr_payload,
               overall_status, schema_version, processing_status, quality_summary,
               extracted_fields, analysis_version, client_local_id)
            VALUES
              (10, CURRENT_TIMESTAMP, 'retail_image', 'unknown', 'aGVsbG8=', '{}', '[]',
               'pass', 2, 'complete', '{}', '{}', 'inspection-v2', 'loc-100')
            """
        )
    return path


def test_migration_0005_creates_product_and_inspection_tables(tmp_path) -> None:
    path = tmp_path / "fresh_0005.db"
    upgrade_database(path)
    engine = create_engine(f"sqlite:///{path}")
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        assert {"products", "inspections", "product_audit_logs"} <= table_names

        scan_cols = {col["name"] for col in inspector.get_columns("scans")}
        assert {"product_id", "inspection_id", "product_match_status"} <= scan_cols

        scan_fks = inspector.get_foreign_keys("scans")
        assert any(
            fk["constrained_columns"] == ["product_id"] and fk["referred_table"] == "products"
            for fk in scan_fks
        )
        assert any(
            fk["constrained_columns"] == ["inspection_id"] and fk["referred_table"] == "inspections"
            for fk in scan_fks
        )

        scan_indexes = {idx["name"] for idx in inspector.get_indexes("scans")}
        assert "ix_scans_product_id" in scan_indexes
        assert "ix_scans_inspection_id" in scan_indexes
        assert "ix_scans_product_inspection_created" in scan_indexes

        product_indexes = {idx["name"] for idx in inspector.get_indexes("products")}
        assert "ix_products_fingerprint_exact" in product_indexes
        assert "ix_products_search_key" in product_indexes
    finally:
        engine.dispose()


def test_migration_0005_upgrades_existing_scans_cleanly(tmp_path) -> None:
    path = _offline_sync_database(tmp_path / "sync.db")
    upgrade_database(path)
    with sqlite3.connect(path) as connection:
        row = connection.execute(
            "SELECT id, product_id, inspection_id, product_match_status FROM scans WHERE id = 10"
        ).fetchone()
        assert row == (10, None, None, "unmatched")
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone() == (
            HEAD_REVISION,
        )


def test_migration_0005_downgrades_cleanly(tmp_path) -> None:
    root = Path(__file__).resolve().parent.parent
    path = tmp_path / "downgrade.db"
    upgrade_database(path)

    config = Config(root / "alembic.ini")
    config.set_main_option("script_location", str(root / "migrations"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{path}")

    # Downgrade back to 0004
    command.downgrade(config, "0004_offline_sync")
    engine = create_engine(f"sqlite:///{path}")
    try:
        inspector = inspect(engine)
        table_names = set(inspector.get_table_names())
        assert "products" not in table_names
        assert "inspections" not in table_names
        assert "product_audit_logs" not in table_names

        scan_cols = {col["name"] for col in inspector.get_columns("scans")}
        assert "product_id" not in scan_cols
        assert "inspection_id" not in scan_cols
        assert "product_match_status" not in scan_cols
    finally:
        engine.dispose()
