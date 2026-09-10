import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { compileRegex, mergeBboxes } from './base';

export function extractMfgDate(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta,
  dateRegexStr: string
): ExtractedField {
  const dateRe = compileRegex(dateRegexStr, 'i');
  const text = ocrWords.map((w) => w.text).join(' ');
  const match = dateRe.exec(text);
  if (!match) {
    return {
      name: 'mfg_date',
      value: null,
      bbox: null,
      confidence: 0.0,
      evidence_spans: [],
    };
  }

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

  if (matchedWords.length === 0) {
    return {
      name: 'mfg_date',
      value: null,
      bbox: null,
      confidence: 0.0,
      evidence_spans: [],
    };
  }

  const val = (match[1] ?? match[0]).trim();
  const conf =
    matchedWords.reduce((sum, w) => sum + w.confidence, 0) / matchedWords.length;

  return {
    name: 'mfg_date',
    value: val,
    bbox: mergeBboxes(matchedWords),
    confidence: conf,
    evidence_spans: matchedWords.map((w) => w.bbox),
  };
}
