[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 14: Polish + demo rehearsal + pitch deck** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 14: Polish + demo rehearsal + pitch deck"

## Steps to execute
14.1 through 14.5.

## Expected outcome
- 3 files: `backend/README.md`, `frontend/README.md`, `PITCH.md` (at repo root)
- Optional: `backend/app/reports.py` modified to wire the on-page annotated image per spec §4.6 — only do this if it's a small change
- Final smoke test: both servers start, `/api/health` returns ok, frontend index loads
- `git log --oneline` shows 14 commits (one per task)
- Commit: `docs: README files for backend + frontend + pitch talk-track`

## Note
- The plan step 14.4 is a full-stack smoke test. Both uvicorn and `pnpm dev` will be running in the background — use `&` for each, then `sleep 10`, then curl, then `pkill -f uvicorn; pkill -f next` to clean up. The smoke test is verification, not part of the commit.
- The annotated-image wiring in step 14.4 mentions modifying `reports.py`. The plan's `build_report` function uses a callback `onLaterPages` that draws the annotated image but the callback passed in step 10.1 is a no-op. To wire it properly: pass `_draw_annotated_image` as the `onLaterPages` callback. Make this change if it's quick (under 5 minutes); otherwise skip and flag it as polish work.

## Final deliverable — report all of these:

1. **Commit list** — output of `git log --oneline`
2. **Backend test summary** — `uv run pytest -v` final tail
3. **Frontend test summary** — `pnpm test:run` (or `npx vitest run`) final tail
4. **Total commits**: 14 expected
5. **Any deviations** from the plan, with brief justification
6. **Anything that didn't work** that the team should know about

End your response with the commit list and test totals.
