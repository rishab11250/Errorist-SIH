# Validation and Demo Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder evaluation with reproducible evidence, bundle representative retail and listing samples, verify the protected application in real browsers, and make the complete demo run without external network access.

**Architecture:** A versioned manifest and JSONL ground truth describe every evidence image. Deterministic engine evaluation consumes committed OCR fixtures; end-to-end evaluation uses the same Tesseract.js worker wrapper as the UI and submits to the local API. Playwright verifies user journeys and blocks non-local requests, while scripts provide repeatable startup, smoke testing, and shutdown.

**Tech Stack:** Python 3.12+, Pydantic, Pillow, pytest; Node 20+, TypeScript, Tesseract.js 5, `@tesseract.js-data/eng`, Sharp, Vitest, Playwright; Next.js and FastAPI local services.

## Global Constraints

- Execute only after the inspection-intelligence and operations-experience completion gates pass.
- The committed dataset contains at least 30 examples split by product into `development` and `test`.
- Ground truth is never overwritten by an evaluation command.
- Every asset declares `team_captured`, `synthetic`, or `redistributable` source classification.
- Do not commit personal data, user account identifiers, proprietary marketplace screenshots, or assets with unclear redistribution rights.
- Bundled demo samples use the real OCR/API path; no hard-coded scan result is allowed.
- Engine mode uses committed OCR fixtures; E2E mode uses the same OCR core used by the browser.
- Percentages include support count, dataset digest, split, and run date.
- Zero-support metrics are `not_measured`.
- The unsafe-decision metric is a ground-truth compliance failure automatically reported as `pass`.
- Runtime requests may target only the local Next.js/FastAPI origins.
- Backend commands use `backend/.venv/bin/python`; `uv` is not required.

---

## Target file map

```text
backend/tests/eval/
  manifest.csv
  ground_truth.jsonl
  ocr/
  images/retail/
  images/ecommerce/
  README.md
backend/app/evaluation.py
backend/scripts/validate_eval.py
backend/scripts/run_eval.py
backend/scripts/generate_synthetic_eval.py
backend/scripts/import_team_captures.py
frontend/public/sample-labels/
frontend/public/tesseract/worker.min.js
frontend/public/tesseract/core/*
frontend/public/tesseract/lang/eng.traineddata.gz
frontend/scripts/copy-tesseract-assets.mjs
frontend/scripts/eval-ocr.ts
frontend/lib/ocr-core.ts
frontend/components/inspection/SampleGallery.tsx
frontend/e2e/*.spec.ts
frontend/playwright.config.ts
scripts/start-demo.sh
scripts/stop-demo.sh
scripts/offline-smoke.sh
docs/demo-runbook.md
```

## Task 1: Define and validate the evaluation dataset contract

**Files:**
- Create: `backend/app/evaluation.py`
- Create: `backend/scripts/validate_eval.py`
- Create: `backend/tests/test_eval_schema.py`
- Modify: `backend/tests/eval/README.md`

**Interfaces:**
- Produces: `load_dataset(root: Path, split: str) -> EvalDataset` and `dataset_digest(dataset) -> str`.
- Validates: paths, hashes, split isolation, statuses, rule IDs, boxes, and source/license metadata.

- [x] **Step 1: Write schema tests against temporary datasets**

```python
def test_valid_dataset_loads_and_has_stable_digest(tmp_path):
    root = write_minimal_dataset(tmp_path, image_bytes=PNG_BYTES)
    first = load_dataset(root, split="test")
    second = load_dataset(root, split="test")
    assert first.examples[0].example_id == "RET-001"
    assert dataset_digest(first) == dataset_digest(second)


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("bad_hash", "sha256 mismatch"),
        ("escaping_path", "path must stay inside dataset"),
        ("unknown_status", "invalid verdict status"),
        ("same_product_across_splits", "product_id crosses splits"),
        ("invalid_bbox", "bbox must be normalized"),
    ],
)
def test_invalid_dataset_is_rejected(tmp_path, mutation, message):
    root = write_invalid_dataset(tmp_path, mutation)
    with pytest.raises(DatasetError, match=message):
        load_dataset(root, split="test")
```

