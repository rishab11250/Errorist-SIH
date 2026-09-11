# UX & Technical Specification: Confirm / Edit Flow for Manual Review Fields

**Author / QA Lead:** Ammar (Reports / QA / PM)  
**Implementation Lead:** Patel Jivan (Frontend / UI Systems)  
**Date:** September 2026  
**Status:** Approved for Implementation  
**Affected Components:** `frontend/components/inspection/VerdictCard.tsx`, `frontend/components/inspection/InspectionResult.tsx`, `frontend/components/inspection/EvidenceCrop.tsx`

---

## 1. Executive Summary & Problem Statement

### 1.1 The Dead-End "Needs Review" Anti-Pattern
Under LMPC 2011 compliance inspection, declarations frequently trigger `status: "manual_review"` due to:
- Moderate or low OCR confidence on complex packaging fonts (e.g. curved surfaces, stylized brand logos, wrinkled metallized foil).
- Package quality safeguard flags (`retake_recommended` or `usable_with_warnings`).
- Missing scale calibration (e.g. Rule 7 minimum character height where physical millimeter dimensions cannot be computed purely from camera pixels).

In the legacy UI, once a rule verdict received `manual_review`:
1. The verdict card presented a purple `Manual Review` badge, a static citation, and `Review state: unreviewed`.
2. The user was presented with no actionable guidance beyond a passive message: *"Image quality is insufficient to support an automatic compliance decision"* or *"Compare the declaration against the physical package"*.
3. The OCR's **best-guess extracted value** was either hidden or obscured in raw logs.
4. The reviewer could not view the specific packaging crop snippet where the text was supposed to be.
5. The overall scan was trapped in a perpetual `manual_review` state, preventing formal audit sign-off, DOCX/PDF export, or enforcement action.

### 1.2 The Solution
This specification establishes a streamlined **Human-in-the-Loop (HITL) Confirm / Edit Flow**:
- For every field or verdict in `manual_review`, render the **original packaging crop snippet** side-by-side with an **editable input pre-filled with OCR's best-guess value**.
- Reviewers can verify the extraction against physical evidence in **under 2 seconds**.
- Single-click **"Confirm OCR Value"** (if the extraction is correct) or **"Update & Verify"** (if an OCR typo like `₹2O.00` needs fixing).
- Dynamic inspection status recalculation: resolving all manual review items promotes the inspection to `Pass` (or `Mixed`), completing the workflow and generating audit-ready documentation.

---

## 2. Handoff Coordination with Jivan

> **Note to Patel Jivan:**  
> This feature directly extends your recent VerdictCard hierarchy, border styling (`border-l-review`), and dual-stroke bounding box work.  
> 1. **Do not alter existing CSS design tokens** — utilize the existing Tailwind design tokens (`border-l-review`, `bg-review/10`, `text-review`, `surface-panel`, `ring-primary`).  
> 2. **Avoid HTML nesting issues:** The current `VerdictCard.tsx` wraps the entire card in an outer `<button>`. Since this flow introduces an `<input>` and action `<button>`s, the card container must be an `<article>` with a distinct selectable header button, allowing the interactive confirm/edit panel to reside outside any parent button element.  
> 3. **Crop Rendering Component:** Implement the reusable `<EvidenceCrop />` component using SVG `viewBox` coordinates with 20% contextual padding. This guarantees hardware acceleration and zero canvas headless test failures.

---

## 3. User Journey & Wireframe

### 3.1 Interaction Hierarchy
```
+-------------------------------------------------------------------------------+
| VERDICT CARD: Rule 6(1)(e) - Maximum Retail Price (MRP)      [Manual Review]  |
| "MRP must be declared and accompanied by 'Inclusive of all taxes'"            |
+-------------------------------------------------------------------------------+
| [!] Verification Required: Low OCR confidence (48%) on curved surface         |
|                                                                               |
|  +---------------------------+  +------------------------------------------+  |
|  | EVIDENCE PACKAGING CROP   |  | EXTRACTED VALUE (BEST GUESS)             |  |
|  | [SVG Zoom Viewport: 20%   |  | [ MRP Rs 20.00 incl. of all taxes      ] |  |
|  |  contextual padding +     |  |                                          |  |
|  |  highlighted purple bbox] |  | Status: OCR Guess (Confidence: 48%)     |  |
|  |                           |  |                                          |  |
|  | [🔍 View in Full Photo]   |  | [✓ Confirm OCR Value]   [✎ Update Value]  |  |
|  +---------------------------+  | [⚠ Flag Non-Compliant / Missing]         |  |
|                                 +------------------------------------------+  |
+-------------------------------------------------------------------------------+
```

### 3.2 State Progression

```
                   +-----------------------+
                   |  Status: manual_review|
                   |  Review: unreviewed   |
                   +-----------+-----------+
                               |
               +---------------+---------------+
               |                               |
       [Reviewer Confirms]             [Reviewer Edits & Saves]
               |                               |
               v                               v
    +--------------------+           +--------------------+
    | Verdict: PASS      |           | Verdict: PASS      |
    | State: CONFIRMED   |           | State: RESOLVED    |
    | Evidence: Confirmed|           | Evidence: Corrected|
    +---------+----------+           +---------+----------+
              \                             /
               \                           /
                v                         v
        +-----------------------------------------+
        | Dynamic Overall Status Recalculation:   |
        | If all manual_review verdicts resolved  |
        | -> scan.overall_status = "pass"|"mixed" |
        | -> Inspection Unblocked & Audit-Ready   |
        +-----------------------------------------+
```

