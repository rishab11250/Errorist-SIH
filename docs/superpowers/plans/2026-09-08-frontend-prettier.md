# Frontend Prettier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic Prettier commands and format only frontend source and configuration files.

**Architecture:** Prettier runs locally from the frontend package through explicit `format` and `format:check` scripts. A repository-local configuration defines stable style, while an ignore file prevents dependencies, generated output, Markdown, Python, and the pnpm lockfile from entering the formatting scope.

**Tech Stack:** Prettier 3.6.2, pnpm, TypeScript, TSX, CSS, JSON, YAML, Next.js 14

## Global Constraints

- Format only frontend source and configuration extensions: `ts`, `tsx`, `js`, `mjs`, `css`, `json`, `yaml`, and `yml`.
- Do not format Markdown, Python, `pnpm-lock.yaml`, `.next`, `node_modules`, `next-env.d.ts`, TypeScript build metadata, coverage, or build output.
- Use single quotes, semicolons, ES5-compatible trailing commas, and a 100-character print width.
- Do not install a Tailwind class-sorting plugin.
- Keep Ruff responsible for Python formatting and linting.

---

### Task 1: Install, configure, apply, and verify Prettier

**Files:**
- Create: `frontend/prettier.config.mjs`
- Create: `frontend/.prettierignore`
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`
- Format: matching frontend source and configuration files selected by the package scripts
- Test: `frontend/package.json` scripts `format:check`, `test:run`, `build`

**Interfaces:**
- Produces: `pnpm format` for writes and `pnpm format:check` for read-only verification.
- Preserves: existing TypeScript, Vitest, and Next.js behavior.

- [ ] **Step 1: Install the pinned local formatter**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm add -D --save-exact prettier@3.6.2
```

Expected: exit 0; `prettier` appears under `devDependencies` with exact version `3.6.2`, and `pnpm-lock.yaml` is updated without a paid or private registry.

- [ ] **Step 2: Add deterministic configuration, exclusions, and scripts**

Create `frontend/prettier.config.mjs`:

```js
/** @type {import('prettier').Config} */
const config = {
  printWidth: 100,
  singleQuote: true,
  semi: true,
  trailingComma: 'es5',
};

export default config;
```

Create `frontend/.prettierignore`:

```text
.next/
node_modules/
coverage/
pnpm-lock.yaml
next-env.d.ts
*.tsbuildinfo
**/*.md
```

Add these entries to `frontend/package.json` under `scripts`:

```json
"format": "prettier --write \"**/*.{ts,tsx,js,mjs,css,json,yaml,yml}\"",
"format:check": "prettier --check \"**/*.{ts,tsx,js,mjs,css,json,yaml,yml}\""
```

- [ ] **Step 3: Verify the formatting check detects current drift**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm format:check
```

Expected: non-zero exit with at least one matching frontend source file reported as needing formatting; ignored Markdown, `pnpm-lock.yaml`, `.next`, and `node_modules` do not appear.

- [ ] **Step 4: Apply the scoped formatting pass**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm format
```

Expected: exit 0; only allowed frontend source and configuration extensions are rewritten. Inspect `git status --short` and confirm no generated/dependency path is staged or newly tracked.

- [ ] **Step 5: Verify formatting and application behavior**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm format:check
pnpm test:run
pnpm exec tsc --noEmit
pnpm build
```

Expected: all commands exit 0, with all frontend tests passing and the Next.js production build completing successfully.

- [ ] **Step 6: Commit the formatter and resulting frontend formatting**

Run:

```bash
cd /home/wind/Projects/sih
git add frontend/.prettierignore frontend/prettier.config.mjs frontend/package.json frontend/pnpm-lock.yaml frontend/app frontend/components frontend/lib frontend/middleware.ts frontend/next.config.mjs frontend/postcss.config.mjs frontend/tailwind.config.ts frontend/tests frontend/tsconfig.json frontend/vitest.config.ts frontend/pnpm-workspace.yaml docs/superpowers/plans/2026-09-08-frontend-prettier.md
git diff --cached --check
git commit -m "chore(frontend): add deterministic prettier formatting"
git push origin HEAD:main
```

Expected: commit and push succeed; `frontend/node_modules`, `frontend/.next`, Markdown other than this checklist, backend files, and unrelated untracked artifacts are absent from the commit.
