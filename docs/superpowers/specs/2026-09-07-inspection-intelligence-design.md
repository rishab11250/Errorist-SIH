# Inspection Intelligence — Design Specification

**Date:** 2026-09-07
**Status:** Draft for written-spec review
**Parent:** `2026-09-07-sih26034-complete-solution-design.md`

## 1. Purpose and boundary

Add the evidence-processing capabilities missing from the current five-rule checker: photo-quality assessment, dynamic font/readability analysis, declaration placement, additional declaration checks, and screenshot-first e-commerce analysis.

This workstream does not own authentication, repository screens, exports, or the evaluation dataset. It produces a stable analysis result that those systems store and display.

## 2. Input modes

### 2.1 Retail package photograph

Used for a photograph of one physical package panel. The workflow analyzes image quality, declarations, placement, readability, and—only when scale confidence permits—statutory character height.

### 2.2 E-commerce listing screenshot

Used for one or more screenshots supplied by the user. The workflow analyzes declarations visible in the uploaded listing evidence. It does not fetch or scrape URLs, bypass authentication, or claim that content outside the screenshot is missing from the live listing.

The selected mode is visible throughout capture, results, history, and exports. Mode-specific rule applicability comes from versioned configuration, not from frontend conditionals.

## 3. OCR evidence model

The browser continues to run Tesseract.js. Its worker and English traineddata are bundled locally. OCR output preserves:

- full text;
- word text, confidence, and normalized bounding box;
- line groups and line bounding boxes;
- estimated median character height per line;
- original image dimensions and orientation.

Normalization removes zero-area boxes, clamps coordinates to `[0,1]`, preserves source order, and reports dropped-word counts. Raw OCR remains available for audit but is never used as trusted HTML.

## 4. Visual analysis

`backend/app/visual_analysis` decodes the submitted evidence image and returns measurements only. It has focused analyzers for:

- blur/sharpness;
- local and global contrast;
- highlight clipping as a glare proxy;
- skew and perspective distortion;
- text coverage and OCR-confidence distribution;
- panel and text-line geometry;
- scale confidence and estimated character height.

Each metric returns `value`, `unit`, `confidence`, `method`, and optional affected bounding boxes. Thresholds and algorithm versions live in versioned configuration and are stored with the scan.

### 4.1 Image-quality outcome

The quality evaluator returns:

- `acceptable`: proceed normally;
- `usable_with_warnings`: analyze but show actionable warnings;
- `retake_recommended`: evidence can be stored, but affected legal verdicts become `manual_review`;
- `unreadable`: return a structured 422 response before creating compliance verdicts.

Guidance is specific: move closer, hold the camera parallel, reduce glare, improve lighting, or include the complete panel. It never asks the user to configure font size or place a calibration object.

## 5. Dynamic font and readability assessment

The system performs the best automatic assessment available from the supplied image. There is no font-size field, reference card, ruler, or calibration step in the normal workflow.

### 5.1 Measurements

For each detected declaration line, the analyzer combines:

- OCR character-box height;
- source image resolution and reliable DPI metadata when present;
- panel geometry and perspective correction confidence;
- line contrast, sharpness, and OCR confidence;
- consistency of character heights within the declaration.

It reports:

- a normalized readability score from 0 to 100;
- estimated character height in pixels;
- estimated physical height in millimetres only when defensible;
- measurement method and confidence;
- the applicable configured Rule 7 threshold when physical enforcement is possible.

### 5.2 Legal decision policy

- If physical scale confidence meets the configured enforcement threshold, compare estimated character height with the applicable versioned Rule 7 minimum.
- If the estimate is close enough to the boundary that measurement error could change the result, return `manual_review`.
- If physical scale confidence is insufficient, do not manufacture a millimetre value and return `manual_review` for the statutory size decision.
- Independently return readability warnings for blur, poor contrast, glare, overlap, or severe perspective.
- Image-quality problems alone cannot produce a statutory font-size failure.

The report always states the method and limitations. This prevents false precision while keeping the workflow fully automatic for the user.

