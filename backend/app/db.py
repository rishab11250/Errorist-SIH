"""SQLAlchemy models and session factory for the SQLite scan store."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)

from app.sqlite import create_sqlite_engine


class Base(DeclarativeBase):
    pass


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    mode: Mapped[str] = mapped_column(String, default="retail_image")
    category: Mapped[str] = mapped_column(String, default="unknown")
    image_b64: Mapped[str] = mapped_column(Text)
    image_meta: Mapped[dict] = mapped_column(JSON)
    ocr_payload: Mapped[list] = mapped_column(JSON)
    overall_status: Mapped[str] = mapped_column(String, default="mixed")
    schema_version: Mapped[int] = mapped_column(Integer, default=1)
    processing_status: Mapped[str] = mapped_column(String, default="complete")
    product_name: Mapped[str | None] = mapped_column(String, nullable=True)
    quality_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    extracted_fields: Mapped[dict] = mapped_column(JSON, default=dict)
    analysis_version: Mapped[str] = mapped_column(String, default="legacy")
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failure_stage: Mapped[str | None] = mapped_column(String, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String, nullable=True)
    processing_error_code: Mapped[str | None] = mapped_column(String, nullable=True)
    verdicts: Mapped[list[VerdictRow]] = relationship(
        back_populates="scan", cascade="all, delete-orphan"
    )


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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    reasoning: Mapped[str] = mapped_column(Text, default="Legacy verdict")
    measurement_method: Mapped[str] = mapped_column(String, default="not_measurable")
    review_state: Mapped[str] = mapped_column(String, default="unreviewed")
    scan: Mapped[Scan] = relationship(back_populates="verdicts")


_engine = None
SessionLocal: sessionmaker[Session] | None = None


def init_db(db_path: str | Path = "lmpc.db") -> None:
    """Upgrade SQLite and initialize the session factory."""
    global _engine, SessionLocal
    path = Path(db_path)
    from app.migrations import upgrade_database

    if _engine is not None:
        _engine.dispose()
    _engine = None
    SessionLocal = None
    upgrade_database(path)
    _engine = create_sqlite_engine(path, echo=False, future=True)
    SessionLocal = sessionmaker(
        bind=_engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )


def get_session() -> Iterator[Session]:
    """Yield a database session and always close it after the request."""
    if SessionLocal is None:
        raise RuntimeError("DB not initialized; call init_db() first")
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
