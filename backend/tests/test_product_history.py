from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, Inspection, Product, Scan, User, VerdictRow
from app.product_history import (
    calculate_inspection_summary,
    compare_verdicts,
    find_previous_inspection_scan,
    get_scan_historical_context,
)


@pytest.fixture
def db_session(tmp_path):
    db_file = tmp_path / "test_history.db"
    engine = create_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    yield session
    session.close()
    engine.dispose()


def test_compare_verdicts_semantics():
    # 1. previous fail -> current fail = repeated non-compliance
    prev = [{"rule_id": "r6_2_consumer_care", "status": "fail"}]
    curr = [{"rule_id": "r6_2_consumer_care", "status": "fail"}]
    deltas, alert = compare_verdicts(prev, curr)
    assert len(deltas) == 1
    assert deltas[0].direction == "unchanged"
    assert deltas[0].repeated_non_compliance is True
    assert alert is not None
    assert alert.type == "repeated_non_compliance"

    # 2. previous fail -> current pass = improved
    curr_pass = [{"rule_id": "r6_2_consumer_care", "status": "pass"}]
    deltas, alert = compare_verdicts(prev, curr_pass)
    assert deltas[0].direction == "improved"
    assert deltas[0].repeated_non_compliance is False
    assert alert is None

    # 3. previous pass -> current fail = regressed
    prev_pass = [{"rule_id": "r6_1_e_mrp", "status": "pass"}]
    curr_fail = [{"rule_id": "r6_1_e_mrp", "status": "fail"}]
    deltas, alert = compare_verdicts(prev_pass, curr_fail)
    assert deltas[0].direction == "regressed"
    assert deltas[0].repeated_non_compliance is False
    assert alert is None

    # 4. previous pass -> current pass = unchanged
    deltas, alert = compare_verdicts(prev_pass, [{"rule_id": "r6_1_e_mrp", "status": "pass"}])
    assert deltas[0].direction == "unchanged"
    assert deltas[0].repeated_non_compliance is False
    assert alert is None

    # 5. manual_review transitions
    prev_mr = [{"rule_id": "r6_1_e_mrp", "status": "manual_review"}]
    deltas, alert = compare_verdicts(prev_mr, [{"rule_id": "r6_1_e_mrp", "status": "fail"}])
    assert deltas[0].repeated_non_compliance is False
    assert alert is None

    deltas, alert = compare_verdicts(prev, [{"rule_id": "r6_2_consumer_care", "status": "manual_review"}])
    assert deltas[0].repeated_non_compliance is False
    assert alert is None


