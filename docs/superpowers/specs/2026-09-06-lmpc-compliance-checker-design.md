# LMPC Compliance Checker — Design Spec

**Date:** 2026-09-06
**Status:** Draft for user review
**Project:** SIH 2026 — Problem Statement 26034 (Legal Metrology Packaged Commodities compliance checker)
**Team:** 6 people, 7-day build window
**Source documents:** `idea.md` (all citations verified against primary text), `SIH26034_Project_Requirements.md` (team-approved MVP scope)

---

## 1. Goal

Build a web application that lets a user upload a photo of a packaged commodity label. The browser runs OCR on the image, sends the extracted text to a FastAPI backend, the backend runs five deterministic rule checks against the Legal Metrology (Packaged Commodities) Rules 2011 ("LMPC Rules"), and the user gets back an annotated image with each rule's verdict and a downloadable PDF report citing the exact sub-rule.

**Primary demo moment:** upload product photo → 5–15s later, see the same image with red/orange/green boxes around each mandatory declaration, each labelled with its rule citation (e.g. "Rule 6(1)(e) — MRP"), plus a downloadable PDF.

---

## 2. Scope (MVP — per requirements doc)

### 2.1 Five MVP rule checks

| # | Rule ID | Citation | Field | Check |
|---|---|---|---|---|
| 1 | `r6_1_e_mrp` | Rule 6(1)(e) | MRP | presence + "Inclusive of all taxes" phrase |
| 2 | `r6_1_c_net_quantity` | Rule 6(1)(c) + Rule 13 | Net quantity | presence + metric unit (g/kg/ml/l) |
| 3 | `r6_1_a_address` | Rule 6(1)(a) + Rule 10 | Manufacturer / Importer address | presence + 6-digit PIN |
| 4 | `r6_2_consumer_care` | Rule 6(2) | Consumer care | name + address + phone + email (all four) |
| 5 | `r6_1_d_mfg_date` | Rule 6(1)(d) | Manufacture date | presence + correct format; skipped for food/cosmetics/seeds and e-commerce mode |

### 2.2 Fields extracted but not yet wired to a rule (infrastructure for future checks)

- Common / generic name — Rule 6(1)(b)
- Country of origin — Rule 6(1)(aa)
- Best-before / use-by date — Rule 6(1)(da)
- Dimensions — Rule 6(1)(f)

### 2.3 Explicitly out of MVP scope

- Font-size measurement in mm (Rule 7) — `rules.yaml` will still encode both Rule 7 versions for future re-enablement, but no measurement runs in MVP
- YOLO-based declaration-region detection
- Live e-commerce URL scraping — pre-cached listings only (also, Rule 6(10) ecommerce obligations are not enforced in MVP)
- Rule 6(10A) e-commerce country-of-origin filter check — deferred to 1 July 2027; presented in pitch as regulatory-readiness
- Rule 18(2A) dual-MRP detection — requires cross-scan product identity, marked as differentiator
- Sticker-alteration detection (Rule 6(3)) — requires visual inspection beyond OCR
- Offline mobile app — future deployment path

### 2.4 Non-goals

- Multi-language OCR (English/Hindi only for MVP)
- Government system integration
- Real-time collaboration / multi-user
- Authentication beyond a single demo user

---

## 3. Architecture

```
┌────────────────────────────────────────┐    ┌─────────────────────────────────┐
│  Browser (Next.js)                     │    │  Backend (FastAPI :8000)        │
│                                        │    │                                 │
│  1. User selects image                 │    │  POST /api/scan                 │
│     ↓                                  │    │  {image_b64, image_meta,       │
│  2. Tesseract.js OCR                   │    │   ocr_payload, scan_context}    │
│     ↓                                  │    │         │                       │
│  3. POST /api/scan ────────────────────┼──→ │         ↓                       │
│                                        │    │  Engine: evaluate(extracted,   │
│  4. Receive verdicts JSON ◄────────────┼────│              rules, context)    │
│     ↓                                  │    │         │                       │
│  5. Canvas overlay draws boxes         │    │         ↓                       │
│     (green=pass, red=fail,             │    │  SQLite write (scans, verdicts)│
│      orange=warn, grey=na)             │    │         │                       │
│                                        │    │  Return verdicts JSON          │
│  6. GET /api/report/:scan_id           │    │         │                       │
│     when user clicks "Download PDF" ────┼──→ │  ReportLab generates PDF       │
│     ← receives PDF bytes               │    │                                 │
└────────────────────────────────────────┘    └─────────────────────────────────┘
```

