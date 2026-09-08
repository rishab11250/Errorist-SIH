"""Authorized append-only review actions."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.auth.dependencies import authorized_scan, require_user
from app.db import ReviewAction, User, VerdictRow, get_session
from app.errors import AppError

router = APIRouter(prefix="/api/scan", tags=["reviews"])
ReviewActionName = Literal["confirmed", "false_positive", "resolved", "needs_follow_up"]


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: ReviewActionName
    note: str = Field(default="", max_length=2000)
    verdict_id: int | None = Field(default=None, gt=0)


class ReviewOut(BaseModel):
    id: int
    scan_id: int
    verdict_id: int | None
    action: ReviewActionName
    note: str
    actor_user_id: int
    actor_display_name: str
    created_at: datetime


@router.post("/{scan_id}/reviews", response_model=ReviewOut, status_code=201)
def create_review(
    scan_id: int,
    body: ReviewCreate,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> ReviewOut:
    scan = authorized_scan(session, current_user, scan_id)
    if scan is None:
        raise AppError(404, "scan_not_found", "Scan not found.")
    note = body.note.strip()
    if body.action in {"false_positive", "needs_follow_up"} and not note:
        raise AppError(422, "review_note_required", "This review action requires a note.")

    verdict = None
    if body.verdict_id is not None:
        verdict = session.get(VerdictRow, body.verdict_id)
        if verdict is None or verdict.scan_id != scan.id:
            raise AppError(422, "invalid_verdict", "Verdict does not belong to this scan.")

    now = datetime.now(UTC)
    action = ReviewAction(
        scan_id=scan.id,
        verdict_id=body.verdict_id,
        actor_user_id=current_user.id,
        action=body.action,
        note=note,
        created_at=now,
    )
    session.add(action)
    if verdict is not None:
        verdict.review_state = body.action
    session.commit()
    session.refresh(action)
    return ReviewOut(
        id=action.id,
        scan_id=action.scan_id,
        verdict_id=action.verdict_id,
        action=action.action,
        note=action.note,
        actor_user_id=current_user.id,
        actor_display_name=current_user.display_name,
        created_at=now,
    )
