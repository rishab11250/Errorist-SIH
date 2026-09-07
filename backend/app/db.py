"""SQLAlchemy models and session factory for the SQLite scan store."""
from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker


class Base(DeclarativeBase):
    pass


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    mode: Mapped[str] = mapped_column(String, default="retail_image")
    category: Mapped[str] = mapped_column(String, default="unknown")
    image_b64: Mapped[str] = mapped_column(Text)
    image_meta: Mapped[dict] = mapped_column(JSON)
    ocr_payload: Mapped[list] = mapped_column(JSON)
    overall_status: Mapped[str] = mapped_column(String, default="mixed")
    verdicts: Mapped[list[VerdictRow]] = relationship(back_populates="scan", cascade="all, delete-orphan")


class VerdictRow(Base):
    __tablename__ = "verdicts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"))
    rule_id: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String)
    citation: Mapped[str] = mapped_column(String)
    evidence: Mapped[str] = mapped_column(Text, default="")
    evidence_bboxes: Mapped[list] = mapped_column(JSON, default=list)
    failure_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_version: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    scan: Mapped[Scan] = relationship(back_populates="verdicts")


_engine = None
SessionLocal: sessionmaker[Session] | None = None


def init_db(db_path: str | Path = "lmpc.db") -> None:
    """Initialize SQLite and create the scan and verdict tables."""
    global _engine, SessionLocal
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    _engine = create_engine(f"sqlite:///{path}", echo=False, future=True)
    SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False, expire_on_commit=False)
    Base.metadata.create_all(_engine)


def get_session() -> Iterator[Session]:
    """Yield a database session and always close it after the request."""
    if SessionLocal is None:
        raise RuntimeError("DB not initialized; call init_db() first")
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