**Key boundary:** the browser owns the image and the OCR. The backend **does not** use the image bytes for the rule-evaluation path — it only consumes the structured text payload, normalised bounding boxes, and image dimensions. The `image_b64` field IS sent to the backend on each scan, but **only** for two purposes: (a) storing in SQLite so the PDF endpoint can re-render it later, (b) including in the scan history thumbnail. The rule engine itself never touches the image. The PDF report is the only place that re-renders the image with overlays, and that happens server-side via ReportLab.

---

## 4. Component design

### 4.1 OCR layer (browser-side)

- **Library:** Tesseract.js (English language, LSTM engine)
- **Input:** File from `<input type="file">` or drag-drop
- **Output:** array of `OCRWord` with normalised bbox coordinates
- **Coordinate system:** Tesseract.js returns bbox in image pixel coordinates; `lib/bbox.ts` normalises to `[0,1]` range against `image_meta.width/height` before sending to backend

```typescript
// frontend/lib/ocr.ts
type OCRWord = {
  text: string;
  confidence: number;          // 0..1
  bbox: { x: number; y: number; w: number; h: number };  // image pixels
};

type OCRResult = {
  words: OCRWord[];
  fullText: string;
};

async function runOCR(imageFile: File, onProgress?: (p: number) => void): Promise<OCRResult>
```

### 4.2 Field extractors (backend)

- **Location:** `backend/app/extractors/*.py`
- **Pattern:** stateless pure functions, one per field
- **Input:** `(ocr_words: list[OCRWord], image_meta: ImageMeta) -> ExtractedField | None`
- **Tests:** one test file per extractor, fed hand-crafted OCR payloads

```python
# backend/app/extractors/base.py
@dataclass
class OCRWord:
    text: str
    confidence: float
    bbox: tuple[float, float, float, float]   # x, y, w, h in image pixels

@dataclass
class ImageMeta:
    width: int
    height: int
    dpi: int | None
    orientation: int

@dataclass
class ExtractedField:
    name: str
    value: str | None
    bbox: tuple | None
    confidence: float          # combined OCR + extractor confidence, 0..1
    evidence_spans: list[tuple]   # sub-bboxes that contributed to the match
```

**Five extractors for MVP:**

| Module | Field | Strategy |
|---|---|---|
| `manufacturer.py` | manufacturer_address | Detect lines with "Mfg", "Mfd", "Manufactured by", "Packed by", "Imported by", "Marketed by"; require PIN (6-digit number, not inside a phone number). Return matched block + PIN span. |
| `net_quantity.py` | net_quantity | Regex `(\d+(?:\.\d+)?)\s*(g\|kg\|ml\|l\|gm\|GM\|Kg\|Litre\|Liter\|mL)`. Reject non-metric (oz, lb, fl oz). Accept metric + Indian English spelling variants. |
| `mrp.py` | mrp | Regex `(?:MRP\|Max\.?\s*Retail\s*Price\|₹\|Rs\.?)[\s:]*([0-9,]+(?:\.\d{1,2})?)`. Verify `inclusive of all taxes` phrase appears within 200px vertical window of the matched price. |
| `consumer_care.py` | consumer_care | Look for keywords (`Customer Care`, `Consumer Care`, `For complaints`, `Email`, `Ph`, `Tel`); require all four sub-fields (name, address, phone, email). Email is the strict gate. |
| `mfg_date.py` | mfg_date | Regex covering numeric (`MM/YYYY`, `MM/YY`, `MM-YYYY`) and word (`Jan 2026`, `January 2026`) formats, all prefixed by `Mfg`, `Mfd`, `Manufactured`, `Packed`, or `PKD`. |

**Two extractors without rule checks (future):**

