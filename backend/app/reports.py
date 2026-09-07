"""Generate PDF compliance reports for saved scans."""
from __future__ import annotations

import base64
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.db import Scan

STATUS_COLOUR = {"pass": colors.green, "fail": colors.red, "warn": colors.orange, "na": colors.grey}


def _decode_image(image_b64: str) -> io.BytesIO | None:
    """Decode a base64 image string, with or without a data URL prefix."""
    try:
        if image_b64.startswith("data:") and "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        return io.BytesIO(base64.b64decode(image_b64))
    except Exception:
        return None


def _draw_annotated_image(canvas, doc, scan: Scan) -> None:  # noqa: ANN001, ARG001
    """Reserved for Task 14 annotation rendering; intentionally not wired yet."""


def build_report(scan: Scan) -> bytes:
    """Return a PDF compliance report for a scan."""
    buffer = io.BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, title=f"LMPC Scan #{scan.id}")
    styles = getSampleStyleSheet()
    elements: list = [
        Paragraph("<b>LMPC Compliance Report</b>", styles["Title"]),
        Spacer(1, 0.5 * cm),
        Paragraph(f"<b>Scan ID:</b> {scan.id}", styles["Normal"]),
        Paragraph(f"<b>Date:</b> {scan.created_at.isoformat()}", styles["Normal"]),
        Paragraph(f"<b>Mode:</b> {scan.mode}", styles["Normal"]),
        Paragraph(f"<b>Category:</b> {scan.category}", styles["Normal"]),
    ]
    overall_colour = STATUS_COLOUR.get(scan.overall_status, colors.black)
    elements.extend([
        Paragraph(
            f"<b>Overall status:</b> <font color='{overall_colour.hexval()}'>{scan.overall_status.upper()}</font>",
            styles["Normal"],
        ),
        Spacer(1, cm),
        PageBreak(),
        Paragraph("<b>Annotated label</b>", styles["Heading2"]),
        Spacer(1, 0.3 * cm),
        PageBreak(),
        Paragraph("<b>Rule verdicts</b>", styles["Heading2"]),
        Spacer(1, 0.3 * cm),
    ])
    table_data = [["Rule", "Citation", "Status", "Evidence", "Notes"]]
    table_data.extend([
        [
            verdict.rule_id,
            verdict.citation,
            verdict.status.upper(),
            (verdict.evidence or "")[:60],
            (verdict.failure_message or "")[:60],
        ]
        for verdict in scan.verdicts
    ])
    table = Table(table_data, colWidths=[3 * cm, 5 * cm, 2 * cm, 4 * cm, 3 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    for row, verdict in enumerate(scan.verdicts, start=1):
        table.setStyle(TableStyle([("TEXTCOLOR", (2, row), (2, row), STATUS_COLOUR.get(verdict.status, colors.black))]))
    elements.extend([
        table,
        Spacer(1, cm),
        Paragraph(
            f"<i>Rules applied: rules.yaml version {scan.verdicts[0].rule_version if scan.verdicts else 'n/a'}</i>",
            styles["Normal"],
        ),
    ])
    document.build(elements, onFirstPage=lambda canvas, doc: None, onLaterPages=lambda canvas, doc: None)
    return buffer.getvalue()