- [x] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_eval_schema.py -q`.

Expected: FAIL because `app.evaluation` does not exist.

- [x] **Step 3: Implement explicit schema models**

Use these manifest columns:

```csv
example_id,product_id,split,mode,category,imported,condition,image_path,sha256,source_classification,source_note,ocr_path
```

Each JSONL record has:

```json
{
  "example_id": "RET-001",
  "quality_status": "acceptable",
  "verdicts": {
    "r6_1_e_mrp": {
      "status": "pass",
      "evidence": "MRP ₹99 Inclusive of all taxes",
      "bboxes": [[0.10, 0.50, 0.50, 0.06]]
    }
  },
  "annotator": "sih-team",
  "reviewer": "sih-team-review",
  "annotation_date": "2026-09-07",
  "notes": "Synthetic clean retail label"
}
```

Pydantic validators enforce identifier patterns, known modes/categories/statuses, `imported` values `true|false|unknown`, a non-empty normalized condition slug, one ground-truth record per manifest row, exact file SHA, normalized boxes, allowed source classifications, distinct annotator/reviewer names, and product-level split isolation. Digest sorted canonical manifest rows, canonical ground truth, and image/OCR hashes with SHA-256.

- [x] **Step 4: Implement validation CLI**

`python -m scripts.validate_eval --dataset tests/eval` loads both splits, prints counts by mode/status/rule/source, prints the digest, and exits 2 for validation errors. It never writes the dataset.

- [x] **Step 5: Run tests and validate the initially empty skeleton**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_eval_schema.py -q
```

Expected: PASS. Do not run the CLI against the repository dataset until Task 2 supplies all 30 records.

- [x] **Step 6: Commit**

```bash
git add backend/app/evaluation.py backend/scripts/validate_eval.py backend/tests/test_eval_schema.py backend/tests/eval/README.md
git commit -m "feat(eval): define versioned evidence dataset contract"
```

## Task 2: Create the 36-example mixed-source evidence baseline

**Files:**
- Create: `backend/scripts/generate_synthetic_eval.py`
- Create: `backend/scripts/import_team_captures.py`
- Create: `backend/tests/test_generate_synthetic_eval.py`
- Create: `backend/tests/test_import_team_captures.py`
- Populate: `backend/tests/eval/images/retail/*.png`
- Populate: `backend/tests/eval/images/ecommerce/*.png`
- Populate: `backend/tests/eval/ocr/*.json`
- Populate: `backend/tests/eval/manifest.csv`
- Populate: `backend/tests/eval/ground_truth.jsonl`

**Interfaces:**
- Produces: 30 deterministic synthetic examples plus six team-captured photographs covering three physical products under multiple conditions, with redistributable OCR fixtures and annotations.

- [ ] **Step 1: Lock the case matrix in a generator test**

The generator exports `CASE_DEFINITIONS`; test exact coverage:

```python
def test_case_matrix_has_required_coverage():
    assert len(CASE_DEFINITIONS) == 30
    assert Counter(case.mode for case in CASE_DEFINITIONS) == {
        "retail_image": 18, "ecommerce_listing": 12,
    }
    statuses = {status for case in CASE_DEFINITIONS for status in case.expected.values()}
    assert {"pass", "fail", "warn", "manual_review", "na"} <= statuses
    assert len({case.product_id for case in CASE_DEFINITIONS}) >= 15
    for product_id, cases in group_by_product(CASE_DEFINITIONS).items():
        assert len({case.split for case in cases}) == 1, product_id
```

Use this exact matrix:

| IDs | Mode | Split | Condition |
|---|---|---|---|
| RET-001..003 | retail | development | clean non-food, clean food exemption, clean imported |
| RET-004..009 | retail | development | MRP missing, tax phrase missing, imperial quantity, PIN missing, care email missing, malformed manufacture date |
| RET-010..012 | retail | development | common name missing, imported origin missing, best-before missing |
| RET-013 | retail | test | relevant dimensions present |
| RET-014 | retail | test | required unit price missing |
| RET-015 | retail | test | blur/low contrast manual review |
| RET-016 | retail | test | glare/perspective manual review |
| RET-017 | retail | test | known scanner scale with undersized characters |
| RET-018 | retail | test | clipped declaration placement failure |
| ECO-001..003 | screenshot | development | clean domestic, clean imported, clean multi-card listing |
| ECO-004..007 | screenshot | development | common name, net quantity, MRP, country of origin missing |
| ECO-008 | screenshot | test | consumer details missing where applicable |
| ECO-009 | screenshot | test | unit price missing |
| ECO-010 | screenshot | test | declaration clipped by viewport |
| ECO-011 | screenshot | test | very small/low-contrast text manual review |
| ECO-012 | screenshot | test | unknown imported context manual review |

