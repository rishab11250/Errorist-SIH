# Operations and Frontend Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local inspector/admin security, auditable reviews, server-backed repository and dashboard operations, editable exports, and a consistent accessible Next.js workspace built only from free/open UI source.

**Architecture:** FastAPI owns identity, opaque sessions, authorization, search, review history, and exports. SQLite schema revision `0003_operations` extends the inspection-v2 database. Next.js proxies same-origin `/api` requests, uses one typed client and one Tailwind token system, and composes shadcn/ui primitives with three normalized free motion accents.

**Tech Stack:** FastAPI, Pydantic 2, SQLAlchemy 2, Alembic, SQLite, argon2-cffi, ReportLab, python-docx, pytest; Next.js 14, React 18, TypeScript, Tailwind 3, shadcn/ui/Radix open code, Motion, Lucide, Recharts, Sonner, Vitest, Testing Library.

## Global Constraints

- Execute only after `2026-09-07-inspection-intelligence.md` reaches its completion gate.
- Roles are exactly `inspector` and `admin`.
- Inspectors access their own scans only; administrators access all scans.
- Legacy scans have `owner_user_id = NULL`, are admin-only, and may be assigned explicitly.
- Session cookies are opaque, `HttpOnly`, `SameSite=Lax`, and `Secure` outside local HTTP development.
- Store only a SHA-256 hash of each random 32-byte session token.
- No self-registration, email recovery, OAuth, remote identity service, or paid UI content.
- All authorization is enforced by FastAPI even when the frontend hides a control.
- All list routes return `{items, page, page_size, total}` with deterministic ordering.
- PDF and DOCX use the same report view model; CSV neutralizes spreadsheet formulas.
- Keep `GET /api/report/{id}` as a PDF compatibility alias.
- Use responsive type tokens and browser/OS scaling; do not add a user font-size control.
- UI motion must respect `prefers-reduced-motion` and may not block input.
- Backend commands use `backend/.venv/bin/python`; `uv` is not required.

---

## Target file map

```text
backend/app/
  auth/
    __init__.py
    models.py             current-user values
    passwords.py          Argon2 hashing
    sessions.py           token issue/verify/revoke
    dependencies.py       require_user/require_admin
    routes.py             login/logout/me
  users/routes.py         admin user management
  reviews/routes.py       append-only review API
  repositories/scans.py   authorized filters/pagination
  exports/
    view_model.py
    pdf.py
    docx.py
    csv.py
    routes.py
  errors.py               extend existing request ID + error envelope
  settings.py             environment configuration
backend/scripts/bootstrap_admin.py
backend/migrations/versions/0003_operations.py
frontend/app/
  (public)/login/page.tsx
  (workspace)/layout.tsx
  (workspace)/page.tsx
  (workspace)/scan/[id]/page.tsx
  (workspace)/history/page.tsx
  (workspace)/dashboard/page.tsx
  (workspace)/admin/users/page.tsx
frontend/components/ui/           shared open-code primitives
frontend/components/auth/
frontend/components/inspection/
frontend/components/repository/
frontend/components/dashboard/
frontend/lib/api-client.ts
frontend/lib/auth.tsx
frontend/middleware.ts
frontend/THIRD_PARTY_NOTICES.md
frontend/tests/server.ts
```

## Task 1: Add the operations schema migration

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/app/db.py`
- Create: `backend/migrations/versions/0003_operations.py`
- Create: `backend/tests/test_operations_migration.py`

**Interfaces:**
- Consumes: Alembic revision `0002_inspection_v2`.
- Produces: `User`, `SessionRow`, `ReviewAction`, nullable `Scan.owner_user_id`, and revision `0003_operations`.

- [x] **Step 1: Add security and export dependencies**

Add to `backend/pyproject.toml`:

```toml
"argon2-cffi>=25.1,<26",
"python-docx>=1.2,<2",
```

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pip install -e '.[dev]'`.

Expected: exit 0; importing `argon2` and `docx` succeeds.

- [x] **Step 2: Write migration tests**

```python
def test_operations_migration_creates_auth_and_review_tables(tmp_path):
    path = tmp_path / "fresh.db"
    upgrade_database(path)
    inspector = inspect(create_engine(f"sqlite:///{path}"))
    assert {"users", "sessions", "review_actions"} <= set(inspector.get_table_names())
    assert "owner_user_id" in {column["name"] for column in inspector.get_columns("scans")}


def test_legacy_scan_remains_unowned_after_operations_migration(inspection_v2_database):
    upgrade_database(inspection_v2_database)
    with sqlite3.connect(inspection_v2_database) as connection:
        assert connection.execute("SELECT owner_user_id FROM scans WHERE id = 7").fetchone() == (None,)
```

- [x] **Step 3: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_operations_migration.py -q`.

Expected: FAIL because revision `0003_operations` is absent.

- [x] **Step 4: Add revision `0003_operations`**

The migration creates:

```python
op.create_table(
    "users",
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("username_normalized", sa.String(80), nullable=False, unique=True),
    sa.Column("display_name", sa.String(120), nullable=False),
    sa.Column("password_hash", sa.Text(), nullable=False),
    sa.Column("role", sa.String(20), nullable=False),
    sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("updated_at", sa.DateTime(), nullable=False),
    sa.Column("last_login_at", sa.DateTime(), nullable=True),
    sa.CheckConstraint("role IN ('inspector', 'admin')", name="ck_users_role"),
)
op.create_table(
    "sessions",
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
    sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.Column("expires_at", sa.DateTime(), nullable=False),
    sa.Column("revoked_at", sa.DateTime(), nullable=True),
    sa.Column("last_seen_at", sa.DateTime(), nullable=False),
)
op.create_table(
    "review_actions",
    sa.Column("id", sa.Integer(), primary_key=True),
    sa.Column("scan_id", sa.Integer(), sa.ForeignKey("scans.id"), nullable=False),
    sa.Column("verdict_id", sa.Integer(), sa.ForeignKey("verdicts.id"), nullable=True),
    sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
    sa.Column("action", sa.String(30), nullable=False),
    sa.Column("note", sa.Text(), nullable=False, server_default=""),
    sa.Column("created_at", sa.DateTime(), nullable=False),
    sa.CheckConstraint(
        "action IN ('confirmed', 'false_positive', 'resolved', 'needs_follow_up')",
        name="ck_review_actions_action",
    ),
)
with op.batch_alter_table("scans") as batch:
    batch.add_column(sa.Column("owner_user_id", sa.Integer(), nullable=True))
    batch.create_foreign_key("fk_scans_owner_user_id", "users", ["owner_user_id"], ["id"])
