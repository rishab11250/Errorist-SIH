[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 2: Backend skeleton + health endpoint** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 2: Backend skeleton + health endpoint"

## Steps to execute
2.1 through 2.8.

## Expected outcome
- 4 files created: `backend/app/__init__.py`, `backend/app/main.py`, `backend/app/models.py`, `backend/tests/__init__.py`, `backend/tests/test_health.py` (5 files total)
- `uv run pytest -v` shows **2 passed**
- Smoke test via uvicorn + curl returns `{"status":"ok","rules_version":"not-loaded"}`
- Commit hash + message `feat(backend): FastAPI skeleton with CORS, health endpoint, DTO models`

## Report
- Test count and pass status
- Commit hash
- Any deviation
