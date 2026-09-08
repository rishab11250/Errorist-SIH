"""Immutable data model shared by every report renderer."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from app.auth.dependencies import authorized_scan_query
from app.db import ReviewAction, Scan, User


@dataclass(frozen=True, slots=True)
class ReportVerdict:
    id: int
    rule_id: str
    citation: str
    status: str
    severity: str
    evidence: str
    evidence_bboxes: tuple[tuple[float, float, float, float], ...]
    failure_message: str
    rule_version: str
    confidence: float
    reasoning: str
    measurement_method: str
    review_state: str


@dataclass(frozen=True, slots=True)
class ReportReview:
    id: int
    verdict_id: int | None
    actor_display_name: str
    action: str
    note: str
    created_at: datetime


@dataclass(frozen=True, slots=True)
class InspectionReport:
    scan_id: int
    product_name: str
    owner_display_name: str
    created_at: datetime
    updated_at: datetime | None
    mode: str
    category: str
    overall_status: str
    processing_status: str
    schema_version: int
    analysis_version: str
    quality_summary: str
    image_meta: str
    source_image_b64: str
    verdicts: tuple[ReportVerdict, ...]
    reviews: tuple[ReportReview, ...]
    rules_versions: tuple[str, ...]


def _json_text(value: object) -> str:
    return json.dumps(value or {}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def build_report_model(scan: Scan) -> InspectionReport:
    """Detach a fully loaded ORM scan into an immutable renderer input."""
    verdicts = tuple(
        ReportVerdict(
            id=verdict.id,
            rule_id=verdict.rule_id,
            citation=verdict.citation,
            status=verdict.status,
            severity=verdict.severity,
            evidence=verdict.evidence or "",
            evidence_bboxes=tuple(tuple(box) for box in (verdict.evidence_bboxes or [])),
            failure_message=verdict.failure_message or "",
            rule_version=verdict.rule_version,
            confidence=verdict.confidence,
            reasoning=verdict.reasoning,
            measurement_method=verdict.measurement_method,
            review_state=verdict.review_state,
        )
        for verdict in sorted(scan.verdicts, key=lambda item: (item.rule_id, item.id))
    )
    reviews = tuple(
        ReportReview(
            id=review.id,
            verdict_id=review.verdict_id,
            actor_display_name=review.actor.display_name,
            action=review.action,
            note=review.note,
            created_at=review.created_at,
        )
        for review in sorted(scan.review_actions, key=lambda item: (item.created_at, item.id))
    )
    return InspectionReport(
        scan_id=scan.id,
        product_name=scan.product_name or "Unidentified product",
        owner_display_name=scan.owner.display_name if scan.owner else "Unassigned legacy scan",
        created_at=scan.created_at,
        updated_at=scan.updated_at,
        mode=scan.mode,
        category=scan.category,
        overall_status=scan.overall_status,
        processing_status=scan.processing_status,
        schema_version=scan.schema_version,
        analysis_version=scan.analysis_version,
        quality_summary=_json_text(scan.quality_summary),
        image_meta=_json_text(scan.image_meta),
        source_image_b64=scan.image_b64,
        verdicts=verdicts,
        reviews=reviews,
        rules_versions=tuple(sorted({verdict.rule_version for verdict in verdicts})),
    )


def report_eager_options():
    """Return the relationship graph required before detaching a report."""
    return (
        joinedload(Scan.owner),
        joinedload(Scan.verdicts),
        joinedload(Scan.review_actions).joinedload(ReviewAction.actor),
    )


def load_report_model(
    session: Session,
    user: User,
    scan_id: int,
) -> InspectionReport | None:
    """Load an authorized scan and all report relations in one eager query."""
    query = (
        authorized_scan_query(user)
        .where(Scan.id == scan_id)
        .options(*report_eager_options())
    )
    scan = session.execute(query).unique().scalar_one_or_none()
    return build_report_model(scan) if scan is not None else None
