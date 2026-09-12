from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import db, main
from app.db import Inspection, Product, ProductAuditLog, Scan
from app.main import app


@pytest.fixture
def product_client(tmp_path, monkeypatch, login_client):
    db_file = tmp_path / "test_product_routes.db"
    monkeypatch.setattr(main, "DB_PATH", db_file)
    with TestClient(app) as test_client:
        insp_user = login_client(test_client, role="inspector", username="inspector_prod")
        yield test_client, insp_user


def test_product_detail_and_history(product_client):
    client, user = product_client

    with db.SessionLocal() as session:
        prod = Product(
            fingerprint_exact="fp_detail_test",
            search_key="cookies 100g",
            manufacturer_name="Britannia",
            common_name="Cookies",
            net_quantity_value=100.0,
            net_quantity_unit="g",
            category="food",
            scan_count=1,
        )
        session.add(prod)
        session.flush()

        insp = Inspection(
            owner_id=user.id,
            company_name="Britannia",
            location="Unit 1",
            status="completed",
        )
        session.add(insp)
        session.flush()

        scan = Scan(
            product_id=prod.id,
            inspection_id=insp.id,
            owner_user_id=user.id,
            mode="retail_image",
            category="food",
            overall_status="pass",
            image_b64="test",
            image_meta={},
            ocr_payload=[],
            processing_status="complete",
        )
        session.add(scan)
        session.flush()

        prod.first_scan_id = scan.id
        prod.latest_scan_id = scan.id
        session.commit()
        prod_id = prod.id
        scan_id = scan.id

    # 1. GET /api/products/{id}
    resp = client.get(f"/api/products/{prod_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(prod_id)
    assert data["manufacturer"] == "Britannia"
    assert data["quantity"] == "100"
    assert data["unit"] == "g"
    assert data["scan_count"] == 1

    # 2. GET /api/products/{id}/inspections
    resp = client.get(f"/api/products/{prod_id}/inspections")
    assert resp.status_code == 200
    assert len(resp.json()["items"]) == 1
    assert resp.json()["items"][0]["overall_status"] == "pass"

    # 3. GET /api/products/{id}/scans
    resp = client.get(f"/api/products/{prod_id}/scans")
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["scan_id"] == scan_id


def test_confirm_and_reject_match_workflow(product_client):
    client, user = product_client

    with db.SessionLocal() as session:
        p1 = Product(
            fingerprint_exact="fp_p1_match",
            search_key="noodles 420g",
            manufacturer_name="Sunfeast",
            common_name="YiPPee Noodles",
            net_quantity_value=420.0,
            net_quantity_unit="g",
            category="food",
            scan_count=1,
        )
        session.add(p1)
        session.flush()

        # Scan with suggested match (product_id None initially)
        scan = Scan(
            owner_user_id=user.id,
            mode="retail_image",
            category="food",
            overall_status="fail",
            image_b64="test",
            image_meta={},
            ocr_payload=[],
            product_match_status="suggested",
            processing_status="complete",
        )
        session.add(scan)
        session.commit()
        p1_id = p1.id
        scan_id = scan.id

    # 1. Confirm product match
    resp = client.post(
        f"/api/scans/{scan_id}/confirm-product-match",
        json={"product_id": str(p1_id)},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["scan"]["product_id"] == str(p1_id)
    assert data["scan"]["product_match_status"] == "confirmed"

    # Verify audit log recorded
    with db.SessionLocal() as session:
        audit = session.scalars(
            select(ProductAuditLog).where(ProductAuditLog.scan_id == scan_id)
        ).first()
        assert audit is not None
        assert audit.action == "confirm_match"
        assert audit.new_product_id == p1_id

    # 2. Test reject product match on a new suggested scan
    with db.SessionLocal() as session:
        scan_reject = Scan(
            owner_user_id=user.id,
            mode="retail_image",
            category="food",
            overall_status="pass",
            image_b64="test",
            image_meta={},
            ocr_payload=[],
            product_match_status="suggested",
            processing_status="complete",
            product_name="Unknown Wafer",
        )
        session.add(scan_reject)
        session.commit()
        reject_scan_id = scan_reject.id

    resp = client.post(f"/api/scans/{reject_scan_id}/reject-product-match")
    assert resp.status_code == 200
    assert resp.json()["scan"]["product_match_status"] == "rejected"
    new_prod_id = resp.json()["scan"]["product_id"]
    assert new_prod_id is not None
    assert int(new_prod_id) != p1_id


def test_admin_link_product_override(tmp_path, monkeypatch, login_client):
    db_file = tmp_path / "test_admin_link.db"
    monkeypatch.setattr(main, "DB_PATH", db_file)

    with TestClient(app) as insp_client, TestClient(app) as admin_client:
        insp_user = login_client(insp_client, role="inspector", username="insp_link")
        admin_user = login_client(admin_client, role="admin", username="admin_link")

        with db.SessionLocal() as session:
            p_target = Product(
                fingerprint_exact="fp_target",
                search_key="chips 50g",
                manufacturer_name="Lays",
                common_name="Potato Chips",
                net_quantity_value=50.0,
                net_quantity_unit="g",
                category="food",
                scan_count=0,
            )
            session.add(p_target)
            session.flush()

            scan = Scan(
                owner_user_id=insp_user.id,
                mode="retail_image",
                category="food",
                overall_status="pass",
                image_b64="test",
                image_meta={},
                ocr_payload=[],
                processing_status="complete",
            )
            session.add(scan)
            session.commit()
            target_id = p_target.id
            scan_id = scan.id

        # Non-admin cannot override link
        resp = insp_client.post(
            f"/api/scans/{scan_id}/link-product",
            json={"product_id": str(target_id), "reason": "Inspector trying override"},
        )
        assert resp.status_code == 403

        # Admin CAN override link
        resp = admin_client.post(
            f"/api/scans/{scan_id}/link-product",
            json={"product_id": str(target_id), "reason": "Admin correction"},
        )
        assert resp.status_code == 200
        assert resp.json()["scan"]["product_id"] == str(target_id)
        assert resp.json()["scan"]["product_match_status"] == "confirmed"

        with db.SessionLocal() as session:
            audit = session.scalars(
                select(ProductAuditLog).where(
                    ProductAuditLog.scan_id == scan_id, ProductAuditLog.action == "admin_override"
                )
            ).first()
            assert audit is not None
            assert audit.actor_user_id == admin_user.id
            assert audit.new_product_id == target_id
            assert audit.reason == "Admin correction"
