[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 12: Results page + AnnotatedImage + history + dashboard** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 12: Results page + AnnotatedImage + history + dashboard"

## Steps to execute
12.1 through 12.11.

## Expected outcome
- 8 files: `frontend/app/scan/[id]/page.tsx`, `frontend/app/history/page.tsx`, `frontend/app/dashboard/page.tsx`, `frontend/components/AnnotatedImage.tsx`, `frontend/components/VerdictCard.tsx`, `frontend/components/VerdictBadge.tsx`, `frontend/components/DashboardCards.tsx`, `frontend/components/ScanHistoryTable.tsx`
- `cd frontend && npx tsc --noEmit` shows no errors
- Smoke test (step 12.10): both `http://localhost:3000` and `http://localhost:8000/api/health` return 200
- Commit: `feat(frontend): results page with annotated overlay + history + dashboard + 5 new components`

## Note
- The plan has `AnnotatedImage` draw coloured rectangles using SVG (not canvas). That's the right approach — copy the SVG code from the plan verbatim.
- The `ScanHistoryTable` component receives `thumbnail_b64` strings that are 200 chars + "..." (per the `/api/history` endpoint's truncation). Don't try to render these as images — they're just text markers. The plan's table doesn't show thumbnails; it shows the scan ID, status, verdict summary, and date. That's fine for MVP.
- The dashboard endpoint may not return data if no scans exist. The frontend should handle the empty state gracefully. The plan does this via `data.recent_activity.length` and `data.total_scans === 0` checks.

## Report
- Test count (vitest + tsc clean)
- Commit hash
- Any deviation
