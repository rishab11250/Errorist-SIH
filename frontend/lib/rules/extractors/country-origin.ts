import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { extractLabeledField } from './base';

export const COUNTRY_PATTERN =
  /\b(?:country\s+of\s+origin|made|manufactured)\s*(?:in\s*)?[:\-]?\s*([A-Za-z][A-Za-z .'-]+)$/i;

export const IMPORTER_PATTERN =
  /\bimported\s+by\s*[:\-]?\s*(.+)$/i;

export function extractCountryOrigin(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta
): ExtractedField {
  return extractLabeledField(ocrWords, {
    name: 'country_origin',
    pattern: COUNTRY_PATTERN,
  });
}

export function extractImporterAddress(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta
): ExtractedField {
  return extractLabeledField(ocrWords, {
    name: 'importer_address',
    pattern: IMPORTER_PATTERN,
  });
}
