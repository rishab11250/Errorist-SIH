"""Spreadsheet-safe CSV renderer for scan report summaries."""

from __future__ import annotations

import csv
import io
from collections.abc import Iterable

from app.exports.view_model import InspectionReport

_FIELDS = (
    "scan_id",
    "created_at",
    "product_name",
    "owner_display_name",
    "mode",
    "category",
    "overall_status",
    "analysis_version",
    "verdict_count",
    "pass_count",
    "fail_count",
    "warn_count",
    "manual_review_count",
    "na_count",
    "rules_versions",
)


def safe_csv_cell(value: object) -> str:
    """Neutralize values spreadsheet programs may interpret as formulas."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in {"=", "+", "-", "@"} else text


def render_csv(reports: Iterable[InspectionReport]) -> bytes:
    """Render one aggregate, formula-safe CSV row per scan."""
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=_FIELDS, lineterminator="\r\n")
    writer.writeheader()
    for report in reports:
        counts = {
            status: sum(verdict.status == status for verdict in report.verdicts)
            for status in ("pass", "fail", "warn", "manual_review", "na")
        }
        row = {
            "scan_id": report.scan_id,
            "created_at": report.created_at.isoformat(),
            "product_name": report.product_name,
            "owner_display_name": report.owner_display_name,
            "mode": report.mode,
            "category": report.category,
            "overall_status": report.overall_status,
            "analysis_version": report.analysis_version,
            "verdict_count": len(report.verdicts),
            "pass_count": counts["pass"],
            "fail_count": counts["fail"],
            "warn_count": counts["warn"],
            "manual_review_count": counts["manual_review"],
            "na_count": counts["na"],
            "rules_versions": "|".join(report.rules_versions),
        }
        writer.writerow({key: safe_csv_cell(value) for key, value in row.items()})
    return output.getvalue().encode("utf-8")
