"""Create the initial local administrator account."""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from collections.abc import Sequence

from sqlalchemy import select

from app import db
from app.auth.models import normalize_username
from app.auth.passwords import hash_password, password_policy_error
from app.db import User
from app.settings import AuthSettings


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", required=True)
    parser.add_argument("--display-name", required=True)
    return parser


def _read_password() -> str | None:
    configured = os.environ.get("LMPC_BOOTSTRAP_PASSWORD")
    if configured is not None:
        return configured
    first = getpass.getpass("Password: ")
    second = getpass.getpass("Confirm password: ")
    if first != second:
        print("Passwords do not match.", file=sys.stderr)
        return None
    return first


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    username = normalize_username(args.username)
    if not username:
        print("Username must not be blank.", file=sys.stderr)
        return 2
    password = _read_password()
    if password is None:
        return 2
    policy_error = password_policy_error(password, username)
    if policy_error:
        print(policy_error, file=sys.stderr)
        return 2

    settings = AuthSettings.from_env()
    db.init_db(settings.database_path)
    if db.SessionLocal is None:
        raise RuntimeError("database was not initialized")
    with db.SessionLocal() as session:
        if session.scalar(select(User.id).where(User.username_normalized == username)):
            print(f"User {username} already exists.", file=sys.stderr)
            return 2
        session.add(
            User(
                username_normalized=username,
                display_name=args.display_name.strip(),
                password_hash=hash_password(password),
                role="admin",
            )
        )
        session.commit()
    print(f"Created administrator {username}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