```

Create indexes for normalized username, session token hash/expiry, scan owner/created time, verdict rule/status, and review scan/time. Downgrade removes the scan foreign key/column before dropping new tables.

- [x] **Step 5: Map ORM relationships and update the head constant**

Add `User`, `SessionRow`, and `ReviewAction` to `db.py`, plus bidirectional relationships where they prevent extra queries. Set `HEAD_REVISION = "0003_operations"` in `app/migrations.py`.

- [x] **Step 6: Run migration and backend regressions**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_operations_migration.py tests/test_migrations.py -q
.venv/bin/python -m pytest -q
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add backend/pyproject.toml backend/app/db.py backend/app/migrations.py backend/migrations/versions/0003_operations.py backend/tests/test_operations_migration.py
git commit -m "feat(backend): add users sessions and review schema"
```

## Task 2: Implement password and opaque-session services

**Files:**
- Create: `backend/app/auth/__init__.py`
- Create: `backend/app/auth/models.py`
- Create: `backend/app/auth/passwords.py`
- Create: `backend/app/auth/sessions.py`
- Create: `backend/app/settings.py`
- Create: `backend/tests/test_auth_services.py`

**Interfaces:**
- Produces: `hash_password`, `verify_password`, `issue_session`, `resolve_session`, `revoke_session`, and `AuthSettings`.

- [x] **Step 1: Write service tests**

```python
def test_password_hash_is_argon2_and_verifies():
    encoded = hash_password("Correct Horse Battery Staple!")
    assert encoded.startswith("$argon2id$")
    assert verify_password(encoded, "Correct Horse Battery Staple!")
    assert not verify_password(encoded, "wrong")


def test_session_database_contains_hash_not_cookie(db_session, inspector):
    issued = issue_session(db_session, inspector, now=NOW, ttl=timedelta(hours=8))
    row = db_session.scalar(select(SessionRow))
    assert issued.token not in row.token_hash
    assert len(row.token_hash) == 64
    assert resolve_session(db_session, issued.token, now=NOW) == inspector


def test_expired_and_revoked_sessions_do_not_resolve(db_session, inspector):
    issued = issue_session(db_session, inspector, now=NOW, ttl=timedelta(seconds=1))
    assert resolve_session(db_session, issued.token, now=NOW + timedelta(seconds=2)) is None
    second = issue_session(db_session, inspector, now=NOW, ttl=timedelta(hours=1))
    revoke_session(db_session, second.token, now=NOW)
    assert resolve_session(db_session, second.token, now=NOW) is None
```

- [x] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_auth_services.py -q`.

Expected: FAIL because auth services do not exist.

- [x] **Step 3: Implement password and session primitives**

Use one configured `argon2.PasswordHasher`, normalize usernames with `unicodedata.normalize("NFKC", value).casefold().strip()`, create tokens with `secrets.token_urlsafe(32)`, and hash them with SHA-256 before storage:

```python
def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def resolve_session(session: Session, token: str, *, now: datetime) -> User | None:
    row = session.scalar(
        select(SessionRow).where(
            SessionRow.token_hash == token_digest(token),
            SessionRow.revoked_at.is_(None),
            SessionRow.expires_at > now,
        )
    )
    if row is None or not row.user.is_active:
        return None
    row.last_seen_at = now
    return row.user
```

`AuthSettings` reads `LMPC_SESSION_HOURS` default `8`, `LMPC_COOKIE_SECURE` default `false`, `LMPC_COOKIE_NAME` default `lmpc_session`, upload limits, database path, and backend origin. Parse booleans strictly as `true/false/1/0` and reject invalid values on startup.

- [x] **Step 4: Run focused tests**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_auth_services.py -q
.venv/bin/python -m ruff check app/auth app/settings.py tests/test_auth_services.py
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add backend/app/auth backend/app/settings.py backend/tests/test_auth_services.py
git commit -m "feat(backend): add secure local session services"
```

## Task 3: Extend consistent errors and add authentication routes

**Files:**
- Modify: `backend/app/errors.py`
- Create: `backend/app/auth/dependencies.py`
- Create: `backend/app/auth/routes.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth_routes.py`

**Interfaces:**
- Produces: `require_user(request, session) -> User`, `require_admin(user) -> User` and `/api/auth/login|logout|me`.
- Produces: `AppError(status_code, error, detail)` serialized with request ID.

- [x] **Step 1: Write authentication route tests**

```python
def test_login_sets_http_only_cookie(client, inspector_credentials):
    response = client.post("/api/auth/login", json=inspector_credentials)
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "lmpc_session=" in cookie
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert response.json()["user"]["role"] == "inspector"


def test_me_requires_valid_session(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert set(response.json()) == {"error", "detail", "request_id"}


def test_logout_revokes_cookie(client, logged_in_inspector):
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
```

