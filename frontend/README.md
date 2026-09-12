# CLAIR Frontend

The CLAIR (Commodity Label Audit & Inspection Recognition) Next.js workspace provides guided evidence capture, local Tesseract.js OCR, explainable inspection results, review actions, repository filters, dashboard charts with table alternatives, and administrator user management.

## Install and run

Node.js 20+ and pnpm are required.

```bash
cd frontend
pnpm install
LMPC_BACKEND_URL=http://127.0.0.1:8000 pnpm dev
```

Open `http://127.0.0.1:3000/login`. `LMPC_BACKEND_URL` is read by the Next.js server and defaults to `http://127.0.0.1:8000`; it is not exposed as a public browser variable.

## Same-origin API model

Browser code only requests relative `/api/*` paths. Next.js proxies those paths to `LMPC_BACKEND_URL`, keeping session cookies and API traffic on the browser-visible origin. Do not add a public API base URL or bypass `lib/api-client.ts` for browser mutations.

Production deployments should put Next.js behind HTTPS, set the backend's `LMPC_COOKIE_SECURE=true`, and add the exact browser-visible frontend origin to `LMPC_ALLOWED_BROWSER_ORIGINS`.

## Offline OCR assets

`pnpm install` runs `scripts/copy-tesseract-assets.mjs`, which copies the pinned Tesseract worker, all WebAssembly core variants, and the English trained-data model into `public/tesseract/`. `lib/ocr.ts` references only these same-origin paths:

```text
/tesseract/worker.min.js
/tesseract/core/*
/tesseract/lang/eng.traineddata.gz
```

The production Content Security Policy keeps `connect-src` at `'self'`; label OCR must not depend on a CDN or other runtime internet service. Re-run `pnpm ocr:assets` after changing a pinned Tesseract package.

## Installable offline shell

`pnpm build` generates `public/sw.js` from the production build output. The service worker precaches every hashed Next.js static asset, the web app manifest and icons, and every file under `public/tesseract/`. It also keeps the last successful capture-page HTML response as the navigation fallback. The generated worker is build-specific and intentionally ignored by Git.

The service worker is registered only in production. Verify it with `pnpm build && pnpm start`, visit the capture page once while online, then use the browser's offline network mode and reload. A transport failure during `/api/auth/me` uses a non-privileged offline inspector shell.

Pending on-device results use the fixed `lmpc-offline` IndexedDB database and `pending_scans` store. The service worker registers the `lmpc-sync-pending-scans` Background Sync task; browsers without that API retry while the installed app is open when connectivity returns. Sync requests go to the idempotent `/api/scan/sync` endpoint, which stores the pre-computed verdict snapshot with its capture-time `rule_version` instead of re-running the backend's current rules. The workspace indicator counts pending, syncing, and failed records. Safari and iOS cannot retry after the app has been fully closed, so reopen the app after connectivity returns.

## LMPC Rules Pipeline and Synchronization

The client-side rules engine reads precompiled rules from `frontend/lib/rules/rules.json`, which is derived from the single source of truth in `backend/app/rules.yaml`.

If you edit `backend/app/rules.yaml`, you **MUST** run `pnpm rules:compile` before committing, and CI/test suites (`pnpm rules:check` / `pytest backend/tests/test_rules_yaml.py`) will catch it and fail loudly if you don't. Automatic compilation also runs during `pnpm prebuild`, `pnpm pretest`, and `pnpm dev`.

## Formatting, tests, and production build

Prettier is intentionally scoped to frontend source and configuration files. Markdown, generated Next.js files, dependencies, coverage, and the lockfile are excluded.

```bash
cd frontend
pnpm format:check
pnpm test:run
pnpm exec tsc --noEmit
pnpm build
pnpm start
```

Use `pnpm format` to apply formatting. The production build adds:

- `Content-Security-Policy` restricting assets, connections, frames, forms, and objects.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: no-referrer`.

## Evidence capture limits

The UI accepts JPEG, PNG, and WebP evidence up to 10 MB and displays decoded preview dimensions. Retail mode can request the environment-facing camera; e-commerce mode remains a file/screenshot chooser. The backend independently enforces its configured byte and pixel limits.

## Third-party components

All UI source and dependencies are free for this application. Local notices, source links, licenses, modifications, and the rejected Aceternity review are recorded in `THIRD_PARTY_NOTICES.md`. No paid/private component service or runtime hosted font is required.