| Module | Field | Strategy |
|---|---|---|
| `common_name.py` | common_name | Extract first non-brand line of the front panel; flag if it only contains a brand name (low priority — needs brand DB) |
| `country_origin.py` | country_origin | Regex `Made in [A-Z][a-z]+|Country of Origin:? [A-Z][a-z]+|Manufactured in [A-Z][a-z]+` |

### 4.3 Rule engine (backend)

- **Location:** `backend/app/engine.py`
- **Pattern:** single pure function, no I/O

```python
def evaluate(
    extracted: dict[str, ExtractedField],
    rules: RulesConfig,
    context: ScanContext
) -> list[Verdict]
```

```python
@dataclass
class ScanContext:
    mode: Literal["retail_image", "ecommerce_listing"]
    category: Literal["food", "non_food", "cosmetics", "seeds", "unknown"]

@dataclass
class Verdict:
    rule_id: str
    status: Literal["pass", "fail", "warn", "na"]
    severity: Literal["critical", "warning", "info"]
    citation: str                  # "Rule 6(1)(e) of LMPC Rules 2011"
    evidence: str                  # extracted value or explanation
    evidence_bboxes: list[tuple]  # for the annotated overlay
    failure_message: str | None
    rule_version: str              # which version of the rule was applied
```

**Status logic:**
- `na` — rule skipped due to `skipped_when` (e.g., mfg date on a food product, or in ecommerce mode)
- `pass` — all required sub-fields present, well-formed, and combined confidence ≥ `pass_min` (0.7)
- `warn` — required sub-field present and well-formed, but combined confidence is between `warn_min` (0.6) and `pass_min` (0.7) — soft signal that OCR may have misread
- `fail` — required sub-field missing or malformed, OR combined confidence is below `warn_min` (0.6)

**Overall status:** `pass` if all verdicts pass; `fail` if any fail; `mixed` if any verdict is `warn` and the rest are `pass` or `na`.

### 4.4 Frontend pages (Next.js App Router)

| Route | Purpose | Owner |
|---|---|---|
| `/` | Upload page: drag-drop or click-to-select, live preview, "Scan" button | Jivan |
| `/scan/[id]` | Results view: annotated image + verdict list + "Download PDF" | Jivan |
| `/history` | Scan history table: thumbnail, product, verdict count, date | Yashvi |
| `/dashboard` | Aggregate stats: 4–5 stat cards (total scans, pass rate, top failed rule, recent activity) | Yashvi |

**Annotated image component** (`components/AnnotatedImage.tsx`):
- Receives the original image (as data URL or blob URL) + list of `{bbox, verdict}` pairs
- Draws coloured rectangles via HTML `<canvas>` overlay positioned on top of the image
- Coordinate scaling: backend receives normalised bboxes (0..1); frontend multiplies by displayed image's CSS pixel size
- Colour mapping: pass = green, fail = red, warn = orange, na = grey (outline only)

### 4.5 Storage (SQLite via SQLAlchemy)

```
scans
  id              INTEGER PRIMARY KEY
  created_at      DATETIME
  mode            TEXT       # 'retail_image' | 'ecommerce_listing'
  category        TEXT       # 'food' | 'non_food' | 'cosmetics' | 'seeds' | 'unknown'
  image_b64       TEXT       # JPEG/PNG, base64 (for PDF re-render)
  image_meta      JSON
  ocr_payload     JSON       # raw OCR words, for debugging
  overall_status  TEXT       # 'pass' | 'fail' | 'mixed'

verdicts
  id              INTEGER PRIMARY KEY
  scan_id         INTEGER REFERENCES scans(id)
  rule_id         TEXT
  status          TEXT       # 'pass' | 'fail' | 'warn' | 'na'
  severity        TEXT
  citation        TEXT
  evidence        TEXT
  evidence_bboxes JSON
  failure_message TEXT
  rule_version    TEXT
  created_at      DATETIME
```

**Storage budget:** ~500KB per image × 1000 demo scans = ~500MB. Acceptable for MVP.

### 4.6 PDF report (ReportLab)