- [x] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_auth_routes.py -q`.

Expected: FAIL with 404 routes.

- [x] **Step 3: Extend request IDs and error handlers for authentication**

Retain the inspection plan's request-ID middleware. Add stable `invalid_credentials`, `authentication_required`, `forbidden`, and `session_expired` error codes to the shared `AppError` path. Confirm handlers for application, FastAPI HTTP, request-validation, and unexpected exceptions return the shared envelope without exposing stack traces.

- [x] **Step 4: Implement login, logout, and current-user routes**

Use `LoginRequest(username: str, password: str)` with length bounds. Login returns the same generic 401 for unknown user, wrong password, or inactive user; on success it updates `last_login_at`, revokes earlier active sessions for that user, issues one new session, and calls:

```python
response.set_cookie(
    key=settings.cookie_name,
    value=issued.token,
    max_age=settings.session_hours * 3600,
    httponly=True,
    secure=settings.cookie_secure,
    samesite="lax",
    path="/",
)
```

Logout is idempotent, revokes a present token, deletes the cookie, and returns 204. `/me` returns only `id`, `username`, `display_name`, and `role`.

- [x] **Step 5: Run route and full API tests**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_auth_routes.py -q
.venv/bin/python -m pytest -q
```

Expected: PASS; existing route tests use an authenticated client fixture where protection is introduced in Task 5.

- [x] **Step 6: Commit**

```bash
git add backend/app/errors.py backend/app/auth backend/app/main.py backend/tests/conftest.py backend/tests/test_auth_routes.py
git commit -m "feat(backend): expose local authentication API"
```

## Task 4: Add admin bootstrap and user management

**Files:**
- Create: `backend/app/users/__init__.py`
- Create: `backend/app/users/routes.py`
- Create: `backend/scripts/bootstrap_admin.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_user_routes.py`
- Create: `backend/tests/test_bootstrap_admin.py`

**Interfaces:**
- Produces: `python -m scripts.bootstrap_admin --username NAME --display-name NAME`.
- Produces: `GET/POST /api/users` and `PATCH /api/users/{id}`; admin only.

- [x] **Step 1: Write user-management tests**

```python
def test_inspector_cannot_list_users(inspector_client):
    assert inspector_client.get("/api/users").status_code == 403


def test_admin_can_create_and_deactivate_inspector(admin_client):
    created = admin_client.post("/api/users", json={
        "username": "Inspector.One", "display_name": "Inspector One",
        "password": "Strong demo password 123!", "role": "inspector",
    })
    assert created.status_code == 201
    user_id = created.json()["id"]
    updated = admin_client.patch(f"/api/users/{user_id}", json={"is_active": False})
    assert updated.json()["is_active"] is False


def test_final_active_admin_cannot_be_demoted(admin_client, admin_user):
    response = admin_client.patch(f"/api/users/{admin_user.id}", json={"role": "inspector"})
    assert response.status_code == 409
    assert response.json()["error"] == "last_admin_required"
```

Test duplicate normalized username, weak password, reset revoking sessions, and bootstrap refusing to overwrite an existing username.

- [x] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_user_routes.py tests/test_bootstrap_admin.py -q`.

Expected: FAIL because user routes and CLI are missing.

- [x] **Step 3: Implement admin endpoints**

Require passwords of 12–128 characters and reject values containing the normalized username. POST returns no hash. PATCH accepts exactly `username`, `display_name`, `role`, `is_active`, or `password`; rejects an empty patch; normalizes and uniqueness-checks a renamed username; protects the final active admin from demotion or deactivation; and revokes sessions after password reset or deactivation. Use 409 for duplicate username/final-admin conflicts.

- [x] **Step 4: Implement bootstrap CLI**

The CLI reads a password twice through `getpass.getpass()` unless `LMPC_BOOTSTRAP_PASSWORD` is present, runs migrations first, creates one admin transactionally, prints the created username but never the password/hash, and exits 2 for an existing normalized username.

- [x] **Step 5: Run tests**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_user_routes.py tests/test_bootstrap_admin.py -q
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/app/users backend/app/main.py backend/scripts/bootstrap_admin.py backend/tests/test_user_routes.py backend/tests/test_bootstrap_admin.py
git commit -m "feat(backend): add admin user management"
```

## Task 5: Enforce scan ownership and append review actions

**Files:**
- Create: `backend/app/reviews/__init__.py`
- Create: `backend/app/reviews/routes.py`
- Modify: `backend/app/scan_routes.py`
- Modify: `backend/app/dashboard_routes.py`
- Modify: `backend/app/report_routes.py`
- Modify: `backend/tests/test_scan_routes.py`
- Modify: `backend/tests/test_dashboard_routes.py`
- Modify: `backend/tests/test_report_routes.py`
- Create: `backend/tests/test_review_routes.py`

**Interfaces:**
- Produces: `POST /api/scan/{id}/reviews`.
- Changes: every scan/list/dashboard/report route requires an authenticated user and filters by authorization.

- [x] **Step 1: Add the permission matrix tests**

```python
@pytest.mark.parametrize("path", ["/api/scan/1", "/api/history", "/api/dashboard", "/api/report/1"])
def test_protected_routes_reject_anonymous(client, path):
    assert client.get(path).status_code == 401


def test_inspector_cannot_read_or_review_another_scan(inspector_client, other_scan):
    assert inspector_client.get(f"/api/scan/{other_scan.id}").status_code == 404
    assert inspector_client.post(
        f"/api/scan/{other_scan.id}/reviews",
        json={"action": "confirmed", "note": "not mine"},
    ).status_code == 404


def test_review_actions_are_append_only(inspector_client, owned_scan):
    for action in ("needs_follow_up", "resolved"):
        assert inspector_client.post(
            f"/api/scan/{owned_scan.id}/reviews", json={"action": action, "note": action}
        ).status_code == 201
    body = inspector_client.get(f"/api/scan/{owned_scan.id}").json()
    assert [item["action"] for item in body["review_actions"]] == ["needs_follow_up", "resolved"]
```

