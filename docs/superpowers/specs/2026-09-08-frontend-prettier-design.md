# Frontend Prettier Design

**Date:** 2026-09-08  
**Status:** Approved design

## Goal

Make frontend formatting deterministic and repeatable without changing the Python, documentation, dependency, or generated-file workflows.

## Scope

Install a pinned Prettier development dependency in `frontend` and add repository-local configuration. Prettier will format frontend source and configuration files with extensions `ts`, `tsx`, `js`, `mjs`, `css`, `json`, `yaml`, and `yml`.

The formatter will not process Markdown, Python, the generated pnpm lockfile, `.next`, `node_modules`, TypeScript build metadata, generated Next environment declarations, coverage, or other build output. Ruff remains the Python formatter and linter.

## Commands

`frontend/package.json` will expose:

- `pnpm format` to rewrite matching frontend source and configuration files;
- `pnpm format:check` to verify the same files without changing them.

Both commands will use an explicit file-extension pattern rooted in the frontend directory. `.prettierignore` provides a second safety boundary for generated and dependency paths.

## Formatting policy

The local Prettier configuration will preserve the codebase's existing conventions: single quotes, semicolons, trailing commas where valid in ES5, and a 100-character print width. No Tailwind class-sorting plugin will be installed, avoiding a large unrelated class-order rewrite.

## Integration and verification

Run Prettier once across the allowed scope, then run:

1. `pnpm format:check`
2. `pnpm test:run`
3. `pnpm exec tsc --noEmit`
4. `pnpm build`

Formatting changes must not alter application behavior. The implementation commit will contain the formatter configuration, package changes, and resulting frontend-only formatting updates. Dependencies and generated output remain ignored and unstaged.
