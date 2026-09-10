import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { extractLabeledField } from './base';

export const PATTERN =
  /\b(?:best\s+before|use\s+by|expiry|expires?)\s*[:\-]?\s*(.+)$/i;

export function extractBestBefore(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta
): ExtractedField {
  return extractLabeledField(ocrWords, {
    name: 'best_before',
    pattern: PATTERN,
  });
}
