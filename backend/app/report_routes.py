"""PDF report download route."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.auth.dependencies import require_user
from app.db import User, get_session
from app.exports.pdf import render_pdf
from app.exports.view_model import load_report_model

router = APIRouter(prefix="/api", tags=["reports"])


@router.get("/report/{scan_id}")
def download_report(
    scan_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> Response:
    report = load_report_model(session, current_user, scan_id)
    if report is None:
        raise HTTPException(status_code=404, detail="scan_not_found")
    return Response(
        content=render_pdf(report),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="lmpc-scan-{scan_id}.pdf"'},
    )
