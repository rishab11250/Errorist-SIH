"""History and dashboard API routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import require_user
from app.db import User, get_session
from app.repositories.scans import ScanFilters, dashboard_for_filters, list_authorized_scans

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/history")
def list_history(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
    filters: Annotated[ScanFilters, Depends()],
) -> dict:
    """Return recent scans, most-recent first."""
    return list_authorized_scans(session, current_user, filters)


@router.get("/dashboard")
def dashboard_summary(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
    filters: Annotated[ScanFilters, Depends()],
) -> dict:
    """Return aggregate scan statistics and recent activity."""
    return dashboard_for_filters(session, current_user, filters)
