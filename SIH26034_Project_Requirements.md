# SIH 2026 — PS 26034: Packaged Commodities Compliance Checker
### Project Requirements Document (As-Built Specification)

**Problem Statement:** 26034 — Software System to check compliance of Packaged Commodities under Legal Metrology (Packaged Commodities) Rules, 2011  
**Organization:** Ministry of Consumer Affairs, Food & Public Distribution (Department of Consumer Affairs)  
**Team (6):** Rishab, Vineet, Daksh, Ammar, Jivan, Yashvi  
**Build window:** 7 days | **Deliverable:** Web application  
**Idea submission deadline:** 30 September 2026  

---

> [!NOTE]
> **Scope Realignment Notice:** The initial planning document scoped an MVP with 5 rule checks, cloud PaddleOCR, Supabase/PostgreSQL, and deferred font-size analysis. During implementation, the scope expanded significantly to support 13 distinct rule checks, in-browser privacy-preserving Tesseract.js OCR, a multi-format export pipeline (PDF, DOCX, CSV), a complete session-based role/auth system (inspector vs. admin), and a defensible Rule 7 character-height measurement policy (DPI-verified scanner calibration with fallback to `manual_review`). This document reconciles the requirements with the codebase as actually delivered.

---

## 1. Proposed Solution (Idea / Solution / Prototype)

### 1.1 The Problem
Enforcement agencies under the Legal Metrology Act, 2009 and the Legal Metrology (Packaged Commodities) Rules, 2011 ("LMPC Rules") cannot physically inspect the volume of pre-packaged goods moving through retail and e-commerce fast enough. Mandatory label declarations — MRP with tax inclusivity, net quantity in metric units, manufacturer/importer address with PIN, consumer care contact with phone and email, manufacturing date, country of origin, unit sale price, common/generic name, and declaration character height — are routinely missing, malformed, or non-compliant. Violations go undetected until a manual inspection catches them.

### 1.2 The Solution
A web application allowing enforcement officers (inspectors and administrators) to upload or capture product label evidence in retail or e-commerce mode. The system:

1. Runs client-side OCR (Tesseract.js WebAssembly) directly in the browser, ensuring images and raw text remain entirely local to the client until submitted, preserving privacy and enabling offline operation.
2. Transmits normalized text bounding boxes and image evidence to the FastAPI backend.
3. Parses the extracted text into mandatory declaration fields using deterministic heuristic and regex extractors.
4. Evaluates extracted fields against 13 versioned rules defined in `rules.yaml`, returning **pass / fail / warn / not-applicable / manual_review** verdicts with exact statutory citations.
5. Performs physical readability assessment (Rule 7) using verified DPI metadata or calibrated panel geometry, safely falling back to `manual_review` when physical scale cannot be established.
6. Renders interactive annotated bounding boxes on the original image (green for compliant, red for violation, amber for warning/manual review).
7. Provides audit-ready multi-format reporting: immutable signed PDF with embedded annotated images, editable DOCX reports, and filtered CSV exports with formula injection protection.
8. Enforces role-based access control (RBAC) with session isolation between inspectors and administrators.

### 1.3 The Core Demo Moment
Upload a label photo or e-commerce listing screenshot → client-side OCR extracts text immediately → within seconds, the backend returns the image annotated with color-coded bounding boxes mapped to statutory citations (e.g., Rule 6(1)(e), Rule 6(2), Rule 7) → inspector downloads an official PDF report complete with legal citations, cropped evidence snippets, and digital verification.

