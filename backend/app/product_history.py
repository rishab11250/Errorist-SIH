"""Historical compliance comparison, inspection snapshots, and repeated non-compliance detection."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Inspection, Scan, VerdictRow

Direction = Literal["improved", "regressed", "unchanged"]


@dataclass
class RuleDelta:
    rule_id: str
    status_before: str | None
    status_after: str
    changed: bool
    direction: Direction
    repeated_non_compliance: bool


@dataclass
class HistoricalAlert:
    type: str = "repeated_non_compliance"
    message: str = (
        "This product was previously found non-compliant for the same requirement and remains "
        "non-compliant in the current inspection."
    )
    recommended_action: str = "review_previous_inspection"


def compare_verdicts(
    previous_verdicts: list[VerdictRow | dict],
    current_verdicts: list[VerdictRow | dict],
) -> tuple[list[RuleDelta], HistoricalAlert | None]:
    """Calculate rule-by-rule status deltas and detect repeated non-compliance per PRD Section 27.

    Improved: (fail or manual_review) -> pass
    Regressed: pass -> fail
    Repeated non-compliance: fail -> fail
    Manual review transitions never become automatic repeated non-compliance.
    """
    prev_map: dict[str, str] = {}
    for v in previous_verdicts:
        r_id = v.rule_id if hasattr(v, "rule_id") else v.get("rule_id")
        stat = v.status if hasattr(v, "status") else v.get("status")
        if r_id and stat:
            prev_map[r_id] = stat

    deltas: list[RuleDelta] = []
    has_repeated = False

    for curr in current_verdicts:
        r_id = curr.rule_id if hasattr(curr, "rule_id") else curr.get("rule_id")
        curr_status = curr.status if hasattr(curr, "status") else curr.get("status")
        if not r_id or not curr_status:
            continue

        prev_status = prev_map.get(r_id)
        if prev_status is None:
            # Rule not evaluated previously
            deltas.append(
                RuleDelta(
                    rule_id=r_id,
                    status_before=None,
                    status_after=curr_status,
                    changed=True,
                    direction="unchanged",
                    repeated_non_compliance=False,
                )
            )
            continue

        changed = prev_status != curr_status
        direction: Direction = "unchanged"
        repeated = False

        if curr_status == "pass":
            if prev_status in ("fail", "manual_review", "warn"):
                direction = "improved"
            else:
                direction = "unchanged"
        elif curr_status == "fail":
            if prev_status == "pass":
                direction = "regressed"
            elif prev_status == "fail":
                direction = "unchanged"
                repeated = True
            elif prev_status == "manual_review":
                # Manual review to fail is a regression/new fail, NOT repeated confirmed violation
                direction = "regressed"
            else:
                direction = "unchanged"
        elif curr_status == "manual_review":
            direction = (
                "unchanged"
                if prev_status == "manual_review"
                else ("regressed" if prev_status == "pass" else "improved")
            )
        else:
            direction = "unchanged" if not changed else "regressed"

        if repeated:
            has_repeated = True

        deltas.append(
            RuleDelta(
                rule_id=r_id,
                status_before=prev_status,
                status_after=curr_status,
                changed=changed,
                direction=direction,
                repeated_non_compliance=repeated,
            )
        )

    alert = HistoricalAlert() if has_repeated else None
    return deltas, alert


def find_previous_inspection_scan(
    session: Session,
    product_id: int,
    current_inspection_id: int | None,
    current_scan_id: int | None = None,
) -> tuple[Inspection | None, Scan | None]:
    """Find latest earlier inspection containing this product, and its latest scan snapshot.

    If current_inspection_id is provided, looks for earlier inspections.
    If no inspection exists, falls back to the latest earlier scan of this product.
    """
    if current_inspection_id is not None:
        current_insp = session.get(Inspection, current_inspection_id)
        current_started = current_insp.started_at if current_insp else None

        # Look for earlier completed or open inspections containing this product
        insp_query = (
            select(Inspection)
            .join(Scan, Scan.inspection_id == Inspection.id)
            .where(
                Scan.product_id == product_id,
                Inspection.id != current_inspection_id,
                Inspection.status != "cancelled",
            )
        )
        if current_started:
            insp_query = insp_query.where(Inspection.started_at < current_started)

        insp_query = insp_query.order_by(Inspection.started_at.desc())
        previous_insp = session.scalars(insp_query).first()

        if previous_insp is not None:
            # Get latest valid analyzed scan for this product in that previous inspection
            prev_scan = session.scalars(
                select(Scan)
                .where(
                    Scan.product_id == product_id,
                    Scan.inspection_id == previous_insp.id,
                    Scan.processing_status == "complete",
                )
                .order_by(Scan.created_at.desc())
            ).first()
            return previous_insp, prev_scan

    # Fallback when no prior inspection exists or current scan is uninspected
    scan_query = select(Scan).where(
        Scan.product_id == product_id,
        Scan.processing_status == "complete",
    )
    if current_inspection_id is not None:
        scan_query = scan_query.where(
            (Scan.inspection_id == None) | (Scan.inspection_id != current_inspection_id)  # noqa: E711
        )
    if current_scan_id is not None:
        scan_query = scan_query.where(Scan.id != current_scan_id)

    scan_query = scan_query.order_by(Scan.created_at.desc())
    prior_scan = session.scalars(scan_query).first()

    prior_insp = (
        session.get(Inspection, prior_scan.inspection_id)
        if prior_scan and prior_scan.inspection_id
        else None
    )
    return prior_insp, prior_scan


def get_scan_historical_context(
    session: Session,
    product_id: int | None,
    current_inspection_id: int | None,
    current_scan_id: int | None,
    current_verdicts: list[VerdictRow | dict],
) -> dict[str, Any]:
    """Produce previous inspection, previous scan, comparison, and historical alert context."""
    if not product_id:
        return {
            "previous_inspection": None,
            "previous_scan": None,
            "comparison": [],
            "historical_alert": None,
        }

    prev_insp, prev_scan = find_previous_inspection_scan(
        session,
        product_id=product_id,
        current_inspection_id=current_inspection_id,
        current_scan_id=current_scan_id,
    )

    if prev_scan is None:
        return {
            "previous_inspection": None,
            "previous_scan": None,
            "comparison": [],
            "historical_alert": None,
        }

    deltas, alert = compare_verdicts(prev_scan.verdicts, current_verdicts)
    deltas_dicts = [asdict(d) for d in deltas]

    prev_insp_dict = {
        "inspection_id": str(prev_insp.id)
        if prev_insp
        else str(prev_scan.inspection_id or prev_scan.id),
        "scanned_at": prev_scan.created_at.isoformat(),
        "overall_status": prev_scan.overall_status,
    }

    prev_scan_dict = {
        "scan_id": prev_scan.id,
        "scanned_at": prev_scan.created_at.isoformat(),
        "overall_status": prev_scan.overall_status,
        "comparison": deltas_dicts,
    }

    return {
        "previous_inspection": prev_insp_dict,
        "previous_scan": prev_scan_dict,
        "comparison": deltas_dicts,
        "historical_alert": asdict(alert) if alert else None,
    }


def calculate_inspection_summary(session: Session, inspection_id: int) -> dict[str, int]:
    """Calculate authoritative inspection summary counts per PRD Section 53.

    Counts are evaluated at the Product level (using the latest analyzed scan per product):
    - product_count
    - scan_count
    - pass_count
    - fail_count
    - manual_review_count
    - repeated_non_compliance_count
    """
    scans = session.scalars(
        select(Scan).where(Scan.inspection_id == inspection_id).order_by(Scan.created_at.desc())
    ).all()

    scan_count = len(scans)
    if scan_count == 0:
        return {
            "product_count": 0,
            "scan_count": 0,
            "pass_count": 0,
            "fail_count": 0,
            "manual_review_count": 0,
            "repeated_non_compliance_count": 0,
        }

    # Group latest scan snapshot by product_id
    product_snapshots: dict[int, Scan] = {}
    unmatched_scans: list[Scan] = []

    for scan in scans:
        if scan.processing_status != "complete":
            continue
        if scan.product_id is not None:
            if scan.product_id not in product_snapshots:
                product_snapshots[scan.product_id] = scan
        else:
            unmatched_scans.append(scan)

    product_count = len(product_snapshots) + len(unmatched_scans)
    pass_count = 0
    fail_count = 0
    manual_review_count = 0
    repeated_non_compliance_count = 0

    for prod_id, snap in product_snapshots.items():
        if snap.overall_status == "pass":
            pass_count += 1
        elif snap.overall_status == "fail":
            fail_count += 1
        else:
            manual_review_count += 1

        # Check if product has repeated non-compliance in this inspection
        hist = get_scan_historical_context(
            session,
            product_id=prod_id,
            current_inspection_id=inspection_id,
            current_scan_id=snap.id,
            current_verdicts=snap.verdicts,
        )
        if hist.get("historical_alert") is not None:
            repeated_non_compliance_count += 1

    for scan in unmatched_scans:
        if scan.overall_status == "pass":
            pass_count += 1
        elif scan.overall_status == "fail":
            fail_count += 1
        else:
            manual_review_count += 1

    return {
        "product_count": product_count,
        "scan_count": scan_count,
        "pass_count": pass_count,
        "fail_count": fail_count,
        "manual_review_count": manual_review_count,
        "repeated_non_compliance_count": repeated_non_compliance_count,
    }
