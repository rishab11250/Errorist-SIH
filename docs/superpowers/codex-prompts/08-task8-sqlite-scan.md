[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 8: SQLite models + /api/scan endpoint** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 8: SQLite models + /api/scan endpoint"

## Steps to execute
8.1 through 8.6.

## Expected outcome
- 4 files: `backend/app/db.py`, `backend/app/scan_routes.py`, `backend/app/main.py` (modified), `backend/tests/test_scan_routes.py`
- `uv run pytest tests/test_scan_routes.py -v` shows **4 passed**
- Full suite still passes (≥ 45 passed)
- Commit: `feat(backend): SQLite persistence + POST /api/scan + GET /api/scan/:id + 4 tests`

## Important
- The plan's `_word_from_dto` function in `scan_routes.py` passes the bbox through unchanged. The frontend's `lib/ocr.ts` already normalises bboxes to [0,1] before sending, so backend bboxes are already normalised. Don't try to "convert" them.
- The test fixture in the plan creates a `tmp_path` SQLite file via the `init_db` fixture. Make sure the test fixture's `tmp_path` cleanup actually unlinks the file (or just let tmp_path handle it).

## Report
- Test count for new tests AND full suite
- Commit hash
- Any deviation