For each targeted negative case, the named rule receives the expected failure or manual-review status and every other applicable declaration is present and expected to pass. Exempt rules are `na`; quality-degraded cases use `manual_review` for conclusions whose evidence becomes insufficient. Reuse product IDs only within a split: `RET-001/004`, `RET-002/006`, `RET-003/009`, `RET-013/015/017`, `RET-014/016/018`, `ECO-001/004`, `ECO-002/007`, `ECO-003/006`, `ECO-008/010`, and `ECO-009/011` represent repeated conditions; every remaining synthetic case uses a unique product ID.

Add these six test-split capture rows after the synthetic matrix:

| IDs | Product ID | Condition |
|---|---|---|
| PHO-001, PHO-002 | PHOTO-A | clear front-panel photo; blur/low-light photo |
| PHO-003, PHO-004 | PHOTO-B | clear front-panel photo; glare/perspective photo |
| PHO-005, PHO-006 | PHOTO-C | clear front-panel photo; edge-clipped photo |

The capture rows use `mode=retail_image`, `source_classification=team_captured`, truthful category/import context, and reviewer-verified expected verdicts. This is the acceptance evidence for three physical products photographed under multiple conditions; synthetic renderings cannot satisfy that gate.

- [ ] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_generate_synthetic_eval.py -q`.

Expected: FAIL because the generator does not exist.

- [ ] **Step 3: Implement deterministic generation for the 30 synthetic rows**

Use Pillow with a fixed canvas size, local DejaVu Sans font, seeded random generator `26034`, and explicit template functions `retail_label(case)` and `listing_screenshot(case)`. Retail images draw a package panel and exact declarations; screenshot images draw a neutral browser/listing layout without third-party names/logos. Apply condition transforms with Pillow:

```python
TRANSFORMS = {
    "blur": lambda image: image.filter(ImageFilter.GaussianBlur(radius=4)),
    "low_contrast": lambda image: ImageEnhance.Contrast(image).enhance(0.25),
    "glare": add_white_translucent_ellipse,
    "perspective": apply_fixed_perspective_quad,
    "small_text": render_declarations_at_10px,
    "clipped": crop_rightmost_declaration,
}
```

Derive OCR fixtures from the generator’s exact positioned text tokens, normalizing their boxes and assigning confidence 0.98 for clean text, 0.68 for degraded text, and 0.40 for unreadable/clipped tokens. Do not call the OCR engine to create ground truth.

- [ ] **Step 4: Generate into a temporary directory and verify determinism**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m scripts.generate_synthetic_eval --output /tmp/lmpc-eval-a
.venv/bin/python -m scripts.generate_synthetic_eval --output /tmp/lmpc-eval-b
diff -qr /tmp/lmpc-eval-a /tmp/lmpc-eval-b
```

Expected: generator reports 30 examples and `diff` exits 0.

- [ ] **Step 5: Implement and test the team-capture importer**

`import_team_captures.py` accepts `--input-dir` and `--dataset`. The input directory contains `captures.json` plus exactly six referenced JPEG/PNG/WebP files. Each capture record contains `example_id`, `product_id`, `source_file`, `condition`, `category`, `imported`, `source_note`, `redistribution_approved: true`, `personal_data_reviewed: true`, distinct `annotator` and `reviewer`, the OCR words/lines, quality class, and expected per-rule verdicts/evidence. Reject unknown IDs, product-ID mismatches against the PHO matrix, the same source file reused twice, missing approval/review flags, equal annotator/reviewer, malformed boxes, and image hashes already present in the dataset.

Decode by content, apply EXIF orientation, strip metadata, and re-encode losslessly as `images/retail/{example_id}.png`. Emit the corresponding OCR JSON, manifest row, and ground-truth JSONL row with `source_classification=team_captured`; never invoke OCR to create annotations. `test_import_team_captures.py` builds six tiny temporary images/records, proves all validations above, and asserts importing twice replaces only the six PHO rows without duplicating any record.

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_import_team_captures.py -q
```

Expected: PASS after the importer is implemented.

- [ ] **Step 6: Acquire and review the six physical-package photographs**

Create `/tmp/lmpc-team-captures/captures.json` and the six files named by it. Photograph three team-owned packages twice each using the PHO matrix; do not include faces, addresses belonging to team members, location metadata, or marketplace/customer data. One team member annotates OCR/evidence boxes and expected applicability; a different member reviews each record and sets both approval flags only after confirming redistribution permission and removing metadata. Do not substitute generated imagery for this step.

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m scripts.import_team_captures --input-dir /tmp/lmpc-team-captures --dataset tests/eval
```

