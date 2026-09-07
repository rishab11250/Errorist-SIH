# SIH 26034 — Pitch notes

## 30-second elevator

Legal Metrology inspectors cannot manually review every packaged good. This tool OCRs a label photo in the browser, checks five mandatory declarations against the Legal Metrology (Packaged Commodities) Rules, 2011, and returns a colour-coded annotated result plus an inspection-ready PDF in seconds.

## Demo script

1. Open `http://localhost:3000` and upload a product label.
2. Choose a category and scan; OCR runs in the browser.
3. Show the per-rule results and evidence overlay.
4. Download the citation-backed PDF report.
5. Open `/dashboard` and `/history` to show aggregate and saved scans.

## Why it is credible

- Browser-side Tesseract.js OCR; label images are not sent to a third-party OCR cloud.
- Deterministic, citation-backed checks for Rule 6(1)(a), (c), (e), Rule 6(2), and Rule 6(1)(d).
- `rules.yaml` preserves both Rule 7 font-size table versions for future measurement support.
- SQLite history, per-rule evidence, and ReportLab PDFs make the workflow inspector-friendly.

## Future work

Font-size measurement, multi-side label fusion, e-commerce scans, anti-dual-MRP matching, Hindi OCR, and enforcement-system integration.
