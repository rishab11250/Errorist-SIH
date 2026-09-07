"""Load and validate rules.yaml into RulesConfig."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import yaml

from app.domain import (
    CheckConfig,
    ConfidenceThresholds,
    FontSizeBracket,
    FontSizeRules,
    FontSizeRuleSet,
    FontSizeTable,
    RulesConfig,
)


class RulesLoadError(ValueError):
    """Raised when rules.yaml is malformed."""


_APPLICABILITY_KEYS = {"mode_in", "category_in", "imported", "context_required"}
_MODES = {"retail_image", "ecommerce_listing"}
_CATEGORIES = {"food", "non_food", "cosmetics", "seeds", "unknown"}
_CONTEXT_FIELDS = {"mode", "category", "imported", "inspection_date"}


def _mapping(raw: object, field_name: str) -> dict[str, Any]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise RulesLoadError(f"{field_name} must be a mapping")
    return dict(raw)


def _parse_applies_when(raw: object, rule_id: str) -> dict[str, object]:
    applies_when = _mapping(raw, f"check {rule_id}.applies_when")
    unknown = applies_when.keys() - _APPLICABILITY_KEYS
    if unknown:
        raise RulesLoadError(f"check {rule_id}: unsupported applicability keys {sorted(unknown)}")
    mode_in = applies_when.get("mode_in")
    if mode_in is not None and (
        not isinstance(mode_in, list) or not mode_in or any(mode not in _MODES for mode in mode_in)
    ):
        raise RulesLoadError(f"check {rule_id}.applies_when.mode_in is invalid")
    category_in = applies_when.get("category_in")
    if category_in is not None and (
        not isinstance(category_in, list)
        or not category_in
        or any(category not in _CATEGORIES for category in category_in)
    ):
        raise RulesLoadError(f"check {rule_id}.applies_when.category_in is invalid")
    imported = applies_when.get("imported")
    if imported is not None and not isinstance(imported, bool):
        raise RulesLoadError(f"check {rule_id}.applies_when.imported must be boolean")
    context_required = applies_when.get("context_required")
    if context_required is not None and (
        not isinstance(context_required, list)
        or any(field_name not in _CONTEXT_FIELDS for field_name in context_required)
    ):
        raise RulesLoadError(f"check {rule_id}.applies_when.context_required is invalid")
    return applies_when


def _parse_brackets(raw: list[dict[str, Any]], field: str) -> list[FontSizeBracket]:
    out: list[FontSizeBracket] = []
    for i, row in enumerate(raw):
        if "normal_mm" not in row or "blown_mm" not in row:
            raise RulesLoadError(f"{field}[{i}]: missing normal_mm or blown_mm")
        out.append(
            FontSizeBracket(
                max_value=row.get("max_g_or_ml") or row.get("max_cm2"),
                normal_mm=float(row["normal_mm"]),
                blown_mm=float(row["blown_mm"]),
            )
        )
    return out


def _parse_font_size_set(key: str, raw: dict[str, Any]) -> FontSizeRuleSet:
    citation, effective_from = raw.get("citation"), raw.get("effective_from")
    if not citation or not effective_from:
        raise RulesLoadError(f"font_size_rules.{key}: citation and effective_from required")
    table_I = None
    table_II = None
    if "table_I_weight_volume" in raw:
        table_I = FontSizeTable(
            _parse_brackets(
                raw["table_I_weight_volume"]["brackets"], f"{key}.table_I_weight_volume"
            )
        )
    if "table_II_length_area_number" in raw:
        table_II = FontSizeTable(
            _parse_brackets(
                raw["table_II_length_area_number"]["brackets"], f"{key}.table_II_length_area_number"
            )
        )
    if "table_I" in raw:
        table_I = FontSizeTable(_parse_brackets(raw["table_I"]["brackets"], f"{key}.table_I"))
    return FontSizeRuleSet(
        key,
        citation,
        effective_from,
        raw.get("superseded_date"),
        table_I,
        table_II,
        raw.get("letter_min_mm"),
        raw.get("letter_blown_min_mm"),
    )


def _parse_check(raw: dict[str, Any]) -> CheckConfig:
    required = {
        "rule_id",
        "citation",
        "field",
        "check_type",
        "severity",
        "requires",
        "failure_message",
    }
    missing = required - raw.keys()
    if missing:
        raise RulesLoadError(f"check {raw.get('rule_id', '?')}: missing fields {missing}")
    rule_id = raw["rule_id"]
    effective_from = raw.get("effective_from")
    if effective_from is not None:
        try:
            date.fromisoformat(effective_from)
        except (TypeError, ValueError) as exc:
            raise RulesLoadError(f"check {rule_id}.effective_from must be an ISO date") from exc
    placement = _mapping(raw.get("placement"), f"check {rule_id}.placement")
    readability = _mapping(raw.get("readability"), f"check {rule_id}.readability")
    exemption = _mapping(raw.get("exemption"), f"check {rule_id}.exemption")
    return CheckConfig(
        rule_id=rule_id,
        citation=raw["citation"],
        field=raw["field"],
        check_type=raw["check_type"],
        severity=raw["severity"],
        requires=list(raw["requires"]),
        failure_message=raw["failure_message"],
        tax_inclusive_phrase_regex=raw.get("tax_inclusive_phrase_regex"),
        requires_unit_in=raw.get("requires_unit_in"),
        pin_code_regex=raw.get("pin_code_regex"),
        email_regex=raw.get("email_regex"),
        phone_regex=raw.get("phone_regex"),
        date_format_regex=raw.get("date_format_regex"),
        skipped_when_category_in=raw.get("skipped_when_category_in"),
        skipped_when_mode=raw.get("skipped_when_mode"),
        applies_when=_parse_applies_when(raw.get("applies_when"), rule_id),
        placement=placement,
        readability=readability,
        effective_from=effective_from,
        exemption=exemption,
    )


def load_rules(path: str | Path) -> RulesConfig:
    """Load rules.yaml from `path`, validate it, return RulesConfig."""
    p = Path(path)
    if not p.exists() and not p.is_absolute():
        p = Path(__file__).resolve().parent.parent.parent / p
    if not p.exists():
        raise RulesLoadError(f"rules file not found: {p}")
    with p.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f)
    if not isinstance(raw, dict):
        raise RulesLoadError("rules root must be a YAML mapping")
    version, schema_version = raw.get("version"), raw.get("schema_version")
    if not version or schema_version != 1:
        raise RulesLoadError(f"unsupported schema_version={schema_version}, version={version}")
    fsr = raw.get("font_size_rules", {})
    if "default_version" not in fsr:
        raise RulesLoadError("font_size_rules.default_version required")
    versions = {
        key: _parse_font_size_set(key, fsr[key])
        for key in ("original_2011", "consolidated_post_2021")
        if key in fsr
    }
    default_v = fsr["default_version"]
    if default_v not in versions:
        raise RulesLoadError(
            f"default_version {default_v!r} not in defined versions {list(versions)}"
        )
    for key, vset in versions.items():
        for other_key, other_vset in versions.items():
            if key != other_key and vset.effective_from == other_vset.effective_from:
                raise RulesLoadError(f"font_size_rules.{key} and .{other_key} share effective_from")
            if key != other_key:
                vset_end = vset.superseded_date or "9999-12-31"
                other_end = other_vset.superseded_date or "9999-12-31"
                if vset.effective_from < other_end and other_vset.effective_from < vset_end:
                    raise RulesLoadError(
                        f"font_size_rules.{key} and .{other_key} have overlapping effective ranges"
                    )
    enforcement_scale_confidence = fsr.get("enforcement_scale_confidence")
    if (
        isinstance(enforcement_scale_confidence, bool)
        or not isinstance(enforcement_scale_confidence, (int, float))
        or not 0.0 < enforcement_scale_confidence <= 1.0
    ):
        raise RulesLoadError(
            "font_size_rules.enforcement_scale_confidence must satisfy 0 < value <= 1"
        )
    boundary_error_policy = fsr.get("boundary_error_policy")
    if boundary_error_policy != "manual_review":
        raise RulesLoadError("font_size_rules.boundary_error_policy must be 'manual_review'")
    exemption = fsr.get("exemption", {})
    font_size = FontSizeRules(
        versions=versions,
        default_version=default_v,
        exemption_applies_when_another_law_governs=bool(
            exemption.get("applies_when_another_law_governs", False)
        ),
        exempted_declarations=list(exemption.get("exempted_declarations", [])),
        exempted_categories=list(exemption.get("exempted_categories", [])),
        enforcement_scale_confidence=float(enforcement_scale_confidence),
        boundary_error_policy=boundary_error_policy,
    )
    ct = raw.get("confidence_thresholds", {})
    confidence_thresholds = ConfidenceThresholds(
        float(ct.get("pass_min", 0.7)), float(ct.get("warn_min", 0.6))
    )
    if not (0.0 <= confidence_thresholds.warn_min < confidence_thresholds.pass_min <= 1.0):
        raise RulesLoadError("confidence_thresholds must satisfy 0 <= warn_min < pass_min <= 1")
    checks_raw = raw.get("checks", [])
    if not checks_raw:
        raise RulesLoadError("rules.checks must be a non-empty list")
    seen_ids: set[str] = set()
    checks: list[CheckConfig] = []
    for c in checks_raw:
        check = _parse_check(c)
        if check.rule_id in seen_ids:
            raise RulesLoadError(f"duplicate rule_id: {check.rule_id}")
        seen_ids.add(check.rule_id)
        checks.append(check)
    return RulesConfig(version, schema_version, font_size, confidence_thresholds, checks)


_active_rules: RulesConfig | None = None


def set_active_rules(cfg: RulesConfig) -> None:
    global _active_rules
    _active_rules = cfg


def get_active_rules() -> RulesConfig:
    if _active_rules is None:
        raise RuntimeError("rules not loaded; main.py startup hook must run first")
    return _active_rules
