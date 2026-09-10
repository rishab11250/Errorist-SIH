import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { extractLabeledField } from './base';

export const PATTERN = /\b(?:common|generic)\s+name\s*[:\-]?\s*(.+)$/i;

export function extractCommonName(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta
): ExtractedField {
  return extractLabeledField(ocrWords, {
    name: 'common_name',
    pattern: PATTERN,
  });
}
