[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 4: Extractor base + manufacturer extractor + tests** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 4: Extractor base + manufacturer extractor + tests"

## Steps to execute
4.1 through 4.6.

## Expected outcome
- 4 files created: `backend/app/extractors/__init__.py`, `backend/app/extractors/base.py`, `backend/app/extractors/manufacturer.py`, `backend/tests/test_extract_manufacturer.py`
- `uv run pytest tests/test_extract_manufacturer.py -v` shows **5 passed**
- Commit: `feat(extractors): manufacturer address extractor + base helpers + 5 tests`

## Note
The `__init__.py` references extractors from later tasks (net_quantity, mrp, etc.) — those don't exist yet. **Temporarily stub them** or comment them out so `from app.extractors import ...` doesn't fail at import time. Alternatively, create the `__init__.py` with only the manufacturer extractor exported; you'll add the others in later tasks.

The most robust approach: in `__init__.py`, define a `__getattr__` lazy-loader that imports each module only when its name is accessed. The plan's literal `__init__.py` won't work until Tasks 5–6 are done, so adapt it.

## Report
- Test count and pass status
- Commit hash
- Any deviation from the literal `__init__.py` shown in the plan
