[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 10: ReportLab PDF generation + /api/report/:id** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 10: ReportLab PDF generation + /api/report/:id"

## Steps to execute
10.1 through 10.8.

## Expected outcome
- 4 files: `backend/app/reports.py`, `backend/app/report_routes.py`, `backend/app/main.py` (modified), `backend/tests/test_report_routes.py`
- `uv run pytest tests/test_report_routes.py -v` shows **3 passed**
- Full suite still passes (≥ 51 passed)
- Smoke test: `curl http://localhost:8000/api/report/1 -o /tmp/test.pdf` produces a file starting with `%PDF`
- Commit: `feat(backend): ReportLab PDF generation + /api/report/:id + 3 tests`

## Note
The plan explicitly says the annotated-image callback is not wired in this task's first pass — the PDF includes the rule verdict table only. Don't try to draw the image with bboxes yet; that's polish for Task 14. The `_draw_annotated_image` function in the plan is defined but unused; that's fine, leave it as a no-op stub.

## Important dependency
ReportLab PDF generation requires `Pillow` for the PIL import in `_draw_annotated_image`. Pillow is NOT in the plan's `pyproject.toml`. Two options:
1. Add `pillow` to `pyproject.toml` dependencies (preferred — minimal addition)
2. Remove the PIL import since the function isn't used yet

Choose option 1 unless it conflicts with the "no extra features" rule.

## Report
- Test count for new tests AND full suite
- Commit hash
- Whether you added `pillow` to pyproject.toml
- Any deviation
