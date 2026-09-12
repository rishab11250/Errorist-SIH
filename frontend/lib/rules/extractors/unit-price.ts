import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { extractLabeledField } from './base';
import { groupWordsIntoSpatialRows } from '../../spatial-layout';

export const PATTERN =
  /\b(?:unit\s+sale\s+price|price\s+per\s+unit|usp)\s*[:\-]?\s*((?:₹|rs\.?|inr)?\s*\(?\s*\d+(?:\.\d{1,2})?\s*(?:per|\/)\s*(?:g|gm|kg|ml|l|piece|unit|u|pc)\)?)/i;

const BROAD_UNIT_PRICE =
  /((?:₹|rs\.?|inr)?\s*\(?\s*\d+(?:\.\d{1,2})?\s*(?:\/|per)\s*(?:g|gm|kg|ml|l|piece|unit|u|pc)\)?)\b/i;

export function extractUnitPrice(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta
): ExtractedField {
  // Pass 1: Standard line window search
  const res = extractLabeledField(ocrWords, {
    name: 'unit_price',
    pattern: PATTERN,
  });
  if (res.value) {
    console.log(`[extractUnitPrice] Matched via standard pattern: "${res.value}"`);
    return res;
  }

  // Pass 2: Spatial row search (e.g. "USP Rs. 0.61/g" or "Unit Sale Price (0.25 Per g)")
  const spatialRows = groupWordsIntoSpatialRows(ocrWords);
  for (const row of spatialRows) {
    if (/\b(?:unit\s+sale\s+price|price\s+per\s+unit|usp)\b/i.test(row.text)) {
      const match = BROAD_UNIT_PRICE.exec(row.text);
      if (match) {
        const val = match[1].trim();
        console.log(`[extractUnitPrice] Matched via spatial row: "${val}" in "${row.text}"`);
        return {
          name: 'unit_price',
          value: val,
          bbox: row.bbox,
          confidence: 0.88,
          evidence_spans: row.words.map((w) => w.bbox),
        };
      }
    }
  }

  return res;
}
