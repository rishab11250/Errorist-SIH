# SIH 26034 — Packaged Commodities Compliance Checker (verified)

**Hackathon:** Smart India Hackathon 2026
**Problem Statement:** 26034 — Software System to check compliance of Packaged Commodities under Legal Metrology (Packaged Commodities) Rules, 2011
**Organization:** Ministry of Consumer Affairs, Food & Public Distribution
**Department:** Department of Consumer Affairs (DoCA)
**Category:** Software
**Theme:** Miscellaneous
**Idea submission deadline:** 30 September 2026
**PS ranking in internal guide:** #3 of 9 (Overall: 9.2/10 — Best computer-vision + rules demo)

---

## 1. Core Problem

India's enforcement agencies physically cannot inspect the millions of pre-packaged goods flowing through retail stores, supermarkets and e-commerce platforms fast enough. Under the **Legal Metrology Act, 2009** and the **Legal Metrology (Packaged Commodities) Rules, 2011** (commonly "LMPC Rules"), every pre-packaged commodity must carry mandatory declarations in a specified format. Non-compliances — missing declarations, wrong font sizes, improper MRP phrasing, no email in consumer care, dual MRPs, missing country of origin on imports — slip through routinely.

The hackathon asks for a software system that **scans product images and labels, extracts the mandatory declarations, validates them against the LMPC Rules, and generates compliance / violation reports** for inspectors.

---

## 2. Key Mandatory Declarations (per Rule 6, LMPC Rules 2011) — VERIFIED

Authoritative source: **Legal Metrology (Packaged Commodities) Rules, 2011 — consolidated text as amended up to GSR 31 Oct 2021** (Maharashtra Legal Metrology official mirror, primary text). Rule 6(1) lists the following declarations that every package shall bear:

| Sub-rule | Declaration | Verification status |
|---|---|---|
| **6(1)(a)** | Name and address of manufacturer; or where manufacturer is not the packer, name and address of manufacturer *and* packer; and for imported packages, name and address of importer | [VERIFIED — primary text, Maharashtra mirror] |
| **6(1)(aa)** | Name of the country of origin or manufacture or assembly in case of imported products | [VERIFIED — primary text, inserted by 2021 amendment w.e.f. 1 Apr 2022] |
| **6(1)(b)** | Common or generic name of the commodity contained in the package (and for multi-product packages, the name and number/quantity of each) | [VERIFIED — primary text] |
| **6(1)(c)** | Net quantity in terms of the standard unit of weight or measure, or number where sold by number | [VERIFIED — primary text] |
| **6(1)(d)** | Month and year in which the commodity is manufactured | [VERIFIED — primary text; **omitted** for food articles (PFA Act), seeds (Seeds Act 1966) and cosmetics (Drugs & Cosmetics Rules)] |
| **6(1)(da)** | "Best before" or "Use by" date, month and year — only where the commodity may become unfit for human consumption with time | [VERIFIED — primary text] |
| **6(1)(e)** | Retail sale price of the package (i.e. **MRP inclusive of all taxes in Indian currency**) | [VERIFIED — primary text; (e) is the MRP clause, NOT (f) as earlier drafts had it] |
| **6(1)(f)** | Where sizes of the commodity are relevant, the **dimensions** of the commodity, and if pieces differ, dimensions of each piece | [VERIFIED — primary text; (f) is the *dimensions* clause, NOT MRP] |
| **6(1)(g)** | Such other matters as are specified in these rules | [VERIFIED — primary text] |
| **6(2)** | **Name, address, telephone number and e-mail address** of the person or office that can be contacted for complaints (consumer care) | [VERIFIED — primary text; this is a standalone sub-rule, not part of 6(1) list] |
| **6(3)** | **Sticker prohibition:** It shall not be permissible to affix individual stickers on the package for altering or making declarations required under these rules *(proviso permits a sticker with revised *lower* MRP that does not cover the original MRP)* | [VERIFIED — primary text] |
| **6(10)** | **E-commerce obligation:** E-commerce entity must ensure mandatory declarations under sub-rule (1) — **except the month and year of manufacture/packing** — are displayed on the digital/electronic network used for e-commerce transactions | [VERIFIED — primary text] |
| **6(11)** | **Unit Sale Price** declaration format ("Rs. __ per g", "Rs. __ per kg", "Rs. __ per ml", "Rs. __ per litre", "Rs. __ per number", etc.) | [VERIFIED — primary text; effective date **1 October 2022** per 2022 Amendment Rules notification dated 28 March 2022; subsequently, the 2023 Amendment Rules (effective 1 January 2024) added clarifications on combination/group/multi-piece packages] |

