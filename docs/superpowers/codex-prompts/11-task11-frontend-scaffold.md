[Paste contents of 00-preamble.md here, then continue:]

# Your task

Execute **Task 11: Next.js scaffold + upload page + Tesseract.js + bbox lib** only.

## Read first
- `/home/wind/Projects/sih/docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md` → find "## Task 11: Next.js scaffold + upload page + Tesseract.js + bbox lib"

## Steps to execute
11.1 through 11.18.

## Expected outcome
- 13 files: `frontend/tsconfig.json`, `frontend/next.config.mjs`, `frontend/tailwind.config.ts`, `frontend/postcss.config.mjs`, `frontend/app/layout.tsx`, `frontend/app/page.tsx`, `frontend/app/globals.css`, `frontend/lib/ocr.ts`, `frontend/lib/bbox.ts`, `frontend/lib/api.ts`, `frontend/lib/types.ts`, `frontend/components/UploadDropzone.tsx`, `frontend/tests/bbox.test.ts`, `frontend/vitest.config.ts` (14 files)
- `cd frontend && pnpm test:run` (or `npm test -- --run` if pnpm missing) shows **3 passed**
- `cd frontend && npx tsc --noEmit` shows no errors
- Dev server starts, `curl -o /dev/null -w "%{http_code}" http://localhost:3000` returns `200`
- Commit: `feat(frontend): Next.js scaffold + upload page + Tesseract.js wrapper + bbox lib + 3 tests`

## Note
- The plan uses `pnpm`. If pnpm is not installed, run `npm install` (slower) and use `npx vitest run` instead of `pnpm test:run`. Note the fallback in your report.
- The Tesseract.js worker import pattern in the plan should work. If `createWorker` complains about TypeScript types, add a `// @ts-expect-error` above the import or add `import type { Worker } from 'tesseract.js'` at the top. Don't fight the types for more than 2 minutes — fall back to `any`.
- The dev server smoke test (step 11.17) may take longer than `sleep 5` on a slow machine. Bump to `sleep 10` if needed.

## Report
- Test count
- Commit hash
- pnpm vs npm
- Any deviation
