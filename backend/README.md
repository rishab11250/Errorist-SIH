# Errorist backend

The FastAPI service stores authenticated inspections, evaluates normalized OCR and image evidence against versioned LMPC rules, and generates PDF, DOCX, and filtered CSV reports.

## Install without `uv`

Python 3.12 or newer is required. From the repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -e './backend[dev]'
```

If `uv` is available, `cd backend && uv sync` is an optional equivalent. All documented run and test commands use `.venv/bin/python` so `uv` is never required.

## Configuration

The defaults are suitable for a loopback-only local demo. Example production-style configuration (replace paths and origins for the deployment):

```bash
export LMPC_DB_PATH=/srv/errorist/data/lmpc.db
export LMPC_SESSION_HOURS=8
export LMPC_COOKIE_NAME=lmpc_session
export LMPC_COOKIE_SECURE=true
export LMPC_MAX_UPLOAD_BYTES=10000000
export LMPC_MAX_IMAGE_PIXELS=24000000
export LMPC_BACKEND_ORIGIN=https://lmpc-api.example.invalid
export LMPC_ALLOWED_BROWSER_ORIGINS=https://lmpc.example.invalid
```

`LMPC_ALLOWED_BROWSER_ORIGINS` is a comma-separated list of exact `http` or `https` origins. Wildcards, paths, queries, and fragments are rejected. Local defaults are `http://127.0.0.1:3000,http://localhost:3000`. Credentialed deployments must never combine cookies with a wildcard origin.

Set `LMPC_COOKIE_SECURE=true` whenever the browser reaches the application over HTTPS. Cookies are HTTP-only, `SameSite=Lax`, bounded by `LMPC_SESSION_HOURS`, and stored server-side only as token hashes.

Images are limited twice: decoded bytes by `LMPC_MAX_UPLOAD_BYTES` and dimensions by `LMPC_MAX_IMAGE_PIXELS`. JPEG, PNG, and WebP are accepted after their content is decoded and verified; the submitted filename or claimed MIME type is not trusted.

## Database migration and administrator bootstrap

Backend startup upgrades a fresh, versioned, or recognized legacy SQLite database to migration `0003_operations`. The migration entry point takes an exclusive lock, checks legacy schema compatibility and foreign keys, and does not overwrite existing scans.

Start once to migrate and serve:

```bash
cd backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Create the initial administrator in an interactive terminal:

```bash
cd backend
.venv/bin/python -m scripts.bootstrap_admin \
  --username admin \
  --display-name "Local Administrator"
```

For non-interactive provisioning only, `LMPC_BOOTSTRAP_PASSWORD` can provide the password to that command. Treat it as a secret, remove it from the environment immediately afterward, and never commit it.

## Role and ownership matrix

| Capability | Anonymous | Inspector | Administrator |
|---|---:|---:|---:|
| Health check | Yes | Yes | Yes |
| Create inspection | No | Yes | Yes |
| Read/export own inspection | No | Yes | Yes |
| Read/export another inspector's inspection | No | No (404) | Yes |
| Filter repository/dashboard by owner | No | No | Yes |
| Add review action to visible inspection | No | Yes | Yes |
| List/create/update local users | No | No | Yes |
| Remove the final active administrator | No | No | No |

Inactive users and expired, revoked, malformed, or unknown session cookies receive an authentication failure. Deactivation and password reset revoke that user's active sessions.

## Browser request security

For `POST`, `PATCH`, and `DELETE`, the service rejects a present `Origin` outside the exact allowlist and rejects `Sec-Fetch-Site: cross-site`. Body-bearing JSON API requests require `Content-Type: application/json`; bodyless logout remains valid. Use the Next.js same-origin `/api/*` proxy in the browser rather than calling FastAPI from a different origin.

## Reports

- `GET /api/exports/scans/{id}.pdf` — immutable evidence report with annotated image.
- `GET /api/exports/scans/{id}.docx` — editable report with the same core values.
- `GET /api/exports/scans.csv?<filters>` — all authorized records matching the active repository filters; spreadsheet-formula prefixes are neutralized.
- `GET /api/report/{id}` — backward-compatible PDF route.

Every export uses the caller's authorized scan scope. Inspectors receive 404 for another owner's record so existence is not disclosed.

## Backup and restore

Stop the backend before copying SQLite files so the database and any journal are consistent.

```bash
install -d -m 700 /srv/errorist/backups
cp --preserve=mode,timestamps /srv/errorist/data/lmpc.db \
  /srv/errorist/backups/lmpc-$(date +%Y%m%d-%H%M%S).db
```

To restore, stop the backend, preserve the current file under a different name, copy the selected backup to the configured `LMPC_DB_PATH`, ensure only the service account can read it, and start the backend. Startup validates and upgrades the restored database.

## Tests and maintenance commands

```bash
cd backend
.venv/bin/python -m ruff check app tests scripts
.venv/bin/python -m pytest -q
.venv/bin/python -m scripts.seed_demo
.venv/bin/python -m scripts.run_eval
```

Important modules are `app/analysis_pipeline.py`, `app/engine.py`, `app/rules.yaml`, `app/repositories/scans.py`, `app/exports/`, `app/auth/`, and `app/users/`.
