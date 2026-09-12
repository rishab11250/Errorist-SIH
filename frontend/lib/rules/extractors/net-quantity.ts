import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { groupWordsIntoSpatialRows } from '../../spatial-layout';
import { avgConfidence } from './base';

export const PATTERN =
  /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|gm|gms|GM|Kg|Litre|Liter|litre|liter|mL|ML|N|U)\b/i;

export const NON_METRIC = /\b(?:oz|ounce|ounces|lb|lbs|pound|pounds|fl\.?\s*oz)\b/i;

const NET_QTY_LABEL = /\b(?:net\s*(?:weight|qty\.?|quantity|contents?|vol\.?|volume|wt\.?))\b/i;

export function extractNetQuantity(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta,
  allowedUnits: string[]
): ExtractedField {
  const allowed = new Set(allowedUnits.map((u) => u.toLowerCase()));
  allowed.add('gm');
  allowed.add('gms');

  // A bare metric value may be a serving size or nutrition value. Only accept a
  // quantity when the same visual row explicitly identifies it as net contents.
  const spatialRows = groupWordsIntoSpatialRows(ocrWords);
  for (const row of spatialRows) {
    if (
      NET_QTY_LABEL.test(row.text) &&
      !/\b(?:serve|serving|per\s*100|nutrition)\b/i.test(row.text)
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

  // OCR sometimes emits the label and value as adjacent blocks rather than one row.
  for (let i = 0; i < ocrWords.length; i++) {
    if (!NET_QTY_LABEL.test(ocrWords[i].text)) continue;
    const ws = ocrWords.slice(i, i + 8);
    const text = ws.map((word) => word.text).join(' ');
    if (/\b(?:serve|serving|per\s*100|nutrition)\b/i.test(text)) continue;
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

  console.log('[extractNetQuantity] No Net Quantity found in evidence.');
  return {
    name: 'net_quantity',
    value: null,
    bbox: null,
    confidence: 0.0,
    evidence_spans: [],
  };
}
