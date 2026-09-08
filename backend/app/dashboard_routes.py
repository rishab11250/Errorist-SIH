"""History and dashboard API routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.dependencies import authorized_scan_query, require_user
from app.db import Scan, User, VerdictRow, get_session

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/history")
def list_history(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
    limit: int = Query(default=20, ge=1, le=100),
) -> list[dict]:
    """Return recent scans, most-recent first."""
    scans = (
        session.execute(
            authorized_scan_query(current_user)
            .order_by(Scan.created_at.desc(), Scan.id.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return [
        {
            "scan_id": scan.id,
            "thumbnail_b64": scan.image_b64[:200] + "..."
            if len(scan.image_b64) > 200
            else scan.image_b64,
            "thumbnail": scan.image_b64[:200] + "..."
            if len(scan.image_b64) > 200
            else scan.image_b64,
            "overall_status": scan.overall_status,
            "verdict_count": len(scan.verdicts),
            "product": None,
            "verdict_summary": {
                "pass": sum(verdict.status == "pass" for verdict in scan.verdicts),
                "fail": sum(verdict.status == "fail" for verdict in scan.verdicts),
                "warn": sum(verdict.status == "warn" for verdict in scan.verdicts),
                "na": sum(verdict.status == "na" for verdict in scan.verdicts),
            },
            "created_at": scan.created_at.isoformat(),
        }
        for scan in scans
    ]


@router.get("/dashboard")
def dashboard_summary(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> dict:
    """Return aggregate scan statistics and recent activity."""
    scope = authorized_scan_query(current_user).subquery()
    total = session.execute(select(func.count(scope.c.id))).scalar_one()
    if total == 0:
        return {"total_scans": 0, "pass_rate": 0.0, "top_failed_rule": None, "recent_activity": []}
    pass_count = session.execute(
        select(func.count(scope.c.id)).where(scope.c.overall_status == "pass")
    ).scalar_one()
    top_failed_row = session.execute(
        select(VerdictRow.rule_id, func.count(VerdictRow.id).label("count"))
        .join(scope, VerdictRow.scan_id == scope.c.id)
        .where(VerdictRow.status == "fail")
        .group_by(VerdictRow.rule_id)
        .order_by(func.count(VerdictRow.id).desc(), VerdictRow.rule_id)
        .limit(1)
    ).first()
    recent = (
        session.execute(
            authorized_scan_query(current_user)
            .order_by(Scan.created_at.desc(), Scan.id.desc())
            .limit(5)
        )
        .scalars()
        .all()
    )
    return {
        "total_scans": total,
        "pass_rate": pass_count / total,
        "top_failed_rule": top_failed_row[0] if top_failed_row else None,
        "recent_activity": [
            {
                "scan_id": scan.id,
                "overall_status": scan.overall_status,
                "created_at": scan.created_at.isoformat(),
            }
            for scan in recent
        ],
    }