### 1.4 Implemented Scope (Actual Codebase Capabilities)
- **Dual-Mode Evidence Capture:** Retail mode (live environment camera or file upload) and E-Commerce listing mode (screenshot / product card analysis).
- **Client-Side In-Browser OCR:** Tesseract.js 5.1.1 running locally via WebAssembly, referencing strictly self-hosted offline assets (`/public/tesseract/`). No third-party OCR API or cloud data leakage.
- **13 Automated LMPC Rule Checks:**
  1. `r6_1_e_mrp`: MRP declared with mandatory "Inclusive of all taxes" phrasing — Rule 6(1)(e).
  2. `r6_1_c_net_quantity`: Net quantity declared in standard metric units (g, kg, ml, l) — Rule 6(1)(c) read with Rule 13.
  3. `r6_1_a_address`: Manufacturer/packer/importer name, complete street address, and valid 6-digit postal PIN code — Rule 6(1)(a) read with Rule 10.
  4. `r6_2_consumer_care`: Consumer care details containing name, physical address, verified phone number, and email — Rule 6(2).
  5. `r6_1_d_mfg_date`: Month and year of manufacture or packaging; dynamically exempted for food, cosmetics, seeds, or e-commerce mode — Rule 6(1)(d).
  6. `r6_1_b_common_name`: Common or generic name of the commodity inside visible panel — Rule 6(1)(b).
  7. `r6_1_aa_country_origin`: Country of origin mandatory for imported commodities — Rule 6(1)(aa).
  8. `r6_1_a_importer_address`: Importer name and address for imported goods — Rule 6(1)(a).
  9. `r6_1_da_best_before`: Best-before, use-by, or expiry date validation for food commodities — Rule 6(1)(da).
  10. `r6_1_f_dimensions`: Metric dimensional declaration for qualifying non-food retail products — Rule 6(1)(f).
  11. `r6_11_unit_sale_price`: Unit sale price declared in standard rupees per g/kg/ml/l/unit with statutory exemption handling — Rule 6(11).
  12. `r6_10_ecommerce_declarations`: Mandatory aggregate declaration visibility across e-commerce product listings — Rule 6(10).
  13. `r7_font_size`: Minimum character height measurement and readability compliance — Rule 7.
- **DPI-Verified Rule 7 Font Readability:** Character height calculated in millimeters from verified scanner DPI metadata (`character_height_px * 25.4 / scanner_dpi`, 98% scale confidence) or calibrated physical panel geometry (`geometry_estimate`). If physical scale cannot be proven reliably (e.g., standard smartphone photo without calibration target), the engine outputs a defensible `manual_review` verdict with explanation rather than a fragile false pass/fail.
- **Role-Based Access Control (RBAC):**
  - Roles: `inspector` and `admin`.
  - Scoped data access: Inspectors view and export only their own scans; inspectors attempting to access another inspector's scan receive a 404 (preventing record disclosure). Admins can inspect, filter, review, and export across all system records.
  - User administration: Admin-only API for provisioning inspectors, updating passwords, toggling active status, with automatic session revocation upon password change or deactivation. Protection against deleting the last active admin.
  - Session security: HttpOnly, SameSite=Lax, bounded TTL, SHA-256 session token hashing, origin allowlist validation, and CSRF protection.
- **Comprehensive Multi-Format Export:**
  - PDF (`/api/exports/scans/{id}.pdf`): Formatted official inspection report generated via ReportLab with embedded annotated image, verdict matrix, rule citations, and inspector sign-off.
  - DOCX (`/api/exports/scans/{id}.docx`): Editable Microsoft Word compliance report for formal documentation workflows.
  - CSV (`/api/exports/scans.csv`): Filtered bulk dataset export honoring active UI search parameters, featuring spreadsheet formula injection neutralization and SHA-256 filter integrity digest (`X-LMPC-Filter-Digest`).
- **Inspection Lifecycle & Review Actions:** Audit logging for inspector review notes, override decisions, and status transitions.

### 1.5 Deferred / Out of Scope Items
- Uncalibrated millimetric font measurement on unconstrained mobile phone photos without physical reference — handled safely via the `manual_review` boundary policy.
- Custom YOLO declaration-detector models — replaced by efficient OpenCV contour/panel estimation combined with OCR layout geometry.
- Live internet scraping of e-commerce storefronts during inspections — e-commerce analysis operates on user-submitted listing screenshots/evidence.
- Native mobile application distribution (iOS/Android binaries) — web application operates via responsive browser interface with direct camera access.

---

## 2. Technical Approach

