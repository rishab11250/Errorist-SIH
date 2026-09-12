import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { groupWordsIntoSpatialRows } from '../../spatial-layout';

export const PATTERN =
  /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|gm|gms|GM|Kg|Litre|Liter|litre|liter|mL|ML|N|U)\b/i;

export const NON_METRIC =
  /\b(?:oz|ounce|ounces|lb|lbs|pound|pounds|fl\.?\s*oz)\b/i;

const NET_QTY_LABEL =
  /\b(?:net\s*(?:weight|qty\.?|quantity|contents?|vol\.?|volume|wt\.?))\b/i;

export function extractNetQuantity(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta,
  allowedUnits: string[]
): ExtractedField {
  const allowed = new Set(allowedUnits.map((u) => u.toLowerCase()));
  allowed.add('gm');
  allowed.add('gms');

  // Pass 1: Standard sequential search (exact parity with Python engine)
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

  // Pass 2: Spatial row search for multi-column layouts (e.g. NET WEIGHT [Col 1] ... 33 g [Col 2])
  const spatialRows = groupWordsIntoSpatialRows(ocrWords);
  for (const row of spatialRows) {
    if (NET_QTY_LABEL.test(row.text)) {
      console.log(`[extractNetQuantity] Checking labeled spatial row: "${row.text}"`);
      const m = PATTERN.exec(row.text);
      if (m && allowed.has(m[2].toLowerCase())) {
        const val = m[0];
        const valWord =
          row.words.find((w) => w.text.includes(m[1]) || w.text.includes(m[2])) ||
          row.words[0];
        console.log(`[extractNetQuantity] Found labeled net quantity: "${val}" in "${row.text}"`);
        return {
          name: 'net_quantity',
          value: val,
          bbox: valWord.bbox,
          confidence: valWord.confidence,
          evidence_spans: row.words.map((w) => w.bbox),
        };
      }
    }
  }

  console.log('[extractNetQuantity] No Net Quantity found in evidence.');
  return {
    name: 'net_quantity',
    value: null,
    bbox: null,
    confidence: 0.0,
    evidence_spans: [],
  };
}