Expected: six PHO rows are imported and the command prints their image hashes. If the reviewed captures are not available, stop here and report this dataset gate as incomplete rather than inventing evidence.

- [ ] **Step 7: Populate and validate the committed dataset**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m scripts.generate_synthetic_eval --output tests/eval --replace-synthetic
.venv/bin/python -m scripts.import_team_captures --input-dir /tmp/lmpc-team-captures --dataset tests/eval
.venv/bin/python -m scripts.validate_eval --dataset tests/eval
.venv/bin/python -m pytest tests/test_generate_synthetic_eval.py tests/test_import_team_captures.py tests/test_eval_schema.py -q
```

Expected: validation reports 36 examples, 24 retail, 12 e-commerce, both splits, all status values, three team-captured products under two conditions each, and one dataset digest; tests PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/scripts/generate_synthetic_eval.py backend/scripts/import_team_captures.py backend/tests/test_generate_synthetic_eval.py backend/tests/test_import_team_captures.py backend/tests/eval/manifest.csv backend/tests/eval/ground_truth.jsonl backend/tests/eval/ocr backend/tests/eval/images
git commit -m "test(eval): add reproducible retail and listing evidence"
```

## Task 3: Self-host all OCR runtime assets and share the OCR core

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`
- Modify: `frontend/pnpm-workspace.yaml`
- Create: `frontend/scripts/copy-tesseract-assets.mjs`
- Create: `frontend/lib/ocr-core.ts`
- Modify: `frontend/lib/ocr.ts`
- Create: `frontend/tests/ocr-assets.test.ts`
- Generate: `frontend/public/tesseract/worker.min.js`
- Generate: `frontend/public/tesseract/core/*`
- Generate: `frontend/public/tesseract/lang/eng.traineddata.gz`

**Interfaces:**
- Produces: `createLocalOCRWorker(onProgress?)` and `recognizeSource(source, dimensions, onProgress?)` used by browser and evaluator.

- [ ] **Step 1: Add the pinned language package and copy script**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm add @tesseract.js-data/eng@1.0.0
```

Add `postinstall: "node scripts/copy-tesseract-assets.mjs"` and `assets:ocr: "node scripts/copy-tesseract-assets.mjs"` scripts. The copy script uses `fs.cp`/`copyFile`, creates directories, and copies:

```text
tesseract.js/dist/worker.min.js
tesseract.js-core/tesseract-core.wasm.js
tesseract.js-core/tesseract-core.wasm
tesseract.js-core/tesseract-core-simd.wasm.js
tesseract.js-core/tesseract-core-simd.wasm
tesseract.js-core/tesseract-core-lstm.wasm.js
tesseract.js-core/tesseract-core-lstm.wasm
tesseract.js-core/tesseract-core-simd-lstm.wasm.js
tesseract.js-core/tesseract-core-simd-lstm.wasm
@tesseract.js-data/eng/4.0.0/eng.traineddata.gz
```

Resolve package roots with `createRequire(import.meta.url).resolve('<package>/package.json')`; fail when any expected source is missing.

- [ ] **Step 2: Write asset and worker-option tests**

```typescript
// @vitest-environment node
it('has every local OCR runtime asset', () => {
  for (const path of REQUIRED_OCR_ASSETS) expect(existsSync(path)).toBe(true);
});

it('uses local paths only', () => {
  expect(localWorkerOptions()).toEqual({
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/core',
    langPath: '/tesseract/lang',
  });
  expect(JSON.stringify(localWorkerOptions())).not.toMatch(/https?:/);
});
```

- [ ] **Step 3: Verify failure, copy assets, and implement shared core**

Run `pnpm test:run -- tests/ocr-assets.test.ts`; expect FAIL before assets/helpers. Then run `pnpm assets:ocr` and implement:

```typescript
export const localWorkerOptions = () => ({
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract/core',
  langPath: '/tesseract/lang',
});

export async function createLocalOCRWorker(onProgress?: (progress: number) => void) {
  return createWorker('eng', undefined, {
    ...localWorkerOptions(),
    logger: (message) => onProgress?.(message.progress),
  });
}
```

Move normalized word/line conversion into `recognizeSource`; keep browser FileReader/image-dimension handling in `ocr.ts`. The Node harness in Task 5 passes filesystem-appropriate worker/lang options while reusing the same result conversion function.

- [ ] **Step 4: Run OCR tests and build**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm assets:ocr
pnpm test:run -- tests/ocr-assets.test.ts tests/ocr-lines.test.ts
pnpm exec tsc --noEmit
pnpm build
```

Expected: PASS; all required worker/core/language files appear in `.next` static output and no OCR CDN URL is present in application source.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/scripts/copy-tesseract-assets.mjs frontend/lib/ocr-core.ts frontend/lib/ocr.ts frontend/tests/ocr-assets.test.ts frontend/public/tesseract
git commit -m "feat(frontend): self-host OCR runtime assets"
```

## Task 4: Replace the placeholder evaluator with measured engine metrics

**Files:**
- Modify: `backend/scripts/run_eval.py`
- Create: `backend/app/eval_metrics.py`
- Create: `backend/tests/test_eval_metrics.py`
- Modify: `backend/scripts/README.md`

**Interfaces:**
- Produces: `compute_metrics(predictions, ground_truth) -> EvalSummary`.
- CLI: `python -m scripts.run_eval --mode engine --split test --output-dir PATH`.

- [ ] **Step 1: Write metric edge-case tests**

```python
def test_zero_support_is_not_measured():
    metric = binary_metric([])
    assert metric.support == 0
    assert metric.precision == metric.recall == metric.f1 == "not_measured"


def test_unsafe_decision_counts_ground_truth_fail_predicted_pass():
    summary = compute_metrics(
        predictions=[Prediction("X", "r", "pass")],
        ground_truth=[GroundTruth("X", "r", "fail")],
    )
    assert summary.unsafe_decisions == 1
    assert summary.unsafe_decision_rate == 1.0


def test_manual_review_is_reported_not_coerced_to_pass_or_fail():
    summary = compute_metrics(
        predictions=[Prediction("X", "r", "manual_review")],
        ground_truth=[GroundTruth("X", "r", "fail")],
    )
    assert summary.manual_review_rate == 1.0
    assert summary.unsafe_decisions == 0
```

Also test bbox IoU, per-mode/category/condition grouping, p50/p95 duration, F1, support, and canonical JSON serialization.

- [ ] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_eval_metrics.py -q`.

Expected: FAIL because `eval_metrics.py` is absent.

- [ ] **Step 3: Implement metrics and engine CLI mode**

For automated pass/fail rows, compute precision/recall/F1 with `pass` as compliant and `fail` as noncompliant, while reporting the confusion matrix explicitly. Exclude `na` from applicability support and report `warn`/`manual_review` separately. Compute bbox IoU only where both sides contain boxes. Serialize:

```json
{
  "dataset_digest": "sha256",
  "split": "test",
  "mode": "engine",
  "run_at": "ISO-8601 UTC",
  "support": 0,
  "manual_review_rate": 0.0,
  "unsafe_decision_rate": 0.0,
  "per_rule": {},
  "breakdowns": {},
  "durations_ms": {"p50": 0.0, "p95": 0.0},
  "failures": []
}
```

Engine mode loads committed OCR fixtures, decodes the corresponding image, calls `analyze_scan` without persisting, compares with ground truth, writes `summary.json` and `predictions.jsonl` only under `--output-dir`, and prints a compact table. Remove the old hard-coded 0.8 recall exit gate; exit non-zero only for invalid data/runtime failure or an explicitly supplied measured baseline regression.

- [ ] **Step 4: Run unit tests and engine evaluation**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_eval_metrics.py -q
.venv/bin/python -m scripts.run_eval --mode engine --split test --output-dir /tmp/lmpc-engine-eval
```

Expected: PASS; output reports a non-empty test support and dataset digest. Measured failures remain in output and do not cause test rewriting.

- [ ] **Step 5: Commit**

```bash
git add backend/app/eval_metrics.py backend/scripts/run_eval.py backend/scripts/README.md backend/tests/test_eval_metrics.py
git commit -m "feat(eval): report reproducible engine metrics"
```

## Task 5: Add the Tesseract.js end-to-end evaluation harness

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`
- Create: `frontend/scripts/eval-ocr.ts`
- Modify: `backend/scripts/run_eval.py`
- Create: `backend/tests/test_eval_e2e_contract.py`

**Interfaces:**
- Node output: JSONL `{example_id, duration_ms, words, lines}`.
- CLI: `python -m scripts.run_eval --mode e2e --split test --output-dir PATH --api-url URL`.

- [ ] **Step 1: Add Node CLI dependencies and contract test**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm add -D tsx sharp
```

Add `sharp` to `onlyBuiltDependencies` in `pnpm-workspace.yaml` and add script `eval:ocr: "tsx scripts/eval-ocr.ts"`. Backend contract test supplies a two-line JSONL fixture, asserts valid normalized words/lines are accepted, and asserts unknown/missing IDs are rejected.

- [ ] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_eval_e2e_contract.py -q`.

Expected: FAIL because the E2E contract reader is absent.

- [ ] **Step 3: Implement the Node OCR harness**

The CLI accepts `--manifest`, `--dataset-root`, `--split`, and `--output`. It reads images sequentially for stable resource use, gets width/height with Sharp, creates one Tesseract worker using local package paths, calls the shared OCR result-conversion function, writes one JSON object per line, and always terminates the worker in `finally`. It refuses output paths inside the dataset root.

- [ ] **Step 4: Orchestrate E2E evaluation from Python**

E2E mode creates an output subdirectory, invokes:

```python
subprocess.run(
    ["pnpm", "--dir", str(frontend_root), "eval:ocr", "--",
     "--manifest", str(manifest), "--dataset-root", str(dataset_root),
     "--split", split, "--output", str(ocr_output)],
    check=True,
)
```

It logs in using dedicated evaluation credentials supplied through environment variables, submits each version-2 payload to the local API, measures image-to-verdict duration, and computes the same metrics as engine mode. It never stores credentials or session cookies in artifacts.

- [ ] **Step 5: Run contract and one-sample smoke evaluation**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_eval_e2e_contract.py -q
.venv/bin/python -m scripts.run_eval --mode e2e --split test --limit 1 --output-dir /tmp/lmpc-e2e-eval --api-url http://127.0.0.1:8000
```

Expected: test PASS; with the local API running and evaluation credentials configured, one example produces `summary.json` and `predictions.jsonl`.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml frontend/scripts/eval-ocr.ts backend/scripts/run_eval.py backend/tests/test_eval_e2e_contract.py
git commit -m "feat(eval): measure the complete OCR to verdict path"
```

## Task 6: Add the bundled sample gallery

**Files:**
- Create: `frontend/public/sample-labels/manifest.json`
- Copy: six selected dataset PNG files to `frontend/public/sample-labels/`
- Create: `frontend/components/inspection/SampleGallery.tsx`
- Modify: `frontend/components/inspection/InspectionCapture.tsx`
- Create: `frontend/tests/sample-gallery.test.tsx`

**Interfaces:**
- Produces: six offline sample choices that enter the normal `File` upload/OCR path.

- [ ] **Step 1: Write gallery behavior tests**

```tsx
it('lists all six outcome-oriented samples', () => {
  render(<SampleGallery onSelect={() => undefined} />);
  expect(screen.getAllByRole('button', { name: /use sample/i })).toHaveLength(6);
});

it('loads a selected asset as a File and does not supply a result', async () => {
  render(<SampleGallery onSelect={onSelect} />);
  await userEvent.click(screen.getByRole('button', { name: /use sample.*poor-quality/i }));
  expect(onSelect).toHaveBeenCalledWith(expect.any(File));
  expect(onSelect.mock.calls[0][0].type).toBe('image/png');
});
```

- [ ] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/frontend && pnpm test:run -- tests/sample-gallery.test.tsx`.

Expected: FAIL because the gallery is absent.

- [ ] **Step 3: Create and wire the sample manifest**

Select the clean retail, clear-failure retail, poor-quality retail, imported retail, clean e-commerce, and incomplete e-commerce cases. Manifest entries contain `id`, `title`, `description`, `mode`, `asset`, and `expected_demo_status`. Copy exact PNG bytes and verify their hashes against the dataset manifest. On click, fetch the local asset, construct a `File`, set the matching mode, and pass it into `InspectionCapture`; the regular OCR and POST flow does all analysis.

- [ ] **Step 4: Run tests and offline asset checks**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm test:run -- tests/sample-gallery.test.tsx
pnpm exec tsc --noEmit
pnpm build
```

Expected: PASS; all six sample assets appear in the production output.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/sample-labels frontend/components/inspection/SampleGallery.tsx frontend/components/inspection/InspectionCapture.tsx frontend/tests/sample-gallery.test.tsx
git commit -m "feat(frontend): bundle real-path demo evidence samples"
```

## Task 7: Add Playwright role, workflow, and offline browser gates

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/pnpm-lock.yaml`
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/auth.spec.ts`
- Create: `frontend/e2e/inspection.spec.ts`
- Create: `frontend/e2e/repository.spec.ts`
- Create: `frontend/e2e/offline.spec.ts`
- Create: `frontend/e2e/helpers.ts`
- Create: `frontend/e2e/auth.setup.ts`

**Interfaces:**
- Produces: repeatable browser tests at 375px and 1440px with local-only network policy.

- [ ] **Step 1: Install and configure Playwright**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm add -D @playwright/test@1.63.0
pnpm exec playwright install chromium
```

Add scripts `test:e2e` and `test:e2e:offline`. Configure one setup project, one mobile project at 375×812, and one desktop project at 1440×900; both browser projects depend on setup. Use traces on first retry, screenshot/video only on failure, and web-server commands for a dedicated test database, backend port 8010, and frontend port 3010. `auth.setup.ts` signs in the seeded administrator, creates the inspector if absent, and saves separate admin/inspector storage states without putting passwords in those JSON files.

- [ ] **Step 2: Write failing authenticated workflow tests**

Implement the approved sequence with accessible selectors: bootstrap/login admin, create inspector, login inspector, scan retail sample, scan listing sample, select overlay/verdict, append review, search/filter repository, download PDF/DOCX/CSV, verify dashboard totals, and assert the inspector receives 403 from the user API and cannot see Users navigation.

- [ ] **Step 3: Add local-only network enforcement**

In `offline.spec.ts`, install a context route before navigation:

```typescript
await context.route('**/*', async (route) => {
  const host = new URL(route.request().url()).hostname;
  if (['127.0.0.1', 'localhost'].includes(host)) await route.continue();
  else await route.abort('internetdisconnected');
});
```

Assert the sample gallery → OCR → result path completes and collect any attempted external URLs; the test fails if the list is non-empty.

- [ ] **Step 4: Run tests and close deterministic failures**

Run:

```bash
cd /home/wind/Projects/sih/frontend
pnpm test:e2e
pnpm test:e2e:offline
```

Expected: both mobile and desktop critical paths PASS; no external request is attempted.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/playwright.config.ts frontend/e2e
git commit -m "test(e2e): verify secure offline inspection workflows"
```

