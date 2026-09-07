"""Core domain types used across the engine, extractors, and API layers."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


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
    dpi: int | None = None
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


VerdictStatus = Literal["pass", "fail", "warn", "na"]
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
