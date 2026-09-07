[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 13: Eval set + run_eval.py + Day 6 validation** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 13: Eval set + run_eval.py + Day 6 validation (PROTECTED BUFFER)"

## Steps to execute
13.1 through 13.9. **Skip step 13.6** (Ammar's data-collection step — the team will populate the CSV with real images later, not in this build).

## Expected outcome
- 4 files: `backend/tests/eval/.gitkeep`, `backend/tests/eval/README.md`, `backend/tests/eval/eval_set.csv` (with just the header row, no data), `backend/scripts/run_eval.py`, `backend/scripts/README.md` (5 files)
- `cd backend && uv run python -m scripts.run_eval` exits with code 1 (because the CSV has no rows), prints "eval_set.csv not found" OR runs without crashing and produces an empty results.json. Either is acceptable — note which in your report.
- `cd backend && uv run pytest -v` runs all backend tests; all should still pass (≥ 51 passed)
- Commit: `feat(eval): eval CSV schema + run_eval.py + scripts README + placeholder CSV`

## Note
- The plan says "exit with code 1 if CSV not found". But since the CSV does exist (just empty), the script will try to read it, find 0 data rows, and exit with code 0 (since the no-recall-check guard `min_recall < 0.8` will compute min over an empty dict — that's a Python `ValueError`). The simplest fix: make the `main()` function return 0 if `summary` is empty (no rows means no evaluation happened, not a failure).
- Don't write the OCR helper Node.js script. The plan notes "OCR-on-image evaluation is for later".

## Report
- Output of `run_eval.py`
- Test count
- Commit hash
- Whether you had to patch the script to handle empty CSV
- Any deviation