- **Endpoint:** `GET /api/report/:scan_id`
- **Input:** scan_id → fetch scan + verdicts from DB
- **Output:** PDF bytes, `application/pdf`
- **Content:**
  1. Cover page: product image thumbnail, scan date, overall status
  2. Annotated image: original image with verdict-coloured bboxes drawn over it (pass = green, fail = red, warn = orange, na = grey)
  3. Rules table: per-rule verdict, citation, evidence, failure message (if any). `warn` verdicts are shown in orange and labelled "Soft fail — please retake photo" in the failure_message column
  4. Appendix: rules.yaml version + rule_versions applied

ReportLab uses `canvas.rect()` for bbox overlays, `Platypus` for the table layout.

---

## 5. `rules.yaml` schema

YAML file loaded once at backend startup, hot-reloaded in dev mode (`uvicorn --reload`).

```yaml
version: "2026-09"
schema_version: 1

font_size_rules:
  # Both versions encoded. Rule engine selects by scan date.
  # Original 2011 Rule 7(2) — TWO tables
  original_2011:
    citation: "Rule 7(2), GSR 202(E), 7 March 2011"
    effective_from: "2011-04-01"
    superseded_by: "consolidated_post_2021"
    superseded_date: "2022-04-01"
    table_I_weight_volume:
      brackets:
        - {max_g_or_ml: 200,  normal_mm: 1, blown_mm: 2}
        - {max_g_or_ml: 500,  normal_mm: 2, blown_mm: 4}
        - {max_g_or_ml: null, normal_mm: 4, blown_mm: 6}   # > 500
    table_II_length_area_number:    # keyed to PDP area
      brackets:
        - {max_cm2: 100,    normal_mm: 1, blown_mm: 2}
        - {max_cm2: 500,    normal_mm: 2, blown_mm: 4}
        - {max_cm2: 2500,   normal_mm: 4, blown_mm: 6}
        - {max_cm2: null,   normal_mm: 6, blown_mm: 6}   # > 2500
    letter_min_mm: 1
    letter_blown_min_mm: 2

  # Current consolidated Rule 7 — ONE Table I (post-2022 amendment)
  consolidated_post_2021:
    citation: "Rule 7(2) as amended, consolidated up to GSR 31.10.2021 (w.e.f. 1.4.2022)"
    effective_from: "2022-04-01"
    table_I:
      brackets:
        - {max_cm2: 50,     normal_mm: 1.0, blown_mm: 1.5}
        - {max_cm2: 100,    normal_mm: 1.5, blown_mm: 3.0}
        - {max_cm2: 500,    normal_mm: 2.5, blown_mm: 4.0}
        - {max_cm2: 2500,   normal_mm: 4.0, blown_mm: 6.0}
        - {max_cm2: null,   normal_mm: 6.0, blown_mm: 6.0}   # > 2500

  default_version: "consolidated_post_2021"

  exemption:    # Rule 7(4) original / Rule 7(5) current
    applies_when_another_law_governs: true
    exempted_declarations: [net_weight, retail_sale_price, expiry_date, consumer_care]
    exempted_categories: [food, cosmetics, seeds]

confidence_thresholds:
  pass_min: 0.7
  warn_min: 0.6       # below this → status becomes 'warn' instead of 'fail'

checks:
  - rule_id: r6_1_e_mrp
    citation: "Rule 6(1)(e) of LMPC Rules 2011"
    field: mrp
    check_type: presence_and_format
    severity: critical
    requires: [mrp_value, tax_inclusive_phrase]
    tax_inclusive_phrase_regex: '(?i)\b(?:incl\.?|inclusive)\s*(?:of\s+)?all\s+taxes?\b'
    failure_message: "MRP must be declared and accompanied by 'Inclusive of all taxes'"

  - rule_id: r6_1_c_net_quantity
    citation: "Rule 6(1)(c) read with Rule 13 of LMPC Rules 2011"
    field: net_quantity
    check_type: presence_and_format
    severity: critical
    requires: [net_quantity_value, net_quantity_unit]
    requires_unit_in: [g, kg, ml, l, gm, GM, Kg, Litre, Liter]
    failure_message: "Net quantity must be declared in metric units (g/kg/ml/l)"

  - rule_id: r6_1_a_address
    citation: "Rule 6(1)(a) read with Rule 10 of LMPC Rules 2011"
    field: manufacturer_address
    check_type: presence_and_format
    severity: critical
    requires: [manufacturer_name, address, pin_code]
    pin_code_regex: '\b([1-9][0-9]{5})\b'
    failure_message: "Manufacturer/packer/importer name, complete address, and 6-digit PIN required"

  - rule_id: r6_2_consumer_care
    citation: "Rule 6(2) of LMPC Rules 2011"
    field: consumer_care
    check_type: presence_and_format
    severity: critical
    requires: [consumer_care_name, consumer_care_address, consumer_care_phone, consumer_care_email]
    email_regex: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
    phone_regex: '(?:\+91[\s-]?)?[6-9]\d{9}'
    failure_message: "Consumer care must include name, address, phone, and email (Rule 6(2))"

  - rule_id: r6_1_d_mfg_date
    citation: "Rule 6(1)(d) of LMPC Rules 2011"
    field: mfg_date
    check_type: presence_and_format
    severity: critical
    skipped_when:
      category_in: [food, cosmetics, seeds]
      mode: ecommerce
    date_format_regex: '(?i)\b(?:mfg|mfd|manufactured|packed|pkd)[:\s,.]*((0?[1-9]|1[0-2])[\/\-\s]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})'
    failure_message: "Month and year of manufacture required (skip if food/cosmetics/seeds or ecommerce mode)"
```

