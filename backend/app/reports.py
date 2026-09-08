"""Backward-compatible PDF report helper."""

from __future__ import annotations

from app.db import Scan
from app.exports.pdf import render_pdf
from app.exports.view_model import build_report_model


def build_report(scan: Scan) -> bytes:
    """Return PDF bytes for callers that already loaded all scan relations."""
    return render_pdf(build_report_model(scan))
