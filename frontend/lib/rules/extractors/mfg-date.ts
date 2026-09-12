import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { avgConfidence, compileRegex, mergeBboxes } from './base';
import { groupWordsIntoSpatialRows } from '../../spatial-layout';

// Standard Indian date pattern: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, MM/YYYY, DD Mon YYYY, Mon YYYY
const BROAD_DATE_PATTERN =
  /\b((?:(?:0?[1-9]|[12][0-9]|3[01])[\/\-\.](?:0?[1-9]|1[0-2])[\/\-\.]\d{2,4})|(?:(?:0?[1-9]|1[0-2])[\/\-\.]\d{2,4})|(?:(?:0?[1-9]|[12][0-9]|3[01])[\s\/\-\.]*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\/\-\.]*\d{2,4})|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\/\-\.]*\d{2,4}))\b/i;

const MFG_PREFIX =
  /\b(?:date\s+of\s+manufacture|date\s+of\s+mfg|mfg\.?\s*date|mfd\.?\s*date|manufactured\s+on|manufacture\s+date|packaging\s+date|packed\s+on|pkd\.?\s*date|mfg|mfd|packed|pkd)\b/i;

export function extractMfgDate(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta,
  dateRegexStr: string
): ExtractedField {
  const dateRe = compileRegex(dateRegexStr, 'i');
  const fullText = ocrWords.map((w) => w.text).join(' ');

  // Pass 1: Standard rule regex on full text
  const match = dateRe.exec(fullText);
  if (match) {
    const wordSpans: Array<{ word: OCRWord; start: number; end: number }> = [];
    let currentPos = 0;
    for (const word of ocrWords) {
      const start = currentPos;
      const end = start + word.text.length;
      wordSpans.push({ word, start, end });
      currentPos = end + 1;
    }

    const matchStart = match.index;
    const matchEnd = match.index + match[0].length;
    const matchedWords = wordSpans
      .filter(({ start, end }) => !(end < matchStart || start > matchEnd))
      .map(({ word }) => word);

    if (matchedWords.length > 0) {
      const val = (match[1] ?? match[0]).trim();
      const conf =
        matchedWords.reduce((sum, w) => sum + w.confidence, 0) / matchedWords.length;
      console.log(`[extractMfgDate] Matched via fullText regex: "${val}"`);
      return {
        name: 'mfg_date',
        value: val,
        bbox: mergeBboxes(matchedWords),
        confidence: conf,
        evidence_spans: matchedWords.map((w) => w.bbox),
      };
    }
  }

  // Pass 2: Spatial Row Search (handles two-column "DATE OF MANUFACTURE" [Col 1] -> "13/05/2026" [Col 2])
  const spatialRows = groupWordsIntoSpatialRows(ocrWords);
  for (const row of spatialRows) {
    if (MFG_PREFIX.test(row.text)) {
      console.log(`[extractMfgDate] Checking spatial row: "${row.text}"`);
      const dateMatch = BROAD_DATE_PATTERN.exec(row.text);
      if (dateMatch) {
        const val = dateMatch[1].trim();
        console.log(`[extractMfgDate] Matched spatial row date: "${val}" in "${row.text}"`);
        return {
          name: 'mfg_date',
          value: val,
          bbox: row.bbox,
          confidence: avgConfidence(row.words),
          evidence_spans: row.words.map((w) => w.bbox),
        };
      }
    }
  }

  console.log('[extractMfgDate] No Mfg Date found in evidence.');
  return {
    name: 'mfg_date',
    value: null,
    bbox: null,
    confidence: 0.0,
    evidence_spans: [],
  };
}
