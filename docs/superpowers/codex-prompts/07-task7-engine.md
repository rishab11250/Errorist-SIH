[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 7: Rule engine + engine tests** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 7: Rule engine + engine tests"

## Steps to execute
7.1 through 7.4.

## Expected outcome
- 2 files created: `backend/app/engine.py`, `backend/tests/test_engine.py`
- `uv run pytest tests/test_engine.py -v` shows **7 passed**
- Full suite still passes (≥ 41 passed)
- Commit: `feat(engine): rule engine with pass/fail/warn/na states + 7 tests`

## Note
The plan's `_subfield_present` function for the consumer care check has a subtle bug in how it derives `consumer_care_name` (uses `len(text.split()) >= 2` for "name"). That's fine for the test cases in the plan. Don't over-engineer it.

## Report
- Test count for engine tests AND full suite
- Commit hash
- Any deviation
