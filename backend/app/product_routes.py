"""Product identity details, history, and match confirmation/rejection routes."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.auth.dependencies import authorized_scan, require_admin, require_user
from app.db import Inspection, Product, ProductAuditLog, ReviewAction, Scan, User, get_session
from app.errors import AppError
from app.models import ProductSummaryOut
from app.product_history import (
    calculate_inspection_summary,
    get_scan_historical_context,
)
from app.product_identity import compute_fingerprint
from app.repositories.scans import _history_item

router = APIRouter(prefix="/api", tags=["products"])


class ConfirmProductMatchIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: str = Field(min_length=1)


class LinkProductIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: str = Field(min_length=1)
    reason: str | None = Field(default=None, max_length=1000)


def _product_summary_dict(product: Product | None, session: Session) -> dict | None:
    if product is None:
        return None
    first_scan = session.get(Scan, product.first_scan_id) if product.first_scan_id else None
    latest_scan = session.get(Scan, product.latest_scan_id) if product.latest_scan_id else None
    return {
        "id": str(product.id),
        "manufacturer": product.manufacturer_name,
        "common_name": product.common_name,
        "quantity": f"{product.net_quantity_value:g}"
        if product.net_quantity_value is not None
        else None,
        "unit": product.net_quantity_unit,
        "category": product.category,
        "scan_count": product.scan_count,
        "first_scan": first_scan.created_at.isoformat() if first_scan else None,
        "latest_scan": latest_scan.created_at.isoformat() if latest_scan else None,
    }


def build_stored_scan_response(session: Session, scan: Scan) -> dict:
    """Construct standard StoredScanResponse payload matching frontend and PRD contracts."""
    session.refresh(scan, attribute_names=["verdicts"])
    scan.review_actions = (
        session.execute(
            select(ReviewAction)
            .where(ReviewAction.scan_id == scan.id)
            .options(selectinload(ReviewAction.actor))
        )
        .scalars()
        .all()
    )

    product = session.get(Product, scan.product_id) if scan.product_id else None
    product_summary = _product_summary_dict(product, session)

    hist_ctx = get_scan_historical_context(
        session,
        product_id=scan.product_id,
        current_inspection_id=scan.inspection_id,
        current_scan_id=scan.id,
        current_verdicts=scan.verdicts,
    )

    return {
        "scan": {
            "id": scan.id,
            "local_id": scan.client_local_id,
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
            "product_id": str(scan.product_id) if scan.product_id else None,
            "inspection_id": scan.inspection_id,
            "product_match_status": scan.product_match_status,
            "product": product_summary,
            "product_candidates": [],
            "previous_scan": hist_ctx.get("previous_scan"),
            "previous_inspection": hist_ctx.get("previous_inspection"),
            "comparison": hist_ctx.get("comparison", []),
            "historical_alert": hist_ctx.get("historical_alert"),
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


@router.get("/products/{product_id}", response_model=ProductSummaryOut)
def get_product_detail(
    product_id: str,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> dict:
    """Retrieve product identity details and counters per PRD Section 33."""
    try:
        pid = int(product_id)
    except ValueError:
        raise AppError(404, "PRODUCT_NOT_FOUND", "Invalid product ID.") from None
    product = session.get(Product, pid)
    if product is None:
        raise AppError(404, "PRODUCT_NOT_FOUND", f"Product #{product_id} not found.")

    res = _product_summary_dict(product, session)
    if res is None:
        raise AppError(404, "PRODUCT_NOT_FOUND", f"Product #{product_id} not found.")
    return res


@router.get("/products/{product_id}/inspections")
def get_product_inspections(
    product_id: str,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    """Retrieve inspection history for a product per PRD Section 34."""
    try:
        pid = int(product_id)
    except ValueError:
        raise AppError(404, "PRODUCT_NOT_FOUND", "Invalid product ID.") from None
    product = session.get(Product, pid)
    if product is None:
        raise AppError(404, "PRODUCT_NOT_FOUND", f"Product #{product_id} not found.")

    # Distinct inspections containing scans of this product
    subq = (
        select(Scan.inspection_id)
        .where(Scan.product_id == pid, Scan.inspection_id.isnot(None))
        .distinct()
    )
    insp_query = (
        select(Inspection).where(Inspection.id.in_(subq)).order_by(Inspection.started_at.desc())
    )
    all_insps = session.scalars(insp_query).all()
    total = len(all_insps)

    paginated_insps = all_insps[(page - 1) * page_size : page * page_size]
    items = []
    for insp in paginated_insps:
        latest_scan = session.scalars(
            select(Scan)
            .where(Scan.product_id == pid, Scan.inspection_id == insp.id)
            .order_by(Scan.created_at.desc())
        ).first()

        overall = latest_scan.overall_status if latest_scan else "unknown"
        summary = calculate_inspection_summary(session, insp.id)
        items.append(
            {
                "inspection_id": str(insp.id),
                "inspection_date": insp.started_at.isoformat(),
                "overall_status": overall,
                "repeated_non_compliance_count": summary["repeated_non_compliance_count"],
            }
        )

    return {
        "items": items,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
        },
    }


@router.get("/products/{product_id}/scans")
def get_product_scans(
    product_id: str,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    """Retrieve scan evidence history for a product per PRD Section 35."""
    try:
        pid = int(product_id)
    except ValueError:
        raise AppError(404, "PRODUCT_NOT_FOUND", "Invalid product ID.") from None
    product = session.get(Product, pid)
    if product is None:
        raise AppError(404, "PRODUCT_NOT_FOUND", f"Product #{product_id} not found.")

    query = (
        select(Scan)
        .where(Scan.product_id == pid)
        .options(selectinload(Scan.verdicts))
        .order_by(Scan.created_at.desc())
    )
    total = session.scalar(select(func.count(Scan.id)).where(Scan.product_id == pid)) or 0
    scans = session.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()

    product_summary = _product_summary_dict(product, session)
    return {
        "product": product_summary,
        "items": [_history_item(s) for s in scans],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.post("/scans/{scan_id}/confirm-product-match")
def handle_confirm_product_match(
    scan_id: int,
    req: ConfirmProductMatchIn,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> dict:
    """Confirm suggested product match candidate per PRD Section 36."""
    scan = authorized_scan(session, current_user, scan_id)
    if scan is None:
        raise AppError(404, "SCAN_NOT_FOUND", f"Scan #{scan_id} not found.")

    try:
        target_pid = int(req.product_id)
    except ValueError:
        raise AppError(400, "MATCH_CANDIDATE_INVALID", "Invalid candidate product ID.") from None

    target_product = session.get(Product, target_pid)
    if target_product is None:
        raise AppError(404, "PRODUCT_NOT_FOUND", "Target product candidate not found.")

    old_product_id = scan.product_id
    scan.product_id = target_product.id
    scan.product_match_status = "confirmed"
    scan.updated_at = datetime.now(UTC)

    target_product.scan_count = (target_product.scan_count or 0) + 1
    target_product.latest_scan_id = scan.id
    if not target_product.first_scan_id:
        target_product.first_scan_id = scan.id

    # Audit log
    audit = ProductAuditLog(
        actor_user_id=current_user.id,
        scan_id=scan.id,
        old_product_id=old_product_id,
        new_product_id=target_product.id,
        action="confirm_match",
        reason=None,
    )
    session.add(audit)
    session.commit()
    session.refresh(scan)

    return build_stored_scan_response(session, scan)


@router.post("/scans/{scan_id}/reject-product-match")
def handle_reject_product_match(
    scan_id: int,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User, Depends(require_user)],
) -> dict:
    """Reject suggested product match and establish new product per PRD Section 37."""
    scan = authorized_scan(session, current_user, scan_id)
    if scan is None:
        raise AppError(404, "SCAN_NOT_FOUND", f"Scan #{scan_id} not found.")

    old_product_id = scan.product_id

    # Create distinct product identity for rejected scan
    name = scan.product_name or f"Product-Scan-{scan.id}"
    category = scan.category
    fp, sk = compute_fingerprint(
        manufacturer_name=f"Vendor-{scan.id}",
        common_name=name,
        net_quantity_value=None,
        net_quantity_unit=None,
        category=category,
    )

    new_prod = Product(
        fingerprint_exact=fp,
        search_key=sk,
        manufacturer_name=f"Vendor-{scan.id}",
        common_name=name,
        category=category,
        first_scan_id=scan.id,
        latest_scan_id=scan.id,
        scan_count=1,
    )
    session.add(new_prod)
    session.flush()

    scan.product_id = new_prod.id
    scan.product_match_status = "rejected"
    scan.updated_at = datetime.now(UTC)

    audit = ProductAuditLog(
        actor_user_id=current_user.id,
        scan_id=scan.id,
        old_product_id=old_product_id,
        new_product_id=new_prod.id,
        action="reject_match",
        reason="Inspector rejected suggested product match",
    )
    session.add(audit)
    session.commit()
    session.refresh(scan)

    return build_stored_scan_response(session, scan)


@router.post("/scans/{scan_id}/link-product")
def handle_admin_link_product(
    scan_id: int,
    req: LinkProductIn,
    session: Annotated[Session, Depends(get_session)],
    current_admin: Annotated[User, Depends(require_admin)],
) -> dict:
    """Administrative link override with audit logging per PRD Section 38."""
    scan = session.get(Scan, scan_id)
    if scan is None:
        raise AppError(404, "SCAN_NOT_FOUND", f"Scan #{scan_id} not found.")

    try:
        target_pid = int(req.product_id)
    except ValueError:
        raise AppError(400, "PRODUCT_NOT_FOUND", "Invalid target product ID.") from None

    target_product = session.get(Product, target_pid)
    if target_product is None:
        raise AppError(404, "PRODUCT_NOT_FOUND", "Target product not found.")

    old_product_id = scan.product_id
    scan.product_id = target_product.id
    scan.product_match_status = "confirmed"
    scan.updated_at = datetime.now(UTC)

    target_product.scan_count = (target_product.scan_count or 0) + 1
    target_product.latest_scan_id = scan.id

    audit = ProductAuditLog(
        actor_user_id=current_admin.id,
        scan_id=scan.id,
        old_product_id=old_product_id,
        new_product_id=target_product.id,
        action="admin_override",
        reason=req.reason or "Admin product link override",
    )
    session.add(audit)
    session.commit()
    session.refresh(scan)

    return build_stored_scan_response(session, scan)
