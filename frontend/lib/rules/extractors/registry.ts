import type {
  CheckConfig,
  ExtractedField,
  ImageMeta,
  OCRWord,
  RulesConfig,
  ScanContext,
} from '../domain';
import { extractBestBefore } from './best-before';
import { extractCommonName } from './common-name';
import { extractConsumerCare } from './consumer-care';
import { extractCountryOrigin, extractImporterAddress } from './country-origin';
import { extractDimensions } from './dimensions';
import { extractManufacturerAddress } from './manufacturer';
import { extractMfgDate } from './mfg-date';
import { extractMrp } from './mrp';
import { extractNetQuantity } from './net-quantity';
import { extractUnitPrice } from './unit-price';
import { sortWordsSpatially } from '../../spatial-layout';

export type Extractor = (
  words: OCRWord[],
  meta: ImageMeta,
  rules: RulesConfig
) => ExtractedField | null;

export const VIRTUAL_FIELDS = new Set([
  'listing_declarations',
  'declaration_readability',
]);

function findCheck(rules: RulesConfig, fieldName: string): CheckConfig | undefined {
  return rules.checks.find((c) => c.field === fieldName);
}

function runManufacturer(
  words: OCRWord[],
  meta: ImageMeta,
  rules: RulesConfig
): ExtractedField {
  const check = findCheck(rules, 'manufacturer_address');
  const pinPattern =
    check && check.pin_code_regex ? check.pin_code_regex : '\\b[1-9][0-9]{5}\\b';
  return extractManufacturerAddress(words, meta, pinPattern);
}

function runNetQuantity(
  words: OCRWord[],
  meta: ImageMeta,
  rules: RulesConfig
): ExtractedField {
  const check = findCheck(rules, 'net_quantity');
  const units =
    check && check.requires_unit_in ? check.requires_unit_in : ['g', 'kg', 'ml', 'l'];
  return extractNetQuantity(words, meta, units);
}

function runMrp(
  words: OCRWord[],
  meta: ImageMeta,
  rules: RulesConfig
): ExtractedField {
  const check = findCheck(rules, 'mrp');
  const phrase =
    check && check.tax_inclusive_phrase_regex
      ? check.tax_inclusive_phrase_regex
      : '(?i)\\binclusive\\s+of\\s+all\\s+taxes\\b';
  const extracted = extractMrp(words, meta, phrase);
  if (extracted && extracted.value) {
    return {
      name: extracted.name,
      value: `MRP ${extracted.value} (Inclusive of all taxes)`,
      bbox: extracted.bbox,
      confidence: extracted.confidence,
      evidence_spans: extracted.evidence_spans,
      conflicting_values: extracted.conflicting_values,
    };
  }
  return extracted;
}

function runConsumerCare(
  words: OCRWord[],
  meta: ImageMeta,
  rules: RulesConfig
): ExtractedField {
  const check = findCheck(rules, 'consumer_care');
  const email =
    check && check.email_regex ? check.email_regex : '[^\\s@]+@[^\\s@]+\\.[^\\s@]+';
  const phone =
    check && check.phone_regex ? check.phone_regex : '(?:\\+91[\\s-]?)?[6-9]\\d{9}';
  return extractConsumerCare(words, meta, email, phone);
}

function runMfgDate(
  words: OCRWord[],
  meta: ImageMeta,
  rules: RulesConfig
): ExtractedField {
  const check = findCheck(rules, 'mfg_date');
  const pattern =
    check && check.date_format_regex ? check.date_format_regex : '(?i)\\bmfg\\b.*\\d';
  return extractMfgDate(words, meta, pattern);
}

function wrapSimple(
  extractor: (words: OCRWord[], meta: ImageMeta) => ExtractedField
): Extractor {
  return (words: OCRWord[], meta: ImageMeta) => extractor(words, meta);
}

export const EXTRACTORS: Record<string, Extractor> = {
  manufacturer_address: runManufacturer,
  net_quantity: runNetQuantity,
  mrp: runMrp,
  consumer_care: runConsumerCare,
  mfg_date: runMfgDate,
  common_name: wrapSimple(extractCommonName),
  country_origin: wrapSimple(extractCountryOrigin),
  best_before: wrapSimple(extractBestBefore),
  dimensions: wrapSimple(extractDimensions),
  unit_price: wrapSimple(extractUnitPrice),
  importer_address: wrapSimple(extractImporterAddress),
};

function insideViewport(word: OCRWord): boolean {
  const [x, y, width, height] = word.bbox;
  return (
    width > 0 &&
    height > 0 &&
    x >= 0 &&
    y >= 0 &&
    x + width <= 1 &&
    y + height <= 1
  );
}

export function extractAll(
  words: OCRWord[],
  imageMeta: ImageMeta,
  context: ScanContext,
  rules: RulesConfig
): Record<string, ExtractedField | null> {
  const visibleWords =
    context.mode === 'ecommerce_listing'
      ? words.filter(insideViewport)
      : words;

  // Reorder words into visual row-by-row reading order (top-to-bottom, left-to-right)
  const orderedWords = sortWordsSpatially(visibleWords);
  console.log(`[extractAll] Running ${Object.keys(EXTRACTORS).length} extractors on ${orderedWords.length} spatially ordered tokens...`);

  const result: Record<string, ExtractedField | null> = {};
  for (const [fieldName, extractor] of Object.entries(EXTRACTORS)) {
    const field = extractor(orderedWords, imageMeta, rules);
    result[fieldName] = field;
    if (field && field.value) {
      console.log(`  ✓ [extractAll] ${fieldName}: "${field.value}" (conf: ${(field.confidence * 100).toFixed(0)}%)`);
    } else {
      console.log(`  ✗ [extractAll] ${fieldName}: null`);
    }
  }
  return result;
}