def test_previous_inspection_lookup_and_same_inspection_duplicates(db_session: Session):
    # Setup Inspector user
    user = User(username_normalized="inspector1", display_name="Inspector 1", password_hash="x", role="inspector")
    db_session.add(user)
    db_session.flush()

    # Product P1
    prod = Product(
        fingerprint_exact="fp_p1",
        search_key="noodles 500g",
        manufacturer_name="ABC Foods",
        common_name="Noodles",
        net_quantity_value=500.0,
        net_quantity_unit="g",
        category="food",
    )
    db_session.add(prod)
    db_session.flush()

    now = datetime.now(UTC)

    # Inspection I1 (yesterday)
    insp1 = Inspection(
        owner_id=user.id,
        company_name="ABC Foods",
        location="Site A",
        status="completed",
        started_at=now - timedelta(days=2),
        completed_at=now - timedelta(days=2),
    )
    db_session.add(insp1)
    db_session.flush()

    # Scan in I1 failing consumer care
    scan1 = Scan(
        created_at=now - timedelta(days=2),
        product_id=prod.id,
        inspection_id=insp1.id,
        processing_status="complete",
        overall_status="fail",
        image_b64="x",
        image_meta={},
        ocr_payload=[],
        verdicts=[
            VerdictRow(
                rule_id="r6_2_consumer_care",
                status="fail",
                severity="critical",
                citation="Rule 6(2)",
                rule_version="1.0",
            )
        ],
    )
    db_session.add(scan1)
    db_session.flush()

    # Inspection I2 (today)
    insp2 = Inspection(
        owner_id=user.id,
        company_name="ABC Foods",
        location="Site A",
        status="open",
        started_at=now,
    )
    db_session.add(insp2)
    db_session.flush()

    # Two scans of same product in I2 (evidence shots)
    scan2_a = Scan(
        created_at=now + timedelta(minutes=1),
        product_id=prod.id,
        inspection_id=insp2.id,
        processing_status="complete",
        overall_status="fail",
        image_b64="x",
        image_meta={},
        ocr_payload=[],
        verdicts=[
            VerdictRow(
                rule_id="r6_2_consumer_care",
                status="fail",
                severity="critical",
                citation="Rule 6(2)",
                rule_version="1.0",
            )
        ],
    )
    scan2_b = Scan(
        created_at=now + timedelta(minutes=5),
        product_id=prod.id,
        inspection_id=insp2.id,
        processing_status="complete",
        overall_status="fail",
        image_b64="x",
        image_meta={},
        ocr_payload=[],
        verdicts=[
            VerdictRow(
                rule_id="r6_2_consumer_care",
                status="fail",
                severity="critical",
                citation="Rule 6(2)",
                rule_version="1.0",
            )
        ],
    )
    db_session.add_all([scan2_a, scan2_b])
    db_session.commit()

    # Verify find_previous_inspection_scan finds I1 (not scan2_a)
    prev_insp, prev_scan = find_previous_inspection_scan(
        db_session,
        product_id=prod.id,
        current_inspection_id=insp2.id,
        current_scan_id=scan2_b.id,
    )
    assert prev_insp is not None
    assert prev_insp.id == insp1.id
    assert prev_scan is not None
    assert prev_scan.id == scan1.id

    # Inspection summary for I2:
    # 1 Product, 2 Scans, 1 Fail, 1 Repeated Non-Compliance
    summary = calculate_inspection_summary(db_session, insp2.id)
    assert summary["product_count"] == 1
    assert summary["scan_count"] == 2
    assert summary["fail_count"] == 1
    assert summary["pass_count"] == 0
    assert summary["repeated_non_compliance_count"] == 1


def test_inspection_summary_no_repeated_when_first_inspection(db_session: Session):
    user = User(username_normalized="inspector2", display_name="Inspector 2", password_hash="x", role="inspector")
    db_session.add(user)
    db_session.flush()

    prod = Product(
        fingerprint_exact="fp_new",
        search_key="biscuits 200g",
        manufacturer_name="XYZ Bakery",
        common_name="Biscuits",
        net_quantity_value=200.0,
        net_quantity_unit="g",
        category="food",
    )
    db_session.add(prod)
    db_session.flush()

    insp = Inspection(
        owner_id=user.id,
        company_name="XYZ Bakery",
        location="Shop 1",
        status="open",
        started_at=datetime.now(UTC),
    )
    db_session.add(insp)
    db_session.flush()

    scan = Scan(
        created_at=datetime.now(UTC),
        product_id=prod.id,
        inspection_id=insp.id,
        processing_status="complete",
        overall_status="fail",
        image_b64="x",
        image_meta={},
        ocr_payload=[],
        verdicts=[
            VerdictRow(
                rule_id="r6_1_e_mrp",
                status="fail",
                severity="critical",
                citation="Rule 6(1)(e)",
                rule_version="1.0",
            )
        ],
    )
    db_session.add(scan)
    db_session.commit()

    summary = calculate_inspection_summary(db_session, insp.id)
    assert summary["product_count"] == 1
    assert summary["scan_count"] == 1
    assert summary["fail_count"] == 1
    assert summary["repeated_non_compliance_count"] == 0

    ctx = get_scan_historical_context(
        db_session,
        product_id=prod.id,
        current_inspection_id=insp.id,
        current_scan_id=scan.id,
        current_verdicts=scan.verdicts,
    )
    assert ctx["previous_inspection"] is None
    assert ctx["comparison"] == []
    assert ctx["historical_alert"] is None
