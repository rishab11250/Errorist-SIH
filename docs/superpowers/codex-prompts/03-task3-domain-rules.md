[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 3: Domain types + rules.yaml + rules_loader** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 3: Domain types + rules.yaml + rules_loader"

## Steps to execute
3.1 through 3.9.

## Expected outcome
- 4 files created: `backend/app/domain.py`, `backend/app/rules_loader.py`, `backend/app/rules.yaml`, `backend/tests/conftest.py`, `backend/tests/test_rules_yaml.py` (5 files total)
- `backend/app/main.py` modified to load rules at startup via lifespan handler
- `uv run pytest tests/test_rules_yaml.py tests/test_health.py -v` shows **11 passed** (2 from health + 9 from rules_yaml)
- Smoke test: curl `/api/health` returns `{"status":"ok","rules_version":"2026-09"}`
- Commit: `feat(backend): domain types, rules.yaml with 5 MVP checks + both Rule 7 versions, loader + validation`

## Important
- The rules.yaml is the legal core of the project. **Do not modify the citations or the regexes** beyond what the plan specifies.
- The two Rule 7 versions must both be present and the `default_version` must be `consolidated_post_2021`.
- The five MVP rule IDs are exactly: `r6_1_e_mrp`, `r6_1_c_net_quantity`, `r6_1_a_address`, `r6_2_consumer_care`, `r6_1_d_mfg_date`.

## Report
- Test count and pass status
- Commit hash
- Any deviation