### Where applicable (separate statutes, simultaneous with LMPC)

- **FSSAI 14-digit licence number** on food products (Food Safety & Standards Act, 2006)
- **BIS Standard Mark + R-Number** for regulated electronics
- **Vegetarian / Non-vegetarian symbol** (green/brown dot) on food packages — Rule 6(8)
- **"GM" marking** on genetically modified food at the top of the principal display panel — Rule 6(7)

### Exemptions — Rule 26

- Packages with net weight or measure **≤ 10 g or 10 ml** (tobacco and tobacco products also exempted from USP)
- Fast food items packed by restaurants/hotels
- Drugs covered under DPCO 2013 (except medical devices declared as drugs)
- Thread sold in coil to handloom weavers

---

## 3. Critical Structural Rules (primary-source verified)

These come straight from the Rules text and drive the rule engine design:

| # | Rule | Implication for the prototype |
|---|---|---|
| 1 | **Rule 6(10):** E-commerce entity must display declarations on the digital platform itself (except mfg date) | The "scan e-commerce listings" angle — must apply when a URL is provided |
| 2 | **Rule 6(11):** USP rounded to nearest 2 decimal places | Format check |
| 3 | USP **not required** when MRP = USP, for wholesale packages, or for packs ≤ 10 g / 10 ml | Suppress false positives |
| 4 | **Rule 6(3):** Individual sticker declarations are prohibited; only a reduced-MRP sticker is permitted (and it must not cover the original MRP) | Catch sticker-only labels (common e-commerce violation) |
| 5 | **Rule 18(2):** No retail dealer or other person shall make any sale of any commodity in packed form at a price exceeding the retail sale price — cognizable offence | Document in report; out of scope for label-scan alone |
| 6 | **Rule 18(2A):** No manufacturer/packer/importer shall declare different MRPs on an identical pre-packaged commodity (anti-dual-MRP) | High-value detection rule |
| 7 | **Rule 6(1)(d) Provisos:** Mfg date not required on Bidis, incense sticks, 14.2/5 kg LPG cylinders | Branch rule set on commodity type |
| 8 | **Rule 6(1)(a) Explanation III:** For food packages, FSSAI rules apply instead of manufacturer-name clause | Branch on commodity category |
| 9 | **MRP prefix case:** "inclusive of all taxes" / "Incl. of all taxes" may be small, upper, or sentence case (per DoCA FAQ Q44 — secondary, not contradicted by Rules text) | Accept any case variant |
| 10 | **Font-size requirement applies only to the MRP value**, not the "MRP Rs." prefix or "(Incl. of all taxes)" suffix (per DoCA FAQ Q45 — secondary) | Measure only the numeric token |
| 11 | **Rule 7(5):** Size rules for numerals/letters do not apply where another law (FSSAI) covers the same declaration | Branch by category |
| 12 | **Rule 10:** "Complete address" must include the **Postal Index Number (PIN)** and the street/city/State, so consumer can locate the manufacturer | PIN regex check |

---

## 4. Font-Size Rules (Rule 7) — VERIFIED PRIMARY SOURCE

Rule 7 was substantially restructured by an amendment between 2011 and 2022. The **original 2011 Rule 7 had two tables** keyed to *how the net quantity is declared*; the **current consolidated Rule 7 has a single Table I** keyed to *principal display panel (PDP) area*. The rule engine must encode both for completeness.

### 4.1 Original 2011 Rule 7(2) — TWO tables (pre-2022 amendment)

**Primary source:** West Bengal Consumer Affairs mirror, original 2011 notification GSR 202(E), 7 March 2011.

**Rule 7(2):** "The height of any numeral in the declaration required under these rules, on the principal display panel shall not be less than,—
(i) as shown in **Table-I**, if the net quantity is declared in terms of **weight or volume**;
(ii) as shown in **Table-II**, if the net quantity is declared in terms of **length, area or number**."

**Rule 7(3)** (letter height): "The height of letters in the declaration shall not be less than 1 mm height and when blown, formed, molded, embossed or perforated, the height of letters shall not be less than 2 mm."

#### Original Table-I — net quantity by weight/volume

| Serial | Net quantity | Normal case (mm) | Blown/formed/molded/embossed/perforated (mm) |
|---|---|---|---|
| 1 | Up to 200 g/ml | **1** | **2** |
| 2 | Above 200 g/ml and up to 500 g/ml | **2** | **4** |
| 3 | Above 500 g/ml | **4** | **6** |

#### Original Table-II — net quantity by length/area/number, keyed to PDP area

