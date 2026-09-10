import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { avgConfidence, compileRegex, mergeBboxes } from './base';

export const PRICE_PATTERN =
  /(?:(?:M\.?\s*R\.?\s*P\.?|Max(?:imum)?\.?\s*Retail\s*Price)\s*[:\-]?[₹$X\.\s]*(?:(?:₹|Rs\.?|Rs|price)\s*[:\-]?[₹$X\.\s]*)?|(?:₹|Rs\.?|Rs|price)\s*[:\-]?[₹$X\.\s]*)([0-9,oOlI]+(?:\.[0-9,oOlI]{1,2})?)/i;

export const MRP_PREFIX_BRANCH =
  /^(?:M\.?\s*R\.?\s*P\.?|Max(?:imum)?\.?\s*Retail\s*Price)\s*[:\-]?/i;

export function extractMrp(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta,
  phraseRegex: string,
  verticalTolerance = 0.06
): ExtractedField {
  const phrase = compileRegex(phraseRegex, 'i');
  let priceWord: OCRWord | null = null;
  let value: string | null = null;

  for (let i = 0; i < ocrWords.length; i++) {
    let sampleText = ocrWords
      .slice(i, Math.min(i + 4, ocrWords.length))
      .map((w) => w.text)
      .join(' ');

    let m = PRICE_PATTERN.exec(sampleText);
    if (!m && MRP_PREFIX_BRANCH.test(sampleText) && !/\d/.test(sampleText)) {
      sampleText = ocrWords
        .slice(i, Math.min(i + 8, ocrWords.length))
        .map((w) => w.text)
        .join(' ');
      m = PRICE_PATTERN.exec(sampleText);
    }

    if (m) {
      const rawVal = m[1];
      const cleaned = rawVal
        .replace(/o/g, '0')
        .replace(/O/g, '0')
        .replace(/l/g, '1')
        .replace(/I/g, '1');

      if (/\d/.test(cleaned)) {
        priceWord = ocrWords[i];
        value = cleaned;
        break;
      }
    }
  }

  if (!priceWord) {
    return {
      name: 'mrp',
      value: null,
      bbox: null,
      confidence: 0.0,
      evidence_spans: [],
    };
  }

  const isNormalized =
    ocrWords.length > 0 &&
    ocrWords.every(
      (w) =>
        w.bbox[0] <= 1.0 &&
        w.bbox[1] <= 1.0 &&
        w.bbox[2] <= 1.0 &&
        w.bbox[3] <= 1.0
    );

  const vertTol = isNormalized
    ? verticalTolerance
    : verticalTolerance * (imageMeta.height > 0 ? imageMeta.height : 1000.0);

  const nearby = ocrWords.filter(
    (w) => Math.abs(w.bbox[1] - priceWord!.bbox[1]) <= vertTol
  );
  const joined = nearby.map((w) => w.text).join(' ');
  const match = phrase.exec(joined);

  if (!match) {
    return {
      name: 'mrp',
      value: null,
      bbox: priceWord.bbox,
      confidence: priceWord.confidence,
      evidence_spans: [priceWord.bbox],
    };
  }

  let pos = 0;
  const phraseWords: OCRWord[] = [];
  const matchStart = match.index;
  const matchEnd = match.index + match[0].length;

  for (const w of nearby) {
    const start = pos;
    const end = start + w.text.length;
    if (!(end < matchStart || start > matchEnd)) {
      phraseWords.push(w);
    }
    pos = end + 1;
  }

  const evidenceWords =
    phraseWords.length > 0
      ? [priceWord, ...phraseWords.filter((w) => w !== priceWord)]
      : [priceWord, ...nearby];

  return {
    name: 'mrp',
    value,
    bbox: mergeBboxes(evidenceWords),
    confidence: avgConfidence(evidenceWords),
    evidence_spans: [
      priceWord.bbox,
      ...evidenceWords.filter((w) => w !== priceWord).map((w) => w.bbox),
    ],
  };
}
