from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import db, main
from app.auth.sessions import issue_session
from app.db import Scan, User, VerdictRow
from app.main import app

BASE_TIME = datetime(2026, 9, 8, 12, 0, tzinfo=UTC)


def _scan(
    owner_id: int,
    *,
    product: str,
    mode: str = "retail_image",
    category: str = "non_food",
    status: str = "pass",
    created_at: datetime = BASE_TIME,
    rule_id: str = "r6_1_e_mrp",
    verdict_status: str = "pass",
    evidence: str = "MRP inclusive of all taxes",
) -> Scan:
    return Scan(
        owner_user_id=owner_id,
        product_name=product,
        mode=mode,
        category=category,
        image_b64="aGVsbG8=",
        image_meta={},
        ocr_payload=[{"text": product}],
        overall_status=status,
        created_at=created_at,
        verdicts=[
            VerdictRow(
                rule_id=rule_id,
                status=verdict_status,
                severity="critical",
                citation="Rule 6",
                evidence=evidence,
                evidence_bboxes=[],
                rule_version="2026-09",
            )
        ],
    )


@pytest.fixture
def repository_context(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "repository.db")
    with TestClient(app) as client:
        assert db.SessionLocal is not None
        with db.SessionLocal() as session:
            inspector = User(
                username_normalized="inspector",
                display_name="Inspector",
                password_hash="unused",
                role="inspector",
            )
            other = User(
                username_normalized="other",
                display_name="Other",
                password_hash="unused",
                role="inspector",
            )
            admin = User(
                username_normalized="admin",
                display_name="Admin",
                password_hash="unused",
                role="admin",
            )
            session.add_all([inspector, other, admin])
            session.flush()
            tokens = {
                user.username_normalized: issue_session(
                    session,
                    user,
                    now=BASE_TIME,
                    ttl=timedelta(days=365),
                ).token
                for user in (inspector, other, admin)
            }
            scans = [
                _scan(inspector.id, product="Tea", created_at=BASE_TIME - timedelta(days=2)),
                _scan(
                    inspector.id,
                    product="Tea Premium",
                    mode="ecommerce_listing",
                    status="fail",
                    verdict_status="fail",
                    evidence="tax phrase missing",
                ),
                _scan(
                    inspector.id,
                    product="Face Cream",
                    category="cosmetics",
                    status="manual_review",
                    rule_id="r7_font_size",
                    verdict_status="manual_review",
                ),
                _scan(inspector.id, product="Tie A", created_at=BASE_TIME - timedelta(days=1)),
                _scan(inspector.id, product="Tie B", created_at=BASE_TIME - timedelta(days=1)),
                _scan(other.id, product="Other Tea", status="fail", verdict_status="fail"),
            ]
            session.add_all(scans)
            session.commit()
            ids = {scan.product_name: scan.id for scan in scans}
            owner_ids = {"inspector": inspector.id, "other": other.id}
        yield {"client": client, "tokens": tokens, "ids": ids, "owner_ids": owner_ids}


def _as(context, username: str) -> TestClient:
    client = context["client"]
    client.cookies.clear()
    client.cookies.set("lmpc_session", context["tokens"][username])
    return client


def test_history_combines_filters_and_has_stable_pagination(repository_context) -> None:
    client = _as(repository_context, "inspector")
    response = client.get(
        "/api/history?q=tea&mode=ecommerce_listing&overall_status=fail&page=1&page_size=10"
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["scan_id"] == repository_context["ids"]["Tea Premium"]

    first_page = client.get("/api/history?page=1&page_size=2").json()
    assert first_page["page"] == 1
    assert first_page["page_size"] == 2
    assert first_page["total"] == 5
    assert [item["scan_id"] for item in first_page["items"]] == [
        repository_context["ids"]["Face Cream"],
        repository_context["ids"]["Tea Premium"],
    ]


def test_history_filters_category_rule_verdict_and_dates(repository_context) -> None:
    client = _as(repository_context, "inspector")
    category = client.get("/api/history?category=cosmetics").json()
    assert category["total"] == 1
    assert category["items"][0]["product"] == "Face Cream"

    verdict = client.get("/api/history?rule_id=r7_font_size&verdict_status=manual_review").json()
    assert verdict["total"] == 1

    dates = client.get(
        "/api/history?created_from=2026-09-06T12:00:00Z&created_to=2026-09-06T12:00:00Z"
    ).json()
    assert dates["total"] == 1
    assert dates["items"][0]["product"] == "Tea"


def test_search_escapes_sql_wildcards(repository_context) -> None:
    client = _as(repository_context, "inspector")
    assert client.get("/api/history?q=%25Tea").json()["total"] == 0
    assert client.get("/api/history?q=T_a").json()["total"] == 0


def test_admin_owner_filter_and_inspector_rejection(repository_context) -> None:
    owner_id = repository_context["owner_ids"]["other"]
    admin = _as(repository_context, "admin")
    assert admin.get(f"/api/history?owner_id={owner_id}").json()["total"] == 1

    inspector = _as(repository_context, "inspector")
    response = inspector.get(f"/api/history?owner_id={owner_id}")
    assert response.status_code == 403
    assert response.json()["error"] == "forbidden"


@pytest.mark.parametrize("query", ["page=0", "page_size=101", "sort=unknown"])
def test_history_rejects_invalid_pagination_or_sort(repository_context, query: str) -> None:
    response = _as(repository_context, "inspector").get(f"/api/history?{query}")
    assert response.status_code == 422


def test_dashboard_uses_same_filter_semantics(repository_context) -> None:
    body = _as(repository_context, "inspector").get("/api/dashboard?mode=ecommerce_listing").json()
    assert body["total_scans"] == 1
    assert body["status_counts"]["fail"] == 1
    assert body["top_failed_rules"][0]["rule_id"] == "r6_1_e_mrp"
