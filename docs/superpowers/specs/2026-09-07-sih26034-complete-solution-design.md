# SIH26034 Complete Solution — Design Specification

**Date:** 2026-09-07
**Status:** Draft for written-spec review
**Problem statement:** SIH 2026 — SIH26034
**Extends:** `2026-09-06-lmpc-compliance-checker-design.md`
**Problem statement URL:** https://sih2026.vuce.in/ps/SIH26034

## 1. Purpose

Extend the working LMPC Compliance Checker from a five-rule prototype into a complete, offline-first inspection workspace for packaged commodities and e-commerce listing screenshots. The solution must help an inspector collect evidence, judge declaration completeness and correctness, assess placement and readability, retrieve prior scans, review uncertain findings, and export usable reports.

The implementation remains a Next.js application backed by FastAPI and SQLite. Next.js already uses React; there is no migration to a standalone React/Vite application.

## 2. Current baseline

The repository already provides:

- browser-side Tesseract.js OCR with normalized word bounding boxes;
- five deterministic LMPC declaration checks;
- FastAPI scan, scan-detail, history, dashboard, health, and PDF endpoints;
- SQLite persistence for scans and verdicts;
- an annotated-image results view;
- PDF reports containing the source image and verdict overlays;
- backend, frontend, type-check, and production-build tests.

This design adds the capabilities still needed for a convincing SIH26034 solution. Existing endpoints and stored scans remain readable while the new schema and API are introduced.

## 3. Product outcomes

An inspector can:

1. sign in to a local account;
2. capture or upload a retail-package photograph or upload an e-commerce listing screenshot;
3. receive automatic image-quality guidance without configuring font sizes or supplying a calibration card;
4. see declaration, format, placement, font/readability, and listing verdicts with evidence and confidence;
5. review uncertain results instead of receiving an unsupported legal conclusion;
6. search and filter the scan repository;
7. record review decisions and notes;
8. export a reviewed inspection as PDF or editable DOCX, and export filtered repository data as CSV;
9. view operational trends on a role-appropriate dashboard;
10. run the complete demo without an internet connection after installation.

## 4. Scope decomposition

The work is split into three bounded subprojects. Each receives its own implementation plan and can be verified independently.

| Workstream | Owns | Depends on | Detailed specification |
|---|---|---|---|
| Inspection intelligence | image quality, dynamic font/readability analysis, placement, expanded declarations, listing screenshots, confidence-aware verdicts | current OCR payload, rule loader, scan API | `2026-09-07-inspection-intelligence-design.md` |
| Operations experience | authentication, roles, searchable repository, reviews, exports, dashboard filters, consistent frontend design | current persistence and routes; inspection verdict contract | `2026-09-07-operations-experience-design.md` |
| Validation and demo readiness | real evaluation data, sample images/screenshots, regression gates, offline assets, end-to-end demo verification | both preceding workstreams | `2026-09-07-validation-demo-readiness-design.md` |

Implementation order is inspection intelligence, operations experience, then validation and demo readiness. Schema foundations shared by later work may be introduced in the first migration, but features remain separated by module and test boundary.

## 5. System architecture

```text
Retail photo or listing screenshot
        |
        v
Next.js capture/upload workspace
  - validates file
  - runs local Tesseract.js OCR
  - normalizes words, lines, confidence, and boxes
        |
        v
FastAPI authenticated scan endpoint
  - decodes the evidence image
  - computes visual quality and measurement confidence
  - extracts mode-specific declarations
  - evaluates declaration, placement, and readability rules
        |
        v
SQLite evidence repository
  - users and sessions
  - scans and visual metrics
  - verdicts and evidence boxes
  - review actions
        |
        +--------------------+
        |                    |
        v                    v
Review/search UI       PDF, DOCX, CSV exports
        |
        v
Filtered dashboard and audit history
```

### 5.1 Module boundaries

- `frontend/lib/ocr`: OCR only; returns words and line groupings.
- `backend/app/visual_analysis`: deterministic image-quality and measurement features; does not issue legal verdicts.
- `backend/app/extractors`: declaration candidates and evidence spans; no persistence.
- `backend/app/placement`: spatial relationships and principal-display-panel estimates.
- `backend/app/engine`: applies versioned rules to extracted and measured evidence.
- `backend/app/auth`: identity, sessions, password verification, and role checks.
- `backend/app/repositories`: database queries and migrations; no HTTP formatting.
- `backend/app/exports`: PDF, DOCX, and CSV rendering from a stable report model.
- Next.js route groups and components consume the API through one typed client.

Each module exposes typed inputs and outputs. Image-analysis algorithms can change without changing API response shapes; export renderers consume a shared report model rather than querying tables independently.

## 6. End-to-end scan contract

The scan request retains the current JSON shape and adds explicit schema and mode metadata:

```json
{
  "schema_version": 2,
  "image_b64": "data:image/jpeg;base64,...",
  "image_meta": {"width": 1920, "height": 1080, "dpi": null, "orientation": 1},
  "ocr_payload": [{"text": "MRP", "confidence": 0.96, "bbox": [0.1, 0.2, 0.05, 0.03]}],
  "ocr_lines": [{"word_indexes": [0], "bbox": [0.1, 0.2, 0.05, 0.03]}],
  "scan_context": {"mode": "retail_image", "category": "non_food"}
}
```

