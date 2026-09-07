from __future__ import annotations

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db import User
from scripts.bootstrap_admin import main


def test_bootstrap_creates_admin_without_printing_secret(tmp_path, monkeypatch, capsys) -> None:
    path = tmp_path / "bootstrap.db"
    password = "One-time bootstrap password 123!"
    monkeypatch.setenv("LMPC_DB_PATH", str(path))
    monkeypatch.setenv("LMPC_BOOTSTRAP_PASSWORD", password)

    assert main(["--username", "Admin.One", "--display-name", "Admin One"]) == 0
    output = capsys.readouterr()
    assert "admin.one" in output.out
    assert password not in output.out + output.err
    assert "$argon2" not in output.out + output.err

    engine = create_engine(f"sqlite:///{path}")
    with Session(engine) as session:
        user = session.scalar(select(User))
        assert user is not None
        assert user.username_normalized == "admin.one"
        assert user.role == "admin"
    engine.dispose()


def test_bootstrap_refuses_duplicate_normalized_username(
    tmp_path,
    monkeypatch,
    capsys,
) -> None:
    path = tmp_path / "bootstrap.db"
    monkeypatch.setenv("LMPC_DB_PATH", str(path))
    monkeypatch.setenv("LMPC_BOOTSTRAP_PASSWORD", "One-time bootstrap password 123!")
    assert main(["--username", "Admin.One", "--display-name", "Admin One"]) == 0
    assert main(["--username", " ＡＤＭＩＮ.ONE ", "--display-name", "Other Admin"]) == 2
    assert "already exists" in capsys.readouterr().err
