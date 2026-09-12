import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { groupWordsIntoSpatialRows } from '../../spatial-layout';
import { avgConfidence } from './base';

export const PATTERN =
  /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|gm|gms|GM|Kg|Litre|Liter|litre|liter|mL|ML|N|U)\b/i;

export const NON_METRIC = /\b(?:oz|ounce|ounces|lb|lbs|pound|pounds|fl\.?\s*oz)\b/i;

export const BARCODE_PATTERN = /\b\d{8,}\b/;

export const NON_STANDARD_UNIT_PATTERN =
  /\b\d+(?:\.\d+)?\s*(?:gm|gms|g\.|\bkg\.|\bkgs\b|ml\.|lt|ltr)\b/i;

const NET_QTY_LABEL = /\b(?:net\s*(?:weight|qty\.?|quantity|contents?|vol\.?|volume|wt\.?)|gross\s*(?:wt\.?|weight)|quantity)\b/i;

const NUTRITION_EXCLUSION =
  /\b(?:protein|energy|carbohydrate|carbs?|fat|sugar|sodium|cholesterol|nutrition|nutritional|nutrients?|per\s*100\s*g|serve\s*size|serving)\b/i;

export function extractNetQuantity(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta,
  allowedUnits: string[]
): ExtractedField {
  const allowed = new Set(allowedUnits.map((u) => u.toLowerCase()));
  allowed.add('gm');
  allowed.add('gms');

  // Filter out barcode tokens (>= 8 consecutive digits)
  const nonBarcodeWords = ocrWords.filter((w) => !BARCODE_PATTERN.test(w.text));

  // Pass 1: Check spatial rows where NET WEIGHT / NET QTY label is present and not a nutrition line
  const spatialRows = groupWordsIntoSpatialRows(nonBarcodeWords);
  for (const row of spatialRows) {
    if (
      NET_QTY_LABEL.test(row.text) &&
      !NUTRITION_EXCLUSION.test(row.text)
    ) {
      console.log(`[extractNetQuantity] Checking labeled spatial row: "${row.text}"`);
      const m = PATTERN.exec(row.text);
      if (m && allowed.has(m[2].toLowerCase())) {
        const val = m[0];
        const valueIndex = row.words.findIndex((word) => word.text.includes(m[1]));
        const valWord = row.words[valueIndex] ?? row.words[0];
        const escapedUnit = m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const unitWord =
          row.words
            .slice(Math.max(0, valueIndex))
            .find((word) => new RegExp(`^${escapedUnit}\\.?$`, 'i').test(word.text)) ?? valWord;
        const evidenceWords = unitWord === valWord ? [valWord] : [valWord, unitWord];
        console.log(`[extractNetQuantity] Found labeled net quantity: "${val}" in "${row.text}"`);
        return {
          name: 'net_quantity',
          value: val,
          bbox: valWord.bbox,
          confidence: avgConfidence(evidenceWords),
          evidence_spans: evidenceWords.map((word) => word.bbox),
        };
      }
    }
  }

  // Pass 2: Sequential window search near label
  for (let i = 0; i < nonBarcodeWords.length; i++) {
    if (!NET_QTY_LABEL.test(nonBarcodeWords[i].text)) continue;
    const ws = nonBarcodeWords.slice(i, i + 8);
    const text = ws.map((word) => word.text).join(' ');
    if (NUTRITION_EXCLUSION.test(text)) continue;
    const match = PATTERN.exec(text);
    if (!match || !allowed.has(match[2].toLowerCase())) continue;
    const valueWord = ws.find((word) => PATTERN.test(word.text)) ?? ws[0];
    return {
      name: 'net_quantity',
      value: match[0],
      bbox: valueWord.bbox,
      confidence: Math.min(...ws.map((word) => word.confidence)),
      evidence_spans: ws.map((word) => word.bbox),
    };
  }

  // Pass 3: Fallback sequential search if no anchor keyword exists (e.g. synthetic test fixtures)
  for (let i = 0; i < nonBarcodeWords.length; i++) {
    const ws = nonBarcodeWords.slice(i, i + 2);
    const text = ws.map((w) => w.text).join(' ');
    const contextWords = nonBarcodeWords.slice(Math.max(0, i - 3), i + 4).map((w) => w.text).join(' ');
    if (NUTRITION_EXCLUSION.test(contextWords)) continue;

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

  console.log('[extractNetQuantity] No Net Quantity found in evidence.');
  return {
    name: 'net_quantity',
    value: null,
    bbox: null,
    confidence: 0.0,
    evidence_spans: [],
  };
}