## Task 8: Add demo lifecycle scripts and runbook

**Files:**
- Create: `scripts/start-demo.sh`
- Create: `scripts/stop-demo.sh`
- Create: `scripts/offline-smoke.sh`
- Create: `docs/demo-runbook.md`
- Modify: `README.md`
- Modify: `.gitignore`
- Create: `backend/tests/test_demo_scripts.py`

**Interfaces:**
- Produces: idempotent local startup, health wait, smoke test, and PID-scoped shutdown.

- [ ] **Step 1: Write script safety tests**

Tests parse each script and assert strict mode, explicit project-relative PID directory, no `pkill`, no `killall`, no recursive deletion, no use of `$HOME`, a bounded health timeout, and cleanup limited to recorded PIDs. A dry-run startup test uses temporary ports/database and confirms repeated invocation does not start duplicates.

- [ ] **Step 2: Verify failure**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_demo_scripts.py -q`.

Expected: FAIL because scripts do not exist.

- [ ] **Step 3: Implement safe lifecycle scripts**

Each script begins `set -euo pipefail`, resolves the repository from its own location, stores PIDs/logs under `.demo-runtime/`, and uses defaults `127.0.0.1:8000` and `127.0.0.1:3000`. Startup verifies dependencies/migrations, bootstraps only when no admin exists and explicit credentials are provided, waits at most 30 seconds per health endpoint, and prints URLs. Shutdown validates numeric recorded PIDs and confirms their command lines belong to this repository before TERM, waits up to 10 seconds, then reports any process requiring manual attention; it never kills by process name.

`offline-smoke.sh` starts the dedicated test stack, runs the Playwright offline project, invokes `stop-demo.sh` in a trap, and returns Playwright’s exit status.

- [ ] **Step 4: Write the runbook**

Document prerequisites, `.venv` installation without `uv`, `pnpm install`, migration, admin bootstrap, start/stop, the six sample stories and expected status classes, exports, database backup, occupied-port recovery, missing OCR asset recovery, stale-database recovery through migration, and how to inspect/close the previously observed stale `pnpm approve-builds` PID safely after verifying its command line.

- [ ] **Step 5: Run safety and smoke tests**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m pytest tests/test_demo_scripts.py -q
cd /home/wind/Projects/sih
./scripts/offline-smoke.sh
```

