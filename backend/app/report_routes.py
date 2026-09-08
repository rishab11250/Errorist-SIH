"""PDF report download route."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth.dependencies import authorized_scan, require_user
from app.db import User, get_session
from app.reports import build_report

router = APIRouter(prefix="/api", tags=["reports"])


@router.get("/report/{scan_id}")
def download_report(
    scan_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> Response:
    scan = authorized_scan(session, current_user, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="scan_not_found")
    return Response(
        content=build_report(scan),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="lmpc-scan-{scan_id}.pdf"'},
    )
