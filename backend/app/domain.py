"""Core domain types used across the engine, extractors, and API layers."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Literal

import numpy as np


@dataclass(frozen=True)
class OCRWord:
    """A single word returned by the browser's OCR engine."""

    text: str
    confidence: float
    bbox: tuple[float, float, float, float]


@dataclass(frozen=True)
class ImageMeta:
    """Metadata about the source image."""

    width: int
    height: int
    dpi: float | None = None
    orientation: int = 1


@dataclass
class ExtractedField:
    """A single field extracted from the OCR payload by one extractor."""

    name: str
    value: str | None
    bbox: tuple[float, float, float, float] | None
    confidence: float
    evidence_spans: list[tuple[float, float, float, float]] = field(default_factory=list)


Mode = Literal["retail_image", "ecommerce_listing"]
Category = Literal["food", "non_food", "cosmetics", "seeds", "unknown"]


@dataclass(frozen=True)
class ScanContext:
    mode: Mode = "retail_image"
    category: Category = "unknown"
    imported: bool | None = None
    inspection_date: date | None = None


MeasurementMethod = Literal[
    "direct_metadata",
    "geometry_estimate",
    "relative_readability",
    "not_measurable",
]
QualityStatus = Literal[
    "acceptable",
    "usable_with_warnings",
    "retake_recommended",
    "unreadable",
]
VerdictStatus = Literal["pass", "fail", "warn", "manual_review", "na"]
OverallStatus = Literal["pass", "fail", "mixed", "manual_review"]
Severity = Literal["critical", "warning", "info"]


@dataclass
class Verdict:
    rule_id: str
    status: VerdictStatus
    severity: Severity
    citation: str
    evidence: str
    evidence_bboxes: list[tuple[float, float, float, float]]
    failure_message: str | None
    rule_version: str
    confidence: float = 1.0
    reasoning: str = "Legacy verdict"
    measurement_method: MeasurementMethod = "not_measurable"


@dataclass(frozen=True)
class OCRLine:
    word_indexes: tuple[int, ...]
    bbox: tuple[float, float, float, float]
    median_character_height: float


@dataclass(frozen=True)
class VisualMetric:
    name: str
    value: float
    unit: str
    confidence: float
    method: str
    evidence_bboxes: tuple[tuple[float, float, float, float], ...] = ()


@dataclass(frozen=True)
class QualitySummary:
    status: QualityStatus
    score: float
    metrics: tuple[VisualMetric, ...]
    guidance: tuple[str, ...]


@dataclass(frozen=True)
class DecodedImage:
    image: np.ndarray
    width: int
    height: int
    metadata: dict[str, object]


@dataclass(frozen=True)
class PanelEstimate:
    bbox: tuple[float, float, float, float]
    confidence: float
    corners: tuple[tuple[float, float], ...] = ()
    physical_width_mm: float | None = None
    scale_method: MeasurementMethod = "not_measurable"


@dataclass(frozen=True)
class ReadabilityAssessment:
    score: float
    character_height_px: float
    estimated_mm: float | None
    error_mm: float | None
    method: MeasurementMethod
    scale_confidence: float
    status: VerdictStatus
    reasoning: str
    evidence_bboxes: tuple[tuple[float, float, float, float], ...] = ()


@dataclass(frozen=True)
class PlacementResult:
    status: VerdictStatus
    relationship: str
    confidence: float
    reasoning: str
    evidence_bboxes: tuple[tuple[float, float, float, float], ...] = ()


@dataclass(frozen=True)
class AnalysisInput:
    extracted: dict[str, ExtractedField | None]
    quality: QualitySummary
    readability: dict[str, ReadabilityAssessment]
    placement: dict[str, PlacementResult]


@dataclass(frozen=True)
class AnalysisResult:
    quality: QualitySummary
    extracted: dict[str, ExtractedField | None]
    verdicts: tuple[Verdict, ...]
    overall_status: OverallStatus
    analysis_version: str


@dataclass(frozen=True)
class FontSizeBracket:
    max_value: float | None
    normal_mm: float
    blown_mm: float


@dataclass(frozen=True)
class FontSizeTable:
    brackets: list[FontSizeBracket]


@dataclass(frozen=True)
class FontSizeRuleSet:
    key: str
    citation: str
    effective_from: str
    superseded_date: str | None
    table_I: FontSizeTable | None = None
    table_II: FontSizeTable | None = None
    letter_min_mm: float | None = None
    letter_blown_min_mm: float | None = None


@dataclass(frozen=True)
class FontSizeRules:
    versions: dict[str, FontSizeRuleSet]
    default_version: str
    exemption_applies_when_another_law_governs: bool
    exempted_declarations: list[str]
    exempted_categories: list[str]
    enforcement_scale_confidence: float
    boundary_error_policy: Literal["manual_review"]


@dataclass(frozen=True)
class CheckConfig:
    rule_id: str
    citation: str
    field: str
    check_type: str
    severity: Severity
    requires: list[str]
    failure_message: str
    tax_inclusive_phrase_regex: str | None = None
    requires_unit_in: list[str] | None = None
    pin_code_regex: str | None = None
    email_regex: str | None = None
    phone_regex: str | None = None
    date_format_regex: str | None = None
    skipped_when_category_in: list[str] | None = None
    skipped_when_mode: str | None = None


@dataclass(frozen=True)
class ConfidenceThresholds:
    pass_min: float
    warn_min: float


@dataclass(frozen=True)
class RulesConfig:
    version: str
    schema_version: int
    font_size: FontSizeRules
    confidence_thresholds: ConfidenceThresholds
    checks: list[CheckConfig]

    def check_by_id(self, rule_id: str) -> CheckConfig | None:
        for c in self.checks:
            if c.rule_id == rule_id:
                return c
        return None