## 6. Placement analysis

`backend/app/placement` consumes declaration boxes, OCR lines, image orientation, and an estimated principal display panel.

It evaluates configured relationships such as:

- whether required declarations are inside the visible panel;
- whether related values and labels are spatially associated;
- whether text is clipped by the image boundary;
- whether evidence regions overlap or are obscured;
- whether an e-commerce declaration is visible in the submitted screenshot.

Every placement verdict records the region, relationship, tolerance, confidence, and evidence boxes. When the visible panel cannot be estimated reliably, placement becomes `manual_review`, not `fail`.

## 7. Declaration coverage

The current five checks remain supported:

- manufacturer, packer, or importer name and address;
- net quantity in a valid metric unit;
- month and year of manufacture or packing when applicable;
- MRP with the tax-inclusive phrase;
- consumer-care details.

The following extracted-only fields become configured checks, and the remaining extractors and checks are added:

- common or generic name;
- country of origin for imported products;
- best-before or use-by date where applicable;
- dimensional declarations where required by package type;
- unit sale price when the active rules profile requires it;
- imported-product-specific responsible-party requirements;
- e-commerce-visible mandatory declarations for screenshot mode.

Applicability depends on mode, category, product attributes, and rule effective date. When required context is unknown, the engine asks for the smallest necessary classification or returns `manual_review`; it does not silently apply the wrong rule.

The legal rule text, effective dates, citations, exemptions, and failure messages remain in `rules.yaml`. Extractors identify evidence; they do not encode legal applicability.

## 8. Analysis result model

Each verdict adds these fields to the current contract:

```json
{
  "rule_id": "r7_font_size",
  "status": "manual_review",
  "severity": "warning",
  "citation": "Rule 7 of LMPC Rules 2011",
  "evidence": "Median character height: 23 px",
  "evidence_bboxes": [[0.12, 0.44, 0.32, 0.05]],
  "confidence": 0.63,
  "reasoning": "Physical scale cannot be established reliably from this photograph.",
  "measurement_method": "relative_readability",
  "failure_message": null,
  "rule_version": "active-version-key"
}
```

`measurement_method` is one of `direct_metadata`, `geometry_estimate`, `relative_readability`, or `not_measurable`. New status and method values are mirrored in Python and TypeScript types.

## 9. Error handling

- Unsupported or disguised file type: 400 `invalid_image`.
- File exceeds configured byte or pixel limits: 413 `image_too_large`.
- Image decoder failure: 422 `image_decode_failed`.
- No usable OCR words: 422 `no_text_extracted` with retake guidance.
- Analysis algorithm failure: the scan records the failed stage and request ID; the UI offers retry. No partial result is presented as complete.
- Unknown category or insufficient applicability context: affected checks become `manual_review` with the missing context named.

## 10. Testing

### 10.1 Unit tests

- deterministic blur, contrast, glare, skew, and perspective fixtures;
- OCR line grouping and character-height calculations;
- scale-confidence boundaries and measurement-method selection;
- placement geometry, clipping, association, and uncertain-panel cases;
- each new declaration extractor, including malformed and low-confidence variants;
- retail versus screenshot rule applicability;
- overall-status precedence with `manual_review`.

### 10.2 Integration tests

- the same OCR payload with good and poor imagery produces different quality guidance but does not invent a declaration failure;
- insufficient scale yields `manual_review`, never a fabricated millimetre measurement;
- screenshot mode applies listing checks and skips physical-only checks;
- all evidence boxes remain normalized and render correctly after image resizing;
- versioned rule selection is deterministic at boundary dates.

## 11. Acceptance criteria

- Users never enter font size or calibration information.
- Every physical font-size conclusion includes a method and confidence.
- Low scale confidence always prevents an automatic statutory pass/fail.
- Readability and photo quality remain useful even when physical size is not measurable.
- Placement decisions expose the spatial evidence and downgrade uncertainty safely.
- Retail and listing screenshot results cannot be confused in API, storage, UI, or reports.
- Expanded declarations are configuration-driven and covered by tests.
