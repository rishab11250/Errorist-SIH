# Backend (FastAPI)

OCR payload → extract fields → rule engine → verdict list → SQLite + ReportLab PDF.

## Quick start

```bash
uv sync
uv run uvicorn app.main:app --reload
```

If `uv` is unavailable: `python -m venv .venv && .venv/bin/python -m pip install -e '.[dev]'`.

## Tests and tools

```bash
uv run pytest -v
uv run python -m scripts.seed_demo
uv run python -m scripts.run_eval
```

Key modules: `app/main.py` (entrypoint), `app/engine.py` (pure rule engine), `app/rules.yaml` (rules), `app/extractors/`, `app/db.py`, `app/scan_routes.py`, `app/dashboard_routes.py`, and `app/report_routes.py`.
