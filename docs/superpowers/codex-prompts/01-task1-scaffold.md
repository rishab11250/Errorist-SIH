[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 1: Repository scaffold** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find the section "## Task 1: Repository scaffold" and read every step.

## Steps to execute
1.1 through 1.10 — all 10 steps of Task 1. The plan spells out every file content and command. Copy them exactly.

## Expected outcome
- `git init` succeeds, user.name and user.email configured
- `.gitignore` exists at repo root with the listed contents
- `README.md` exists at repo root
- `backend/pyproject.toml` and `frontend/package.json` exist
- `uv sync` succeeds in `backend/`
- `pnpm install` (or `npm install` if pnpm missing) succeeds in `frontend/`
- The first commit is created with message `chore: scaffold backend (FastAPI + uv) and frontend (Next.js + pnpm) projects`

## Report at the end
- Commit hash
- Output of `git log --oneline -1`
- Whether pnpm was available or you had to fall back to npm
- Any deviation
