# Errorist — SIH26034 LMPC Compliance Checker

Errorist is a local-first inspection workspace for checking packaged-commodity labels and e-commerce listing screenshots against the Legal Metrology (Packaged Commodities) Rules, 2011. It combines in-browser OCR, deterministic rule evaluation, evidence-linked findings, manual review, searchable inspection records, dashboards, and auditable exports.

## What the solution provides

- Guided retail-photo and e-commerce screenshot capture with image-quality guidance.
- Browser OCR with normalized word/line geometry; OCR assets are bundled for offline use.
- Versioned, deterministic checks with citations, evidence boxes, confidence, reasoning, and explicit `manual_review` outcomes when the image cannot support a safe decision.
- Authenticated inspector/admin workspaces, ownership boundaries, review history, and local user administration.
- Filtered repository and dashboard views plus PDF, DOCX, and spreadsheet-safe CSV exports.
- SQLite migrations that adopt the legacy schema without discarding existing scans.
- Security boundaries for credentialed browser requests, bounded image decoding, secure cookies, and same-origin API access.

## Architecture

```text
Browser (Next.js + Tesseract.js)
  ├─ local worker/WASM/language assets
  ├─ image + OCR geometry
  └─ same-origin /api/* requests
              │
              ▼
FastAPI
  ├─ authentication and role/ownership checks
  ├─ image-quality, extraction, placement, and rule engine
  ├─ SQLite + Alembic migrations
  └─ PDF / DOCX / filtered CSV exports
```

## Local quick start

Requirements: Python 3.12+, Node.js 20+, and pnpm. `uv` is optional and is not required by any project command.

```bash
git clone https://github.com/rishab11250/Errorist-SIH.git
cd Errorist-SIH

python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -e './backend[dev]'

cd frontend
pnpm install
cd ..
```

Create the first administrator. The command prompts for the password without echoing or storing it in shell history.

```bash
cd backend
.venv/bin/python -m scripts.bootstrap_admin --username admin --display-name "Local Administrator"
```

Start the services in two terminals:

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

```bash
cd frontend
LMPC_BACKEND_URL=http://127.0.0.1:8000 pnpm dev
```

Open `http://127.0.0.1:3000/login`. Database migrations run automatically when the backend starts.

## Verification

```bash
cd backend
.venv/bin/python -m ruff check app tests scripts
.venv/bin/python -m pytest -q

cd ../frontend
pnpm format:check
pnpm test:run
pnpm exec tsc --noEmit
pnpm build
```

See [backend/README.md](backend/README.md) for deployment, security, migration, backup, and role details; see [frontend/README.md](frontend/README.md) for the same-origin proxy, local OCR assets, and frontend commands.
