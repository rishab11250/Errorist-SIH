import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { extractLabeledField } from './base';

export const PATTERN =
  /\b(?:dimensions?|size)\s*[:\-]?\s*(\d+(?:\.\d+)?\s*(?:mm|cm|m)(?:\s*[x×]\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)){1,2})/i;

export function extractDimensions(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta
): ExtractedField {
  return extractLabeledField(ocrWords, {
    name: 'dimensions',
    pattern: PATTERN,
  });
}
