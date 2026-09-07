"""Scan creation and retrieval API routes."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import Scan, VerdictRow, get_session
from app.domain import ExtractedField, ImageMeta, OCRWord, ScanContext
from app.engine import run_engine
from app.extractors import (
    extract_common_name,
    extract_consumer_care,
    extract_country_origin,
    extract_manufacturer_address,
    extract_mfg_date,
    extract_mrp,
    extract_net_quantity,
)
from app.models import ScanRequest
from app.rules_loader import get_active_rules

router = APIRouter(prefix="/api", tags=["scan"])


def _word_from_dto(word: object) -> OCRWord:
    return OCRWord(text=word.text, confidence=word.confidence, bbox=tuple(word.bbox))


class ScanCreatedResponse(BaseModel):
    scan_id: int
    overall_status: str
    verdicts: list[dict]


@router.post("/scan", response_model=ScanCreatedResponse, status_code=201)
def create_scan(
    req: ScanRequest,
    session: Annotated[Session, Depends(get_session)],
) -> ScanCreatedResponse:
    if not req.ocr_payload:
        raise HTTPException(status_code=422, detail="no_text_extracted")

    rules = get_active_rules()
    words = [_word_from_dto(word) for word in req.ocr_payload]
    image_meta = ImageMeta(**req.image_meta.model_dump())
    address_check = rules.check_by_id("r6_1_a_address")
    quantity_check = rules.check_by_id("r6_1_c_net_quantity")
    mrp_check = rules.check_by_id("r6_1_e_mrp")
    care_check = rules.check_by_id("r6_2_consumer_care")
    date_check = rules.check_by_id("r6_1_d_mfg_date")

    mrp = extract_mrp(words, image_meta, mrp_check.tax_inclusive_phrase_regex) if mrp_check else None
    # A non-empty MRP extractor result already verified the tax phrase; preserve
    # that fact in the engine input while retaining its evidence bboxes.
    if mrp and mrp.value:
        mrp = ExtractedField(
            name=mrp.name,
            value=f"MRP {mrp.value} (Inclusive of all taxes)",
            bbox=mrp.bbox,
            confidence=mrp.confidence,
            evidence_spans=mrp.evidence_spans,
        )

    extracted: dict[str, ExtractedField] = {
        "manufacturer_address": extract_manufacturer_address(words, image_meta, address_check.pin_code_regex)
        if address_check and address_check.pin_code_regex
        else None,
        "net_quantity": extract_net_quantity(words, image_meta, quantity_check.requires_unit_in)
        if quantity_check and quantity_check.requires_unit_in
        else None,
        "mrp": mrp,
        "consumer_care": extract_consumer_care(
            words, image_meta, care_check.email_regex, care_check.phone_regex
        )
        if care_check and care_check.email_regex and care_check.phone_regex
        else None,
        "mfg_date": extract_mfg_date(words, image_meta, date_check.date_format_regex)
        if date_check and date_check.date_format_regex
        else None,
        "common_name": extract_common_name(words, image_meta),
        "country_origin": extract_country_origin(words, image_meta),
    }
    verdicts = run_engine(
        extracted,
        rules,
        ScanContext(mode=req.scan_context.mode, category=req.scan_context.category),
    )
    statuses = {verdict.status for verdict in verdicts}
    overall = "fail" if "fail" in statuses else "mixed" if "warn" in statuses else "pass"
    scan = Scan(
        mode=req.scan_context.mode,
        category=req.scan_context.category,
        image_b64=req.image_b64,
        image_meta=req.image_meta.model_dump(),
        ocr_payload=[word.model_dump() for word in req.ocr_payload],
        overall_status=overall,
        verdicts=[
            VerdictRow(
                rule_id=verdict.rule_id,
                status=verdict.status,
                severity=verdict.severity,
                citation=verdict.citation,
                evidence=verdict.evidence,
                evidence_bboxes=[list(bbox) for bbox in verdict.evidence_bboxes],
                failure_message=verdict.failure_message,
                rule_version=verdict.rule_version,
            )
            for verdict in verdicts
        ],
    )
    session.add(scan)
    session.commit()
    session.refresh(scan)
    return ScanCreatedResponse(
        scan_id=scan.id,
        overall_status=overall,
        verdicts=[
            {
                "rule_id": verdict.rule_id,
                "status": verdict.status,
                "severity": verdict.severity,
                "citation": verdict.citation,
                "evidence": verdict.evidence,
                "evidence_bboxes": [list(bbox) for bbox in verdict.evidence_bboxes],
                "failure_message": verdict.failure_message,
                "rule_version": verdict.rule_version,
            }
            for verdict in verdicts
        ],
    )


@router.get("/scan/{scan_id}")
def get_scan(scan_id: int, session: Annotated[Session, Depends(get_session)]) -> dict:
    scan = session.get(Scan, scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="scan_not_found")
    return {
        "scan": {
            "id": scan.id,
            "created_at": scan.created_at.isoformat(),
            "mode": scan.mode,
            "category": scan.category,
            "overall_status": scan.overall_status,
            "image_b64": scan.image_b64,
            "image_meta": scan.image_meta,
        },
        "verdicts": [
            {
                "rule_id": verdict.rule_id,
                "status": verdict.status,
                "severity": verdict.severity,
                "citation": verdict.citation,
                "evidence": verdict.evidence,
                "evidence_bboxes": verdict.evidence_bboxes,
                "failure_message": verdict.failure_message,
                "rule_version": verdict.rule_version,
            }
            for verdict in scan.verdicts
        ],
    }