- [x] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_review_routes.py tests/test_scan_routes.py -q`.

Expected: FAIL because routes are public and review routes are absent.

- [x] **Step 3: Apply authorization consistently**

Set `owner_user_id=current_user.id` on every new scan. Add one query helper:

```python
def authorized_scan_query(user: User):
    query = select(Scan)
    if user.role != "admin":
        query = query.where(Scan.owner_user_id == user.id)
    return query
```

Use the helper for scan detail, report, review, history, and dashboard. Return 404 rather than 403 for an inaccessible scan ID to avoid disclosing its existence. Anonymous POST `/api/scan` returns 401.

- [x] **Step 4: Implement append-only reviews**

Validate action enum, note length at most 2000, optional verdict ID belonging to the same scan, and non-empty notes for `false_positive` and `needs_follow_up`. Insert a new row; do not expose update/delete endpoints. When a verdict ID is supplied, update its denormalized `review_state` to the new action in the same transaction while preserving every action row. Return actor display name and UTC timestamp.

- [x] **Step 5: Run all backend route tests**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_*routes.py -q
.venv/bin/python -m pytest -q
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/app/reviews backend/app/scan_routes.py backend/app/dashboard_routes.py backend/app/report_routes.py backend/tests/test_scan_routes.py backend/tests/test_dashboard_routes.py backend/tests/test_report_routes.py backend/tests/test_review_routes.py
git commit -m "feat(backend): enforce scan ownership and audit reviews"
```

## Task 6: Add paginated repository search and filtered dashboards

**Files:**
- Create: `backend/app/repositories/__init__.py`
- Create: `backend/app/repositories/scans.py`
- Modify: `backend/app/dashboard_routes.py`
- Modify: `backend/tests/test_dashboard_routes.py`
- Create: `backend/tests/test_scan_repository.py`

**Interfaces:**
- Produces: `ScanFilters`, `list_authorized_scans`, `dashboard_for_filters`.
- Returns: `{items, page, page_size, total}` from `/api/history`.

- [x] **Step 1: Write pagination/filter/search tests**

```python
def test_history_combines_filters_and_has_stable_pagination(inspector_client, scan_factory):
    scan_factory(product_name="Tea", mode="retail_image", status="pass")
    expected = scan_factory(product_name="Tea Premium", mode="ecommerce_listing", status="fail")
    response = inspector_client.get(
        "/api/history?q=tea&mode=ecommerce_listing&overall_status=fail&page=1&page_size=10"
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["scan_id"] == expected.id


def test_dashboard_uses_same_filter_semantics(inspector_client, scan_factory):
    scan_factory(mode="retail_image", status="pass")
    scan_factory(mode="ecommerce_listing", status="fail")
    body = inspector_client.get("/api/dashboard?mode=ecommerce_listing").json()
    assert body["total_scans"] == 1
    assert body["status_counts"]["fail"] == 1
```

Also test `rule_id`, `verdict_status`, category, UTC inclusive dates, admin `owner_id`, inspector rejection of `owner_id`, invalid sort, page bounds, and tie ordering by `created_at DESC, id DESC`.

- [x] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_scan_repository.py tests/test_dashboard_routes.py -q`.

Expected: FAIL against the current list response and limited filters.

- [x] **Step 3: Implement typed filters and authorized SQL queries**

Define:

```python
class ScanFilters(BaseModel):
    q: str | None = Field(default=None, max_length=200)
    mode: Literal["retail_image", "ecommerce_listing"] | None = None
    category: Literal["food", "non_food", "cosmetics", "seeds", "unknown"] | None = None
    overall_status: Literal["pass", "fail", "mixed", "manual_review"] | None = None
    rule_id: str | None = Field(default=None, max_length=80)
    verdict_status: Literal["pass", "fail", "warn", "manual_review", "na"] | None = None
    owner_id: int | None = None
    created_from: datetime | None = None
    created_to: datetime | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
```

Use SQLAlchemy expressions and `exists()` for verdict filters. Escape `%`, `_`, and the escape character in text search; search product name, serialized OCR text, rule ID, and verdict evidence. Count on the filtered subquery before applying limit/offset. Do not deserialize all scans in Python.

- [x] **Step 4: Return filter-aware dashboard data**

Return total scans, status counts, pass rate, top five failed rules, daily trend, and five recent authorized scans from the same base query. Use zero rather than division errors for empty results.

- [x] **Step 5: Run focused and full backend tests**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_scan_repository.py tests/test_dashboard_routes.py -q
.venv/bin/python -m pytest -q
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/app/repositories backend/app/dashboard_routes.py backend/tests/test_scan_repository.py backend/tests/test_dashboard_routes.py
git commit -m "feat(backend): add searchable inspection repository"
```

## Task 7: Build a shared report model and PDF, DOCX, CSV exports

**Files:**
- Create: `backend/app/exports/__init__.py`
- Create: `backend/app/exports/view_model.py`
- Create: `backend/app/exports/pdf.py`
- Create: `backend/app/exports/docx.py`
- Create: `backend/app/exports/csv.py`
- Create: `backend/app/exports/routes.py`
- Modify: `backend/app/report_routes.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_export_routes.py`

**Interfaces:**
- Produces: `build_report_model(scan) -> InspectionReport`, plus PDF/DOCX/CSV bytes.
- Produces: `/api/exports/scans/{id}.pdf`, `.docx`, and filtered `/api/exports/scans.csv`.

- [x] **Step 1: Write report parity and CSV safety tests**

