import { describe, expect, it } from 'vitest';
import type { ExtractedField, ImageMeta, OCRWord, RulesConfig } from '../lib/rules/domain';
import { isSmallPackExempt, runEngine } from '../lib/rules/engine';
import { extractMrp } from '../lib/rules/extractors/mrp';
import rulesJson from '../lib/rules/rules.json';

const rules = rulesJson as unknown as RulesConfig;

describe('Edge Cases: Small-Pack USP Exemption & Dual MRP Detection', () => {
  describe('isSmallPackExempt', () => {
    it('exempts packages with mass <= 10g', () => {
      const [exempt1, reason1] = isSmallPackExempt('5 g');
      expect(exempt1).toBe(true);
      expect(reason1).toContain('5g <= 10g');

      const [exempt2] = isSmallPackExempt('10 g');
      expect(exempt2).toBe(true);

      const [exempt3] = isSmallPackExempt('10.00 gm');
      expect(exempt3).toBe(true);
    });

    it('rejects mass > 10g from exemption', () => {
      const [exempt1] = isSmallPackExempt('15 g');
      expect(exempt1).toBe(false);

      const [exempt2] = isSmallPackExempt('500 g');
      expect(exempt2).toBe(false);
    });

    it('exempts packages with volume <= 10ml', () => {
      const [exempt1, reason1] = isSmallPackExempt('8 ml');
      expect(exempt1).toBe(true);
      expect(reason1).toContain('8ml <= 10ml');

      const [exempt2] = isSmallPackExempt('10 mL');
      expect(exempt2).toBe(true);
    });

    it('rejects volume > 10ml from exemption', () => {
      const [exempt1] = isSmallPackExempt('15 ml');
      expect(exempt1).toBe(false);

      const [exempt2] = isSmallPackExempt('500 ml');
      expect(exempt2).toBe(false);
    });

    it('exempts packages sold by count where count == 1', () => {
      const [exempt1, reason1] = isSmallPackExempt('1 N');
      expect(exempt1).toBe(true);
      expect(reason1).toContain('single unit/piece');

      const [exempt2] = isSmallPackExempt('1 piece');
      expect(exempt2).toBe(true);

      const [exempt3] = isSmallPackExempt('1 U');
      expect(exempt3).toBe(true);
    });

    it('rejects packages where count > 1', () => {
      const [exempt1] = isSmallPackExempt('2 N');
      expect(exempt1).toBe(false);

      const [exempt2] = isSmallPackExempt('5 units');
      expect(exempt2).toBe(false);
    });

    it('handles empty and invalid values', () => {
      expect(isSmallPackExempt(null)[0]).toBe(false);
      expect(isSmallPackExempt('')[0]).toBe(false);
      expect(isSmallPackExempt(undefined)[0]).toBe(false);
    });
  });

  describe('USP Exemption in Engine', () => {
    it('returns na for small packs without declared USP', () => {
      const extracted: Record<string, ExtractedField | null> = {
        mrp: {
          name: 'mrp',
          value: 'MRP Rs 10 (Inclusive of all taxes)',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
        net_quantity: {
          name: 'net_quantity',
          value: '5 g',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
        manufacturer_address: {
          name: 'manufacturer_address',
          value: 'ACME Plot 12 Mumbai 400001',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
        consumer_care: {
          name: 'consumer_care',
          value: 'ACME care@acme.com +91 9876543210',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
        mfg_date: {
          name: 'mfg_date',
          value: 'Mfg: 03/2026',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
      };

      const verdicts = runEngine(extracted, rules);
      const uspVerdict = verdicts.find((v) => v.rule_id === 'r6_11_unit_sale_price');
      expect(uspVerdict).toBeDefined();
      expect(uspVerdict?.status).toBe('na');
      expect(uspVerdict?.reasoning).toContain('Rule 6(11) Second Proviso');
    });

    it('returns manual_review for large packs (500g) without declared USP', () => {
      const extracted: Record<string, ExtractedField | null> = {
        mrp: {
          name: 'mrp',
          value: 'MRP Rs 100 (Inclusive of all taxes)',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
        net_quantity: {
          name: 'net_quantity',
          value: '500 g',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
        manufacturer_address: {
          name: 'manufacturer_address',
          value: 'ACME Plot 12 Mumbai 400001',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
        consumer_care: {
          name: 'consumer_care',
          value: 'ACME care@acme.com +91 9876543210',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
        mfg_date: {
          name: 'mfg_date',
          value: 'Mfg: 03/2026',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
      };

      const verdicts = runEngine(extracted, rules);
      const uspVerdict = verdicts.find((v) => v.rule_id === 'r6_11_unit_sale_price');
      expect(uspVerdict).toBeDefined();
      expect(uspVerdict?.status).toBe('manual_review');
    });
  });

  describe('Dual MRP Detection', () => {
    it('detects conflicting prices in extractMrp', () => {
      const meta: ImageMeta = { width: 1000, height: 1000 };
      const phrase = '(?i)\\b(?:incl\\.?|inclusive)\\s*(?:of\\s+)?(?:all)?\\s*taxes?\\b';
      const ocrWords: OCRWord[] = [
        { text: 'MRP', confidence: 0.95, bbox: [0.1, 0.1, 0.05, 0.02] },
        { text: 'Rs', confidence: 0.95, bbox: [0.16, 0.1, 0.03, 0.02] },
        { text: '100', confidence: 0.95, bbox: [0.2, 0.1, 0.05, 0.02] },
        { text: 'Inclusive', confidence: 0.95, bbox: [0.26, 0.1, 0.08, 0.02] },
        { text: 'of', confidence: 0.95, bbox: [0.35, 0.1, 0.02, 0.02] },
        { text: 'all', confidence: 0.95, bbox: [0.38, 0.1, 0.03, 0.02] },
        { text: 'taxes', confidence: 0.95, bbox: [0.42, 0.1, 0.05, 0.02] },
        // Sticker nearby with conflicting MRP 120
        { text: 'MRP', confidence: 0.92, bbox: [0.6, 0.1, 0.05, 0.02] },
        { text: 'Rs', confidence: 0.92, bbox: [0.66, 0.1, 0.03, 0.02] },
        { text: '120', confidence: 0.92, bbox: [0.7, 0.1, 0.05, 0.02] },
      ];

      const result = extractMrp(ocrWords, meta, phrase);
      expect(result.value).toBeDefined();
      expect(result.conflicting_values).toBeDefined();
      expect(result.conflicting_values?.length).toBe(2);
      expect(result.conflicting_values).toContain('100');
      expect(result.conflicting_values).toContain('120');
    });

    it('flags warning for conflicting MRPs under Rule 18(2)', () => {
      const extracted: Record<string, ExtractedField | null> = {
        mrp: {
          name: 'mrp',
          value: 'MRP Rs 100 (Inclusive of all taxes)',
          bbox: [0.1, 0.1, 0.1, 0.02],
          confidence: 0.95,
          evidence_spans: [[0.1, 0.1, 0.1, 0.02], [0.6, 0.1, 0.1, 0.02]],
          conflicting_values: ['100', '120'],
        },
        net_quantity: {
          name: 'net_quantity',
          value: '500 g',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
        manufacturer_address: {
          name: 'manufacturer_address',
          value: 'ACME Plot 12 Mumbai 400001',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
        consumer_care: {
          name: 'consumer_care',
          value: 'ACME care@acme.com +91 9876543210',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
        mfg_date: {
          name: 'mfg_date',
          value: 'Mfg: 03/2026',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
        unit_price: {
          name: 'unit_price',
          value: 'Rs 0.20/g',
          bbox: [0, 0, 10, 10],
          confidence: 0.9,
          evidence_spans: [],
        },
      };

      const verdicts = runEngine(extracted, rules);
      const mrpVerdict = verdicts.find((v) => v.rule_id === 'r6_1_e_mrp');
      expect(mrpVerdict).toBeDefined();
      expect(mrpVerdict?.status).toBe('warn');
      expect(mrpVerdict?.reasoning).toContain('Rule 18(2)');
      expect(mrpVerdict?.reasoning).toContain('conflicting MRP declarations');
    });
  });
});
