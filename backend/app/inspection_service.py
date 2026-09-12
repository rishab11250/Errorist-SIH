"""Inspection domain services and lifecycle management."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Inspection, User
from app.errors import AppError
from app.models import InspectionCreateIn
from app.product_history import calculate_inspection_summary


def create_inspection(session: Session, user_id: int, req: InspectionCreateIn) -> Inspection:
    """Create a new open inspection event."""
    inspection = Inspection(
        owner_id=user_id,
        company_name=req.company_name.strip() if req.company_name else None,
        location=req.location.strip() if req.location else None,
        notes=req.notes.strip() if req.notes else None,
        status="open",
        started_at=datetime.now(UTC),
    )
    session.add(inspection)
    session.commit()
    session.refresh(inspection)
    return inspection


def get_inspection_or_404(session: Session, inspection_id: int, user: User) -> Inspection:
    """Fetch an inspection ensuring ownership or admin role."""
    inspection = session.get(Inspection, inspection_id)
    if inspection is None:
        raise AppError(404, "INSPECTION_NOT_FOUND", f"Inspection #{inspection_id} not found.")
    if user.role != "admin" and inspection.owner_id != user.id:
        raise AppError(403, "FORBIDDEN", "You do not have permission to view this inspection.")
    return inspection


def complete_inspection(session: Session, inspection_id: int, user: User) -> Inspection:
    """Complete an open inspection per PRD Section 20."""
    inspection = get_inspection_or_404(session, inspection_id, user)
    if inspection.status == "completed":
        raise AppError(400, "INVALID_INSPECTION_STATE", "Inspection is already completed.")
    if inspection.status == "cancelled":
        raise AppError(400, "INVALID_INSPECTION_STATE", "Cannot complete a cancelled inspection.")

    inspection.status = "completed"
    inspection.completed_at = datetime.now(UTC)
    session.commit()
    session.refresh(inspection)
    return inspection


def validate_inspection_for_scan(session: Session, inspection_id: int | None, user: User) -> Inspection | None:
    """Ensure inspection is open and can accept new scans per PRD Section 17 & 20."""
    if inspection_id is None:
        return None
    inspection = session.get(Inspection, inspection_id)
    if inspection is None:
        raise AppError(404, "INSPECTION_NOT_FOUND", f"Inspection #{inspection_id} not found.")
    if user.role != "admin" and inspection.owner_id != user.id:
        raise AppError(403, "FORBIDDEN", "You cannot attach scans to an inspection you do not own.")
    if inspection.status != "open":
        raise AppError(
            400,
            "INVALID_INSPECTION_STATE",
            f"Cannot add a scan to a {inspection.status} inspection.",
        )
    return inspection


def list_inspections(
    session: Session,
    user: User,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    """List inspections with authoritative summaries."""
    query = select(Inspection)
    if user.role != "admin":
        query = query.where(Inspection.owner_id == user.id)

    total = len(session.scalars(query).all())
    inspections = session.scalars(
        query.order_by(Inspection.started_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    items = []
    for insp in inspections:
        summary = calculate_inspection_summary(session, insp.id)
        items.append({
            "id": insp.id,
            "owner_id": insp.owner_id,
            "company_name": insp.company_name,
            "location": insp.location,
            "status": insp.status,
            "started_at": insp.started_at,
            "completed_at": insp.completed_at,
            "notes": insp.notes,
            "summary": summary,
        })

    return items, total
