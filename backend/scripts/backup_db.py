"""Create a consistent SQLite backup while the database is in use."""

from __future__ import annotations

import argparse
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path


def backup_database(database: Path, backup_dir: Path) -> Path:
    source = database.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"database not found: {source}")

    destination_dir = backup_dir.expanduser().resolve()
    destination_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    destination = destination_dir / f"{source.stem}-{timestamp}.db"
    if destination.exists():
        raise FileExistsError(f"backup already exists: {destination}")

    with sqlite3.connect(source) as source_connection:
        with sqlite3.connect(destination) as destination_connection:
            source_connection.backup(destination_connection)
    return destination


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database",
        type=Path,
        default=Path(os.environ.get("LMPC_DB_PATH", "lmpc.db")),
        help="SQLite database path (default: LMPC_DB_PATH or lmpc.db)",
    )
    parser.add_argument(
        "--backup-dir",
        type=Path,
        default=Path("backups"),
        help="Directory for timestamped backups (default: backups)",
    )
    return parser


def main() -> None:
    args = _parser().parse_args()
    destination = backup_database(args.database, args.backup_dir)
    print(destination)


if __name__ == "__main__":
    main()