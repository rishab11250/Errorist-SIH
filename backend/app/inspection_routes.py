"""Inspection API routes for creating, retrieving, and completing inspections."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.dependencies import require_user
from app.db import User, get_session
from app.inspection_service import (
    complete_inspection,
    create_inspection,
    get_inspection_or_404,
    list_inspections,
)
from app.models import InspectionCreateIn, InspectionOut
from app.product_history import calculate_inspection_summary

router = APIRouter(prefix="/api/inspections", tags=["inspections"])


@router.post("", response_model=InspectionOut, status_code=201)
def handle_create_inspection(
    req: InspectionCreateIn,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> InspectionOut:
    """Create a new inspection event per PRD Section 18."""
    inspection = create_inspection(session, current_user.id, req)
    summary = calculate_inspection_summary(session, inspection.id)
    return InspectionOut(
        id=inspection.id,
        owner_id=inspection.owner_id,
        company_name=inspection.company_name,
        location=inspection.location,
        status=inspection.status,
        started_at=inspection.started_at,
        completed_at=inspection.completed_at,
        notes=inspection.notes,
        summary=summary,
    )


@router.get("", response_model=dict)
def handle_list_inspections(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    """List accessible inspections with summary metrics."""
    items, total = list_inspections(session, current_user, page=page, page_size=page_size)
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.get("/{inspection_id}", response_model=InspectionOut)
def handle_get_inspection(
    inspection_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> InspectionOut:
    """Retrieve inspection details and authoritative summary per PRD Section 19."""
    inspection = get_inspection_or_404(session, inspection_id, current_user)
    summary = calculate_inspection_summary(session, inspection.id)
    return InspectionOut(
        id=inspection.id,
        owner_id=inspection.owner_id,
        company_name=inspection.company_name,
        location=inspection.location,
        status=inspection.status,
        started_at=inspection.started_at,
        completed_at=inspection.completed_at,
        notes=inspection.notes,
        summary=summary,
    )


@router.post("/{inspection_id}/complete", response_model=InspectionOut)
def handle_complete_inspection(
    inspection_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> InspectionOut:
    """Complete an inspection and close it to future scans per PRD Section 20."""
    inspection = complete_inspection(session, inspection_id, current_user)
    summary = calculate_inspection_summary(session, inspection.id)
    return InspectionOut(
        id=inspection.id,
        owner_id=inspection.owner_id,
        company_name=inspection.company_name,
        location=inspection.location,
        status=inspection.status,
        started_at=inspection.started_at,
        completed_at=inspection.completed_at,
        notes=inspection.notes,
        summary=summary,
    )
