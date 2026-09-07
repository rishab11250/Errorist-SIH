# SIH26034 Complete Solution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved SIH26034 inspection workspace by extending the current scanner with evidence intelligence, secure operations, consistent Next.js UX, exports, real evaluation, and an offline demo path.

**Architecture:** Preserve the existing Next.js/Tesseract.js → FastAPI/rule engine → SQLite/report pipeline. Add each capability behind a focused module and a versioned API/database contract, then validate the whole workflow with bundled evidence and browser tests.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS 3, shadcn/ui-compatible open code, Tesseract.js 5, FastAPI, Pydantic 2, SQLAlchemy 2, Alembic, SQLite, Pillow/OpenCV, ReportLab, python-docx, pytest, Vitest, Testing Library, and Playwright.

## Global Constraints

- Keep Next.js App Router; Next.js is the React framework for this project.
- Keep browser-side Tesseract.js OCR and normalized `[0,1]` evidence boxes.
- Use only free/open UI source; never add paid, Pro, all-access, or license-unclear assets.
- Use shadcn/ui-compatible Tailwind primitives as the only styling foundation; do not install Chakra UI.
- Users never enter font size or use a ruler/reference card.
- A statutory physical-size pass/fail requires sufficient automatic scale confidence; otherwise use `manual_review`.
- Photo defects alone cannot produce a declaration compliance failure.
- E-commerce support accepts uploaded screenshots only; do not add live URL scraping.
- Store evidence locally by default and make runtime behavior independent of external networks.
- Protect all scan, repository, dashboard, review, user, and export data on the backend.
- Preserve existing scans and the compatibility route `GET /api/report/{id}`.
- Use Alembic for every schema change after the current database baseline.
- Every error response is `{error, detail, request_id}`.
- Every implementation task follows red → green → focused regression tests → commit.
- Backend commands use `backend/.venv/bin/python`; do not assume `uv` is installed.
- Do not state accuracy or performance percentages until produced by the committed evaluator against a named dataset revision.

---

## Plan suite and execution order

Execute the plans in this exact order:

1. [`2026-09-07-inspection-intelligence.md`](./2026-09-07-inspection-intelligence.md)
2. [`2026-09-07-operations-experience.md`](./2026-09-07-operations-experience.md)
3. [`2026-09-07-validation-demo-readiness.md`](./2026-09-07-validation-demo-readiness.md)

The first plan establishes the version-2 analysis contract and first two database migrations. The second adds migration `0003`, authentication, authorization, operational APIs, exports, and the final UI. The third locks the data/evaluation contract and proves the installed application works offline.

## Required stage gates

| Gate | Required before proceeding |
|---|---|
| Inspection intelligence complete | Backend unit/API tests pass; frontend unit tests, type check, and build pass; a retail image and listing screenshot return the version-2 response shape |
| Operations experience complete | Fresh and legacy migrations pass; inspector/admin permission matrix passes; PDF/DOCX/CSV tests pass; protected frontend routes build |
| Validation complete | Dataset validation passes; engine and E2E evaluation run; Playwright critical path passes at mobile and desktop; offline smoke test passes |

## Specification coverage

| Approved requirement | Owning tasks |
|---|---|
| Retail and uploaded screenshot modes | Inspection Tasks 7, 9, 10 |
| Image quality and actionable capture guidance | Inspection Tasks 4, 9, 10 |
| Automatic font/readability with confidence-safe review | Inspection Tasks 5, 8, 9 |
| Placement evidence | Inspection Tasks 6, 8, 9 |
| Expanded declarations and versioned applicability | Inspection Tasks 7–9 |
| Local auth and inspector/admin roles | Operations Tasks 1–5, 9 |
| Search, filters, pagination, and dashboard | Operations Tasks 6 and 11 |
| Append-only review history | Operations Tasks 5 and 10 |
| PDF, editable DOCX, and filtered CSV | Operations Task 7 |
| Consistent free/open Next.js UI | Operations Tasks 8–11 |
| Responsive text without a user font control | Operations Tasks 8, 10–12 |
| Validated dataset and honest metrics | Validation Tasks 1, 2, 4, 5, 9 |
| Bundled evidence samples | Validation Tasks 2 and 6 |
| Offline runtime and repeatable demo | Validation Tasks 3, 7, 8 |

## Final verification

- [ ] **Step 1: Install locked dependencies without `uv`**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pip install -e '.[dev]'
cd /home/wind/Projects/sih/frontend
pnpm install --frozen-lockfile
```

Expected: both commands exit 0 and do not request paid credentials.

- [ ] **Step 2: Upgrade a fresh database and run backend checks**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -c "from app.migrations import upgrade_database; upgrade_database('/tmp/lmpc-final-verification.db')"
.venv/bin/python -m ruff check app tests scripts
.venv/bin/python -m pytest -q
```

Expected: Alembic reaches revision `0003`; Ruff and pytest exit 0.

- [ ] **Step 3: Run frontend checks**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm test:run
pnpm exec tsc --noEmit
pnpm build
```

Expected: Vitest, TypeScript, and the Next.js production build exit 0.

- [ ] **Step 4: Run evaluation and browser gates**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m scripts.validate_eval --dataset tests/eval
.venv/bin/python -m scripts.run_eval --mode engine --split test --output-dir ../artifacts/eval-engine
cd /home/wind/Projects/sih
pnpm --dir frontend exec playwright test
./scripts/offline-smoke.sh
```

Expected: validation and both smoke paths exit 0; evaluator output names the dataset digest, sample support, and measured values.

- [ ] **Step 5: Confirm the final verification state**

```bash
git status --short
```

Expected: no tracked implementation changes remain. Untracked user-owned files that predated this plan remain untouched; generated logs, databases, and browser artifacts are ignored.
