"""Pydantic DTOs for HTTP request and response payloads."""

from __future__ import annotations

import math
from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator

from app.settings import DEFAULT_MAX_OCR_WORDS


def _normalized_bbox(
    value: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    x, y, width, height = value
    if not all(math.isfinite(part) for part in value):
        raise ValueError("bbox values must be finite")
    if not all(0.0 <= part <= 1.0 for part in value):
        raise ValueError("bbox values must be between 0 and 1")
    if width <= 0.0 or height <= 0.0:
        raise ValueError("bbox width and height must be greater than zero")
    if x + width > 1.0 or y + height > 1.0:
        raise ValueError("bbox must fit inside normalized image bounds")
    return value


NormalizedBBox = Annotated[
    tuple[float, float, float, float],
    AfterValidator(_normalized_bbox),
]
ModeValue = Literal["retail_image", "ecommerce_listing"]
CategoryValue = Literal["food", "non_food", "cosmetics", "seeds", "unknown"]
VerdictStatusValue = Literal["pass", "fail", "warn", "manual_review", "na"]
OverallStatusValue = Literal["pass", "fail", "mixed", "manual_review"]
QualityStatusValue = Literal[
    "acceptable",
    "usable_with_warnings",
    "retake_recommended",
    "unreadable",
]
MeasurementMethodValue = Literal[
    "direct_metadata",
    "geometry_estimate",
    "relative_readability",
    "not_measurable",
]


class HealthResponse(BaseModel):
    status: str = "ok"
    rules_version: str


class ScanContextIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: ModeValue = "retail_image"
    category: CategoryValue = "unknown"
    imported: bool | None = None
    inspection_date: date | None = None


class ImageMetaIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    width: int = Field(gt=0)
    height: int = Field(gt=0)
    dpi: float | None = Field(default=None, gt=0)
    orientation: int = Field(default=1, ge=1, le=8)


class OCRWordIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(max_length=1000)
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: NormalizedBBox


class OCRLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    word_indexes: list[int] = Field(min_length=1)
    bbox: NormalizedBBox
    median_character_height: float = Field(gt=0.0, le=1.0)

    @field_validator("word_indexes")
    @classmethod
    def validate_word_indexes(cls, value: list[int]) -> list[int]:
        if any(index < 0 for index in value):
            raise ValueError("word indexes must be non-negative")
        if len(set(value)) != len(value):
            raise ValueError("word indexes must not repeat")
        return value


class ScanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image_b64: str = Field(min_length=1, max_length=13_333_336)
    image_meta: ImageMetaIn
    ocr_payload: list[OCRWordIn]
    scan_context: ScanContextIn = Field(default_factory=ScanContextIn)
    schema_version: Literal[1, 2] = 1
    ocr_lines: list[OCRLineIn] = Field(default_factory=list)
    inspection_id: int | None = None

    @field_validator("ocr_payload")
    @classmethod
    def validate_ocr_payload_length(cls, value: list[OCRWordIn]) -> list[OCRWordIn]:
        if len(value) > DEFAULT_MAX_OCR_WORDS:
            raise ValueError(
                f"OCR word count ({len(value)}) exceeds "
                f"maximum allowed limit of {DEFAULT_MAX_OCR_WORDS}."
            )
        return value


class VisualMetricOut(BaseModel):
    name: str
    value: float
    unit: str
    confidence: float = Field(ge=0.0, le=1.0)
    method: str
    evidence_bboxes: list[NormalizedBBox] = Field(default_factory=list)


class QualitySummaryOut(BaseModel):
    status: QualityStatusValue
    score: float = Field(ge=0.0, le=100.0)
    metrics: list[VisualMetricOut] = Field(default_factory=list)
    guidance: list[str] = Field(default_factory=list)


class ExtractedFieldOut(BaseModel):
    name: str
    value: str | None
    bbox: NormalizedBBox | None
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_bboxes: list[NormalizedBBox] = Field(default_factory=list)


class VerdictOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rule_id: str = Field(min_length=1, max_length=128)
    status: VerdictStatusValue
    severity: Literal["critical", "warning", "info"]
    citation: str = Field(min_length=1, max_length=512)
    evidence: str = Field(max_length=2000)
    evidence_bboxes: list[NormalizedBBox] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str = Field(min_length=1, max_length=4000)
    measurement_method: MeasurementMethodValue
    failure_message: str | None = Field(max_length=2000)
    rule_version: str = Field(min_length=1, max_length=128)


class OfflineScanSyncRequest(BaseModel):
    """Wire representation of an immutable on-device scan snapshot.

    IndexedDB keeps the image as a Blob. The sync client converts only that
    field to base64 for this JSON API; the remaining fields keep their stored
    shapes unchanged.
    """

    model_config = ConfigDict(extra="forbid")

    local_id: UUID
    captured_at: datetime
    rule_version: str = Field(min_length=1, max_length=128)
    image_b64: str = Field(min_length=1, max_length=13_333_336)
    ocr_payload: list[OCRWordIn]
    scan_context: ScanContextIn = Field(default_factory=ScanContextIn)
    verdicts: list[VerdictOut] = Field(min_length=1)

    @field_validator("captured_at")
    @classmethod
    def captured_at_must_include_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("captured_at must include a timezone offset")
        return value

    @field_validator("rule_version")
    @classmethod
    def normalize_rule_version(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("rule_version must not be blank")
        return normalized

    @field_validator("ocr_payload")
    @classmethod
    def validate_sync_ocr_payload_length(cls, value: list[OCRWordIn]) -> list[OCRWordIn]:
        if len(value) > DEFAULT_MAX_OCR_WORDS:
            raise ValueError(
                f"OCR word count ({len(value)}) exceeds "
                f"maximum allowed limit of {DEFAULT_MAX_OCR_WORDS}."
            )
        return value

    @model_validator(mode="after")
    def validate_snapshot(self) -> OfflineScanSyncRequest:
        if any(verdict.rule_version != self.rule_version for verdict in self.verdicts):
            raise ValueError("every verdict rule_version must match capture rule_version")
        rule_ids = [verdict.rule_id for verdict in self.verdicts]
        if len(set(rule_ids)) != len(rule_ids):
            raise ValueError("verdict rule_id values must be unique")
        return self


class OfflineScanSyncResponse(BaseModel):
    scan_id: int
    local_id: UUID
    processing_status: Literal["complete"] = "complete"
    rule_version: str
    created: bool


class ProductSummaryOut(BaseModel):
    id: str
    manufacturer: str | None = None
    common_name: str | None = None
    quantity: str | None = None
    unit: str | None = None
    category: str | None = None
    scan_count: int = 0
    first_scan: str | None = None
    latest_scan: str | None = None


class ProductCandidateOut(ProductSummaryOut):
    similarity_score: float | None = None
    score: float | None = None
    product_id: str | None = None


class RuleDeltaOut(BaseModel):
    rule_id: str
    status_before: str | None
    status_after: str
    changed: bool
    direction: Literal["improved", "regressed", "unchanged"]
    repeated_non_compliance: bool = False


class HistoricalAlertOut(BaseModel):
    type: str = "repeated_non_compliance"
    message: str
    recommended_action: str = "review_previous_inspection"


class PreviousInspectionOut(BaseModel):
    inspection_id: str
    scanned_at: str
    overall_status: str


class PreviousScanOut(BaseModel):
    scan_id: int
    scanned_at: str
    overall_status: str
    comparison: list[RuleDeltaOut] = Field(default_factory=list)


class InspectionCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company_name: str | None = Field(default=None, max_length=256)
    location: str | None = Field(default=None, max_length=256)
    notes: str | None = Field(default=None, max_length=2000)


class InspectionSummaryOut(BaseModel):
    product_count: int = 0
    scan_count: int = 0
    pass_count: int = 0
    fail_count: int = 0
    manual_review_count: int = 0
    repeated_non_compliance_count: int = 0


class InspectionOut(BaseModel):
    id: int
    owner_id: int
    company_name: str | None
    location: str | None
    status: Literal["open", "completed", "cancelled"]
    started_at: datetime
    completed_at: datetime | None
    notes: str | None
    summary: InspectionSummaryOut | None = None


class ScanAnalysisResponse(BaseModel):
    scan_id: int
    processing_status: Literal["processing", "complete", "failed"]
    quality: QualitySummaryOut
    extracted_fields: dict[str, ExtractedFieldOut | None]
    verdicts: list[VerdictOut]
    overall_status: OverallStatusValue
    analysis_version: str
    inspection_id: int | None = None
    product_id: str | None = None
    product_match_status: Literal["unmatched", "auto_matched", "suggested", "confirmed", "rejected"] = "unmatched"
    product: ProductSummaryOut | None = None
    product_candidates: list[ProductCandidateOut] = Field(default_factory=list)
    previous_scan: PreviousScanOut | None = None
    previous_inspection: PreviousInspectionOut | None = None
    comparison: list[RuleDeltaOut] = Field(default_factory=list)
    historical_alert: HistoricalAlertOut | None = None


class ErrorResponse(BaseModel):
    error: str
    detail: str
    request_id: str