---

## 4. Component Specification

### 4.1 `<EvidenceCrop />` Component
- **Props:**
  - `imageSrc: string` — Base64 or URL of the packaging photo.
  - `bbox?: [number, number, number, number] | null` — Normalized `[x, y, width, height]` (values between `0.0` and `1.0`).
  - `imageWidth?: number` — Image pixel width.
  - `imageHeight?: number` — Image pixel height.
  - `label?: string` — Accessible image description.
- **Rendering Logic:**
  - When `bbox` is present:
    1. Calculate contextual padding: `padX = max(bbox.width * 0.25, 0.03)`, `padY = max(bbox.height * 0.35, 0.03)`.
    2. Compute crop boundary clamped to `[0, 1]`:
       - `minX = max(0, bbox.x - padX)`
       - `minY = max(0, bbox.y - padY)`
       - `cropW = min(1 - minX, bbox.width + padX * 2)`
       - `cropH = min(1 - minY, bbox.height + padY * 2)`
    3. Render SVG `<svg viewBox="${minX} ${minY} ${cropW} ${cropH}" preserveAspectRatio="xMidYMid meet">`:
       - `<image href={imageSrc} x="0" y="0" width="1" height="1" preserveAspectRatio="none" />`
       - Overlaid target box: `<rect x={bbox.x} y={bbox.y} width={bbox.width} height={bbox.height} stroke="#a855f7" strokeDasharray="3 3" fill="rgba(168,85,247,0.15)" strokeWidth={cropW * 0.015} />`
  - When `bbox` is null/empty:
    - Render a fallback banner: *"No localized bounding box on packaging — check full evidence image"*.

### 4.2 `<VerdictCard />` Enhancements
- **New Props:**
  - `imageDataUrl?: string` — Current photo data URL for rendering crop.
  - `onReviewSubmit?: (verdict: Verdict, action: 'confirmed' | 'resolved' | 'false_positive', finalValue: string, note?: string) => Promise<void> | void`.
- **Behavior:**
  - If `verdict.status === 'manual_review'` or `verdict.review_state === 'needs_review'`:
    - Display the inline Confirm/Edit panel.
    - Initial input state pre-populated with `verdict.evidence || ''`.
    - If user edits input, show the **"Update & Verify"** button.
    - If user leaves input unmodified, show the **"Confirm OCR Value"** button.
  - Once reviewed:
    - Show an alert banner: `✓ Verified by reviewer: "[value]" (Confirmed)`.
    - Provide a secondary button: `Edit again` if the reviewer wishes to revise.

### 4.3 `<InspectionResult />` Coordination
- Manage local verdicts state (`verdicts`, `setVerdicts`).
- Implement `handleVerdictReview`:
  1. Update target verdict: `verdict.status = (action === 'false_positive' ? 'fail' : 'pass')`, `verdict.review_state = action`, `verdict.evidence = finalValue`.
  2. Recompute overall status:
     - Check all remaining verdicts. If none are `manual_review` (or unresolved), promote `overallStatus` from `manual_review` to `pass` (if all pass) or `mixed` (if warnings/failures exist).
  3. Dispatch API call to `POST /api/scan/${scanId}/reviews`:
     - Payload: `{ action, note: `Verified value: ${finalValue}`, verdict_id: verdict.id }`.
  4. Append action to `reviewActions` list so it displays in `Review History`.
  5. Sync updated scan object to `sessionStorage`.

---

## 5. QA Validation & Acceptance Criteria

### 5.1 Real Stress-Test Test Cases
Validate against real test data from `real_test_labels/off_stress_test_results.json` and `real_test_labels/e2e_real_test_results.json`:
1. **Balaji Wafers (`case_1_clean_balaji`)**:
   - `r6_1_e_mrp` is assigned `manual_review` because of image quality/scale threshold.
   - Expected: Packaging crop displays the bottom-left price snippet (`[0.289, 0.871, 0.083, 0.033]`), best-guess input is populated, reviewer clicks "Confirm", status becomes `pass`.
2. **Sting Energy (`off_1_8902080000227`)**:
   - High curve distortion on bottle label leads to `manual_review`.
   - Expected: Best-guess text with OCR typos (e.g. `Rs 2O`) can be corrected by typing `Rs 20.00` and clicking "Update & Verify".
3. **Multi-Field Inspection Resolution**:
   - When all `manual_review` verdicts in a scan are confirmed, the top "Quality Safeguard / Manual Review" banner clears, overall status switches to `Pass`, and the scan is ready for export.

### 5.2 Automated Vitest Tests
The implementation must pass:
- `frontend/tests/manual-review-flow.test.tsx` (100% pass on all review actions, crops, and transitions).
- Existing test suite (`frontend/tests/inspection-ui.test.tsx`) without regressions.