Expected: tests PASS; smoke completes and `.demo-runtime/` contains no live PID after cleanup.

- [ ] **Step 6: Commit**

```bash
git add scripts/start-demo.sh scripts/stop-demo.sh scripts/offline-smoke.sh docs/demo-runbook.md README.md .gitignore backend/tests/test_demo_scripts.py
git commit -m "docs: add repeatable offline SIH demo runbook"
```

## Task 9: Produce measured summaries and audit public claims

**Files:**
- Create: `backend/tests/eval/baseline.json`
- Create: `artifacts/eval-engine/summary.json`
- Create: `artifacts/eval-e2e/summary.json`
- Modify: `README.md`
- Modify: `backend/README.md`
- Modify: `frontend/README.md`
- Create: `backend/tests/test_documented_claims.py`

**Interfaces:**
- Produces: named measured baseline and documentation whose claims point to that baseline.

- [ ] **Step 1: Add claims-policy tests**

Scan documentation for percentage/latency claims. For each match, require an adjacent dataset digest or a reference to a committed summary containing `dataset_digest`, `support`, `split`, and `run_at`. Reject phrases such as “guaranteed compliant,” “legally certified,” or “100% accurate.”

- [ ] **Step 2: Run the tests to expose unsupported claims**

Run `cd /home/wind/Projects/sih/backend && .venv/bin/python -m pytest tests/test_documented_claims.py -q`.

