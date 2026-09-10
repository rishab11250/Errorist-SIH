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
  const candidates: Array<{
    priceWord: OCRWord;
    value: string;
    numeric: number;
  }> = [];
  const seenNumeric = new Set<number>();

  for (let i = 0; i < ocrWords.length; i++) {
    let sampleText = ocrWords
      .slice(i, Math.min(i + 4, ocrWords.length))
      .map((w) => w.text)
      .join(' ');

    if (/\b(?:save|off|cashback|discount)\b/i.test(sampleText)) {
      continue;
    }
    if (
      /\/\s*(?:g|gm|kg|ml|l|unit|u|pc|piece)\b|\b(?:per\s+(?:g|gm|kg|ml|l|unit|u|pc|piece))\b|\b(?:usp|unit\s*price)\b/i.test(
        sampleText
      )
    ) {
      continue;
    }

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
        const numVal = parseFloat(cleaned.replace(/,/g, ''));
        if (!isNaN(numVal) && numVal > 0 && !seenNumeric.has(numVal)) {
          seenNumeric.add(numVal);
          candidates.push({
            priceWord: ocrWords[i],
            value: cleaned,
            numeric: numVal,
          });
        }
      }
    }
  }

  if (candidates.length === 0) {
    return {
      name: 'mrp',
      value: null,
      bbox: null,
      confidence: 0.0,
      evidence_spans: [],
      conflicting_values: [],
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

  let bestCand = candidates[0];
  let bestPhraseWords: OCRWord[] = [];
  let bestMatch: RegExpExecArray | null = null;

  for (const cand of candidates) {
    const nearby = ocrWords.filter(
      (w) => Math.abs(w.bbox[1] - cand.priceWord.bbox[1]) <= vertTol
    );
    const joined = nearby.map((w) => w.text).join(' ');
    const match = phrase.exec(joined);
    if (match) {
      bestCand = cand;
      bestMatch = match;
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
      bestPhraseWords = phraseWords;
      break;
    }
  }

  const priceWord = bestCand.priceWord;
  const value = bestCand.value;
  const conflicting =
    candidates.length > 1 ? candidates.map((c) => c.value) : [];
  const extraSpans = candidates
    .filter((c) => c.priceWord !== priceWord)
    .map((c) => c.priceWord.bbox);

  if (!bestMatch) {
    return {
      name: 'mrp',
      value: null,
      bbox: priceWord.bbox,
      confidence: priceWord.confidence,
      evidence_spans: [priceWord.bbox, ...extraSpans],
      conflicting_values: conflicting,
    };
  }

  const evidenceWords =
    bestPhraseWords.length > 0
      ? [priceWord, ...bestPhraseWords.filter((w) => w !== priceWord)]
      : [priceWord];

  return {
    name: 'mrp',
    value,
    bbox: mergeBboxes(evidenceWords),
    confidence: avgConfidence(evidenceWords),
    evidence_spans: [
      priceWord.bbox,
      ...evidenceWords.filter((w) => w !== priceWord).map((w) => w.bbox),
      ...extraSpans,
    ],
    conflicting_values: conflicting,
  };
}
