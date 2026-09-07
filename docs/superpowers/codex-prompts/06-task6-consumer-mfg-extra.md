[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 6: Consumer care + mfg date + common name + country origin extractors + tests** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 6: Consumer care + mfg date + common name + country origin extractors + tests"

## Steps to execute
6.1 through 6.8.

## Expected outcome
- 6 files created: `backend/app/extractors/consumer_care.py`, `backend/app/extractors/mfg_date.py`, `backend/app/extractors/common_name.py`, `backend/app/extractors/country_origin.py`, `backend/tests/test_extract_consumer_care.py`, `backend/tests/test_extract_mfg_date.py`
- Update `backend/app/extractors/__init__.py` to export all four new extractors
- `uv run pytest tests/test_extract_consumer_care.py tests/test_extract_mfg_date.py -v` shows **8 passed** (4 + 4)
- Full test suite still passes (`uv run pytest -v` should show ≥ 34 passed total)
- Commit: `feat(extractors): consumer care, mfg date, common name, country origin + 8 tests`

## Note
The plan's mfg_date test file has some redundant intermediate `words = [...]` assignments in `test_extracts_word_month` — that's a copy-paste artifact in the plan. Just write the final clean version that uses a single-token combined case (e.g., `Manufactured:January` as one OCRWord) so the test is reliable.

## Report
- Test count for the new tests AND full suite
- Commit hash
- Any deviation