**Failures that should NOT produce a `fail` verdict on the OCR engine:**
- Tesseract.js failed to extract any words → return HTTP 422 with `{error: "no_text_extracted"}`. UI shows "could not read this image, please retake".
- Image dimensions missing → return HTTP 400.

---

## 6. API surface

| Method | Path | Body / Params | Returns |
|---|---|---|---|
| POST | `/api/scan` | `{image_b64, image_meta, ocr_payload, scan_context}` | `{scan_id, overall_status, verdicts: [Verdict]}` |
| GET | `/api/scan/:scan_id` | — | `{scan, verdicts}` |
| GET | `/api/report/:scan_id` | — | PDF bytes (`application/pdf`) |
| GET | `/api/history` | `?limit=20` | `[{scan_id, thumbnail, product, verdict_count, created_at}]` |
| GET | `/api/dashboard` | — | `{total_scans, pass_rate, top_failed_rule, recent_activity}` |
| GET | `/api/health` | — | `{status: "ok", rules_version}` |

All errors return `{error: string, detail?: string}` with appropriate 4xx/5xx status.

---

## 7. Module / file structure

```
backend/
  app/
    main.py              # FastAPI app, CORS, route mounting
    engine.py            # evaluate(extracted, rules, context) -> list[Verdict]
    extractors/
      base.py            # OCRWord, ImageMeta, ExtractedField dataclasses
      manufacturer.py
      net_quantity.py
      mrp.py
      consumer_care.py
      mfg_date.py
      common_name.py     # extract only, no rule check yet
      country_origin.py  # extract only, no rule check yet
    db.py                # SQLAlchemy models, get_session dependency
    reports.py           # ReportLab PDF generation
    rules_loader.py      # loads + validates rules.yaml at startup
    rules.yaml           # the spec
  tests/
    test_extract_manufacturer.py
    test_extract_net_quantity.py
    test_extract_mrp.py
    test_extract_consumer_care.py
    test_extract_mfg_date.py
    test_engine.py       # scenarios covering pass / fail / na / warn
    test_rules_yaml.py   # schema validation, version selection
    eval/
      eval_set.csv       # 30–50 hand-labeled images + per-rule verdicts
      images/            # the actual image files
  scripts/
    run_eval.py          # runs engine against eval_set.csv, reports precision/recall
  pyproject.toml
  README.md

frontend/
  app/
    layout.tsx
    page.tsx             # upload page
    scan/[id]/page.tsx   # results view
    history/page.tsx
    dashboard/page.tsx
  components/
    UploadDropzone.tsx
    AnnotatedImage.tsx   # canvas overlay
    VerdictCard.tsx
    ScanHistoryTable.tsx
    DashboardCards.tsx
  lib/
    ocr.ts               # Tesseract.js wrapper
    api.ts               # fetch wrapper for /api/*
    bbox.ts              # coordinate normalisation helpers
    types.ts             # shared TypeScript types matching backend dataclasses
  public/
    sample-labels/       # 3–5 demo images bundled for instant testing
  package.json
  tsconfig.json
  tailwind.config.ts
  README.md
```

