from __future__ import annotations

import sqlite3
from multiprocessing import get_context

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import db
from app.migrations import HEAD_REVISION, LegacySchemaError, upgrade_database


def _columns(path, table: str) -> set[str]:
    with sqlite3.connect(path) as connection:
        return {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}


def _create_legacy_schema(
    connection: sqlite3.Connection,
    *,
    mode_type: str = "VARCHAR",
    mode_not_null: bool = True,
    include_foreign_key: bool = True,
) -> None:
    mode_constraint = "NOT NULL" if mode_not_null else ""
    foreign_key = ", FOREIGN KEY(scan_id) REFERENCES scans(id)" if include_foreign_key else ""
    connection.executescript(
        f"""
        CREATE TABLE scans (
          id INTEGER NOT NULL PRIMARY KEY, created_at DATETIME NOT NULL,
          mode {mode_type} {mode_constraint}, category VARCHAR NOT NULL,
          image_b64 TEXT NOT NULL, image_meta JSON NOT NULL, ocr_payload JSON NOT NULL,
          overall_status VARCHAR NOT NULL
        );
        CREATE TABLE verdicts (
          id INTEGER NOT NULL PRIMARY KEY, scan_id INTEGER NOT NULL, rule_id VARCHAR NOT NULL,
          status VARCHAR NOT NULL, severity VARCHAR NOT NULL, citation VARCHAR NOT NULL,
          evidence TEXT NOT NULL, evidence_bboxes JSON NOT NULL, failure_message TEXT,
          rule_version VARCHAR NOT NULL, created_at DATETIME NOT NULL
          {foreign_key}
        );
        """
    )


def _upgrade_worker(path: str, start_event, result_queue) -> None:
    start_event.wait()
    try:
        upgrade_database(path)
    except Exception as error:  # pragma: no cover - asserted through the parent process
        result_queue.put(f"{type(error).__name__}: {error}")
    else:
        result_queue.put(None)


def test_fresh_database_reaches_inspection_head(tmp_path) -> None:
    path = tmp_path / "fresh.db"
    upgrade_database(path)
    upgrade_database(path)
    assert {
        "quality_summary",
        "extracted_fields",
        "analysis_version",
        "failure_stage",
        "request_id",
        "processing_error_code",
    } <= _columns(path, "scans")
    assert {"confidence", "reasoning", "measurement_method", "review_state"} <= _columns(
        path, "verdicts"
    )
    with sqlite3.connect(path) as connection:
        revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    assert revision == HEAD_REVISION


def test_unversioned_legacy_database_is_adopted_without_data_loss(tmp_path) -> None:
    path = tmp_path / "legacy.db"
    with sqlite3.connect(path) as connection:
        _create_legacy_schema(connection)
        connection.executescript(
            """
            INSERT INTO scans VALUES
              (7, CURRENT_TIMESTAMP, 'retail_image', 'unknown', 'aGVsbG8=', '{}', '[]', 'pass');
            INSERT INTO verdicts VALUES
              (11, 7, 'r6_1_e_mrp', 'pass', 'critical', 'Rule 6(1)(e)',
               'MRP Rs.99', '[[0.1, 0.2, 0.3, 0.4]]', NULL, '2026-09', CURRENT_TIMESTAMP);
            """
        )
    upgrade_database(path)
    upgrade_database(path)
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT id FROM scans").fetchall() == [(7,)]
        assert connection.execute(
            "SELECT id, scan_id, evidence_bboxes FROM verdicts"
        ).fetchall() == [(11, 7, "[[0.1, 0.2, 0.3, 0.4]]")]
        assert connection.execute("PRAGMA foreign_key_list(verdicts)").fetchone()[2] == "scans"
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == (
            HEAD_REVISION
        )


def test_partial_legacy_database_is_rejected(tmp_path) -> None:
    path = tmp_path / "partial.db"
    with sqlite3.connect(path) as connection:
        connection.execute("CREATE TABLE scans (id INTEGER PRIMARY KEY)")

    with pytest.raises(LegacySchemaError, match="both scans and verdicts"):
        upgrade_database(path)


def test_incompatible_legacy_database_is_rejected(tmp_path) -> None:
    path = tmp_path / "incompatible.db"
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE scans (id INTEGER PRIMARY KEY, unexpected TEXT);
            CREATE TABLE verdicts (id INTEGER PRIMARY KEY);
            """
        )

    with pytest.raises(LegacySchemaError, match="incompatible unversioned legacy schema"):
        upgrade_database(path)


def test_legacy_database_without_expected_foreign_key_is_rejected(tmp_path) -> None:
    path = tmp_path / "missing-foreign-key.db"
    with sqlite3.connect(path) as connection:
        _create_legacy_schema(connection, include_foreign_key=False)

    with pytest.raises(LegacySchemaError, match="foreign key"):
        upgrade_database(path)


@pytest.mark.parametrize(
    ("options", "message"),
    [
        ({"mode_type": "BLOB"}, "type affinity"),
        ({"mode_not_null": False}, "nullability"),
    ],
)
def test_legacy_database_with_incompatible_column_shape_is_rejected(
    tmp_path, options, message
) -> None:
    path = tmp_path / f"incompatible-{message}.db"
    with sqlite3.connect(path) as connection:
        _create_legacy_schema(connection, **options)

    with pytest.raises(LegacySchemaError, match=message):
        upgrade_database(path)


def test_legacy_database_with_orphan_verdict_is_rejected_before_stamp(tmp_path) -> None:
    path = tmp_path / "orphan.db"
    with sqlite3.connect(path) as connection:
        _create_legacy_schema(connection)
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.execute(
            """
            INSERT INTO verdicts VALUES
              (13, 999, 'r6_1_e_mrp', 'fail', 'critical', 'Rule 6(1)(e)',
               '', '[]', NULL, '2026-09', CURRENT_TIMESTAMP)
            """
        )

    with pytest.raises(LegacySchemaError, match="foreign key check"):
        upgrade_database(path)


def test_app_connections_enforce_foreign_keys(tmp_path) -> None:
    path = tmp_path / "app.db"
    db.init_db(path)
    assert db._engine is not None
    with db._engine.connect() as connection:
        assert connection.execute(text("PRAGMA foreign_keys")).scalar_one() == 1
        with pytest.raises(IntegrityError):
            connection.execute(
                text(
                    """
                    INSERT INTO verdicts
                      (scan_id, rule_id, status, severity, citation, evidence,
                       evidence_bboxes, rule_version, created_at)
                    VALUES
                      (999, 'r6_1_e_mrp', 'fail', 'critical', 'Rule 6(1)(e)', '',
                       '[]', '2026-09', CURRENT_TIMESTAMP)
                    """
                )
            )


def test_concurrent_fresh_database_upgrades_are_serialized(tmp_path) -> None:
    path = tmp_path / "concurrent.db"
    context = get_context("spawn")
    start_event = context.Event()
    result_queue = context.Queue()
    workers = [
        context.Process(target=_upgrade_worker, args=(str(path), start_event, result_queue))
        for _ in range(4)
    ]
    for worker in workers:
        worker.start()
    start_event.set()
    for worker in workers:
        worker.join(timeout=20)

    assert all(not worker.is_alive() for worker in workers)
    assert [result_queue.get(timeout=2) for _ in workers] == [None] * len(workers)
    assert all(worker.exitcode == 0 for worker in workers)
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT version_num FROM alembic_version").fetchone()[0] == (
            HEAD_REVISION
        )
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert {"quality_summary", "analysis_version"} <= _columns(path, "scans")
