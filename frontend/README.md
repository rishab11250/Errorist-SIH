# Frontend (Next.js)

Upload → Tesseract.js OCR → POST to backend → annotated overlay + PDF download.

## Quick start

```bash
pnpm install
pnpm dev
```

## Tests

```bash
pnpm test:run
npx tsc --noEmit
```

Set `NEXT_PUBLIC_API_BASE` to override the backend URL (default: `http://localhost:8000`). The app contains upload, results, history, and dashboard pages; `lib/ocr.ts`, `lib/api.ts`, `lib/bbox.ts`, and `lib/types.ts` contain the client integration layer.
