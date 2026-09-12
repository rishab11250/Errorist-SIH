import { describe, expect, it } from 'vitest';

import { normalizePackagingLexicon } from '@/lib/ocr';
import { assessPackageContent } from '@/lib/rules/package-gate';
import type { OCRWord } from '@/lib/rules/domain';

function makeWords(textList: string[]): OCRWord[] {
  return textList.map((text, i) => ({
    text,
    confidence: 0.9,
    bbox: [0.1, 0.1 * i, 0.2, 0.05],
  }));
}

describe('Package Anchor Gate (detecting packages vs non-packages)', () => {
  it('accepts package evidence containing pricing anchors', () => {
    const words = makeWords(['Product', 'Brand', 'MRP', '₹99', 'incl.', 'of', 'all', 'taxes']);
    const result = assessPackageContent(words);
    expect(result.isPackage).toBe(true);
    expect(result.anchorsFound).toContain('pricing');
  });

  it('accepts package evidence containing net quantity anchors', () => {
    const words = makeWords(['Biscuits', 'Net', 'Weight:', '200g']);
    const result = assessPackageContent(words);
    expect(result.isPackage).toBe(true);
    expect(result.anchorsFound).toContain('quantity');
  });

  it('accepts package evidence containing manufacturer and pin code', () => {
    const words = makeWords(['Manufactured', 'by', 'Britannia', 'Industries', 'Mumbai', '400001']);
    const result = assessPackageContent(words);
    expect(result.isPackage).toBe(true);
    expect(result.anchorsFound).toContain('manufacturer');
  });

  it('accepts package evidence containing FSSAI and regulatory markers', () => {
    const words = makeWords(['FSSAI', 'Lic.', 'No.', '10012022000123']);
    const result = assessPackageContent(words);
    expect(result.isPackage).toBe(true);
    expect(result.anchorsFound).toContain('consumer_care_regulatory');
  });

  it('rejects arbitrary non-packaging text (novels, newspapers, keyboards)', () => {
    const words = makeWords(['Chapter', 'one', 'The', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog']);
    const result = assessPackageContent(words);
    expect(result.isPackage).toBe(false);
    expect(result.anchorsFound).toHaveLength(0);
    expect(result.reasons[0]).toContain('No statutory packaging anchors');
  });

  it('rejects empty text', () => {
    const result = assessPackageContent([]);
    expect(result.isPackage).toBe(false);
  });
});

describe('Packaging Lexicon Normalizer (boosting OCR accuracy)', () => {
  it('corrects currency question mark confusions into rupee symbol', () => {
    expect(normalizePackagingLexicon('?99')).toBe('₹99');
    expect(normalizePackagingLexicon('F120')).toBe('₹120');
  });

  it('corrects Net Qty character confusions', () => {
    expect(normalizePackagingLexicon('Net Oty')).toBe('Net Qty');
    expect(normalizePackagingLexicon('Net Qlv')).toBe('Net Qty');
    expect(normalizePackagingLexicon('Net Otv')).toBe('Net Qty');
  });

  it('corrects metric unit misreadings (q -> g)', () => {
    expect(normalizePackagingLexicon('500q')).toBe('500g');
    expect(normalizePackagingLexicon('199')).toBe('199');
    expect(normalizePackagingLexicon('2029')).toBe('2029');
    expect(normalizePackagingLexicon('1kg')).toBe('1kg');
    expect(normalizePackagingLexicon('250ml')).toBe('250ml');
  });

  it('corrects FSSAI and license typos', () => {
    expect(normalizePackagingLexicon('ESsat')).toBe('FSSAI');
    expect(normalizePackagingLexicon('FSSAL')).toBe('FSSAI');
    expect(normalizePackagingLexicon('Lie. No.')).toBe('Lic. No.');
  });

  it('corrects Customer Care typos', () => {
    expect(normalizePackagingLexicon('Custormer Care')).toBe('Customer Care');
  });
});
