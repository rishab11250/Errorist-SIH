import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { avgConfidence, extractLabeledField } from './base';
import { groupWordsIntoSpatialRows } from '../../spatial-layout';

export const PATTERN =
  /\b(?:best\s+before(?:\s+date)?|use\s+by(?:\s+date)?|expiry(?:\s+date)?|expires?|exp\.?\s*date)\s*[:\-]?\s*(.+)$/i;

const BROAD_DATE_PATTERN =
  /\b((?:(?:0?[1-9]|[12][0-9]|3[01])[\/\-\.](?:0?[1-9]|1[0-2])[\/\-\.]\d{2,4})|(?:(?:0?[1-9]|1[0-2])[\/\-\.]\d{2,4})|(?:(?:0?[1-9]|[12][0-9]|3[01])[\s\/\-\.]*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\/\-\.]*\d{2,4})|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\/\-\.]*\d{2,4}))\b/i;

export function extractBestBefore(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta
): ExtractedField {
  // Pass 1: Standard line window search
  const res = extractLabeledField(ocrWords, {
    name: 'best_before',
    pattern: PATTERN,
  });
  if (res.value && (BROAD_DATE_PATTERN.test(res.value) || /\b\d+\s*(?:days?|weeks?|months?|years?)\b/i.test(res.value))) {
    console.log(`[extractBestBefore] Matched: "${res.value}"`);
    return res;
  }

  // Pass 2: Spatial row search (e.g. "USE BY DATE" [Col 1] -> "09/10/2026" [Col 2])
  const spatialRows = groupWordsIntoSpatialRows(ocrWords);
  for (const row of spatialRows) {
    if (/\b(?:best\s+before|use\s+by|expiry|exp\.?)\b/i.test(row.text)) {
      const dateMatch = BROAD_DATE_PATTERN.exec(row.text);
      if (dateMatch) {
        const val = dateMatch[1].trim();
        console.log(`[extractBestBefore] Matched spatial row date: "${val}" in "${row.text}"`);
        return {
          name: 'best_before',
          value: val,
          bbox: row.bbox,
          confidence: avgConfidence(row.words),
          evidence_spans: row.words.map((w) => w.bbox),
        };
      }
    }
  }

  return { ...res, value: null, confidence: 0 };
}
