"""Scan creation and retrieval API routes."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.analysis_pipeline import PipelineError, analyze_scan
from app.auth.dependencies import authorized_scan, get_auth_settings, require_user
from app.db import Scan, User, VerdictRow, get_session
from app.domain import AnalysisResult, ExtractedField, QualitySummary, Verdict
from app.errors import AppError
from app.inspection_service import validate_inspection_for_scan
from app.models import (
    OfflineScanSyncRequest,
    OfflineScanSyncResponse,
    ScanAnalysisResponse,
    ScanRequest,
)
from app.product_history import get_scan_historical_context
from app.product_identity import (
    clean_manufacturer_name,
    parse_net_quantity,
    resolve_product_identity,
)
from app.product_routes import _product_summary_dict, build_stored_scan_response
from app.rules_loader import get_active_rules
from app.settings import AuthSettings
from app.visual_analysis.image_io import ImageDecodeError, decode_image

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


def _snapshot_overall_status(req: OfflineScanSyncRequest) -> str:
    statuses = {verdict.status for verdict in req.verdicts}
    if "fail" in statuses:
        return "fail"
    if "manual_review" in statuses:
        return "manual_review"
    if "warn" in statuses:
        return "mixed"
    return "pass"


def _decode_sync_image(image_b64: str, settings: AuthSettings):
    try:
        return decode_image(
            image_b64,
            max_bytes=settings.max_upload_bytes,
            max_pixels=settings.max_image_pixels,
        )
    except ImageDecodeError as exc:
        status, error, detail = {
            "invalid_image": (400, "invalid_image", "The supplied file is not a supported image."),
            "image_too_large": (
                413,
                "image_too_large",
                "The image exceeds the allowed byte or pixel limit.",
            ),
            "image_decode_failed": (
                422,
                "image_decode_failed",
                "The image payload could not be decoded.",
            ),
        }.get(
            exc.code,
            (422, "image_decode_failed", "The image payload could not be decoded."),
        )
        raise AppError(status, error, detail) from exc


def _sync_verdict_row(verdict, captured_at: datetime, rule_version: str) -> VerdictRow:
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
        rule_version=rule_version,
        created_at=captured_at,
    )


def _find_synced_scan(session: Session, owner_user_id: int, local_id: str) -> Scan | None:
    return session.scalar(
        select(Scan).where(
            Scan.owner_user_id == owner_user_id,
            Scan.client_local_id == local_id,
        )
    )


def _stored_rule_version(session: Session, scan: Scan) -> str:
    session.refresh(scan, attribute_names=["verdicts"])
    versions = {verdict.rule_version for verdict in scan.verdicts}
    if len(versions) != 1:
        raise AppError(
            409,
            "sync_conflict",
            "The local scan identifier already refers to an incompatible snapshot.",
        )
    return versions.pop()


def _submitted_verdicts(req: OfflineScanSyncRequest) -> list[dict]:
    return sorted(
        [verdict.model_dump(mode="json") for verdict in req.verdicts],
        key=lambda verdict: verdict["rule_id"],
    )


def _stored_verdicts(scan: Scan) -> list[dict]:
    return sorted(
        [
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
            }
            for verdict in scan.verdicts
        ],
        key=lambda verdict: verdict["rule_id"],
    )


def _existing_sync_response(
    session: Session,
    scan: Scan,
    req: OfflineScanSyncRequest,
    captured_at: datetime,
) -> OfflineScanSyncResponse:
    stored_version = _stored_rule_version(session, scan)
    submitted_ocr = [word.model_dump(mode="json") for word in req.ocr_payload]
    if (
        stored_version != req.rule_version
        or scan.created_at != captured_at
        or scan.mode != req.scan_context.mode
        or scan.category != req.scan_context.category
        or scan.image_b64 != req.image_b64
        or scan.ocr_payload != submitted_ocr
        or _stored_verdicts(scan) != _submitted_verdicts(req)
    ):
        raise AppError(
            409,
            "sync_conflict",
            "The local scan identifier already refers to an incompatible snapshot.",
        )
    return OfflineScanSyncResponse(
        scan_id=scan.id,
        local_id=req.local_id,
        rule_version=stored_version,
        created=False,
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


@router.post("/scan/sync", response_model=OfflineScanSyncResponse, status_code=201)
def sync_offline_scan(
    req: OfflineScanSyncRequest,
    request: Request,
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
    settings: Annotated[AuthSettings, Depends(get_auth_settings)],
) -> OfflineScanSyncResponse:
    """Persist an on-device verdict snapshot without running active backend rules."""
    local_id = str(req.local_id)
    captured_at = req.captured_at.astimezone(UTC).replace(tzinfo=None)
    existing = _find_synced_scan(session, current_user.id, local_id)
    if existing is not None:
        response.status_code = 200
        return _existing_sync_response(session, existing, req, captured_at)

    decoded = _decode_sync_image(req.image_b64, settings)
    image_meta = dict(decoded.metadata)
    image_meta.update({"width": decoded.width, "height": decoded.height})
    scan = Scan(
        created_at=captured_at,
        mode=req.scan_context.mode,
        category=req.scan_context.category,
        image_b64=req.image_b64,
        image_meta=image_meta,
        ocr_payload=[word.model_dump(mode="json") for word in req.ocr_payload],
        overall_status=_snapshot_overall_status(req),
        schema_version=2,
        processing_status="complete",
        analysis_version="offline-ts-engine",
        updated_at=datetime.now(UTC),
        request_id=request.state.request_id,
        quality_summary={},
        extracted_fields={},
        owner_user_id=current_user.id,
        client_local_id=local_id,
        verdicts=[
            _sync_verdict_row(verdict, captured_at, req.rule_version) for verdict in req.verdicts
        ],
    )
    session.add(scan)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        existing = _find_synced_scan(session, current_user.id, local_id)
        if existing is None:
            raise
        response.status_code = 200
        return _existing_sync_response(session, existing, req, captured_at)
    session.refresh(scan)
    return OfflineScanSyncResponse(
        scan_id=scan.id,
        local_id=req.local_id,
        rule_version=req.rule_version,
        created=True,
    )


@router.post("/scan", response_model=ScanAnalysisResponse, status_code=201)
def create_scan(
    req: ScanRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
    settings: Annotated[AuthSettings, Depends(get_auth_settings)],
) -> ScanAnalysisResponse:
    validate_inspection_for_scan(session, req.inspection_id, current_user)

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
        inspection_id=req.inspection_id,
    )
    session.add(scan)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise AppError(409, "scan_conflict", "A conflicting scan record already exists.") from exc
    session.refresh(scan)

    try:
        result = analyze_scan(
            req,
            rules,
            max_image_bytes=settings.max_upload_bytes,
            max_image_pixels=settings.max_image_pixels,
        )
        _store_complete(scan, result)

        # Resolve product identity per PRD Section 15 & 22
        mfg_field = result.extracted.get("manufacturer_address")
        raw_mfg = mfg_field.value if mfg_field else None
        clean_mfg = clean_manufacturer_name(raw_mfg)

        name_field = result.extracted.get("common_name")
        common_name = name_field.value if name_field else scan.product_name

        qty_field = result.extracted.get("net_quantity")
        raw_qty = qty_field.value if qty_field else None
        qty_val, qty_unit = parse_net_quantity(raw_qty)

        product, match_status, candidates = resolve_product_identity(
            session,
            manufacturer_name=clean_mfg,
            common_name=common_name,
            net_quantity_value=qty_val,
            net_quantity_unit=qty_unit,
            category=scan.category,
        )

        if product is not None:
            scan.product_id = product.id
            scan.product_match_status = match_status
            product.scan_count = (product.scan_count or 0) + 1
            product.latest_scan_id = scan.id
            if not product.first_scan_id:
                product.first_scan_id = scan.id
        else:
            scan.product_id = None
            scan.product_match_status = match_status

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

    hist_ctx = get_scan_historical_context(
        session,
        product_id=scan.product_id,
        current_inspection_id=scan.inspection_id,
        current_scan_id=scan.id,
        current_verdicts=scan.verdicts,
    )
    product_summary = _product_summary_dict(product, session) if product else None

    return ScanAnalysisResponse(
        scan_id=scan.id,
        processing_status="complete",
        quality=_quality_dict(result.quality),
        extracted_fields={name: _extracted_dict(field) for name, field in result.extracted.items()},
        verdicts=[_verdict_dict(verdict) for verdict in result.verdicts],
        overall_status=result.overall_status,
        analysis_version=result.analysis_version,
        inspection_id=scan.inspection_id,
        product_id=str(scan.product_id) if scan.product_id else None,
        product_match_status=scan.product_match_status,
        product=product_summary,
        product_candidates=candidates,
        previous_scan=hist_ctx.get("previous_scan"),
        previous_inspection=hist_ctx.get("previous_inspection"),
        comparison=hist_ctx.get("comparison", []),
        historical_alert=hist_ctx.get("historical_alert"),
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
    return build_stored_scan_response(session, scan)
