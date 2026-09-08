# Errorist frontend

The Next.js workspace provides guided evidence capture, local Tesseract.js OCR, explainable inspection results, review actions, repository filters, dashboard charts with table alternatives, and administrator user management.

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
