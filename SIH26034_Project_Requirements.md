# SIH 2026 — PS 26034: Packaged Commodities Compliance Checker
### Project Requirements Document

**Problem Statement:** 26034 — Software System to check compliance of Packaged Commodities under Legal Metrology (Packaged Commodities) Rules, 2011
**Organization:** Ministry of Consumer Affairs, Food & Public Distribution (Department of Consumer Affairs)
**Team (6):** Rishab, Vineet, Daksh, Ammar, Jivan, Yashvi
**Build window:** 7 days | **Deliverable:** Web application
**Idea submission deadline:** 30 September 2026

---

## 1. Proposed Solution (Idea / Solution / Prototype)

### 1.1 The Problem
Enforcement agencies under the Legal Metrology Act, 2009 and the Legal Metrology (Packaged Commodities) Rules, 2011 ("LMPC Rules") cannot physically inspect the volume of pre-packaged goods moving through retail and e-commerce fast enough. Mandatory label declarations — MRP with tax inclusivity, net quantity in metric units, manufacturer/importer address with PIN, consumer care contact with email, manufacturing date, country of origin — are routinely missing, malformed, or non-compliant, and violations go undetected until a manual inspection happens to catch them.

### 1.2 The Solution
A web application that lets a user (inspector or self-checking business) upload a photo of a product label. The system:

1. Runs OCR on the image to extract all visible text with bounding-box positions.
2. Parses the extracted text into the mandatory declaration fields defined under Rule 6 of the LMPC Rules.
3. Runs each field through a rule engine that checks it against the specific sub-rule that governs it, returning **pass / fail / not-applicable** with the exact rule citation.
4. Renders the result back on the original image — a colour-coded box around every field, green for compliant, red for violation — alongside a downloadable PDF report listing each check, the evidence extracted, and the legal citation.

### 1.3 The Core Demo Moment
Upload a product photo → within seconds, the same image comes back annotated with red boxes on every violation, each labelled with its rule number (e.g. Rule 6(1)(e), Rule 6(2)) → a PDF report mirrors the same findings. This is the single moment the prototype is built around: instant, visual, legally grounded.

### 1.4 MVP Scope (what will actually be built in 7 days)
- Single-image upload of a product's front label.
- OCR with preserved bounding boxes (PaddleOCR).
- Extraction of 7 declaration fields: manufacturer/importer name+address+PIN, net quantity, MRP + tax-inclusivity phrase, month/year of manufacture, consumer care details, country of origin, common/generic name.
- **5 core rule checks**, prioritized by real-world detectability and inspector relevance:
  1. MRP present with correct tax-inclusivity phrasing — Rule 6(1)(e)
  2. Net quantity declared in metric units — Rule 6(1)(c)
  3. Manufacturer/importer address present with valid PIN — Rule 6(1)(a) + Rule 10
  4. Consumer care details include an email address — Rule 6(2)
  5. Manufacture date present and correctly formatted (skipped where exempt by category) — Rule 6(1)(d)
- Annotated image output (colour-coded bounding boxes).
- PDF compliance report with citations and evidence snippets.
- Scan history and a dashboard of violation statistics.

### 1.5 Explicitly Out of MVP Scope (roadmap only, not built or demoed live)
- Font-size measurement in millimetres via physical reference object — too fragile to demo reliably in the available time.
- YOLO-based declaration-region detection — real ML work requiring a labeled dataset this team doesn't have time to build; considered only as a stretch item after the MVP is fully working, never a Day 1 commitment.
- Live e-commerce URL scraping during the demo — pre-cached listings will be used instead.
- Offline mobile app — noted as a future deployment path for field inspectors with poor connectivity, not built.

---

## 2. Technical Approach

### 2.1 Architecture
```
[Web Upload] → [Image Pre-processing] → [OCR Engine] → [Field Extractor]
   → [Rule Engine] → [Compliance Verdict] → [Annotated Image + PDF Report] → [Dashboard]
```