---

## 8. Build order (7-day, 6-person)

| Day | Focus | Owners (per requirements doc) |
|---|---|---|
| 1 | Interface contracts locked: TypeScript types match Python dataclasses byte-for-byte; backend skeleton + frontend skeleton running; `rules.yaml` v0.1; eval set started (10 images) | Rishab + Daksh: backend types & skeleton; Vineet + Jivan: frontend types & skeleton; Ammar: rules.yaml + eval set |
| 2 | OCR (Tesseract.js) wired; extractors for mfg_date + mrp (regex-heavy, easy to test) | Rishab (OCR), Vineet (extractors), Ammar (eval set to 20 images) |
| 3 | Extractors for net_quantity + manufacturer_address + consumer_care; rules.yaml updated with all 5 checks wired | Vineet (extractors), Daksh (rule wiring), Ammar (eval set to 35 images) |
| 4 | First end-to-end run: upload → OCR → extract → rules → verdict → annotated image. Demo a single product end-to-end. | All hands on the integration |
| 5 | PDF report (ReportLab) + scan history + dashboard pages | Ammar (PDF), Jivan (results/history UI), Yashvi (dashboard) |
| 6 | Full run against eval set, precision/recall metrics, bug fixing (protected buffer) | All; Ammar leads triage |
| 7 | Code freeze, demo rehearsal (3+ runs), pitch deck polish only | All |

---

## 9. Testing strategy

### 9.1 Unit tests (per extractor)

- One test file per extractor
- Each test feeds a hand-crafted list of `OCRWord` objects (simulating Tesseract.js output) and asserts the extracted field value + bbox
- Coverage includes: happy path, missing field, partial field, low-confidence words, regex edge cases (case, spacing, units)

### 9.2 Engine tests (`test_engine.py`)

Scenarios for each of the 5 rules:
- `pass` — well-formed OCR payload
- `fail_missing` — required sub-field absent
- `fail_malformed` — regex match succeeds but value invalid (e.g., non-metric unit)
- `warn_low_confidence` — field extracted but combined confidence < 0.6
- `na_skipped` — `skipped_when` conditions met (food category for mfg_date, e-commerce mode for mfg_date)

### 9.3 `rules.yaml` validation (`test_rules_yaml.py`)

- Schema is valid YAML, all required fields present
- Every `check.rule_id` is unique
- Every `check.requires` references a field that has a registered extractor
- Every `check.citation` matches `^Rule \d+\([a-z\d]+\)` or similar pattern
- Both Rule 7 versions have non-overlapping `effective_from`/`superseded_date` ranges

### 9.4 Eval set (`eval/eval_set.csv`)

```csv
image_id,r6_1_a_address_pass,r6_1_a_address_evidence,r6_1_e_mrp_pass,r6_1_e_mrp_evidence,r6_1_c_net_quantity_pass,r6_2_consumer_care_pass,r6_1_d_mfg_date_pass,notes
IMG_001,1,"Acme Foods Pvt Ltd, Plot 12, Mumbai 400001",1,"MRP ₹99.00 (Incl. of all taxes)",1,1,1,clean label
IMG_002,0,,0,"MRP ₹99 (no tax phrase)",1,1,1,missing tax-inclusive phrase
IMG_003,1,"...Plot 12, Mumbai 400001",1,"...Inclusive of all taxes",0,1,1,net qty in oz
...
```

- 30–50 rows, hand-labeled by Ammar + team over Days 1–3
- Each row has: image filename, per-rule ground-truth pass (0/1), free-text evidence snippet
- **Coverage:** the five checked rules only (r6_1_a_address, r6_1_e_mrp, r6_1_c_net_quantity, r6_2_consumer_care, r6_1_d_mfg_date). The two extracted-but-not-checked fields (common_name, country_origin) are not in the eval set
- `scripts/run_eval.py` runs the engine against each image and reports per-rule precision/recall plus overall accuracy

