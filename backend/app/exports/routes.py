"""Authenticated PDF, DOCX, and filtered CSV export routes."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth.dependencies import require_user
from app.db import Scan, User, get_session
from app.exports.csv import render_csv
from app.exports.docx import render_docx
from app.exports.pdf import render_pdf
from app.exports.view_model import build_report_model, load_report_model, report_eager_options
from app.repositories.scans import ScanFilters, filtered_authorized_scan_query

router = APIRouter(prefix="/api/exports", tags=["exports"])

_DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_ACTIVE_FILTER_FIELDS = (
    "q",
    "mode",
    "category",
    "overall_status",
    "rule_id",
    "verdict_status",
    "owner_id",
    "created_from",
    "created_to",
)


def _single_report(session: Session, user: User, scan_id: int):
    report = load_report_model(session, user, scan_id)
    if report is None:
        raise HTTPException(status_code=404, detail="scan_not_found")
    return report


@router.get("/scans/{scan_id}.pdf")
def export_scan_pdf(
    scan_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> Response:
    report = _single_report(session, current_user, scan_id)
    return Response(
        content=render_pdf(report),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="lmpc-scan-{scan_id}.pdf"'},
    )


@router.get("/scans/{scan_id}.docx")
def export_scan_docx(
    scan_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> Response:
    report = _single_report(session, current_user, scan_id)
    return Response(
        content=render_docx(report),
        media_type=_DOCX_TYPE,
        headers={"Content-Disposition": f'attachment; filename="lmpc-scan-{scan_id}.docx"'},
    )


def _active_filter_payload(filters: ScanFilters) -> dict:
    values = filters.model_dump(include=set(_ACTIVE_FILTER_FIELDS), exclude_none=True)
    return {
        key: value.isoformat() if isinstance(value, datetime) else value
        for key, value in values.items()
    }


@router.get("/scans.csv")
def export_scans_csv(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
    filters: Annotated[ScanFilters, Query()],
) -> Response:
    query = filtered_authorized_scan_query(current_user, filters).options(*report_eager_options())
    if filters.sort == "created_asc":
        query = query.order_by(Scan.created_at.asc(), Scan.id.asc())
    else:
        query = query.order_by(Scan.created_at.desc(), Scan.id.desc())
    query = query.limit(5000)
    scans = session.execute(query).unique().scalars().all()
    reports = tuple(build_report_model(scan) for scan in scans)
    active_json = json.dumps(
        _active_filter_payload(filters),
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    digest = hashlib.sha256(active_json).hexdigest()
    utc_date = datetime.now(UTC).date().isoformat()
    return Response(
        content=render_csv(reports),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="lmpc-scans-{utc_date}.csv"',
            "X-LMPC-Filter-Digest": digest,
            "X-LMPC-Result-Count": str(len(reports)),
        },
    )
