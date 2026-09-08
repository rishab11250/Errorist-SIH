"""Scan creation and retrieval API routes."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.analysis_pipeline import PipelineError, analyze_scan
from app.auth.dependencies import authorized_scan, require_user
from app.db import Scan, User, VerdictRow, get_session
from app.domain import AnalysisResult, ExtractedField, QualitySummary, Verdict
from app.errors import AppError
from app.models import ScanAnalysisResponse, ScanRequest
from app.rules_loader import get_active_rules

router = APIRouter(prefix="/api", tags=["scan"])


def _quality_dict(quality: QualitySummary) -> dict:
    return {
        "status": quality.status,
        "score": quality.score,
        "metrics": [
            {
                "name": metric.name,
                "value": metric.value,
                "unit": metric.unit,
                "confidence": metric.confidence,
                "method": metric.method,
                "evidence_bboxes": [list(box) for box in metric.evidence_bboxes],
            }
            for metric in quality.metrics
        ],
        "guidance": list(quality.guidance),
    }


def _extracted_dict(field: ExtractedField | None) -> dict | None:
    if field is None:
        return None
    return {
        "name": field.name,
        "value": field.value,
        "bbox": list(field.bbox) if field.bbox is not None else None,
        "confidence": field.confidence,
        "evidence_bboxes": [list(box) for box in field.evidence_spans],
    }


def _verdict_dict(verdict: Verdict) -> dict:
    return {
        "rule_id": verdict.rule_id,
        "status": verdict.status,
        "severity": verdict.severity,
        "citation": verdict.citation,
        "evidence": verdict.evidence,
        "evidence_bboxes": [list(box) for box in verdict.evidence_bboxes],
        "confidence": verdict.confidence,
        "reasoning": verdict.reasoning,
        "measurement_method": verdict.measurement_method,
        "failure_message": verdict.failure_message,
        "rule_version": verdict.rule_version,
    }


def _verdict_row(verdict: Verdict) -> VerdictRow:
    return VerdictRow(
        rule_id=verdict.rule_id,
        status=verdict.status,
        severity=verdict.severity,
        citation=verdict.citation,
        evidence=verdict.evidence,
        evidence_bboxes=[list(box) for box in verdict.evidence_bboxes],
        confidence=verdict.confidence,
        reasoning=verdict.reasoning,
        measurement_method=verdict.measurement_method,
        failure_message=verdict.failure_message,
        rule_version=verdict.rule_version,
    )


def _mark_failed(
    session: Session,
    scan_id: int,
    *,
    stage: str,
    error_code: str,
) -> None:
    session.rollback()
    scan = session.get(Scan, scan_id)
    if scan is None:
        return
    scan.processing_status = "failed"
    scan.failure_stage = stage
    scan.processing_error_code = error_code
    scan.analysis_version = "inspection-v2"
    scan.updated_at = datetime.now(UTC)
    scan.verdicts.clear()
    session.commit()


def _store_complete(scan: Scan, result: AnalysisResult) -> None:
    extracted = {name: _extracted_dict(field) for name, field in result.extracted.items()}
    scan.processing_status = "complete"
    scan.quality_summary = _quality_dict(result.quality)
    scan.extracted_fields = extracted
    scan.analysis_version = result.analysis_version
    scan.overall_status = result.overall_status
    scan.product_name = (
        result.extracted.get("common_name").value
        if result.extracted.get("common_name") is not None
        else None
    )
    scan.updated_at = datetime.now(UTC)
    scan.failure_stage = None
    scan.processing_error_code = None
    scan.verdicts = [_verdict_row(verdict) for verdict in result.verdicts]


@router.post("/scan", response_model=ScanAnalysisResponse, status_code=201)
def create_scan(
    req: ScanRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> ScanAnalysisResponse:
    rules = get_active_rules()
    request_id = request.state.request_id
    scan = Scan(
        mode=req.scan_context.mode,
        category=req.scan_context.category,
        image_b64=req.image_b64,
        image_meta=req.image_meta.model_dump(mode="json"),
        ocr_payload=[word.model_dump(mode="json") for word in req.ocr_payload],
        overall_status="manual_review",
        schema_version=req.schema_version,
        processing_status="processing",
        analysis_version="inspection-v2",
        request_id=request_id,
        quality_summary={},
        extracted_fields={},
        owner_user_id=current_user.id,
    )
    session.add(scan)
    session.commit()
    session.refresh(scan)

    try:
        result = analyze_scan(req, rules)
        _store_complete(scan, result)
        session.commit()
        session.refresh(scan)
    except PipelineError as exc:
        _mark_failed(
            session,
            scan.id,
            stage=exc.stage,
            error_code=exc.error,
        )
        raise
    except AppError as exc:
        _mark_failed(session, scan.id, stage="analysis", error_code=exc.error)
        raise
    except Exception:
        _mark_failed(session, scan.id, stage="analysis", error_code="internal_error")
        raise

    return ScanAnalysisResponse(
        scan_id=scan.id,
        processing_status="complete",
        quality=_quality_dict(result.quality),
        extracted_fields={name: _extracted_dict(field) for name, field in result.extracted.items()},
        verdicts=[_verdict_dict(verdict) for verdict in result.verdicts],
        overall_status=result.overall_status,
        analysis_version=result.analysis_version,
    )


@router.get("/scan/{scan_id}")
def get_scan(
    scan_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> dict:
    scan = authorized_scan(session, current_user, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="scan_not_found")
    return {
        "scan": {
            "id": scan.id,
            "created_at": scan.created_at.isoformat(),
            "updated_at": scan.updated_at.isoformat() if scan.updated_at else None,
            "mode": scan.mode,
            "category": scan.category,
            "overall_status": scan.overall_status,
            "image_b64": scan.image_b64,
            "image_meta": scan.image_meta,
            "schema_version": scan.schema_version,
            "processing_status": scan.processing_status,
            "product_name": scan.product_name,
            "quality_summary": scan.quality_summary,
            "extracted_fields": scan.extracted_fields,
            "analysis_version": scan.analysis_version,
            "failure_stage": scan.failure_stage,
            "request_id": scan.request_id,
            "processing_error_code": scan.processing_error_code,
        },
        "verdicts": [
            {
                "rule_id": verdict.rule_id,
                "status": verdict.status,
                "severity": verdict.severity,
                "citation": verdict.citation,
                "evidence": verdict.evidence,
                "evidence_bboxes": verdict.evidence_bboxes,
                "confidence": verdict.confidence,
                "reasoning": verdict.reasoning,
                "measurement_method": verdict.measurement_method,
                "failure_message": verdict.failure_message,
                "rule_version": verdict.rule_version,
                "review_state": verdict.review_state,
            }
            for verdict in scan.verdicts
        ],
        "review_actions": [
            {
                "id": action.id,
                "verdict_id": action.verdict_id,
                "action": action.action,
                "note": action.note,
                "actor_user_id": action.actor_user_id,
                "actor_display_name": action.actor.display_name,
                "created_at": action.created_at.isoformat(),
            }
            for action in sorted(scan.review_actions, key=lambda item: (item.created_at, item.id))
        ],
    }
