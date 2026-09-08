from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import db, main
from app.auth.sessions import issue_session
from app.db import ReviewAction, Scan, User, VerdictRow
from app.main import app


def _scan(owner_user_id: int | None, *, with_verdict: bool = False) -> Scan:
    verdicts = []
    if with_verdict:
        verdicts.append(
            VerdictRow(
                rule_id="r6_1_e_mrp",
                status="manual_review",
                severity="critical",
                citation="Rule 6(1)(e)",
                evidence="MRP Rs.99",
                evidence_bboxes=[],
                rule_version="2026-09",
            )
        )
    return Scan(
        owner_user_id=owner_user_id,
        mode="retail_image",
        category="non_food",
        image_b64="aGVsbG8=",
        image_meta={},
        ocr_payload=[],
        overall_status="manual_review",
        verdicts=verdicts,
    )


@pytest.fixture
def access_context(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "permissions.db")
    with TestClient(app) as client:
        assert db.SessionLocal is not None
        with db.SessionLocal() as session:
            users = [
                User(
                    username_normalized=name,
                    display_name=name.title(),
                    password_hash="unused",
                    role=role,
                )
                for name, role in (
                    ("inspector", "inspector"),
                    ("other", "inspector"),
                    ("admin", "admin"),
                )
            ]
            session.add_all(users)
            session.flush()
            tokens = {
                user.username_normalized: issue_session(
                    session,
                    user,
                    now=datetime.now(UTC),
                    ttl=timedelta(hours=8),
                ).token
                for user in users
            }
            owned = _scan(users[0].id, with_verdict=True)
            other = _scan(users[1].id, with_verdict=True)
            legacy = _scan(None)
            session.add_all([owned, other, legacy])
            session.commit()
            result = {
                "client": client,
                "tokens": tokens,
                "owned_id": owned.id,
                "other_id": other.id,
                "legacy_id": legacy.id,
                "owned_verdict_id": owned.verdicts[0].id,
                "other_verdict_id": other.verdicts[0].id,
            }
        yield result


def _authenticate(context, username: str | None) -> TestClient:
    client = context["client"]
    client.cookies.clear()
    if username is not None:
        client.cookies.set("lmpc_session", context["tokens"][username])
    return client


@pytest.mark.parametrize("path", ["/api/scan/1", "/api/history", "/api/dashboard", "/api/report/1"])
def test_protected_routes_reject_anonymous(access_context, path: str) -> None:
    assert _authenticate(access_context, None).get(path).status_code == 401


def test_inspector_cannot_read_or_review_another_scan(access_context) -> None:
    client = _authenticate(access_context, "inspector")
    other_id = access_context["other_id"]
    assert client.get(f"/api/scan/{other_id}").status_code == 404
    assert (
        client.post(
            f"/api/scan/{other_id}/reviews",
            json={"action": "confirmed", "note": "not mine"},
        ).status_code
        == 404
    )
    assert client.get(f"/api/scan/{access_context['legacy_id']}").status_code == 404


def test_admin_can_read_legacy_and_other_scans(access_context) -> None:
    client = _authenticate(access_context, "admin")
    assert client.get(f"/api/scan/{access_context['legacy_id']}").status_code == 200
    assert client.get(f"/api/scan/{access_context['other_id']}").status_code == 200


def test_review_actions_are_append_only(access_context) -> None:
    client = _authenticate(access_context, "inspector")
    scan_id = access_context["owned_id"]
    for action in ("needs_follow_up", "resolved"):
        response = client.post(
            f"/api/scan/{scan_id}/reviews",
            json={"action": action, "note": action},
        )
        assert response.status_code == 201
        assert response.json()["actor_display_name"] == "Inspector"
    body = client.get(f"/api/scan/{scan_id}").json()
    assert [item["action"] for item in body["review_actions"]] == [
        "needs_follow_up",
        "resolved",
    ]
    assert db.SessionLocal is not None
    with db.SessionLocal() as session:
        assert session.query(ReviewAction).filter_by(scan_id=scan_id).count() == 2


def test_verdict_review_updates_state_and_validates_membership(access_context) -> None:
    client = _authenticate(access_context, "inspector")
    scan_id = access_context["owned_id"]
    verdict_id = access_context["owned_verdict_id"]
    response = client.post(
        f"/api/scan/{scan_id}/reviews",
        json={"action": "confirmed", "note": "checked", "verdict_id": verdict_id},
    )
    assert response.status_code == 201
    body = client.get(f"/api/scan/{scan_id}").json()
    assert body["verdicts"][0]["review_state"] == "confirmed"

    wrong = client.post(
        f"/api/scan/{scan_id}/reviews",
        json={
            "action": "confirmed",
            "note": "wrong verdict",
            "verdict_id": access_context["other_verdict_id"],
        },
    )
    assert wrong.status_code == 422


@pytest.mark.parametrize("action", ["false_positive", "needs_follow_up"])
def test_explanatory_review_actions_require_note(access_context, action: str) -> None:
    client = _authenticate(access_context, "inspector")
    response = client.post(
        f"/api/scan/{access_context['owned_id']}/reviews",
        json={"action": action, "note": "  "},
    )
    assert response.status_code == 422