### 2.1 Architecture
```
[Client Browser]
   ├── Camera / Evidence File Picker (JPEG, PNG, WebP ≤ 10 MB)
   ├── Tesseract.js (Offline Wasm OCR Engine in Web Worker)
   └── Same-Origin Next.js Reverse Proxy (/api/*)
           │
           ▼
[FastAPI Backend Service]
   ├── Session Authentication & RBAC Middleware (Inspector / Admin)
   ├── OpenCV Image Processing & Quality Assessment (Contrast, Sharpness, Glare)
   ├── Panel Area & Character Geometry Engine
   ├── Deterministic Field Extractors (13 LMPC Fields)
   ├── Rule Engine (`rules.yaml` — 13 Statutory Rules)
   ├── ReportLab PDF, python-docx DOCX & CSV Generator
   └── SQLite Database + Alembic Migrations (`0003_operations`)
```

### 2.2 Implemented Tech Stack

| Layer | Technology | Rationale & Architectural Reality |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind CSS | Fast responsive UI, full accessibility, works across desktop and mobile browsers |
| In-Browser OCR | Tesseract.js 5.1.1 (WebAssembly) | Client-side OCR keeps evidence completely private; zero network reliance or cloud OCR subscription costs |
| Backend | FastAPI (Python 3.12+) | High-throughput asynchronous REST API; tight integration with CV/image processing libraries |
| CV Processing | OpenCV (`opencv-python-headless`) + NumPy | Image decoding, quality metrics (Laplacian sharpness, contrast, glare ratio), panel bounding |
| Rule Engine | Python + `rules.yaml` | Declarative legal logic with versioned sub-rule tables, exemption criteria, and structured verdicts |
| Database | SQLite + SQLAlchemy 2.0 + Alembic | Zero-infrastructure single-file relational database with strict foreign keys, transactional migrations, and WAL mode |
| Auth & Sessions | Custom Session Auth + Argon2/PBKDF2 Hashing | Cookie-based session management (`lmpc_session`), token SHA-256 storage, RBAC permissions |
| Exports | ReportLab + python-docx + Python standard `csv` | Official immutable PDFs with annotated images, editable DOCX documents, and formula-safe CSVs |
| Deployment | *Open / Unconfigured* | Currently runs locally via pwsh/bash scripts. No production deployment configuration (Dockerfile, vercel.json, render.yaml, railway.json) currently committed to repository. |

### 2.3 Rationale for Client-Side OCR & Same-Origin Architecture
Rather than sending megabyte-heavy raw image payloads to an external cloud OCR service (e.g. Google Cloud Vision or AWS Textract), optical character recognition executes entirely inside the user's web browser using Tesseract.js WebAssembly. All core models and language dictionaries are hosted locally under `/public/tesseract/`. This delivers:
1. **Strict Data Privacy:** Sensitive pre-market packaging labels and inspector evidence never leave the local environment for OCR processing.
2. **Offline Resilience:** OCR functions even under restricted field connectivity once assets are cached.
3. **Same-Origin Security:** The browser communicates exclusively via relative `/api/*` routes proxied by Next.js to the backend, maintaining HttpOnly cookie boundaries and avoiding cross-origin credential exposures.

### 2.4 Database & Schema Versioning
Initial drafts contemplated Supabase/PostgreSQL. The system as implemented relies on SQLite with Alembic migrations (`alembic/versions/`):
- `0001_legacy_schema`: Core scans, verdicts, and quality metrics.
- `0002_inspection_v2`: Expanded fields for full LMPC declarations, packaging panel estimates, and readability scores.
- `0003_operations`: Complete multi-user RBAC schema (`users`, `sessions`, `review_actions`), scan ownership foreign keys, and administrative audit trails.

---

## 3. Feasibility and Viability

### 3.1 Technical Feasibility
- Deterministic extraction and regex-based phrase verification ensure 100% reproducible legal verdicts without hallucination risks common to generative LLMs.
- Rule definitions in `rules.yaml` are directly traceable to gazetted LMPC amendments (including 2026 amendments).
- Verification suite includes 232 comprehensive automated tests covering all extractors, rule evaluation edge cases, export generation, and RBAC authorization boundaries.

### 3.2 Risk Matrix (Updated for As-Built State)

