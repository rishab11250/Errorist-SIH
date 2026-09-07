from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import main
from app.db import Scan, VerdictRow
from app.errors import error_body
from app.main import app
from app.models import ScanRequest, VerdictOut


def _request(**overrides) -> ScanRequest:
    values = {
        "image_b64": "aGVsbG8=",
        "image_meta": {"width": 10, "height": 10, "orientation": 1},
        "ocr_payload": [{"text": "MRP", "confidence": 0.9, "bbox": [0.1, 0.1, 0.2, 0.2]}],
    }
    values.update(overrides)
    return ScanRequest(**values)


def test_v1_request_defaults_to_schema_one() -> None:
    request = _request()
    assert request.schema_version == 1
    assert request.ocr_lines == []
    assert request.scan_context.imported is None
    assert request.scan_context.inspection_date is None


def test_v2_request_accepts_lines_and_applicability_context() -> None:
    request = _request(
        schema_version=2,
        ocr_lines=[
            {
                "word_indexes": [0],
                "bbox": [0.1, 0.1, 0.2, 0.2],
                "median_character_height": 0.2,
            }
        ],
        scan_context={
            "mode": "ecommerce_listing",
            "category": "non_food",
            "imported": True,
            "inspection_date": "2026-09-07",
        },
    )
    assert request.schema_version == 2
    assert request.scan_context.imported is True
    assert request.scan_context.inspection_date == date(2026, 9, 7)
    assert request.ocr_lines[0].word_indexes == [0]


@pytest.mark.parametrize(
    "bbox",
    [
        [1.1, 0.0, 0.2, 0.2],
        [0.9, 0.0, 0.2, 0.2],
        [0.0, 0.9, 0.2, 0.2],
        [0.0, 0.0, 0.0, 0.2],
        [float("nan"), 0.0, 0.2, 0.2],
    ],
)
def test_invalid_normalized_bbox_is_rejected(bbox) -> None:
    with pytest.raises(ValidationError):
        _request(ocr_payload=[{"text": "MRP", "confidence": 0.9, "bbox": bbox}])


def test_manual_review_verdict_has_reason_and_method() -> None:
    verdict = VerdictOut(
        rule_id="r7_font_size",
        status="manual_review",
        severity="warning",
        citation="Rule 7",
        evidence="23 px",
        evidence_bboxes=[],
        confidence=0.6,
        reasoning="Scale is uncertain",
        measurement_method="relative_readability",
        failure_message=None,
        rule_version="2026-09",
    )
    assert verdict.status == "manual_review"


def test_app_error_uses_shared_envelope() -> None:
    body = error_body("invalid_image", "Image could not be decoded.", "request-1")
    assert body == {
        "error": "invalid_image",
        "detail": "Image could not be decoded.",
        "request_id": "request-1",
    }


def test_task_one_columns_are_mapped_by_the_orm() -> None:
    assert {
        "schema_version",
        "processing_status",
        "product_name",
        "quality_summary",
        "extracted_fields",
        "analysis_version",
        "updated_at",
        "failure_stage",
        "request_id",
        "processing_error_code",
    } <= set(Scan.__table__.columns.keys())
    assert {"confidence", "reasoning", "measurement_method", "review_state"} <= set(
        VerdictRow.__table__.columns.keys()
    )


def test_http_errors_include_request_id(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "contract.db")
    with TestClient(app) as client:
        response = client.get("/api/scan/99999", headers={"X-Request-ID": "contract-test"})
    assert response.status_code == 404
    assert response.json() == {
        "error": "scan_not_found",
        "detail": "Scan not found.",
        "request_id": "contract-test",
    }
    assert response.headers["X-Request-ID"] == "contract-test"