```python
def test_pdf_and_docx_contain_same_core_report_values(admin_client, reviewed_scan):
    pdf = admin_client.get(f"/api/exports/scans/{reviewed_scan.id}.pdf")
    docx = admin_client.get(f"/api/exports/scans/{reviewed_scan.id}.docx")
    assert pdf.status_code == docx.status_code == 200
    assert pdf.content.startswith(b"%PDF")
    document = Document(io.BytesIO(docx.content))
    text = "\n".join(p.text for p in document.paragraphs)
    for value in (str(reviewed_scan.id), reviewed_scan.overall_status, "Rule 6"):
        assert value in text


def test_csv_neutralizes_formula_cells(admin_client, scan_factory):
    scan_factory(product_name="=HYPERLINK(\"https://bad\")")
    response = admin_client.get("/api/exports/scans.csv")
    assert response.status_code == 200
    assert "'=HYPERLINK" in response.text
```

Also test ownership, active-filter parity, content types, safe filenames, missing scans, image decode failure, Unicode, all status values, and review history.

- [x] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_export_routes.py -q`.

Expected: FAIL because export modules/routes do not exist.

- [x] **Step 3: Implement the immutable report view model**

`InspectionReport` contains scan identity/context, owner display name, timestamps, quality summary, source image, analysis version, ordered verdicts, review actions, and rules versions. Build it in one eager SQLAlchemy query. Renderers accept this value only and never receive a database session.

- [x] **Step 4: Implement three renderers**

PDF preserves the existing annotated-image behavior and adds quality, reasoning, measurement method, confidence, and reviews. DOCX uses headings, a source image, and a table with the same fields. CSV writes one row per scan with aggregate counts and uses:

```python
def safe_csv_cell(value: object) -> str:
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in {"=", "+", "-", "@"} else text
```

CSV export reuses `ScanFilters` and the authorized repository query. Set `Content-Disposition` with filenames `lmpc-scan-{id}.pdf`, `lmpc-scan-{id}.docx`, and `lmpc-scans-{UTC_DATE}.csv`. Add `X-LMPC-Filter-Digest` as SHA-256 over the canonical sorted active-filter JSON and `X-LMPC-Result-Count` so the exported scope is auditable without reflecting raw search text into a header.

- [x] **Step 5: Keep compatibility and run tests**

Make `GET /api/report/{id}` call the same PDF service as the new route. Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_export_routes.py tests/test_report_routes.py -q
.venv/bin/python -m pytest -q
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/app/exports backend/app/report_routes.py backend/app/main.py backend/tests/test_export_routes.py backend/tests/test_report_routes.py
git commit -m "feat(backend): export auditable PDF DOCX and CSV reports"
```

## Task 8: Establish the frontend design system and test harness

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`
- Modify: `frontend/tailwind.config.ts`
- Modify: `frontend/app/globals.css`
- Create: `frontend/components.json`
- Modify: `frontend/vitest.config.ts`
- Create: `frontend/tests/setup.ts`
- Create: `frontend/tests/server.ts`
- Create: `frontend/lib/cn.ts`
- Create: `frontend/components/ui/button.tsx`
- Create: `frontend/components/ui/input.tsx`
- Create: `frontend/components/ui/label.tsx`
- Create: `frontend/components/ui/select.tsx`
- Create: `frontend/components/ui/dialog.tsx`
- Create: `frontend/components/ui/dropdown-menu.tsx`
- Create: `frontend/components/ui/tabs.tsx`
- Create: `frontend/components/ui/tooltip.tsx`
- Create: `frontend/components/ui/table.tsx`
- Create: `frontend/components/ui/badge.tsx`
- Create: `frontend/components/ui/skeleton.tsx`
- Create: `frontend/components/ui/toaster.tsx`
- Create: `frontend/components/ui/number-ticker.tsx`
- Create: `frontend/components/ui/scan-progress.tsx`
- Create: `frontend/components/ui/spotlight.tsx`
- Create: `frontend/THIRD_PARTY_NOTICES.md`
- Create: `frontend/tests/ui-primitives.test.tsx`

**Interfaces:**
- Produces: shared accessible primitives, semantic tokens, font classes, and test environment.

- [x] **Step 1: Install free runtime/test dependencies**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm add class-variance-authority @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-select @radix-ui/react-tabs @radix-ui/react-tooltip @fontsource/lexend@5.3.0 @fontsource/source-sans-3@5.3.0 motion@13.2.0 recharts@3.10.1 sonner@2.0.8
pnpm add -D @testing-library/jest-dom @testing-library/react@16.3.3 @testing-library/user-event jsdom@30.0.1 msw@2.15.0
```

Expected: exit 0 and lockfile changes contain no paid/private registry.

- [x] **Step 2: Write primitive behavior tests**

Configure Vitest for `jsdom`, path alias `@`, and `tests/setup.ts` importing `@testing-library/jest-dom/vitest`. Create `tests/server.ts` with an MSW `setupServer`, start/reset/close it from setup hooks, and add tests:

```tsx
it('button exposes disabled semantics and visible text', () => {
  render(<Button disabled>Start scan</Button>);
  expect(screen.getByRole('button', { name: 'Start scan' })).toBeDisabled();
});

it('dialog has a keyboard-reachable title and close control', async () => {
  render(<DialogExample />);
  await userEvent.click(screen.getByRole('button', { name: 'Open review' }));
  expect(screen.getByRole('dialog', { name: 'Review finding' })).toBeVisible();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```

- [x] **Step 3: Verify failure**

Run `cd /home/wind/Projects/sih/frontend && pnpm test:run -- tests/ui-primitives.test.tsx`.

Expected: FAIL before the primitives/configuration exist.

- [x] **Step 4: Add shadcn-compatible open-code primitives**

