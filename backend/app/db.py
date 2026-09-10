"""SQLAlchemy models and session factory for the SQLite scan store."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
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


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('inspector', 'admin')", name="ck_users_role"),
        Index("ix_users_username_normalized", "username_normalized", unique=True),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username_normalized: Mapped[str] = mapped_column(String(80))
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sessions: Mapped[list[SessionRow]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    scans: Mapped[list[Scan]] = relationship(back_populates="owner")
    review_actions: Mapped[list[ReviewAction]] = relationship(back_populates="actor")


class SessionRow(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_sessions_token_hash", "token_hash", unique=True),
        Index("ix_sessions_expires_at", "expires_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    user: Mapped[User] = relationship(back_populates="sessions")


class Scan(Base):
    __tablename__ = "scans"
    __table_args__ = (
        Index("ix_scans_owner_created_at", "owner_user_id", "created_at"),
        Index(
            "ix_scans_owner_client_local_id",
            "owner_user_id",
            "client_local_id",
            unique=True,
        ),
    )

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
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    client_local_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    owner: Mapped[User | None] = relationship(back_populates="scans")
    verdicts: Mapped[list[VerdictRow]] = relationship(
        back_populates="scan", cascade="all, delete-orphan"
    )
    review_actions: Mapped[list[ReviewAction]] = relationship(back_populates="scan")


class VerdictRow(Base):
    __tablename__ = "verdicts"
    __table_args__ = (Index("ix_verdicts_rule_status", "rule_id", "status"),)

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
    review_actions: Mapped[list[ReviewAction]] = relationship(back_populates="verdict")


class ReviewAction(Base):
    __tablename__ = "review_actions"
    __table_args__ = (
        CheckConstraint(
            "action IN ('confirmed', 'false_positive', 'resolved', 'needs_follow_up')",
            name="ck_review_actions_action",
        ),
        Index("ix_review_actions_scan_created_at", "scan_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"))
    verdict_id: Mapped[int | None] = mapped_column(ForeignKey("verdicts.id"), nullable=True)
    actor_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(30))
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    scan: Mapped[Scan] = relationship(back_populates="review_actions")
    verdict: Mapped[VerdictRow | None] = relationship(back_populates="review_actions")
    actor: Mapped[User] = relationship(back_populates="review_actions")


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
