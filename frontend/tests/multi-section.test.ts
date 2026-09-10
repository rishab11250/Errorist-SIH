import { describe, expect, it } from 'vitest';
import type { OCRWord, QualitySummary, RulesConfig } from '../lib/rules/domain';
import {
  computeAverageQuality,
  extractProductAnchors,
  fuseMultiSectionExtractions,
  verifyProductConsistency,
  type SectionCaptureData,
} from '../lib/rules/multi-section';
import rulesJson from '../lib/rules/rules.json';

const rules = rulesJson as unknown as RulesConfig;

function word(text: string, conf = 0.95): OCRWord {
  return {
    text,
    confidence: conf,
    bbox: [0.1, 0.1, 0.1, 0.02],
  };
}

describe('Multi-Section Inspection & Product Identity Consistency', () => {
  describe('extractProductAnchors', () => {
    it('extracts brands, FSSAI, barcodes, and batch numbers', () => {
      const words = [
        word('Sunfeast'),
        word('YiPPee!'),
        word('Noodles'),
        word('Lic.'),
        word('No.'),
        word('10012031000312'),
        word('8901725005955'),
        word('Batch'),
        word('BP41766'),
      ];
      const anchors = extractProductAnchors(words);
      expect(anchors.brands).toContain('sunfeast');
      expect(anchors.brands).toContain('yippee');
      expect(anchors.fssai).toContain('10012031000312');
      expect(anchors.barcodes).toContain('8901725005955');
      expect(anchors.batches).toContain('BP41766');
    });
  });

  describe('verifyProductConsistency', () => {
    it('accepts consistent package sections from same product', () => {
      const sec1 = {
        label: 'Section 1 (Front/Brand)',
        words: [word('Sunfeast'), word('YiPPee!'), word('Noodles')],
      };
      const sec2 = {
        label: 'Section 2 (Manufacturer/FSSAI)',
        words: [word('Lic.'), word('No.'), word('10012031000312'), word('8901725005955')],
      };
      const sec3 = {
        label: 'Section 3 (MRP Flap)',
        words: [word('Net'), word('Weight:'), word('420g'), word('MRP'), word('Rs'), word('90.00'), word('B.No:'), word('BP41766')],
      };

      const result = verifyProductConsistency([sec1, sec2, sec3]);
      expect(result.isConsistent).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('rejects sections with conflicting brand names', () => {
      const sec1 = {
        label: 'Section 1 (Noodles)',
        words: [word('Sunfeast'), word('YiPPee!'), word('Noodles')],
      };
      const sec2 = {
        label: 'Section 2 (Maggi)',
        words: [word('Maggi'), word('2-Minute'), word('Noodles')],
      };

      const result = verifyProductConsistency([sec1, sec2]);
      expect(result.isConsistent).toBe(false);
      expect(result.reason).toContain('Incompatible brands detected');
    });

    it('rejects sections with conflicting FSSAI licenses', () => {
      const sec1 = {
        label: 'Section 1',
        words: [word('Lic.'), word('No.'), word('10012031000312')],
      };
      const sec2 = {
        label: 'Section 2',
        words: [word('Lic.'), word('No.'), word('10015042000123')],
      };

      const result = verifyProductConsistency([sec1, sec2]);
      expect(result.isConsistent).toBe(false);
      expect(result.reason).toContain('Conflicting FSSAI license numbers');
    });

    it('rejects sections with conflicting barcodes', () => {
      const sec1 = {
        label: 'Section 1',
        words: [word('8901725005955')],
      };
      const sec2 = {
        label: 'Section 2',
        words: [word('8901030865421')],
      };

      const result = verifyProductConsistency([sec1, sec2]);
      expect(result.isConsistent).toBe(false);
      expect(result.reason).toContain('Conflicting barcodes');
    });
  });

  describe('computeAverageQuality', () => {
    it('computes exact average score and merges metrics', () => {
      const q1: QualitySummary = {
        status: 'acceptable',
        score: 90,
        guidance: ['Good lighting'],
        metrics: [{ name: 'sharpness', value: 80, unit: 'score', confidence: 0.9, method: 'laplacian' }],
      };
      const q2: QualitySummary = {
        status: 'usable_with_warnings',
        score: 70,
        guidance: ['Mild glare'],
        metrics: [{ name: 'sharpness', value: 60, unit: 'score', confidence: 0.9, method: 'laplacian' }],
      };

      const avg = computeAverageQuality([q1, q2]);
      expect(avg.score).toBe(80);
      expect(avg.status).toBe('usable_with_warnings');
      expect(avg.guidance).toContain('Good lighting');
      expect(avg.guidance).toContain('Mild glare');

      const sharpness = avg.metrics.find((m) => m.name === 'sharpness');
      expect(sharpness?.value).toBe(70);
    });
  });

  describe('fuseMultiSectionExtractions', () => {
    it('combines fields extracted across different sections', () => {
      const mockFile = new File(['mock'], 'mock.jpg', { type: 'image/jpeg' });
      const sec1: SectionCaptureData = {
        id: 'sec1',
        label: 'Section 1 (MRP)',
        file: mockFile,
        ocr: {
          words: [
            word('MRP'), word('Rs'), word('90.00'),
            word('Inclusive'), word('of'), word('all'), word('taxes'),
          ],
          lines: [],
          imageDataUrl: '',
          imageWidth: 1000,
          imageHeight: 1000,
        },
        quality: { status: 'acceptable', score: 95, guidance: [], metrics: [] },
      };

      const sec2: SectionCaptureData = {
        id: 'sec2',
        label: 'Section 2 (Net Qty & Mfg)',
        file: mockFile,
        ocr: {
          words: [
            word('Net'), word('Quantity:'), word('420'), word('g'),
            word('Manufactured'), word('by:'), word('ACME'), word('Foods'),
            word('Industrial'), word('Area'), word('Delhi'), word('110001'),
          ],
          lines: [],
          imageDataUrl: '',
          imageWidth: 1000,
          imageHeight: 1000,
        },
        quality: { status: 'acceptable', score: 90, guidance: [], metrics: [] },
      };

      const fused = fuseMultiSectionExtractions([sec1, sec2], rules, {});
      expect(fused.mergedExtracted.mrp).toBeDefined();
      expect(fused.mergedExtracted.mrp?.value).toContain('90.00');
      expect(fused.mergedExtracted.net_quantity).toBeDefined();
      expect(fused.mergedExtracted.net_quantity?.value).toContain('420');
      expect(fused.mergedExtracted.manufacturer_address).toBeDefined();
    });
  });
});