Create `components.json` with this compatibility configuration, then generate only the required open-code primitives:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/cn",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Run:

```bash
pnpm dlx shadcn@4.21.0 add button input label select dialog dropdown-menu tabs tooltip table badge skeleton sonner
```

Expected: the named local files are created under `components/ui`; inspect and normalize their imports through `@/lib/cn`.

Do not run an “add all” command. Every primitive must be used by a planned screen or omitted.

- [x] **Step 5: Add semantic tokens and local fonts**

Import the two Fontsource packages in `app/layout.tsx`. Define CSS variables and Tailwind mappings for background/surface/foreground/border/primary/accent plus `pass`, `fail`, `warn`, `review`, and `na`. Add type tokens using `clamp()`, 4/8px spacing rhythm, a single radius/elevation scale, 2px focus ring, 44px minimum touch target, and reduced-motion rules.

- [x] **Step 6: Add the approved free accent mix**

Create three locally owned, token-normalized files:

- `components/ui/number-ticker.tsx`, adapted from Magic UI’s free Number Ticker and used only for KPI changes;
- `components/ui/scan-progress.tsx`, adapted from React Bits’ free Stepper and used only for upload/OCR/analysis progress;
- `components/ui/spotlight.tsx`, adapted from Aceternity UI’s free Spotlight and used only on the login/upload empty surface.

Remove pointer tracking and large dependencies; use Motion only for number/progress transitions, add `useReducedMotion`, and mark decorative SVG/CSS layers `aria-hidden`. Record source URL, access date, license, local filename, and modifications in `THIRD_PARTY_NOTICES.md`. If the source page does not expose a compatible open license at implementation time, do not copy it: implement the same functional need with existing primitives and record the rejected source in the notice file.

- [x] **Step 7: Run UI tests, type check, and build**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm test:run -- tests/ui-primitives.test.tsx
pnpm exec tsc --noEmit
pnpm build
```

Expected: PASS and no runtime font request appears in the build output.

- [x] **Step 8: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/tailwind.config.ts frontend/app/globals.css frontend/app/layout.tsx frontend/components.json frontend/components/ui frontend/lib/cn.ts frontend/vitest.config.ts frontend/tests/setup.ts frontend/tests/server.ts frontend/tests/ui-primitives.test.tsx frontend/THIRD_PARTY_NOTICES.md
git commit -m "feat(frontend): establish accessible inspection design system"
```

## Task 9: Add same-origin API client, auth state, and workspace shell

**Files:**
- Modify: `frontend/next.config.mjs`
- Create: `frontend/lib/api-client.ts`
- Create: `frontend/lib/auth.tsx`
- Create: `frontend/middleware.ts`
- Create: `frontend/app/(workspace)/layout.tsx`
- Move/modify: `frontend/app/page.tsx` → `frontend/app/(workspace)/page.tsx`
- Move/modify: `frontend/app/scan/[id]/page.tsx` → `frontend/app/(workspace)/scan/[id]/page.tsx`
- Move/modify: `frontend/app/history/page.tsx` → `frontend/app/(workspace)/history/page.tsx`
- Move/modify: `frontend/app/dashboard/page.tsx` → `frontend/app/(workspace)/dashboard/page.tsx`
- Create: `frontend/app/(public)/login/page.tsx`
- Create: `frontend/components/auth/LoginForm.tsx`
- Create: `frontend/components/WorkspaceShell.tsx`
- Create: `frontend/tests/auth-ui.test.tsx`

**Interfaces:**
- Produces: typed `apiFetch<T>()`, `AuthProvider`, `useAuth`, protected route shell, and login UI.

- [x] **Step 1: Write client and login tests**

```tsx
it('submits credentials with cookies and shows the returned user', async () => {
  server.use(http.post('/api/auth/login', () => HttpResponse.json({ user: INSPECTOR })));
  render(<LoginForm onAuthenticated={onAuthenticated} />);
  await userEvent.type(screen.getByLabelText('Username'), 'inspector');
  await userEvent.type(screen.getByLabelText('Password'), 'correct password');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(onAuthenticated).toHaveBeenCalledWith(INSPECTOR);
});

it('shows recovery guidance for an API error', async () => {
  server.use(http.post('/api/auth/login', () => HttpResponse.json(
    { error: 'invalid_credentials', detail: 'Username or password is incorrect.', request_id: 'r1' },
    { status: 401 },
  )));
  render(<LoginForm onAuthenticated={() => undefined} />);
  await submitCredentials();
  expect(screen.getByRole('alert')).toHaveTextContent('Username or password is incorrect.');
});
```

