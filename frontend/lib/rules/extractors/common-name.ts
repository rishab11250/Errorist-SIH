import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { extractLabeledField, mergeBboxes } from './base';

export const PATTERN = /\b(?:common|generic)\s+name\s*[:\-]?\s*(.+)$/i;

export function extractCommonName(ocrWords: OCRWord[], imageMeta: ImageMeta): ExtractedField {
  const labeled = extractLabeledField(ocrWords, {
    name: 'common_name',
    pattern: PATTERN,
  });
  if (labeled.value) return labeled;

  // Consumer packs commonly print the generic identity prominently without a
  // literal "common name" label. Keep this vocabulary deliberately generic.
  const commodity =
    /^(?:noodles?|oats?|biscuits?|cookies?|crackers?|soap|shampoo|toothpaste|detergent)$/i;
  const ingredientsTop = ocrWords
    .filter((word) => /^ingredients?[:]?$/i.test(word.text))
    .reduce((top, word) => Math.min(top, word.bbox[1]), Number.POSITIVE_INFINITY);
  const candidates = ocrWords
    .map((word, index) => ({ word, index }))
    .filter(
      ({ word }) =>
        commodity.test(word.text.replace(/[^a-z]/gi, '')) &&
        word.confidence >= 0.6 &&
        word.bbox[1] < ingredientsTop
    )
    .sort((left, right) => left.word.bbox[1] - right.word.bbox[1]);
  for (const { word } of candidates) {
    const previous = ocrWords
      .filter(
        (candidate) =>
          candidate !== word &&
          candidate.bbox[0] < word.bbox[0] &&
          word.bbox[0] - (candidate.bbox[0] + candidate.bbox[2]) < 0.05 &&
          Math.abs(candidate.bbox[1] - word.bbox[1]) <=
            Math.max(candidate.bbox[3], word.bbox[3]) * 0.8
      )
      .sort((left, right) => right.bbox[0] + right.bbox[2] - (left.bbox[0] + left.bbox[2]))[0];
    const sameLine =
      previous &&
      Math.abs(previous.bbox[1] - word.bbox[1]) <= Math.max(previous.bbox[3], word.bbox[3]) * 0.8 &&
      previous.bbox[0] < word.bbox[0] &&
      !/^(?:net|per|of|with|and|total|added)$/i.test(previous.text);
    const evidence = sameLine ? [previous, word] : [word];
    return {
      name: 'common_name',
      value: evidence.map((item) => item.text.replace(/[:*]+$/, '')).join(' '),
      bbox: mergeBboxes(evidence),
      confidence: Math.min(...evidence.map((item) => item.confidence)),
      evidence_spans: evidence.map((item) => item.bbox),
    };
  }
  return labeled;
}