### 2.2 Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js + TypeScript + Tailwind + shadcn/ui | Fast to build, judge-friendly UI, works as a browser-based "app" on any device including mobile browsers |
| Backend | FastAPI (Python) | Best ecosystem for OCR/CV libraries |
| OCR | PaddleOCR (Tesseract fallback) | Better performance on curved/Indic-script labels than Tesseract alone |
| CV pre-processing | OpenCV | Deskew, denoise, contrast normalisation, perspective correction |
| Rule engine | Python + YAML-defined rules | Each check is a small, independently testable function; easy to demo and to extend |
| Database / Storage | Supabase (Postgres + object storage) | Zero-ops, generous free tier, fast to stand up |
| Reports | ReportLab (PDF) | Native annotated-image embedding + rule table |
| Deployment | Vercel (frontend) + Render/Railway (backend) | Standard, fast, judge-accessible via a URL — no app install required |

### 2.3 Why Web, Not a Native App
Camera capture is available in-browser via `<input type="file" capture="environment">` / `getUserMedia`, so photo upload works on mobile browsers without a native app. A URL-based demo has fewer failure points on stage than a mirrored phone screen, and "open a link, no install" is also the stronger real-world deployment story for government adoption.

### 2.4 Rule Engine Design
Each rule is defined once in a YAML file with: rule ID, the sub-rule text reference, the field(s) it checks, the check logic, and applicability conditions (e.g. skipped for e-commerce listings, skipped for food/cosmetics/seed categories per statutory exemption). The engine returns a structured result per check: `{rule_id, status, evidence, citation}`. This keeps the legal logic auditable and separable from the OCR/CV code — a rule can be corrected or a new one added without touching the extraction pipeline.

### 2.5 Team & Work Distribution (7 days, 6 people)

| Role | Owner | Focus |
|---|---|---|
| OCR/CV | Rishab or Vineet (split, not joint) | Pre-processing, PaddleOCR integration, bounding-box output |
| Rule Engine | Vineet or Rishab (the other of the two) | `rules.yaml`, extractors, the 5 core checks |
| Backend/API | Daksh | FastAPI endpoints, Supabase schema, wiring OCR → extractor → rule engine |
| Frontend — Upload/Viewer | Jivan | Upload flow, annotated-image viewer |
| Frontend — Dashboard | Yashvi | Scan history, violation-stats dashboard |
| Reports/QA/PM | Ammar | PDF report generation, 30–50 image hand-labeled eval set, bug triage, demo script, pitch deck |

Day-by-day: Day 1 — interface contracts locked, skeletons up. Days 2–3 — parallel build against mocked interfaces. Day 4 — first real integration. Day 5 — reports + dashboard finished. Day 6 — full run against the eval set, bug fixing (protected buffer day). Day 7 — code freeze, demo rehearsal, pitch deck only.

---

## 3. Feasibility and Viability

### 3.1 Technical Feasibility
- OCR and rule-based validation are both proven, well-understood techniques — no unproven ML research is required for the MVP.
- The rule set is a fixed, finite legal document (Rule 6 of the LMPC Rules), not an open-ended classification problem — every check has a deterministic, citable answer.
- No public LMPC-compliance image dataset exists, so evaluation depends on a small hand-labeled set (30–50 product images with ground-truth violations) built by the team during the build week.

### 3.2 Key Risks and Mitigation

| Risk | Mitigation |
|---|---|
| OCR accuracy drops on curved, glossy, wrinkled, or low-contrast labels | Aggressive image pre-processing (deskew, contrast normalisation); surface per-field OCR confidence scores honestly rather than hiding uncertainty |
| Font-size-in-mm measurement is unreliable without a controlled reference object | Cut from MVP; documented as a known limitation and future work rather than demoed unreliably |
| Regulatory text has rule-numbering pitfalls (e.g. MRP is Rule 6(1)(e), not (f); consumer care is a standalone Rule 6(2), not part of 6(1)) | Every citation in the rule engine cross-checked against primary-source consolidated text before being hardcoded |
| Rule 6(10A) (e-commerce country-of-origin filter) was originally reported as effective 1 July 2026, but the Second Amendment Rules, 2026 (27 April 2026) deferred it to **1 July 2027** | The team's own rule engine and pitch materials must reflect the corrected date; this check is presented as regulatory-readiness for an upcoming requirement, not as an already-binding violation check |
| Edge-case date formats, MRP phrasing variants | Permissive regex patterns validated against the hand-labeled eval set |
| Live e-commerce scraping is fragile mid-demo (rate limits, DOM changes) | Demo runs against a pre-scraped, cached set of listings |

