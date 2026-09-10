"""Authorized, filter-aware queries for inspection scans."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import Select, String, cast, exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.auth.dependencies import authorized_scan_query
from app.db import Scan, User, VerdictRow
from app.errors import AppError

ScanMode = Literal["retail_image", "ecommerce_listing"]
ScanCategory = Literal["food", "non_food", "cosmetics", "seeds", "unknown"]
OverallStatus = Literal["pass", "fail", "mixed", "manual_review"]
VerdictStatus = Literal["pass", "fail", "warn", "manual_review", "na"]
ScanSort = Literal["created_desc", "created_asc"]

_OVERALL_STATUSES = ("pass", "fail", "mixed", "manual_review")
_VERDICT_STATUSES = ("pass", "fail", "warn", "manual_review", "na")


class ScanFilters(BaseModel):
    """Validated filters shared by history, dashboard, and CSV export."""

    model_config = ConfigDict(extra="forbid")

    q: str | None = Field(default=None, max_length=200)
    mode: ScanMode | None = None
    category: ScanCategory | None = None
    overall_status: OverallStatus | None = None
    rule_id: str | None = Field(default=None, max_length=80)
    verdict_status: VerdictStatus | None = None
    owner_id: int | None = Field(default=None, gt=0)
    created_from: datetime | None = None
    created_to: datetime | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort: ScanSort = "created_desc"

    @field_validator("q", "rule_id")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("created_from", "created_to")
    @classmethod
    def normalize_datetime(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value
        return value.astimezone(UTC).replace(tzinfo=None)

    @model_validator(mode="after")
    def validate_date_range(self) -> ScanFilters:
        if self.created_from and self.created_to and self.created_from > self.created_to:
            raise ValueError("created_from must be before or equal to created_to")
        return self


def _escaped_like(value: str) -> str:
    escaped = value.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def filtered_authorized_scan_query(
    user: User,
    filters: ScanFilters,
) -> Select[tuple[Scan]]:
    """Build the complete authorized scan scope without pagination."""
    if filters.owner_id is not None and user.role != "admin":
        raise AppError(403, "forbidden", "Only administrators can filter by owner.")

    query = authorized_scan_query(user)
    if filters.owner_id is not None:
        query = query.where(Scan.owner_user_id == filters.owner_id)
    if filters.mode is not None:
        query = query.where(Scan.mode == filters.mode)
    if filters.category is not None:
        query = query.where(Scan.category == filters.category)
    if filters.overall_status is not None:
        query = query.where(Scan.overall_status == filters.overall_status)
    if filters.created_from is not None:
        query = query.where(Scan.created_at >= filters.created_from)
    if filters.created_to is not None:
        query = query.where(Scan.created_at <= filters.created_to)
    if filters.rule_id is not None:
        query = query.where(
            exists().where(
                VerdictRow.scan_id == Scan.id,
                VerdictRow.rule_id == filters.rule_id,
            )
        )
    if filters.verdict_status is not None:
        query = query.where(
            exists().where(
                VerdictRow.scan_id == Scan.id,
                VerdictRow.status == filters.verdict_status,
            )
        )
    if filters.q is not None:
        pattern = _escaped_like(filters.q)
        matching_verdict = exists().where(
            VerdictRow.scan_id == Scan.id,
            or_(
                func.lower(VerdictRow.rule_id).like(pattern, escape="\\"),
                func.lower(VerdictRow.evidence).like(pattern, escape="\\"),
            ),
        )
        query = query.where(
            or_(
                func.lower(func.coalesce(Scan.product_name, "")).like(pattern, escape="\\"),
                func.lower(cast(Scan.ocr_payload, String)).like(pattern, escape="\\"),
                matching_verdict,
            )
        )
    return query


def _ordered_query(query: Select[tuple[Scan]], sort: ScanSort) -> Select[tuple[Scan]]:
    if sort == "created_asc":
        return query.order_by(Scan.created_at.asc(), Scan.id.asc())
    return query.order_by(Scan.created_at.desc(), Scan.id.desc())


def _history_item(scan: Scan) -> dict:
    summary = {
        status: sum(verdict.status == status for verdict in scan.verdicts)
        for status in _VERDICT_STATUSES
    }
    rule_versions = sorted({verdict.rule_version for verdict in scan.verdicts})
    return {
        "scan_id": scan.id,
        "local_id": scan.client_local_id,
        "thumbnail_b64": scan.image_b64,
        "thumbnail": scan.image_b64,
        "overall_status": scan.overall_status,
        "verdict_count": len(scan.verdicts),
        "product": scan.product_name,
        "mode": scan.mode,
        "category": scan.category,
        "owner_user_id": scan.owner_user_id,
        "verdict_summary": summary,
        "rule_version": rule_versions[0] if len(rule_versions) == 1 else None,
        "rule_versions": rule_versions,
        "created_at": scan.created_at.isoformat(),
    }


def list_authorized_scans(session: Session, user: User, filters: ScanFilters) -> dict:
    """Return one stable page from an authorized, filtered scan scope."""
    query = filtered_authorized_scan_query(user, filters)
    total = session.scalar(select(func.count()).select_from(query.subquery())) or 0
    scans = (
        session.execute(
            _ordered_query(query, filters.sort)
            .options(selectinload(Scan.verdicts))
            .offset((filters.page - 1) * filters.page_size)
            .limit(filters.page_size)
        )
        .scalars()
        .all()
    )
    return {
        "items": [_history_item(scan) for scan in scans],
        "page": filters.page,
        "page_size": filters.page_size,
        "total": total,
    }


def dashboard_for_filters(session: Session, user: User, filters: ScanFilters) -> dict:
    """Aggregate dashboard metrics from the same scope used by history."""
    query = filtered_authorized_scan_query(user, filters)
    scope = query.subquery()
    total = session.scalar(select(func.count()).select_from(scope)) or 0

    status_counts = dict.fromkeys(_OVERALL_STATUSES, 0)
    for status, count in session.execute(
        select(scope.c.overall_status, func.count(scope.c.id))
        .group_by(scope.c.overall_status)
        .order_by(scope.c.overall_status)
    ):
        if status in status_counts:
            status_counts[status] = count

    failed_rows = session.execute(
        select(VerdictRow.rule_id, func.count(VerdictRow.id).label("count"))
        .join(scope, VerdictRow.scan_id == scope.c.id)
        .where(VerdictRow.status == "fail")
        .group_by(VerdictRow.rule_id)
        .order_by(func.count(VerdictRow.id).desc(), VerdictRow.rule_id.asc())
        .limit(5)
    ).all()
    top_failed_rules = [{"rule_id": rule_id, "count": count} for rule_id, count in failed_rows]

    daily_trend = [
        {"date": day, "total": count}
        for day, count in session.execute(
            select(func.date(scope.c.created_at), func.count(scope.c.id))
            .group_by(func.date(scope.c.created_at))
            .order_by(func.date(scope.c.created_at).asc())
        )
    ]
    recent = (
        session.execute(
            _ordered_query(query, "created_desc").options(selectinload(Scan.verdicts)).limit(5)
        )
        .scalars()
        .all()
    )

    return {
        "total_scans": total,
        "status_counts": status_counts,
        "pass_rate": status_counts["pass"] / total if total else 0.0,
        "top_failed_rule": top_failed_rules[0]["rule_id"] if top_failed_rules else None,
        "top_failed_rules": top_failed_rules,
        "daily_trend": daily_trend,
        "recent_activity": [_history_item(scan) for scan in recent],
    }
