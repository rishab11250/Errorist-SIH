import type { ExtractedField, ImageMeta, OCRWord } from '../domain';

export const PATTERN =
  /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|gm|GM|Kg|Litre|Liter|litre|liter|mL|ML)\b/i;

export const NON_METRIC =
  /\b(?:oz|ounce|ounces|lb|lbs|pound|pounds|fl\.?\s*oz)\b/i;

export function extractNetQuantity(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta,
  allowedUnits: string[]
): ExtractedField {
  const allowed = new Set(allowedUnits.map((u) => u.toLowerCase()));

  for (let i = 0; i < ocrWords.length; i++) {
    const ws = ocrWords.slice(i, i + 2);
    const text = ws.map((w) => w.text).join(' ');
    const m = PATTERN.exec(text);
    if (m && allowed.has(m[2].toLowerCase())) {
      const conf = ws.reduce((sum, w) => sum + w.confidence, 0) / ws.length;
      return {
        name: 'net_quantity',
        value: m[0],
        bbox: ws[0].bbox,
        confidence: conf,
        evidence_spans: ws.map((w) => w.bbox),
      };
    }
  }

  return {
    name: 'net_quantity',
    value: null,
    bbox: null,
    confidence: 0.0,
    evidence_spans: [],
  };
}
