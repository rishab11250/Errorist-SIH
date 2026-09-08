# Evaluation evidence dataset

This directory contains the versioned, reviewer-checked evidence used to measure the LMPC
checker. Evaluation commands treat it as immutable input: they never replace images, OCR
fixtures, or ground truth.

The dataset contract consists of:

- `manifest.csv`, with the exact columns documented in `app.evaluation.MANIFEST_COLUMNS`;
- `ground_truth.jsonl`, with one annotation record for every manifest row;
- `images/retail/` and `images/ecommerce/`, containing the evidence images; and
- `ocr/`, containing deterministic OCR fixtures for engine-only evaluation.

Every manifest row records a SHA-256 image digest and classifies its source as
`team_captured`, `synthetic`, or `redistributable`. `source_note` must record enough provenance
to review the right to use the asset; for redistributable material that includes its license and
source. Team-captured material must have redistribution and personal-data review completed by
the capture importer before it reaches this directory. Annotator and reviewer identities must be
distinct.

Product IDs cannot cross the `development` and `test` splits. Boxes use normalized
`[x, y, width, height]` coordinates, with every value and edge inside the image. Ground-truth
statuses are `pass`, `fail`, `warn`, `manual_review`, or `na`.

Validate without modifying the dataset:

```bash
cd backend
.venv/bin/python -m scripts.validate_eval --dataset tests/eval
```

The command reports support counts and a stable digest over canonical manifest rows, canonical
ground truth, and image/OCR hashes. It exits with status 2 when any evidence violates the
contract. The populated 36-example baseline is generated and imported in Validation Task 2.