| Serial | PDP area | Normal case (mm) | Blown/formed/molded/embossed/perforated (mm) |
|---|---|---|---|
| 1 | Up to 100 cm² | **1** | **2** |
| 2 | Above 100 cm² and up to 500 cm² | **2** | **4** |
| 3 | Above 500 cm² and up to 2500 cm² | **4** | **6** |
| 4 | Above 2500 cm² | **6** | **6** |

**Rule 7(4)** (original, the "other law" exemption): "The provisions under sub-rule (1) to (3) shall not apply to a package if the information to be specified on such package under this rule is also required to be given by or under any other law for the time being in force."

[VERIFIED — primary text, West Bengal Consumer Affairs mirror, GSR 202(E), 7 March 2011]

### 4.2 Current consolidated Rule 7 — ONE Table I (post-2022 amendment)

**Primary source:** Maharashtra Legal Metrology official mirror, consolidated up to GSR 31 Oct 2021 (w.e.f. 1 Apr 2022).

**Rule 7(2)** (current): "The height of any numeral and letter in the declaration required under these rules shall be as per Table – I"

**Rule 7(3)** (current): "The width of the letter or numeral shall not be less than one third of its height, except in the case of numeral '1' and letters (i), (I) and (l)"

#### Current Table I — PDP area only

| Serial | PDP area (cm²) | Printed (mm) | Blown/formed/molded (mm) |
|---|---|---|---|
| 1 | A ≤ 50 | **1.0** | **1.5** |
| 2 | 50 < A ≤ 100 | **1.5** | **3.0** |
| 3 | 100 < A ≤ 500 | **2.5** | **4.0** |
| 4 | 500 < A ≤ 2500 | **4.0** | **6.0** |
| 5 | A > 2500 | **6.0** | **6.0** |

**Rule 7(5)** (current, the "other law" exemption): "Except size of the numbers and letters for declaring net weight, retail sale price, date of expiry or best before or use by date (wherever and as applicable) and consumer care details, the provisions under sub-rules (1) to (4) shall not apply to a package if the information to be specified on such package under this rule is also required to be given by or under any other law for the time being in force."

[VERIFIED — primary text, Maharashtra Legal Metrology mirror, consolidated to 31 Oct 2021 / 1 Apr 2022]

### 4.3 Reconciliation

- **The two-table structure was consolidated into the single PDP-area table** at some point between 2011 and the 31 Oct 2021 amendment. The exact amendment GSR is not yet identified — flagged as a follow-up verification item.
- **For the operative rule engine**, encode **both** versions tagged with their effective date. The engine selects the version in force at the scan date (or the latest known version if no date is provided).
- **Effective row selection** for the original two-table Rule 7:
  - If net quantity is declared by **weight or volume** (g, kg, ml, l) → use Table-I
  - If net quantity is declared by **length, area or number** → use Table-II (which itself is keyed to PDP area)
- **Effective row selection** for the current single-table Rule 7: always use the PDP area to look up the row.
- **The "other law" exemption** (Rule 7(4) original / Rule 7(5) current) applies in both versions. For **food products**, font-size for net weight, MRP, expiry date, and consumer care is governed by FSSAI labelling regulations, not Rule 7. The rule engine must branch on commodity category before applying font-size checks to these declarations.

### 4.4 First Schedule — Maximum Permissible Errors on net quantity (separate concept)

This is **not** a font-size table — it governs *measurement tolerance*, with brackets keyed to **declared quantity (g or ml)** or to **length/area/number**. Primary source: First Schedule, Rule 22(1).

**First Schedule, Table I — errors on net quantity declared by weight or volume:**

| Sr. No. | Declared quantity (g or ml) | Max permissible error |
|---|---|---|
| (i) | up to 50 | 9% |
| (ii) | 50 to 100 | 4.5 g or ml |
| (iii) | 100 to 200 | 4.5% |
| (iv) | 200 to 300 | 9 g or ml |
| (v) | 300 to 500 | 3% |
| (vi) | 500 to 1000 | 15 g or ml |
| (vii) | 1000 to 10000 | 1.5% |
| (viii) | 10000 to 15000 | 150 g or ml |
| (ix) | More than 15000 | 1% |

**First Schedule, Table II — errors on net quantity declared by length, area or number:**

| Sl. No. | Quantity declared | Max permissible error |
|---|---|---|
| (i) | in units of length | 2% up to 10 m, thereafter 1% |
| (ii) | in units of area | 4% up to 10 m², thereafter 1% |
| (iii) | by number | 2% of declared quantity |

[VERIFIED — primary text, First Schedule]

### 4.5 Verification of Rule 18(2A) (anti-dual-MRP) — previously unconfirmed, now verified

