import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { extractLabeledField } from './base';

export const PATTERN =
  /\b(?:unit\s+sale\s+price|price\s+per\s+unit)\s*[:\-]?\s*((?:₹|rs\.?|inr)\s*\d+(?:\.\d{1,2})?\s*\/\s*(?:g|kg|ml|l|piece|unit))/i;

export function extractUnitPrice(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta
): ExtractedField {
  return extractLabeledField(ocrWords, {
    name: 'unit_price',
    pattern: PATTERN,
  });
}
