"""PDF renderer for an immutable inspection report."""

from __future__ import annotations

import base64
import io
from xml.sax.saxutils import escape

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.exports.view_model import InspectionReport

STATUS_COLOUR = {
    "pass": colors.green,
    "fail": colors.red,
    "warn": colors.orange,
    "manual_review": colors.darkorange,
    "na": colors.grey,
}


def decode_source_image(image_b64: str) -> io.BytesIO | None:
    """Return a validated image stream, or None for malformed evidence."""
    try:
        payload = image_b64.split(",", 1)[1] if image_b64.startswith("data:") else image_b64
        raw = base64.b64decode(payload, validate=True)
        image = io.BytesIO(raw)
        with PILImage.open(image) as parsed:
            parsed.verify()
        image.seek(0)
        return image
    except Exception:
        return None


def _paragraph(value: object, style) -> Paragraph:  # noqa: ANN001
    return Paragraph(escape(str(value)), style)


def _draw_annotated_image(canvas, doc, report: InspectionReport) -> None:  # noqa: ANN001
    if doc.page != 2:
        return
    image = decode_source_image(report.source_image_b64)
    if image is None:
        return
    try:
        with PILImage.open(image) as parsed:
            image_width, image_height = parsed.size
        image.seek(0)
        available_width, available_height = A4[0] - 4 * cm, A4[1] - 8 * cm
        scale = min(available_width / image_width, available_height / image_height)
        draw_width, draw_height = image_width * scale, image_height * scale
        x_offset, y_offset = 2 * cm, A4[1] - 4 * cm - draw_height
        canvas.drawImage(
            ImageReader(image),
            x_offset,
            y_offset,
            width=draw_width,
            height=draw_height,
        )
        for verdict in report.verdicts:
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
    except Exception:
        return


def render_pdf(report: InspectionReport) -> bytes:
    """Render a complete compliance report as PDF bytes."""
    buffer = io.BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, title=f"LMPC Scan #{report.scan_id}")
    styles = getSampleStyleSheet()
    status_colour = STATUS_COLOUR.get(report.overall_status, colors.black)
    elements: list = [
        Paragraph("<b>LMPC Compliance Report</b>", styles["Title"]),
        Spacer(1, 0.5 * cm),
        Paragraph(f"<b>Scan ID:</b> {report.scan_id}", styles["Normal"]),
        Paragraph(f"<b>Product:</b> {escape(report.product_name)}", styles["Normal"]),
        Paragraph(f"<b>Inspector:</b> {escape(report.owner_display_name)}", styles["Normal"]),
        Paragraph(f"<b>Date:</b> {report.created_at.isoformat()}", styles["Normal"]),
        Paragraph(f"<b>Mode:</b> {escape(report.mode)}", styles["Normal"]),
        Paragraph(f"<b>Category:</b> {escape(report.category)}", styles["Normal"]),
        Paragraph(
            "<b>Overall status:</b> "
            f"<font color='{status_colour.hexval()}'>{escape(report.overall_status)}</font>",
            styles["Normal"],
        ),
        Paragraph(f"<b>Analysis version:</b> {escape(report.analysis_version)}", styles["Normal"]),
        Paragraph(f"<b>Quality:</b> {escape(report.quality_summary)}", styles["Normal"]),
        Spacer(1, cm),
        PageBreak(),
        Paragraph("<b>Annotated label</b>", styles["Heading2"]),
        Spacer(1, 19 * cm),
        PageBreak(),
        Paragraph("<b>Rule verdicts</b>", styles["Heading2"]),
        Spacer(1, 0.3 * cm),
    ]
    table_data = [["Rule / citation", "Status", "Evidence", "Assessment"]]
    for verdict in report.verdicts:
        assessment = (
            f"Reasoning: {verdict.reasoning}\nMethod: {verdict.measurement_method}\n"
            f"Confidence: {verdict.confidence:.0%}\nReview: {verdict.review_state}"
        )
        table_data.append(
            [
                _paragraph(f"{verdict.rule_id}\n{verdict.citation}", styles["BodyText"]),
                _paragraph(verdict.status, styles["BodyText"]),
                _paragraph(verdict.evidence or verdict.failure_message, styles["BodyText"]),
                _paragraph(assessment, styles["BodyText"]),
            ]
        )
    table = Table(table_data, colWidths=[4.2 * cm, 2.3 * cm, 4.4 * cm, 6 * cm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    elements.extend([table, Spacer(1, cm), Paragraph("<b>Review history</b>", styles["Heading2"])])
    if report.reviews:
        for review in report.reviews:
            elements.append(
                _paragraph(
                    f"{review.created_at.isoformat()} — {review.actor_display_name}: "
                    f"{review.action}. {review.note}",
                    styles["BodyText"],
                )
            )
    else:
        elements.append(Paragraph("No review actions recorded.", styles["BodyText"]))
    versions = ", ".join(report.rules_versions) or "n/a"
    elements.extend(
        [
            Spacer(1, cm),
            Paragraph(f"<i>Rules applied: {escape(versions)}</i>", styles["Normal"]),
        ]
    )
    document.build(
        elements,
        onFirstPage=lambda canvas, doc: None,
        onLaterPages=lambda canvas, doc: _draw_annotated_image(canvas, doc, report),
    )
    return buffer.getvalue()
