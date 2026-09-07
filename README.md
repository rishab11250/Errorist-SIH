# SIH 26034 — LMPC Compliance Checker

Web app that checks packaged-commodity labels for compliance with the
Legal Metrology (Packaged Commodities) Rules, 2011.

- Design spec: `docs/superpowers/specs/2026-09-06-lmpc-compliance-checker-design.md`
- Idea doc (research + citations): `idea.md`
- Implementation plan: `docs/superpowers/plans/2026-09-06-lmpc-compliance-checker.md`

## Quick start

Backend: `cd backend && uv sync && uv run uvicorn app.main:app --reload`
Frontend: `cd frontend && pnpm install && pnpm dev`
