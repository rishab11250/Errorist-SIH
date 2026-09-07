"""Generate PDF compliance reports for saved scans."""
from __future__ import annotations

import base64
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
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


def _draw_annotated_image(canvas, doc, scan: Scan) -> None:  # noqa: ANN001
    """Render the stored label and normalised verdict boxes on page two."""
    if doc.page != 2:
        return
    image = _decode_image(scan.image_b64)
    if image is None:
        return
    try:
        from PIL import Image as PILImage

        pil_image = PILImage.open(image)
        image_width, image_height = pil_image.size
        image.seek(0)
    except Exception:
        return
    available_width, available_height = A4[0] - 4 * cm, A4[1] - 8 * cm
    scale = min(available_width / image_width, available_height / image_height)
    draw_width, draw_height = image_width * scale, image_height * scale
    x_offset, y_offset = 2 * cm, A4[1] - 4 * cm - draw_height
    canvas.drawImage(ImageReader(image), x_offset, y_offset, width=draw_width, height=draw_height)
    for verdict in scan.verdicts:
        canvas.setStrokeColor(STATUS_COLOUR.get(verdict.status, colors.black))
        canvas.setLineWidth(1.5)
        for x, y, width, height in verdict.evidence_bboxes:
            canvas.rect(
                x_offset + x * draw_width,
                y_offset + draw_height - (y + height) * draw_height,
                width * draw_width,
                height * draw_height,
                stroke=1,
                fill=0,
            )


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
    document.build(
        elements,
        onFirstPage=lambda canvas, doc: None,
        onLaterPages=lambda canvas, doc: _draw_annotated_image(canvas, doc, scan),
    )
    return buffer.getvalue()
