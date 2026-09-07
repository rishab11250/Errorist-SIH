[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 9: History + dashboard endpoints + seed script** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 9: History + dashboard endpoints + seed script"

## Steps to execute
9.1 through 9.7.

## Expected outcome
- 5 files: `backend/app/dashboard_routes.py`, `backend/scripts/seed_demo.py`, `backend/scripts/__init__.py` (empty), `backend/app/main.py` (modified), `backend/tests/test_dashboard_routes.py`
- `uv run pytest tests/test_dashboard_routes.py -v` shows **3 passed**
- Full suite still passes (≥ 48 passed)
- Commit: `feat(backend): /api/history + /api/dashboard + seed script + 3 tests`

## Note
The plan's `seed_demo.py` uses `base64.b64encode(b"demo-png-bytes")` for the demo image bytes. That's fine — it's just placeholder text. The history endpoint truncates this to 200 chars + "..." in `thumbnail_b64`, so the dashboard rows show short strings, not real images. That's expected for MVP.

## Report
- Test count for new tests AND full suite
- Commit hash
- Any deviation