The response contains:

- the scan ID and processing status;
- overall compliance status;
- image-quality metrics and retake guidance;
- extracted fields;
- verdicts with citation, evidence, evidence boxes, confidence, reasoning, and measurement method;
- a `manual_review` marker whenever physical measurement or OCR evidence is insufficient.

Existing clients that omit version-2 fields continue through a compatibility adapter. New clients only emit version 2.

## 7. Confidence and status policy

The system distinguishes a compliance failure from weak evidence.

- `pass`: sufficient evidence meets the configured rule.
- `fail`: sufficient evidence proves a required declaration is absent or malformed.
- `warn`: a non-blocking quality or readability concern is supported by measurable evidence.
- `manual_review`: the system cannot make the legal determination confidently.
- `na`: the rule does not apply to the selected context.

Overall status is `fail` when any applicable verdict fails, `manual_review` when none fail but at least one requires review, `mixed` when none fail or require review but at least one warns, and `pass` otherwise. The UI always shows text and an icon in addition to color.

Photo defects never become declaration failures by themselves. A blurred image produces retake guidance or manual review, not a claim that the physical label is unlawful.

## 8. Data and migration strategy

SQLite remains the default database. Alembic migrations replace implicit `create_all` evolution for production data. The migration adds ownership and analysis fields to scans, extends verdict evidence, and introduces `users`, `sessions`, and `review_actions`.

Images remain local evidence. Configuration defines maximum upload size, accepted MIME types, image retention, session lifetime, and database path. No evidence leaves the machine unless a future deployment explicitly enables a remote store.

The deployment guide documents a cloud migration path: PostgreSQL-compatible persistence, object storage for images, reverse-proxy TLS, and externally managed identity. None is required for the SIH demo.

## 9. API conventions

All application endpoints remain under `/api`. Protected routes use an opaque session cookie. Every error uses:

```json
{
  "error": "machine_readable_code",
  "detail": "Actionable user-facing explanation",
  "request_id": "uuid"
}
```

Lists use stable pagination and return `{items, page, page_size, total}`. Date/time values are ISO 8601 UTC. Unknown scan IDs return 404, invalid uploads return 400, unreadable OCR returns 422, unauthenticated requests return 401, and forbidden role actions return 403.

## 10. Offline-first deployment

The demo runs as two local processes with one SQLite database:

- Next.js serves the React UI and proxies `/api` to FastAPI so session cookies are same-origin;
- FastAPI serves analysis, persistence, and exports;
- OCR workers, traineddata, fonts, icons, and sample media are bundled locally;
- no UI component, analytics, font, OCR, or report dependency is fetched at runtime.

Containerization may be supplied for repeatability, but a documented local `pnpm` plus Python virtual-environment path remains supported because `uv` is not assumed to be available.

## 11. Security and privacy

- Passwords are stored only as Argon2 hashes.
- Session tokens are random, stored hashed, rotated on login, revocable, and expired server-side.
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` outside local HTTP development.
- Mutating requests enforce same-origin checks and JSON content types.
- Uploads are validated by decoded content, dimensions, and byte limits rather than filename alone.
- Image data and OCR text are escaped before presentation and never inserted as HTML.
- Report filenames and CSV cells are sanitized; CSV formula prefixes are neutralized.
- Inspectors can access their own scans; administrators can access all scans and manage users.
- Review actions record actor and timestamp and are append-only through the normal API.

This is suitable for a local SIH demonstration, not a substitute for a production government security assessment.

## 12. Acceptance criteria

The complete solution is ready when:

- retail photographs and listing screenshots follow distinct, tested rule profiles;
- every supported declaration has evidence boxes or an explicit absence explanation;
- font/readability assessment is automatic and uncertain physical measurements use `manual_review`;
- placement findings cite the spatial evidence used;
- authentication and inspector/admin authorization are enforced server-side;
- scans can be searched and filtered without loading the entire table;
- PDF and DOCX represent the same scan/review data and CSV matches active filters;
- bundled samples demonstrate pass, fail, manual-review, and e-commerce cases;
- the real evaluation runner reports measured results without hard-coded performance claims;
- backend tests, frontend tests, type checking, production build, migrations, and the offline end-to-end smoke test pass.

## 13. Superseded decisions

This specification deliberately supersedes these MVP exclusions in the 2026-09-06 design:

- font/readability and placement analysis are now in scope;
- uploaded e-commerce screenshots are now in scope, while live URL scraping remains out of scope;
- role-based local authentication is now in scope;
- editable DOCX and filtered CSV exports are now in scope;
- a real evaluation set and bundled sample evidence are now required.

All original implemented behavior not contradicted here remains valid.

## 14. References

- SIH26034 problem statement: https://sih2026.vuce.in/ps/SIH26034
- Existing design: `docs/superpowers/specs/2026-09-06-lmpc-compliance-checker-design.md`
- Existing implementation plan: `docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md`
- shadcn/ui: https://ui.shadcn.com/docs
- Rare UI: https://www.rareui.com/
- Magic UI: https://magicui.design/docs/installation
- Aceternity UI: https://ui.aceternity.com/components
- React Bits free catalog: https://reactbits.dev/
- 21st.dev: https://21st.dev/
- Chakra UI: https://chakra-ui.com/