### 9.5 Manual integration testing

- Day 4: demo 5 different products (food, non-food, imported, very small pack, glossy curved pack) end-to-end
- Day 5: test PDF report download on all 5
- Day 6: full eval run + targeted bug fixing

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| OCR fails on curved / glossy / wrinkled labels | Surface per-field confidence in UI; status `warn` (orange) when confidence < 0.6 so the user knows to retake. Set pass/warn threshold at 0.7/0.6. |
| Font-size measurement (when re-enabled) unreliable without reference object | Already cut from MVP per requirements doc |
| Regulatory text has numbering pitfalls (MRP = Rule 6(1)(e), not (f); consumer care = Rule 6(2) standalone) | Every `citation` in `rules.yaml` cross-checked against primary text in `idea.md` §4 |
| Rule 6(10A) deferred to 1 July 2027 | Documented in `idea.md` §4A; presented in pitch as upcoming requirement, not as enforcement of currently-binding rule |
| Eval set is small (30–50 images) — risk of overfitting regexes | Run regexes against a held-out 10-image subset; require ≥80% precision/recall before sign-off |
| `rules.yaml` schema evolves mid-build | Bump `schema_version`, fail fast on load with clear error if mismatch |
| Tesseract.js English-only model misses Hindi declarations on bilingual packs | Acceptable for MVP — demo uses English-language products; flag in PDF as known limitation |
| Browser OCR is slow (5–15s for one image) | Show progress bar; do not block UI; cache last scan in localStorage for retry |

---

## 11. Open follow-up items (not blocking MVP)

1. **Identify the exact amendment GSR** that consolidated Rule 7 from two tables to one table. Best guess: 31 Oct 2021 amendment (w.e.f. 1 Apr 2022), but unverified.
2. **Re-verify Rule 6(10A) effective date** (1 July 2027) before final submission. LMPC Rules have been amended 3× in 2026 alone; further amendments are plausible.
3. **Re-verify Section 36 penalty figures** before final submission. Jan Vishwas Act 8 of 2026 restructured Section 36 effective 1 May 2026 — current figures in `idea.md` §5 should be re-confirmed.
4. **Tesseract.js Hindi language pack** — add if demo product set includes bilingual labels.
5. **PDF signature/audit trail** — no need for MVP, but for real enforcement use the PDF should be cryptographically signable so it can serve as evidence in court.

---

## 12. References

### Primary sources
- Legal Metrology (Packaged Commodities) Rules, 2011 — original notification GSR 202(E), 7 March 2011 (West Bengal Consumer Affairs mirror): https://wbconsumers.gov.in/writereaddata/ACT%20&%20RULES/Act%20&%20Rules/9%20The%20Legal%20Metrology%20(Package%20Commodities)%20Rules,%202011.pdf
- Legal Metrology (Packaged Commodities) Rules, 2011 — consolidated up to GSR 31.10.2021 w.e.f. 1.4.2022 (Maharashtra Legal Metrology mirror): https://legalmetrologymh.in/public/temp/368/02d3c4fef3045bc21d90ba000a28357e.pdf
- Legal Metrology (Packaged Commodities) Amendment Rules, 2026 (Rule 6(10A) original): https://gazettetracker.com/g/CG-DL-E-13022026-270123
- Legal Metrology (Packaged Commodities) Second Amendment Rules, 2026 (defers 6(10A) to 1 July 2027): https://gazettetracker.com/g/CG-DL-E-27042026-272105
- Legal Metrology (Packaged Commodities) Third Amendment Rules, 2026 (Explanation-2 to Rule 4, Rule 27 amendments): https://gazettetracker.com/g/CG-DL-E-01062026-273053
- Legal Metrology Act, 2009 — consolidated text as on 7 May 2026: https://www.indiacode.nic.in/indiacode/bitstream/123456789/2102/1/2009l.pdf

### Internal documents
- `idea.md` — research + verification log (404 lines, all rule citations primary-source-verified)
- `SIH26034_Project_Requirements.md` — team-approved MVP scope (5 checks, 7-day build, 6-person team)
