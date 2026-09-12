from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import Base, Product
from app.product_identity import (
    clean_manufacturer_name,
    compute_fingerprint,
    normalize_identity_string,
    parse_net_quantity,
    resolve_product_identity,
)


@pytest.fixture
def db_session(tmp_path):
    db_file = tmp_path / "test_identity.db"
    engine = create_engine(f"sqlite:///{db_file}")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    yield session
    session.close()
    engine.dispose()


def test_normalize_identity_string():
    assert normalize_identity_string("  ABC   Foods  Pvt. Ltd.  ") == "abc foods pvt ltd"
    assert normalize_identity_string("Maggi® 2-Minute Noodles!") == "maggi 2 minute noodles"
    assert normalize_identity_string("") == ""
    assert normalize_identity_string(None) == ""


def test_parse_net_quantity():
    val, unit = parse_net_quantity("Net Wt. 500 g")
    assert val == 500.0
    assert unit == "g"

    val, unit = parse_net_quantity("1.5 kg")
    assert val == 1.5
    assert unit == "kg"

    val, unit = parse_net_quantity("250 ml")
    assert val == 250.0
    assert unit == "ml"

    val, unit = parse_net_quantity("1 Litre")
    assert val == 1.0
    assert unit == "l"

    val, unit = parse_net_quantity("invalid string")
    assert val is None
    assert unit is None


def test_clean_manufacturer_name():
    assert clean_manufacturer_name("Mfg by: Nestlé India Ltd, Plot 10, Industrial Area") == "Nestlé India Ltd"
    assert clean_manufacturer_name("Marketed by: Britannia Industries Ltd; Village...") == "Britannia Industries Ltd"
    assert clean_manufacturer_name("Haldiram Snacks Pvt Ltd") == "Haldiram Snacks Pvt Ltd"


def test_fingerprint_ignores_comparison_fields():
    # Inspection 1: MRP = Rs 50, Consumer care = email1@test.com
    fp1, key1 = compute_fingerprint(
        manufacturer_name="ABC Foods Pvt Ltd",
        common_name="Instant Noodles",
        net_quantity_value=500.0,
        net_quantity_unit="g",
        category="food",
    )

    # Inspection 2: MRP = Rs 60, Consumer care = email2@test.com
    # The identity fields are identical
    fp2, key2 = compute_fingerprint(
        manufacturer_name="abc foods pvt. ltd.",
        common_name="instant   noodles",
        net_quantity_value=500.0,
        net_quantity_unit="g",
        category="food",
    )

    assert fp1 == fp2
    assert key1 == key2


def test_fingerprint_differs_when_identity_changes():
    fp1, _ = compute_fingerprint("ABC Foods", "Noodles", 500.0, "g", "food")
    # Different quantity
    fp2, _ = compute_fingerprint("ABC Foods", "Noodles", 200.0, "g", "food")
    # Different manufacturer
    fp3, _ = compute_fingerprint("XYZ Foods", "Noodles", 500.0, "g", "food")
    # Different unit
    fp4, _ = compute_fingerprint("ABC Foods", "Noodles", 500.0, "kg", "food")

    assert fp1 != fp2
    assert fp1 != fp3
    assert fp1 != fp4


def test_resolve_exact_match(db_session: Session):
    prod1, status1, candidates1 = resolve_product_identity(
        db_session,
        manufacturer_name="ABC Foods",
        common_name="Noodles",
        net_quantity_value=500.0,
        net_quantity_unit="g",
        category="food",
    )
    db_session.commit()

    assert prod1 is not None
    assert status1 == "auto_matched"
    assert candidates1 == []

    # Second lookup with same identity
    prod2, status2, candidates2 = resolve_product_identity(
        db_session,
        manufacturer_name="abc foods",
        common_name="noodles",
        net_quantity_value=500.0,
        net_quantity_unit="g",
        category="food",
    )
    assert prod2.id == prod1.id
    assert status2 == "auto_matched"
    assert candidates2 == []


def test_resolve_fuzzy_auto_match_high_confidence(db_session: Session):
    prod1, _, _ = resolve_product_identity(
        db_session,
        manufacturer_name="Sunfeast YiPPee Noodles",
        common_name="Instant Noodles",
        net_quantity_value=420.0,
        net_quantity_unit="g",
        category="food",
    )
    db_session.commit()

    # Minor typo in manufacturer (OCR glitch: Sunfest YiPPee Noodels)
    prod2, status, candidates = resolve_product_identity(
        db_session,
        manufacturer_name="Sunfest YiPPee Noodels",
        common_name="Instant Noodles",
        net_quantity_value=420.0,
        net_quantity_unit="g",
        category="food",
    )
    # Should auto match since score >= 90
    assert status == "auto_matched"
    assert prod2 is not None
    assert prod2.id == prod1.id
    assert candidates == []


def test_resolve_suggested_match_medium_confidence(db_session: Session):
    prod1, _, _ = resolve_product_identity(
        db_session,
        manufacturer_name="Britannia Industries Limited",
        common_name="Good Day Butter Cookies",
        net_quantity_value=100.0,
        net_quantity_unit="g",
        category="food",
    )
    db_session.commit()

    # Moderately different variation that scores between 75 and 89
    # E.g. "Britannia Industries" and "Good Day Cookies" (score ~86.2)
    prod2, status, candidates = resolve_product_identity(
        db_session,
        manufacturer_name="Britannia Industries",
        common_name="Good Day Cookies",
        net_quantity_value=100.0,
        net_quantity_unit="g",
        category="food",
    )
    assert status == "suggested"
    assert prod2 is None
    assert len(candidates) >= 1
    assert candidates[0]["product_id"] == str(prod1.id)
    assert 75.0 <= candidates[0]["score"] < 90.0


def test_resolve_new_product_low_confidence(db_session: Session):
    prod1, _, _ = resolve_product_identity(
        db_session,
        manufacturer_name="ABC Foods",
        common_name="Choco Chip Cookies",
        net_quantity_value=100.0,
        net_quantity_unit="g",
        category="food",
    )
    db_session.commit()

    # Completely different product with same weight
    prod2, status, candidates = resolve_product_identity(
        db_session,
        manufacturer_name="Totally Different Bakery",
        common_name="Spicy Sev Bhujia",
        net_quantity_value=100.0,
        net_quantity_unit="g",
        category="food",
    )
    assert status == "auto_matched"
    assert prod2 is not None
    assert prod2.id != prod1.id
    assert candidates == []