### 3.3 Viability for Real Deployment
- A browser-based web app requires no distribution channel beyond a URL — lower adoption friction than a native app for both field inspectors and self-checking businesses.
- The rule-citation-first design (every verdict traceable to a specific sub-rule) is directly usable as evidence in an inspection report, which is closer to how enforcement actually works than a generic pass/fail score.
- Clear integration path for future government adoption: connecting scan results to existing state Legal Metrology enforcement systems, and adding offline capture for inspectors working with poor connectivity — both flagged as roadmap items rather than promised as built.

---

## 4. Impact and Benefits

### 4.1 For Consumers
Faster surfacing of mislabeled or non-compliant products — missing tax-inclusivity disclosure, dual MRPs, absent country-of-origin on imports — protects consumers from being misled on price and origin.

### 4.2 For Government / Enforcement Agencies
Inspectors can screen far more products per day than manual label-by-label review allows, with every flagged violation backed by a specific rule citation and evidence snippet ready to go into an inspection report — reducing the manual documentation burden per case.

### 4.3 For Industry
Manufacturers, packers, and e-commerce sellers get a self-check tool to catch labeling errors before a product reaches the shelf or listing goes live, reducing exposure to the tiered penalty regime introduced by the Jan Vishwas (Amendment of Provisions) Act, 2026 — improvement notices escalating to fines up to ₹25–50 lakh for repeated non-compliance under the revised Section 36.

### 4.4 Broader Impact
Supports the Department of Consumer Affairs' transparency objectives in both physical retail and the fast-growing e-commerce channel, where labeling oversight has historically lagged.

---

## 5. Research and References

### Primary sources (statute and rules text)
- Legal Metrology (Packaged Commodities) Rules, 2011 — consolidated text as amended up to GSR 31 Oct 2021 (Maharashtra Legal Metrology official mirror)
- Legal Metrology (Packaged Commodities) Rules, 2011 — West Bengal Consumer Affairs mirror
- Legal Metrology Act, 2009 (Act 1 of 2010) — India Code consolidated text
- Legal Metrology (Packaged Commodities) Amendment Rules, 2022 and 2023 — Legitquest
- Legal Metrology (Packaged Commodities) Amendment Rules, 2026 — Gazette Notification CG-DL-E-13022026-270123 (13 Feb 2026), inserted Rule 6(10A)
- **Legal Metrology (Packaged Commodities) Second Amendment Rules, 2026 — G.S.R. 312(E), notified 27 April 2026** — deferred Rule 6(10A) effective date from 1 July 2026 to **1 July 2027**
- **Legal Metrology (Packaged Commodities) Third Amendment Rules, 2026 — G.S.R. 418(E), notified 29 May 2026, effective 1 June 2026** — added Explanation-2 to Rule 4 (bonded-warehouse declarations for AEO Tier-2/3 importers) and amended Rule 27
- Jan Vishwas (Amendment of Provisions) Act, 2026 (Act 8 of 2026), effective 1 May 2026 — restructured Section 36 penalty regime

### Primary sources (official DoCA material)
- DoCA — Legal Metrology Act landing page and FAQs on Packaged Commodities Rules, 2011
- DoCA — Consolidated rulebook with all amendments

### Secondary sources (used for corroboration only)
- RAI (Retailers Association of India) — Jan Vishwas 2023 impact table on the Legal Metrology Act
- LiveLaw, SCC Online, Mondaq, TeamLease RegTech, CliniExperts — commentary and explainers on the 2026 amendment rules

### Note on currency of this research
Rule text and amendment dates are current as of September 2026. The LMPC Rules have been amended three times in 2026 alone; before final submission, re-verify Rule 6(10A)'s effective date and Section 36 penalty figures against the primary gazette text, as further amendments before the SIH deadline are plausible given this pace of change.