| Risk | Status | Mitigation in Codebase |
|---|---|---|
| Inaccurate font height measurement on arbitrary mobile photos | Mitigated | Defensible two-tier policy: verified scanner DPI yields exact mm; uncalibrated photos produce `manual_review` rather than unlawful violations |
| Data privacy & confidentiality of pre-market product labels | Mitigated | Tesseract.js runs OCR locally on-device; backend receives parsed text and image under authenticated, role-scoped sessions |
| Unauthorized access or inspector data leakage | Mitigated | Session-based RBAC isolates inspector scans (returns 404 for unowned records); admin actions strictly audited |
| Spreadsheet formula injection attacks in CSV exports | Mitigated | CSV export sanitizes spreadsheet formula prefixes (`=`, `+`, `-`, `@`) and issues SHA-256 filter verification digests |
| Regulatory citation drift across frequent amendments | Mitigated | Decoupled YAML rules configuration allows instant citation and threshold updates without code modification |
| Lack of verified deployment infrastructure | **Open Risk** | No Dockerfile, `render.yaml`, or Vercel configuration has been validated in production. The system currently executes solely in local environments. |

### 3.3 Production Deployment Requirements (Open Item)
To transition this codebase to a live production environment:
1. **Containerization & Backend Host:** Dockerfile or Render/Railway build configuration running `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Note that SQLite storage is ephemeral on free-tier platforms unless mounted to a persistent volume disk.
2. **Frontend Host:** Vercel deployment with `LMPC_BACKEND_URL` pointing to the public backend instance, ensuring Next.js server rewrites continue to proxy `/api/*` cross-domain.
3. **CORS & Cookie Configuration:** Production domain must be explicitly added to `LMPC_ALLOWED_BROWSER_ORIGINS`, with `LMPC_COOKIE_SECURE=true` enabled for HTTPS.
4. **Initial Provisioning:** Automated execution of `scripts.bootstrap_admin` to create the root administrator account upon deployment.

---

## 4. Impact and Benefits

### 4.1 For Consumers
Rapid detection of non-compliant retail packaging prevents deceptive trade practices, ensuring transparent pricing (MRP inclusive of all taxes, mandatory unit sale price) and clear origin disclosure on imported goods.

### 4.2 For Enforcement Officers (Inspectors)
Reduces manual label inspection time from 15 minutes to under 5 seconds per product. Delivers standardized, court-admissible evidence packages (PDF/DOCX) complete with statutory sub-rule citations, annotated visual evidence, and inspector audit notes.

### 4.3 For Industry & Packagers
Enables proactive pre-market compliance audits for brand owners and manufacturers, minimizing exposure to compounding financial penalties under the amended Section 36 of the Legal Metrology Act (up to ₹50 lakh for repeated violations).

---

## 5. Research and Statutory References

### Primary Statutory Authorities
- **Legal Metrology Act, 2009 (Act 1 of 2010):** Sections 18, 36 (penalty framework restructured via Jan Vishwas Act, 2023/2026).
- **Legal Metrology (Packaged Commodities) Rules, 2011:**
  - *Rule 6(1)(a) read with Rule 10:* Name, complete address, and PIN code of manufacturer/packer/importer.
  - *Rule 6(1)(b):* Generic or common name of the commodity.
  - *Rule 6(1)(c) read with Rule 13:* Net quantity in standard metric units.
  - *Rule 6(1)(d):* Month and year of manufacture, packing, or import (with category exemptions).
  - *Rule 6(1)(da):* Best-before or expiry declarations for perishable/food items.
  - *Rule 6(1)(e):* Retail sale price (MRP) with mandatory inclusive of all taxes wording.
  - *Rule 6(1)(f):* Dimensions of commodity where relevant.
  - *Rule 6(1)(aa):* Mandatory country of origin for imported goods.
  - *Rule 6(2):* Consumer care details (name, address, telephone, email).
  - *Rule 6(10):* E-commerce marketplace display of mandatory declarations.
  - *Rule 6(11):* Unit Sale Price declaration standards (effective June 2023).
  - *Rule 7 read with Table I & II:* Minimum font size and character height based on package display area.
- **Legal Metrology (Packaged Commodities) Second Amendment Rules, 2026 (G.S.R. 312(E)):** Notified 27 April 2026, deferring Rule 6(10A) e-commerce country-of-origin mandatory filter to 1 July 2027.
- **Legal Metrology (Packaged Commodities) Third Amendment Rules, 2026 (G.S.R. 418(E)):** Effective 1 June 2026, bonded-warehouse declarations for AEO Tier-2/3 importers.
