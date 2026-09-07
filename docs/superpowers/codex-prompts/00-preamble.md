# Shared preamble — paste this at the top of every task prompt

You are executing a pre-approved implementation plan for the **LMPC Compliance Checker MVP** (SIH 2026 — Problem Statement 26034).

## Source documents (read in this order)

1. `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` — the full implementation plan. Read cover-to-cover before writing any code.
2. `/home/wind/Projects/sih/docs/superpowers/specs/2026-09-06-lmpc-compliance-checker-design.md` — design spec (for intent)
3. `/home/wind/Projects/sih/idea.md` — research + rule-citation verification log

## Working directory

`/home/wind/Projects/sih`

## Project context

- Not yet a git repo unless the task list says otherwise
- Python 3.12+ via `uv`. If `uv` is missing, install via `pip install uv` or use `python -m venv .venv` + `pip install -e .` instead.
- Node 20+ via `pnpm` (fall back to `npm` if pnpm missing).
- 14 tasks total. Execute only the task named in your prompt. The next task assumes this one finished cleanly.
- After tests pass, commit with the exact Conventional Commit message shown at the end of the task.

## Execution rules

1. **Follow the plan literally.** Every file path, every code block, every test command is spelled out — copy them exactly.
2. **Do not skip the tests.** Each task has its own test file and expected test output. Run pytest/vitest after the task and verify the expected pass count before committing.
3. **Do not add features beyond the plan.** If something is out of scope, leave it out.
4. **Do not change the rule citations** in rules.yaml. They are primary-source-verified against the Legal Metrology (Packaged Commodities) Rules 2011.
5. **Run only the task you were given.** Don't run ahead into later tasks.
6. **If a test fails, fix the code, not the test.** Unless the test is provably wrong.
7. **If a dependency install fails**, try the npm fallback, then report the issue at the end of your response.
8. **If you hit an ambiguity in the plan**, pick the most conservative interpretation (smallest code change), proceed, and flag it at the end of your response.

## Permissions

You have `--dangerously-bypass-approvals-and-sandbox` because this is a one-shot build. Execute freely.

## What to report at the end of your response

- Files created or modified
- Number of tests passed / failed
- The commit hash and short message
- Any deviations from the plan and why
- Any blockers you couldn't resolve

Begin now.
