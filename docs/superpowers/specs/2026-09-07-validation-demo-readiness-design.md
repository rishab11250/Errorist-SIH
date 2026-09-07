# Validation and Demo Readiness — Design Specification

**Date:** 2026-09-07
**Status:** Draft for written-spec review
**Parent:** `2026-09-07-sih26034-complete-solution-design.md`

## 1. Purpose and boundary

Replace placeholder evaluation artifacts with reproducible evidence that the complete SIH26034 workflow works. Provide bundled retail-label images and e-commerce screenshots, measurable evaluation results, migration checks, and an offline end-to-end demo path.

This workstream does not tune rules against the evaluation test split or invent target metrics. It measures the implemented system and reports limitations honestly.

## 2. Dataset structure

Evaluation data is stored under `backend/tests/eval/`:

```text
eval/
  manifest.csv
  ground_truth.jsonl
  images/
    retail/
    ecommerce/
  README.md
```

Each example has a stable ID and records:

- relative evidence path and SHA-256 digest;
- evidence mode and product category;
- source classification: team-captured, synthetic, or explicitly redistributable;
- expected applicability and verdict per supported rule;
- ground-truth evidence text and normalized bounding boxes where visible;
- expected quality class and readability/manual-review behavior;
- annotator, second-reviewer, annotation date, and notes.

No personal data, account identifiers, or unlicensed marketplace screenshots are committed. Synthetic screenshots reproduce listing layouts without copying proprietary branding or user information.

## 3. Dataset split and annotation policy

The dataset uses product-level development/test separation so photographs of the same package cannot cross splits. Deterministic rules may be tuned against the development split; the locked test split is measurement-only. The evaluation runner reads committed ground truth and does not modify it.

Two people review every test example. Disagreements are resolved before the example enters the locked test split. Ambiguous legal cases are labeled `manual_review` rather than forced into pass/fail.

The first useful dataset contains at least 30 examples and targets coverage rather than using sample count as a quality claim:

- at least one clean pass and one clear fail for every automated rule;
- malformed and missing declaration cases;
- low contrast, blur, glare, skew, perspective, clipping, and unreadable examples;
- imported and non-imported products;
- applicable exemptions and unknown-context cases;
- retail photos and e-commerce screenshots;
- at least three physical products photographed under multiple conditions for robustness checks.

## 4. Evaluation runner

`backend/scripts/run_eval.py` becomes a reproducible CLI with machine-readable and human-readable output. It accepts dataset path, split, output directory, optional rule filter, and `engine` or `e2e` mode.

- `engine` mode consumes committed OCR fixtures to test extraction and rules deterministically.
- `e2e` mode invokes a Node harness that imports the same `frontend/lib/ocr` implementation used by the UI, submits its output to a running local API, and measures the complete image-to-verdict path.

Generated OCR and result artifacts are written under the selected output directory, never over the ground truth.

It reports:

- per-rule precision, recall, F1, and support for automated pass/fail decisions;
- manual-review rate and unsafe-decision rate, where unsafe means a ground-truth failure was automatically reported as a pass;
- evidence-box intersection-over-union where boxes are annotated;
- quality-class accuracy;
- retail and screenshot-mode breakdowns;
- end-to-end processing time distribution on the current machine;
- failures grouped by rule, mode, category, and image condition.

Confidence intervals or explicit sample counts accompany percentages. A result with zero support is `not_measured`, not 0% or 100%. The command exits non-zero only for dataset/schema/runtime failures or for a regression gate defined from a previously committed measured baseline.

## 5. Bundled demo samples

The frontend includes a compact, redistributable sample gallery available without network access:

- compliant retail label;
- retail label with clear declaration failures;
- poor-quality photo that triggers retake/manual review;
- imported-product case;
- compliant e-commerce screenshot;
- incomplete e-commerce screenshot.

Each sample has a short neutral description and expected demonstration outcome. Selecting it copies the asset into the normal upload flow; there is no separate hard-coded demo result.

## 6. Test layers

### 6.1 Static and unit gates

- Python formatting/linting if configured;
- backend unit and route tests;
- frontend component tests;
- TypeScript `--noEmit`;
- Next.js production build;
- rules and ground-truth schema validation.

### 6.2 Migration gates

- migrate a fresh database from zero to head;
- migrate a fixture representing the current schema to head;
- verify existing scans, verdicts, images, and timestamps remain readable;
- verify downgrade only where the migration is declared reversible;
- reject startup when database revision and application expectations conflict.

### 6.3 API and security gates

- complete authenticated happy paths for inspector and administrator;
- cross-user access denial;
- malformed, oversized, and disguised uploads;
- session expiry/revocation;
- consistent error shape and request ID;
- safe CSV, DOCX, and PDF output.

### 6.4 Browser end-to-end gates

Using the local services and bundled assets:

1. bootstrap admin and sign in;
2. create an inspector;
3. sign in as inspector;
4. scan a retail image and inspect overlays;
5. scan an e-commerce screenshot;
6. record a review action;
7. search and filter history;
8. download PDF and DOCX;
9. export filtered CSV;
10. verify dashboard totals;
11. confirm forbidden admin access for the inspector;
12. run the same critical path with network access disabled.

Viewport checks cover 375px mobile, 768px tablet, and 1440px desktop. Keyboard-only navigation and reduced-motion mode are included.

## 7. Offline verification

The build fails if it depends on a runtime CDN for OCR traineddata, fonts, component assets, or icons. The offline smoke test starts only local services, opens a clean temporary browser profile, blocks external network access for that profile, and executes the bundled-sample path.

Installation may require network access to obtain dependencies. Runtime use after a successful build must not.

## 8. Demo runbook

The repository provides one concise runbook covering:

- prerequisites and the Python virtual-environment fallback when `uv` is unavailable;
- dependency installation and database migration;
- admin bootstrap and local startup;
- the six bundled samples and the story each demonstrates;
- exact expected status transitions;
- report and repository checks;
- recovery from occupied ports, missing OCR assets, or a stale database;
- a clean shutdown procedure, including stopping leftover package-manager approval processes.

The runbook does not require editing source code or environment files during the demo.

## 9. Measured claims policy

README, pitch material, and the UI may state only metrics produced by the committed evaluation runner against a named dataset revision. They must include sample count and date. Until such a run exists, wording is qualitative: “deterministic rule checks with confidence-aware manual review,” not an accuracy percentage.

Known limitations are visible in the report and documentation, including OCR language coverage, physical scale uncertainty, screenshot-only e-commerce evidence, dataset size, and the need for legal revalidation when rules change.

## 10. Acceptance criteria

- Evaluation media and ground truth are real, synthetic, or clearly redistributable—not placeholders.
- Every supported rule and each status path has dataset coverage.
- Metrics are reproducible and never hard-coded.
- Existing-database migration and fresh installation both pass.
- Bundled samples traverse the real OCR and backend paths.
- The critical inspector workflow completes with external network access disabled.
- Demo setup and shutdown are documented and repeatable by a teammate unfamiliar with the code.
- No performance or legal-accuracy claim appears without dataset revision, sample count, and measured result.
