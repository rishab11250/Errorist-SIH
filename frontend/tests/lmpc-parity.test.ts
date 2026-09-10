import { describe, expect, it } from 'vitest';

import type { ExtractedField, ImageMeta, OCRWord, RulesConfig, ScanContext } from '../lib/rules/domain';
import { overallStatus, runEngine, validateUnitSalePrice } from '../lib/rules/engine';
import { extractConsumerCare } from '../lib/rules/extractors/consumer-care';
import { extractManufacturerAddress } from '../lib/rules/extractors/manufacturer';
import { extractMfgDate } from '../lib/rules/extractors/mfg-date';
import { extractMrp } from '../lib/rules/extractors/mrp';
import { extractNetQuantity } from '../lib/rules/extractors/net-quantity';
import { extractAll } from '../lib/rules/extractors/registry';
import { loadDefaultRules } from '../lib/rules/loader';
import { computeConfidenceDistribution, computeTextCoverage } from '../lib/rules/quality';
import parityData from './fixtures/python_parity_cases.json';

describe('TypeScript vs Python Parity Verification', () => {
  const rules: RulesConfig = loadDefaultRules();

  describe('MRP Extractor Parity', () => {
    for (const testCase of parityData.mrp) {
      it(`matches Python output on case: ${testCase.name}`, () => {
        const words: OCRWord[] = testCase.words.map((w: any) => ({
          text: w.text,
          confidence: w.confidence,
          bbox: w.bbox as [number, number, number, number],
        }));
        const meta: ImageMeta = {
          width: testCase.meta.width,
          height: testCase.meta.height,
        };

        const result = extractMrp(words, meta, testCase.phrase);
        const expected = testCase.expected;

        expect(result.value).toBe(expected.value);
        if (expected.value !== null) {
          expect(result.confidence).toBeCloseTo(expected.confidence, 3);
          expect(result.bbox).toEqual(expected.bbox);
          expect(result.evidence_spans).toEqual(expected.evidence_spans);
        }
      });
    }
  });

  describe('Manufacturer Extractor Parity', () => {
    for (const testCase of parityData.manufacturer) {
      it(`matches Python output on case: ${testCase.name}`, () => {
        const words: OCRWord[] = testCase.words.map((w: any) => ({
          text: w.text,
          confidence: w.confidence,
          bbox: w.bbox as [number, number, number, number],
        }));
        const meta: ImageMeta = {
          width: testCase.meta.width,
          height: testCase.meta.height,
        };

        const result = extractManufacturerAddress(words, meta, testCase.pin);
        const expected = testCase.expected;

        expect(result.value).toBe(expected.value);
        if (expected.value !== null) {
          expect(result.confidence).toBeCloseTo(expected.confidence, 3);
          expect(result.bbox).toEqual(expected.bbox);
          expect(result.evidence_spans).toEqual(expected.evidence_spans);
        }
      });
    }
  });

  describe('Consumer Care Extractor Parity', () => {
    for (const testCase of parityData.consumer_care) {
      it(`matches Python output on case: ${testCase.name}`, () => {
        const words: OCRWord[] = testCase.words.map((w: any) => ({
          text: w.text,
          confidence: w.confidence,
          bbox: w.bbox as [number, number, number, number],
        }));
        const meta: ImageMeta = {
          width: testCase.meta.width,
          height: testCase.meta.height,
        };

        const result = extractConsumerCare(words, meta, testCase.email, testCase.phone);
        const expected = testCase.expected;

        expect(result.value).toBe(expected.value);
        if (expected.value !== null) {
          expect(result.confidence).toBeCloseTo(expected.confidence, 3);
          expect(result.bbox).toEqual(expected.bbox);
          expect(result.evidence_spans).toEqual(expected.evidence_spans);
        }
      });
    }
  });

  describe('Net Quantity Extractor Parity', () => {
    for (const testCase of parityData.net_quantity) {
      it(`matches Python output on case: ${testCase.name}`, () => {
        const words: OCRWord[] = testCase.words.map((w: any) => ({
          text: w.text,
          confidence: w.confidence,
          bbox: w.bbox as [number, number, number, number],
        }));
        const meta: ImageMeta = {
          width: testCase.meta.width,
          height: testCase.meta.height,
        };

        const result = extractNetQuantity(words, meta, testCase.units);
        const expected = testCase.expected;

        expect(result.value).toBe(expected.value);
        if (expected.value !== null) {
          expect(result.confidence).toBeCloseTo(expected.confidence, 3);
          expect(result.bbox).toEqual(expected.bbox);
        }
      });
    }
  });

  describe('Mfg Date Extractor Parity', () => {
    for (const testCase of parityData.mfg_date) {
      it(`matches Python output on case: ${testCase.name}`, () => {
        const words: OCRWord[] = testCase.words.map((w: any) => ({
          text: w.text,
          confidence: w.confidence,
          bbox: w.bbox as [number, number, number, number],
        }));
        const meta: ImageMeta = {
          width: testCase.meta.width,
          height: testCase.meta.height,
        };

        const result = extractMfgDate(words, meta, testCase.pattern);
        const expected = testCase.expected;

        expect(result.value).toBe(expected.value);
        if (expected.value !== null) {
          expect(result.confidence).toBeCloseTo(expected.confidence, 3);
          expect(result.bbox).toEqual(expected.bbox);
        }
      });
    }
  });

  describe('Extended Extractors Parity', () => {
    for (const testCase of parityData.extended) {
      it(`extracts field "${testCase.field}" with parity for text: "${testCase.text}"`, () => {
        const words: OCRWord[] = testCase.words.map((w: any) => ({
          text: w.text,
          confidence: w.confidence,
          bbox: w.bbox as [number, number, number, number],
        }));
        const meta: ImageMeta = {
          width: testCase.meta.width,
          height: testCase.meta.height,
        };
        const context: ScanContext = { mode: 'retail_image' };

        const allExtracted = extractAll(words, meta, context, rules);
        const fieldResult = allExtracted[testCase.field];
        const expected = testCase.expected;

        expect(fieldResult).not.toBeNull();
        expect(fieldResult?.value).toBe(expected.value);
        if (expected.value !== null && fieldResult) {
          expect(fieldResult.confidence).toBeCloseTo(expected.confidence, 3);
          expect(fieldResult.bbox).toEqual(expected.bbox);
        }
      });
    }
  });

  describe('Quality Gate & OCR Confidence Distribution Parity', () => {
    for (const testCase of parityData.quality) {
      it(`matches Python quality distribution on case: ${testCase.name}`, () => {
        const words: OCRWord[] = testCase.words.map((w: any) => ({
          text: w.text,
          confidence: w.confidence,
          bbox: w.bbox as [number, number, number, number],
        }));

        const { median, lowerQuartile } = computeConfidenceDistribution(words);
        const coverage = computeTextCoverage(words);

        expect(median).toBeCloseTo(testCase.expected_median, 1);
        expect(lowerQuartile).toBeCloseTo(testCase.expected_lower_quartile, 1);
        expect(coverage).toBeCloseTo(testCase.expected_coverage, 2);
      });
    }
  });

  describe('USP Cross-Validation Parity', () => {
    for (const testCase of parityData.unit_sale_price) {
      it(`validates USP (${testCase.mrp}, ${testCase.qty}, ${testCase.usp}) with parity`, () => {
        const [valid, note] = validateUnitSalePrice(testCase.mrp, testCase.qty, testCase.usp);
        expect(valid).toBe(testCase.expected_valid);
        expect(note !== null).toBe(testCase.has_note);
      });
    }
  });

  describe('Engine Verdict & Overall Status Parity', () => {
    for (const scenario of parityData.engine) {
      it(`matches Python verdicts and status on scenario: ${scenario.name}`, () => {
        const extracted: Record<string, ExtractedField | null> = {};
        for (const [key, val] of Object.entries(scenario.extracted)) {
          if (val) {
            extracted[key] = {
              name: (val as any).name,
              value: (val as any).value,
              bbox: (val as any).bbox,
              confidence: (val as any).confidence,
              evidence_spans: (val as any).evidence_spans,
            };
          } else {
            extracted[key] = null;
          }
        }

        const analysisInput = {
          extracted,
          quality: {
            status: scenario.quality.status as any,
            score: scenario.quality.score,
            metrics: [],
            guidance: [],
          },
        };

        const verdicts = runEngine(analysisInput, rules, scenario.context as ScanContext);
        const status = overallStatus(verdicts);

        expect(status).toBe(scenario.expected_overall_status);
        expect(verdicts.length).toBe(scenario.expected_verdicts.length);

        const tsVerdictMap = new Map(verdicts.map((v) => [v.rule_id, v]));
        for (const expV of scenario.expected_verdicts) {
          const actual = tsVerdictMap.get(expV.rule_id);
          expect(actual, `Missing verdict for ${expV.rule_id}`).toBeDefined();
          if (actual) {
            expect(actual.status, `Status mismatch for ${expV.rule_id}`).toBe(expV.status);
            expect(actual.severity).toBe(expV.severity);
            expect(actual.citation).toBe(expV.citation);
            expect(actual.confidence).toBeCloseTo(expV.confidence, 3);
          }
        }
      });
    }
  });
});