- [x] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/frontend && pnpm test:run -- tests/auth-ui.test.tsx`.

Expected: FAIL because the auth UI/client does not exist.

- [x] **Step 3: Proxy the API and implement one typed client**

Replace public cross-origin URLs with a Next.js rewrite from `/api/:path*` to `${LMPC_BACKEND_URL:-http://127.0.0.1:8000}/api/:path*`. `apiFetch` uses relative URLs, `credentials: 'include'`, JSON content type for JSON bodies, parses the error envelope, and throws `ApiError` carrying status/code/detail/request ID. Update all old `lib/api.ts` consumers, then remove the old base URL constant.

- [x] **Step 4: Add auth provider and route protection**

`AuthProvider` loads `/api/auth/me`, exposes `user`, `loading`, `login`, `logout`, and `refresh`, and clears user state on 401. Middleware redirects protected paths to `/login?next=<encoded-local-path>` when the cookie is absent and redirects authenticated users away from `/login`. Validate `next` as a same-origin path beginning with one `/` before navigation.

- [x] **Step 5: Build responsive workspace shell and login**

Use one navigation hierarchy with icon plus label for New inspection, Repository, Dashboard, and—only for admins—Users. Desktop uses a sidebar; small screens use an accessible dialog/sheet. The login page uses visible labels, password reveal, inline errors, a loading button, and the token-normalized spotlight as a noninteractive background.

- [x] **Step 6: Run frontend tests and build**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm test:run -- tests/auth-ui.test.tsx
pnpm exec tsc --noEmit
pnpm build
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add frontend/next.config.mjs frontend/lib/api-client.ts frontend/lib/auth.tsx frontend/middleware.ts 'frontend/app/(public)' 'frontend/app/(workspace)' frontend/components/auth/LoginForm.tsx frontend/components/WorkspaceShell.tsx frontend/tests/auth-ui.test.tsx
git commit -m "feat(frontend): add authenticated inspection workspace"
```

## Task 10: Build the capture and evidence-review experience

**Files:**
- Move/modify: `frontend/components/UploadDropzone.tsx` → `frontend/components/inspection/InspectionCapture.tsx`
- Move/modify: `frontend/components/AnnotatedImage.tsx` → `frontend/components/inspection/AnnotatedEvidence.tsx`
- Move/modify: `frontend/components/VerdictBadge.tsx` → `frontend/components/inspection/VerdictBadge.tsx`
- Move/modify: `frontend/components/VerdictCard.tsx` → `frontend/components/inspection/VerdictCard.tsx`
- Modify: `frontend/app/(workspace)/page.tsx`
- Modify: `frontend/app/(workspace)/scan/[id]/page.tsx`
- Create: `frontend/components/inspection/QualityPanel.tsx`
- Create: `frontend/components/inspection/ReviewForm.tsx`
- Create: `frontend/tests/inspection-ui.test.tsx`

**Interfaces:**
- Consumes: version-2 scan response and review API.
- Produces: accessible retail/screenshot capture, progress, annotated verdict selection, and review actions.

- [x] **Step 1: Write critical interaction tests**

```tsx
it('changes capture guidance when screenshot mode is selected', async () => {
  render(<InspectionCapture onComplete={() => undefined} />);
  await userEvent.click(screen.getByRole('radio', { name: 'E-commerce screenshot' }));
  expect(screen.getByText(/upload listing screenshot/i)).toBeVisible();
  expect(screen.getByLabelText(/evidence image/i)).not.toHaveAttribute('capture');
});

it('selecting a verdict highlights its evidence and announces details', async () => {
  render(<InspectionResult result={MANUAL_REVIEW_RESULT} />);
  await userEvent.click(screen.getByRole('button', { name: /Rule 7/i }));
  expect(screen.getByTestId('evidence-box-r7_font_size-0')).toHaveAttribute('data-active', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Physical scale cannot be established');
});
```

Test loading, cancellation before API submission, retry after OCR/API error, quality guidance, no-text response, review validation, and reduced-motion progress.

- [x] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/frontend && pnpm test:run -- tests/inspection-ui.test.tsx`.

Expected: FAIL before the new components exist.

- [x] **Step 3: Implement capture stages and validation**

Use stages `ready`, `reading`, `ocr`, `analyzing`, `saving`, `complete`, and `error`. Accept JPEG/PNG/WebP up to the backend-configured 10 MB user-visible limit. Retail mode enables `capture="environment"`; listing mode does not. Show preview dimensions, a replace action, one primary Start inspection button, progress, and an AbortController-backed cancel before POST begins.

- [x] **Step 4: Implement results and review**

Show overall status, quality panel, evidence image, filterable verdict list, exports, and review history. Clicking or focusing a verdict activates matching SVG rectangles with thicker stroke and accessible text. Each card shows status, citation, evidence, confidence, reasoning, method, and failure guidance. The review form supports the four actions and enforces notes for false positive/follow-up before calling the API.

- [x] **Step 5: Run focused tests and responsive build**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm test:run -- tests/inspection-ui.test.tsx
pnpm exec tsc --noEmit
pnpm build
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add 'frontend/app/(workspace)/page.tsx' 'frontend/app/(workspace)/scan/[id]/page.tsx' frontend/components/inspection frontend/tests/inspection-ui.test.tsx
git commit -m "feat(frontend): add guided capture and evidence review"
```

## Task 11: Build repository, dashboard, and user administration screens

**Files:**
- Modify: `frontend/app/(workspace)/history/page.tsx`
- Modify: `frontend/app/(workspace)/dashboard/page.tsx`
- Create: `frontend/app/(workspace)/admin/users/page.tsx`
- Create: `frontend/components/repository/ScanFilters.tsx`
- Create: `frontend/components/repository/ScanResults.tsx`
- Create: `frontend/components/repository/Pagination.tsx`
- Create: `frontend/components/dashboard/MetricCards.tsx`
- Create: `frontend/components/dashboard/StatusChart.tsx`
- Create: `frontend/components/dashboard/RuleFailuresChart.tsx`
- Create: `frontend/components/auth/UserTable.tsx`
- Create: `frontend/tests/operations-ui.test.tsx`

**Interfaces:**
- Consumes: paginated history, filtered dashboard, users, and CSV export APIs.
- Produces: URL-preserving operational screens with role-aware controls.

- [x] **Step 1: Write repository/dashboard/admin tests**

```tsx
it('serializes filters into the URL and API request', async () => {
  render(<RepositoryPage initialSearchParams={{}} />);
  await userEvent.type(screen.getByRole('searchbox'), 'tea');
  await userEvent.selectOptions(screen.getByLabelText('Mode'), 'ecommerce_listing');
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(mockRouter.replace).toHaveBeenCalledWith(expect.stringContaining('q=tea'));
  expect(mockRouter.replace).toHaveBeenCalledWith(expect.stringContaining('mode=ecommerce_listing'));
});

it('charts have a table alternative', () => {
  render(<StatusChart counts={{ pass: 4, fail: 2, mixed: 1, manual_review: 3 }} />);
  expect(screen.getByRole('table', { name: 'Scan status data' })).toBeInTheDocument();
});

it('does not expose user administration to inspectors', () => {
  render(<WorkspaceShell user={INSPECTOR}><div /></WorkspaceShell>);
  expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
});
```

- [x] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/frontend && pnpm test:run -- tests/operations-ui.test.tsx`.

Expected: FAIL before these components exist.

- [x] **Step 3: Implement repository filters and responsive results**

Use immediate search and common filters plus an Advanced disclosure for rule, owner, and dates. Apply explicitly, reset explicitly, serialize all active filters and page in `URLSearchParams`, and restore from the URL. Desktop renders a semantic sortable table; small screens render the same records as cards. Link to detail with the repository query and scroll position in `history.state`; the detail back action restores both without issuing an unfiltered request. Preserve focus and announce result count after loading. CSV download uses the current query string.

- [x] **Step 4: Implement dashboard with accessible data alternatives**

Use filter semantics identical to repository. Render KPI values through the reduced-motion-aware NumberTicker, Recharts bars/lines with exact tooltips, and a visually available table beneath each chart. Status always includes text/icon, never only color. Empty/error states replace charts with a clear action.

- [x] **Step 5: Implement admin user management**

List users and expose create, reset password, change role, and deactivate dialogs. Use visible labels and confirmation for role/deactivation changes. Display backend final-admin/duplicate conflicts inline. Never retain password fields after submit or log request bodies.

- [x] **Step 6: Run tests and production build**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm test:run -- tests/operations-ui.test.tsx
pnpm test:run
pnpm exec tsc --noEmit
pnpm build
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add 'frontend/app/(workspace)/history/page.tsx' 'frontend/app/(workspace)/dashboard/page.tsx' 'frontend/app/(workspace)/admin/users/page.tsx' frontend/components/repository frontend/components/dashboard frontend/components/auth/UserTable.tsx frontend/tests/operations-ui.test.tsx
git commit -m "feat(frontend): add searchable operations and admin views"
```

## Task 12: Close accessibility, security, and documentation gaps

**Files:**
- Modify: `backend/README.md`
- Modify: `frontend/README.md`
- Modify: `README.md`
- Create: `backend/tests/test_security_regressions.py`
- Create: `frontend/tests/accessibility-regressions.test.tsx`

**Interfaces:**
- Verifies: security headers/requests, keyboard and reduced-motion behavior, setup and role documentation.

- [ ] **Step 1: Add regression tests**

Backend tests reject unsupported content type, cross-origin mutation, oversized/decompression-bomb images, invalid cookie, inactive user, CSV formula payloads, and unauthorized exports. Frontend tests cover visible focus, icon accessible names, dialog focus return, error `role=alert`, toast `aria-live=polite`, 44px control classes, non-color status text, and reduced-motion disabling transforms.

- [ ] **Step 2: Run tests to expose gaps**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_security_regressions.py -q
cd /home/wind/Projects/sih/frontend
pnpm test:run -- tests/accessibility-regressions.test.tsx
```

Expected: FAIL only on the uncovered security/accessibility behavior.

- [ ] **Step 3: Implement the security/accessibility closures and document operation**

Add `LMPC_ALLOWED_BROWSER_ORIGINS` as a comma-separated exact-origin setting with local defaults `http://127.0.0.1:3000,http://localhost:3000`. For `POST`, `PATCH`, and `DELETE`, middleware rejects a present `Origin` outside that set and rejects `Sec-Fetch-Site: cross-site`; body-bearing JSON API routes reject a content type other than `application/json` with `unsupported_media_type`. Keep bodyless logout valid. Do not use wildcard origins with credentialed cookies.

Add `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and this production CSP through Next.js response headers: `default-src 'self'; img-src 'self' data: blob:; worker-src 'self' blob:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`. Verify the policy in the production build and offline OCR test; do not silently relax `connect-src` or add remote origins.

For frontend failures, add only the focus, live-region, target-size, semantic-status, and reduced-motion behavior named by the assertions. Document dependency installation without `uv`, migration, bootstrap, login, role matrix, cookie production settings, allowed-origin configuration, same-origin proxy, upload limits, backup/restore, report formats, and no-runtime-network requirement. Include exact local commands and example environment variables without real secrets.

- [ ] **Step 4: Run the workstream gate**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m ruff check app tests scripts
.venv/bin/python -m pytest -q
cd /home/wind/Projects/sih/frontend
pnpm test:run
pnpm exec tsc --noEmit
pnpm build
```

Expected: all commands PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md backend/README.md frontend/README.md backend/app/errors.py backend/app/main.py backend/app/settings.py backend/app/auth backend/app/exports backend/tests/test_security_regressions.py frontend/app/globals.css frontend/components/ui frontend/components/WorkspaceShell.tsx frontend/components/inspection frontend/components/repository frontend/components/dashboard frontend/tests/accessibility-regressions.test.tsx
git commit -m "fix: harden and document the inspection workspace"
```

## Operations experience completion gate

- [ ] Fresh database upgrades to `0003_operations` and a copied legacy database retains existing scans.
- [ ] Anonymous, inspector, other-inspector, inactive-user, and administrator cases match the permission matrix.
- [ ] PDF/DOCX parity and filtered CSV tests pass.
- [ ] Repository URLs restore filters and pages after navigation.
- [ ] Mobile 375px and desktop 1440px layouts have no horizontal overflow.
- [ ] Keyboard-only and reduced-motion critical paths complete.
- [ ] No paid/private component dependency or runtime network asset is present.
