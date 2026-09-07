[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 5: Net quantity + MRP extractors + tests** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 5: Net quantity + MRP extractors + tests"

## Steps to execute
5.1 through 5.6.

## Expected outcome
- 4 files created: `backend/app/extractors/net_quantity.py`, `backend/app/extractors/mrp.py`, `backend/tests/test_extract_net_quantity.py`, `backend/tests/test_extract_mrp.py`
- Update `backend/app/extractors/__init__.py` to export `extract_net_quantity` and `extract_mrp`
- `uv run pytest tests/test_extract_net_quantity.py tests/test_extract_mrp.py -v` shows **10 passed** (5 + 5)
- All previously passing tests still pass (`uv run pytest -v` shows ≥ 5 + 11 + 10 = 26 passed total)
- Commit: `feat(extractors): net quantity + MRP extractors with 10 tests`

## Report
- Test count and pass status for both the new tests AND the full test suite
- Commit hash
- Any deviation
