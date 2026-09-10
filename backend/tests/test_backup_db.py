from __future__ import annotations

import sqlite3

from scripts.backup_db import backup_database


def test_backup_database_copies_live_wal_database(tmp_path) -> None:
    database = tmp_path / "lmpc.db"
    backup_dir = tmp_path / "backups"
    with sqlite3.connect(database) as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("CREATE TABLE scans (id INTEGER PRIMARY KEY, status TEXT NOT NULL)")
        connection.execute("INSERT INTO scans (status) VALUES ('complete')")
        connection.commit()

        backup = backup_database(database, backup_dir)

    assert backup.name.startswith("lmpc-")
    assert backup.suffix == ".db"
    with sqlite3.connect(backup) as connection:
        assert connection.execute("SELECT status FROM scans").fetchone() == ("complete",)