Expected: FAIL only if current docs contain unsupported claims.

- [ ] **Step 3: Run both measured evaluations**

With the dedicated local evaluation account and API running:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m scripts.run_eval --mode engine --split test --output-dir ../artifacts/eval-engine
.venv/bin/python -m scripts.run_eval --mode e2e --split test --output-dir ../artifacts/eval-e2e --api-url http://127.0.0.1:8000
```

Expected: both commands exit 0 and summaries contain non-zero support, digest, measured metrics, failure details, and p50/p95 duration.

- [ ] **Step 4: Set the initial regression baseline and update wording**

Copy only stable engine metrics and dataset digest into `baseline.json`; configure future `--baseline` runs to fail when unsafe decisions increase, per-rule test support decreases, or a measured F1 decreases by more than 0.05. Document actual results with support/date/digest, and explicitly state limitations: synthetic-heavy data, English OCR, uncertain physical scale, screenshot-only listing evidence, and legal rules requiring version revalidation.

- [ ] **Step 5: Run every final gate**

Run:

```bash
cd /home/wind/Projects/sih/backend
.venv/bin/python -m scripts.validate_eval --dataset tests/eval
.venv/bin/python -m scripts.run_eval --mode engine --split test --baseline tests/eval/baseline.json --output-dir /tmp/lmpc-final-engine
.venv/bin/python -m ruff check app tests scripts
.venv/bin/python -m pytest -q
cd /home/wind/Projects/sih/frontend
pnpm test:run
pnpm exec tsc --noEmit
pnpm build
pnpm test:e2e
cd /home/wind/Projects/sih
./scripts/offline-smoke.sh
```

Expected: every command PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/eval/baseline.json artifacts/eval-engine/summary.json artifacts/eval-e2e/summary.json README.md backend/README.md frontend/README.md backend/tests/test_documented_claims.py
git commit -m "test: record measured SIH26034 validation baseline"
```

## Validation and demo readiness completion gate

- [ ] Dataset validation reports 36 examples, including six reviewed team captures, and one stable digest.
- [ ] Engine and E2E modes produce non-empty measured summaries without editing ground truth.
- [ ] Six bundled samples traverse the real OCR/API path.
- [ ] Playwright passes for inspector/admin, 375px, 1440px, and local-only network.
- [ ] Fresh install and existing database migration both pass.
- [ ] Demo start, smoke, and stop leave no background process.
- [ ] Every numeric public claim identifies dataset digest, support, split, and date.