**Rule 18(2A)** of LMPC Rules 2011 (substituted by amendment dated 31 Oct 2021, w.e.f. 1 Apr 2022):

> "Unless otherwise specifically provided under any other law, no manufacturer or packer or importer shall declare different maximum retail prices on an identical pre packaged commodity by adopting restrictive trade practices or unfair trade practices as defined under clause (41) and (47) of section 2 of the Consumer Protection Act, 2019 (35 of 2019)."

[VERIFIED — primary text, Maharashtra mirror]

### 4.6 Note on the "1.6 mm US-style" proposal

The internal claim that "industry pushed toward a 1.6 mm minimum" was investigated and **could not be verified** as having been enacted. Current Table I (1.0 / 1.5 / 2.5 / 4.0 / 6.0 mm) is the operative schedule per the 2021 consolidated primary text. **Risk-flag:** if a future amendment revises these numbers, the rule engine must be updated.

---

## 4A. Rule 6(10A) — E-commerce Country-of-Origin Filter

**Original primary source:** [Legal Metrology (Packaged Commodities) Amendment Rules, 2026, Gazette Notification CG-DL-E-13022026-270123, dated 13 February 2026](https://gazettetracker.com/g/CG-DL-E-13022026-270123) — inserted sub-rule (10A) after sub-rule (10) in Rule 6, original effective date 1 July 2026.

**Deferred by Second Amendment:** [Legal Metrology (Packaged Commodities) Second Amendment Rules, 2026, Gazette Notification CG-DL-E-27042026-272105, dated 27 April 2026](https://gazettetracker.com/g/CG-DL-E-27042026-272105) — substituted sub-rule (10A) and deferred effective date to **1 July 2027**. Corroborated by [TeamLease RegTech summary](https://www.teamleaseregtech.com/updates/article/55254/legal-metrology-packaged-commodities-second-amendment-rules-2026/).

Sub-rule (10A) as currently drafted (post-Second Amendment):

> "Every e-commerce entity selling imported products shall provide the product listings of such imported products in a searchable and sortable filter specifying the country of origin."

[VERIFIED — primary gazette notifications; current effective date **1 July 2027**, not 1 July 2026]

**Build relevance as of Sept 2026:** the requirement is **not yet binding** — it becomes effective 1 July 2027, roughly 10 months after SIH submission. The requirements document (Section 3.3) frames this correctly: present the check as **regulatory-readiness for an upcoming requirement**, not as enforcement of an already-binding violation.

## 4B. Other 2026 amendments (added for currency)

- **Third Amendment Rules, 2026 (G.S.R. 418(E), 29 May 2026, effective on publication)** — added **Explanation-2 to Rule 4** (bonded-warehouse declarations for AEO Tier-2/3 importers) and amended **Rule 27** (registration). [Primary source: Gazette Tracker CG-DL-E-01062026-273053](https://gazettetracker.com/g/CG-DL-E-01062026-273053). These are unlikely to affect the MVP rule set but should be noted for completeness.

---

## 5. Penalties — Legal Metrology Act, 2009 — VERIFIED AS OF 7 MAY 2026

**Primary source:** India Code consolidated text of the Legal Metrology Act, 2009 (Act 1 of 2010), as on 7 May 2026, including both Jan Vishwas Amendment Acts.

### Section 36 — Penalty for selling, etc., of non-standard packages — current (post-1 May 2026)

**Section 36(1):** Whoever manufactures, packs, imports, sells, distributes, delivers or otherwise transfers, offers, exposes or possesses for sale, **including through digital modes of sale such as e-commerce platforms, online market places or any other digital or electronic means including electronic service providers facilitating such sales**, any pre-packaged commodity which does not conform to the declarations on the package —
- **First offence:** warned with an improvement notice
- **Second offence:** penalty up to **₹5 lakh**
- **Subsequent offences:** fine **not less than ₹25 lakh, may extend to ₹50 lakh**

[VERIFIED — primary text via India Code; Jan Vishwas Act 8 of 2026, s.2 & Sch., w.e.f. 1 May 2026]

**Section 36(2):** Whoever manufactures or packs or imports any pre-packaged commodity with error in net quantity —
- Fine **not less than ₹10,000, may extend to ₹1 lakh**
- Second offence: fine up to **₹5 lakh**
- Third or subsequent offence: fine up to **₹50 lakh**, or imprisonment up to **1 year**, or both

[VERIFIED — primary text via India Code; Jan Vishwas Act 8 of 2026, w.e.f. 1 May 2026]

### Jan Vishwas Amendment timeline (verified)

- **Jan Vishwas (Amendment of Provisions) Act, 2023 (Act 18 of 2023)** — assented 11 August 2023. Restructured penalties under **Sections 25, 27, 28, 29, 31, 34, 35**, and widened compounding scope under **Section 48**. **Section 36 was NOT changed in 2023** — confirmed by RAI impact table (authoritative trade body) and by the absence of Section 36 amendments in the 2023 Act's schedule (verified by comparing the India Code text structure).
- **Jan Vishwas (Amendment of Provisions) Act, 2026 (Act 8 of 2026)** — w.e.f. 1 May 2026. Substantially rewrote **Section 36(1)** (introducing improvement-notice regime + explicit e-commerce coverage) and **Section 36(2)** (tiered fines). Also restructured Sections 26 (no change in substance), 32, 38, 39, 41, 45–47, and introduced the new **"improvement notice"** definition in Section 2( ea).

---

## 6. Violation Priority (rank-ordered by what inspectors actually catch)

| Priority | Violation | Detectable from image |
|---|---|---|
| High | MRP missing or without "(Incl. of all taxes)" | Yes — Rule 6(1)(e) |
| High | Net quantity in non-metric units (oz, lb, fl oz) | Yes — Rule 6(1)(c) + Rule 13 |
| High | No manufacturer/importer address or missing PIN | Yes — Rule 6(1)(a) + Rule 10 |
| High | Consumer care without email | Yes — Rule 6(2) |
| High | Manufacture date in wrong format or missing (where applicable) | Yes — Rule 6(1)(d) |
| High | Country of origin missing on imported-looking products | Yes — Rule 6(1)(aa) |
| Medium | Font size of any declaration below Rule 7 Table I minimum | Yes — Rule 7(2) |
| Medium | Dual MRP on a single pack (prohibited) | Yes — Rule 18(2A) |
| High | E-commerce listing missing searchable/sortable country-of-origin filter on imported products | Yes — Rule 6(10A) (effective 1 July 2026) |
| Medium | Single-sticker declarations (prohibited under 6(3)) | Needs visual check |
| Low | Generic name missing (only brand shown) | Needs brand DB |
| Low | BIS / FSSAI number format invalid | Yes |

---

## 7. Solution Architecture

```
[Mobile/Web Upload] → [Image Pre-processing] → [OCR Engine] → [Field Extractor] → [Rule Engine] → [Compliance Verdict] → [Annotated Image + PDF Report] → [Dashboard]
```

### Pipeline details

1. **Ingest** — Single-image upload (front face) OR multi-image (front + back + side) OR e-commerce URL scrape
2. **Pre-process** (OpenCV) — deskew, denoise, contrast normalisation, perspective correction
4. **OCR** — **PaddleOCR** (handles Indic scripts and curved labels better than Tesseract); Tesseract fallback
5. **Extract fields** — bounding-box + text → regex + heuristics per declaration type → structured `{field, value, bbox, confidence}`
6. **Measure font size** — pixel height of any declaration token → convert to mm via a reference object (credit-card-sized sticker in a second shot) or assumed DPI from package dimensions
7. **Rule engine** — deterministic JSON / YAML rules; each check returns `{rule_id, status: pass|fail|na|warn, evidence, citation}`
8. **Verdict + Report** — annotated image (bounding boxes coloured by verdict) + ReportLab PDF report with rule citations
9. **Store** — Supabase (Postgres + image storage): scan history, products, reports
10. **Dashboard** — Next.js: scan list, violation trends, product detail, search/filter

### Tech stack (matches internal guide recommendation)

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | **Next.js + TypeScript + Tailwind + shadcn/ui** | Fast UI, judge-friendly |
| Backend | **FastAPI (Python)** | Best OCR/CV library ecosystem |
| OCR | **PaddleOCR** + Tesseract fallback | Better Indic + curved text than Tesseract alone |
| CV | **OpenCV** | Pre-processing, perspective, contours |
| ML (optional) | **YOLO** for declaration region localisation if OCR alone is too noisy | Adds demo depth |
| Rule engine | **Python + JSON/YAML rules** | Each check is a small function; easy to demo |
| DB / Storage | **Supabase** (Postgres + object storage) | Zero-ops; good free tier |
| Auth | Supabase Auth (optional for MVP) | Role-based access later |
| Reports | **ReportLab** (PDF) + JSON for editable export | Native image annotation |
| Deployment | **Vercel** (frontend) + **Render/Railway** (backend) | Standard SIH stack |

---

## 8. Prototype Scope

### MVP — 5 core rule checks (per team requirements document, 7-day build, 6 people)

1. **Single-image upload** of a product's front label
2. **OCR with preserved bounding boxes** (PaddleOCR; Tesseract fallback)
3. **Extract 7 declaration fields** to structured form:
   - Manufacturer / importer name + address + PIN (Rule 6(1)(a) + Rule 10)
   - Net quantity in metric units (Rule 6(1)(c))
   - MRP + "Inclusive of all taxes" phrase (Rule 6(1)(e))
   - Month/year of manufacture (Rule 6(1)(d) — skipped per statutory exemption)
   - Consumer care details (Rule 6(2) — must include email)
   - Country of origin (Rule 6(1)(aa))
   - Common / generic name (Rule 6(1)(b))
4. **5 core rule checks** producing pass/fail/NA with primary-source citations:
   1. MRP present with correct tax-inclusivity phrasing — **Rule 6(1)(e)**
   2. Net quantity declared in metric units — **Rule 6(1)(c)**
   3. Manufacturer/importer address present with valid PIN — **Rule 6(1)(a) + Rule 10**
   4. Consumer care details include an email address — **Rule 6(2)**
   5. Manufacture date present and correctly formatted (skipped where exempt by category) — **Rule 6(1)(d)**
5. **Annotated image output** (colour-coded bounding boxes)
6. **PDF compliance report** with citations and evidence snippets
7. **Scan history page** and **dashboard** of violation statistics

### Explicitly out of MVP scope (per requirements document)

- **Font-size measurement in mm via physical reference object** — too fragile to demo reliably in the available time. Documented as known limitation and future work.
- **YOLO-based declaration-region detection** — real ML work requiring a labeled dataset the team does not have time to build; stretch item only after MVP is working, never Day 1 commitment.
- **Live e-commerce URL scraping during demo** — pre-cached listings used instead.
- **Offline mobile app** — flagged as future deployment path.
- **Rule 6(10A) check as a binding violation** — deferred to 1 July 2027; presented in pitch materials as regulatory-readiness for an upcoming requirement, not as enforcement of an already-binding rule.

### Differentiators (only if MVP is solid)

- **Multi-side image fusion** — combine front + back labels; reconcile duplicate fields
- **Visual violation overlays** — animated demo on the original image (very high demo impact)
- **E-commerce listing scan** — paste URL → scrape listing + listing image → apply Rule 6(10) (mfg date not required on e-commerce) **and Rule 6(10A)** (searchable/sortable country-of-origin filter on imported products — required since 1 July 2026)
- **Font-size measurement in mm** using a reference object (credit-card-size fiducial) in the same shot
- **Hindi / regional language support** via PaddleOCR's multilingual models

### Deliberately cut from the prototype

- Full role-based user access (RBAC complexity vs. limited demo time)
- End-to-end authentication flow (single demo user is fine)
- Full-text semantic search across all scans
- Offline mobile app
- Real-time integration with e-commerce platform APIs

---

## 9. Biggest Technical Risks

1. **OCR accuracy on curved / wrinkled / glossy / low-contrast labels** — Mitigate with PaddleOCR + aggressive image normalisation; worst case, accept field-level confidence scores and show them honestly
2. **True font-size measurement in mm** — requires a reference object of known size in the same image; if absent, fall back to estimated DPI or document as a limitation
3. **Rule edge cases** — date formats (`MM/YY`, `Month YYYY`, `Mfg: 04/2026`), MRP phrasing variants, USP vs MRP equality — solved by permissive regexes
4. **Label region localisation on cluttered packs** — optional YOLO detector if OCR alone struggles
5. **Dataset for evaluation** — no public LMPC-compliance dataset exists; plan a small hand-labelled set (30–50 product images with ground-truth violations) for evaluation

---

## 10. Suggested Build Order (36–48 hour hackathon plan)

| Hour | Track | Goal |
|---|---|---|
| 0–4 | All | Stand up Next.js + FastAPI skeletons; integrate PaddleOCR on one sample image; define `rules.yaml` schema |
| 4–12 | Backend | Field extractors for the 7 fields with regex + heuristics; unit tests against 5 sample images |
| 12–20 | Backend | Rule engine wired to extractors; 10 checks implemented with citations; font-size measurement using a reference card |
| 20–28 | Backend | PDF report (ReportLab) with annotated image + rule table |
| 20–28 | Frontend | Upload + scan UI; annotated image viewer; scan history page |
| 28–36 | Frontend | Dashboard with violation counts; demo seed data |
| 36–40 | All | Polish UX; demo script; presentation slides |
| 40–48 | All | Buffer for OCR edge cases + presentation rehearsal |

---

## 11. What Makes the Demo Win

The single best demo moment: **upload a product photo → 2 seconds later show it back with red boxes around every violation, each labelled with the rule citation (Rule 6(1)(e), Section 36(1) LM Act, etc.)** and a PDF report with the same evidence. This visual, instant, rule-grounded transformation is what makes judges and DoCA stakeholders immediately understand the value.

---

## 12. Verification Log

| # | Item in prior draft | Status | Action taken |
|---|---|---|---|
| 1 | MRP cited as Rule 6(1)(f) | **Wrong** | **Corrected to Rule 6(1)(e)** — primary text verified (Maharashtra mirror) |
| 2 | Common/generic name cited as Rule 6(1)(c) | **Wrong** | **Corrected to Rule 6(1)(b)** — primary text verified |
| 3 | Consumer care cited as Rule 6(1)(g) | **Wrong** | **Corrected to Rule 6(2)** — primary text verified; this is a standalone sub-rule |
| 4 | Sticker prohibition cited as Rule 6(2) | **Wrong** | **Corrected to Rule 6(3)** — primary text verified |
| 5 | USP cited as Rule 6(11), no effective date | **Correct citation; missing effective date** | **Added: effective 1 October 2022** per 2022 Amendment Rules notification 28 March 2022; 2023 Amendment Rules (effective 1 January 2024) added clarifications — primary text verified |
| 6 | Font-size "Table I/II with weight vs PDP-area brackets" | **CORRECTED** — the original 2011 Rule 7 (West Bengal mirror, GSR 202(E)) **does** have TWO tables keyed to how net quantity is declared: Table I for weight/volume (≤200, 200–500, >500 g/ml; 1/2/4 mm normal, 2/4/6 mm molded), Table II for length/area/number keyed to PDP area (≤100, 100–500, 500–2500, >2500 cm²; 1/2/4/6 mm normal, 2/4/6/6 mm molded). Rule 7(3) original sets letter min at 1mm/2mm molded. **Rule 7 was restructured** between 2011 and the 31 Oct 2021 amendment (w.e.f. 1 Apr 2022): the two tables were consolidated into a single PDP-area-keyed Table I (Maharashtra mirror). The exact consolidating amendment GSR is not yet identified — flagged as follow-up verification. **rules.yaml must encode both versions** tagged with effective date. **Section 4 fully rewritten** to show both versions with sources |
| 7 | Country of origin not cited | **Now cited** as **Rule 6(1)(aa)** — primary text verified (inserted by 2021 amendment, w.e.f. 1 April 2022) |
| 8 | Table I/II mm minimums revised by amendment | **Could not verify** that a 1.6 mm revision was ever enacted. Current Table I (1.0/1.5/2.5/4.0/6.0 mm) is the operative schedule per 2021 consolidated text. **Risk-flagged** in Section 4.7 |
| 9 | Section 36 penalty figures | **Corrected**: prior draft had ₹25,000 / ₹1,00,000 (pre-Jan Vishwas 2026 figures); Section 36 was substantially rewritten by **Jan Vishwas Act 8 of 2026 (effective 1 May 2026)**. Current Section 36(1) = improvement notice → up to ₹5L → ₹25–50L; Section 36(2) = ₹10k–1L → up to ₹5L → up to ₹50L or 1 yr imprisonment |
| 10 | Jan Vishwas 2026 Section 36 specifically | **Verified**: Jan Vishwas 2026 DID restructure Sections 25, 26, 27, 28, 29, 31, 32, 34, 35, 36(1), 36(2), 37, 38, 39, 41, 45, 46, 47 and Section 48, plus added Section 2(ea) "improvement notice" — primary text verified via India Code |
| 11 | Jan Vishwas 2023 Section 36 | **Verified**: Jan Vishwas 2023 did **NOT** touch Section 36 — confirmed by RAI impact table (authoritative trade body comparison) and absence of Section 36 in the 2023 Act schedule |
| 12 | MRP declaration format "MRP ₹X (Inclusive of all taxes)" | **Partly secondary** — the Rules text says "retail sale price... in Indian currency... clearly indicate that it is the maximum retail price inclusive of all taxes"; the exact "Inclusive of all taxes" wording is industry/DoCA-FAQ level. **Risk-flagged**: the rule engine should accept the canonical phrase plus reasonable variants |
| 13 | Font size only applies to MRP value, not the prefix | **Secondary source** (DoCA FAQ Q45) — not contradicted by Rules text. **Risk-flagged** but defensible |
| 14 | Rule 18(2A) (anti-dual-MRP) | **Now verified** — primary text confirms Rule 18(2A) substituted by 31 Oct 2021 amendment (w.e.f. 1 Apr 2022). Cited verbatim in Section 4.6 |
| 15 | Rule 7(5) (claimed exemption list) | **Now verified** — primary text confirms the exemption list covers **net weight, retail sale price (MRP), date of expiry/best-before/use-by, and consumer care details**, but only where another law (typically FSSAI) also requires the same declaration. Cited verbatim in Section 4.4 |
| 16 | Rule 6(10A) — e-commerce country-of-origin filter | **Now verified** — Legal Metrology (Packaged Commodities) Amendment Rules 2026, gazette notification CG-DL-E-13022026-270123 dated 13 Feb 2026, effective 1 July 2026. New sub-rule (10A) inserted after sub-rule (10) in Rule 6. Added as new Section 4A with build-relevant rationale |

### Sources (primary first, then secondary)

**Primary (rules text & statute):**
- [Legal Metrology (Packaged Commodities) Rules, 2011 — consolidated up to GSR 31 Oct 2021 (Maharashtra Legal Metrology mirror, official)](https://legalmetrologymh.in/public/temp/368/02d3c4fef3045bc21d90ba000a28357e.pdf)
- [Legal Metrology (Packaged Commodities) Rules, 2011 — Indian Kanoon verbatim](https://indiankanoon.org/doc/100694501/)
- [Legal Metrology (Packaged Commodities) Rules, 2011 — Indian Kanoon (Rule 6 section)](https://indiankanoon.org/doc/38209662/)
- [Legal Metrology (Packaged Commodities) Rules, 2011 — West Bengal Consumer Affairs mirror](https://wbconsumers.gov.in/writereaddata/ACT%20&%20RULES/Act%20&%20Rules/9%20The%20Legal%20Metrology%20(Package%20Commodities)%20Rules,%202011.pdf)
- [Legal Metrology (Packaged Commodities) Amendment Rules, 2022 — Legitquest text](https://www.legitquest.com/act/legal-metrology-packaged-commodities-amendment-rules-2022/B5DC)
- [Legal Metrology (Packaged Commodities) Amendment Rules, 2023 — Legitquest text](https://www.legitquest.com/act/legal-metrology-packaged-commodities-amendment-rules-2023/E049)
- [Legal Metrology Act, 2009 (Act 1 of 2010) — India Code consolidated text as on 7 May 2026](https://www.indiacode.nic.in/indiacode/bitstream/123456789/2102/1/2009l.pdf)
- [Section 36 Legal Metrology Act, 2009 — Indian Kanoon](https://indiankanoon.org/doc/28676169/)
- [Legal Metrology (Packaged Commodities) Amendment Rules, 2026 — Gazette notification CG-DL-E-13022026-270123 (13 Feb 2026)](https://gazettetracker.com/g/CG-DL-E-13022026-270123) — primary source for Rule 6(10A)

**Primary (gazette / official circulars):**
- [DoCA — Legal Metrology Act landing page](https://consumeraffairs.gov.in/pages/legal-metrology-act)
- [DoCA — FAQs on Packaged Commodities Rules 2011 (official)](https://consumeraffairs.gov.in/public/upload/admin/cmsfiles/whatsnews/FAQs_on_Packaged_Commodities,_Rules_2011_whatsnews.pdf)
- [DoCA — Consolidated rulebook with all amendments](https://consumeraffairs.gov.in/public/upload/admin/cmsfiles/whatsnews/Book_on_Legal_Metrology_Packaged_Commodities_Rules,2011_with_all_amendments_whatsnews.pdf)
- [DoCA — Amendment notification 8(i)](https://consumeraffairs.gov.in/public/upload/files/8(i)_0_1732860957.pdf)
- [DoCA — Amendment notification 8(ii)](https://consumeraffairs.gov.in/public/upload/files/8(ii)_0_1732860982.pdf)

**Secondary (used only when primary was silent):**
- [RAI (Retailers Association of India) — Jan Vishwas 2023 impact table on Legal Metrology Act](https://www.rai.net.in/Advocacy_Files/Changes%20in%20LM%20Act%20by%20JanVishwasAmendment%202023.pdf) — used to confirm Jan Vishwas 2023 did NOT change Section 36
- [LiveLaw — Jan Vishwas 2023 amendments to Legal Metrology Act](https://www.livelaw.in/law-firms/law-firm-articles-/jan-vishwas-amendments-legal-metrology-act-2009-ahlawat-and-associates-241409)
- [Krono Labs — India Product Labeling Requirements](https://krono-labs.com/guides/india-product-labeling-requirements)
- [FMCGMath — MRP and Legal Metrology Rules](https://www.fmcgmath.in/blog/legal-metrology-mrp-rules)
- [Industry guide — LMPC MRP Label Requirements 2026](https://buytscprinters.com/blogs/news/legal-metrology-mrp-label-requirements-packaged-food-india-2026)