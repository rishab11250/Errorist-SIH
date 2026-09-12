import { describe, expect, it } from 'vitest';
import { shouldCheckOcrOrientation } from '@/lib/ocr';

describe('OCR orientation recovery budget', () => {
  it('avoids two extra OCR passes for a short readable camera panel', () => {
    expect(shouldCheckOcrOrientation([{ text: 'MRP ₹199', confidence: 0.96, bbox: [0, 0, 1, 1] }], 1)).toBe(false);
  });
  it('retains orientation recovery for empty or low-confidence recognition', () => {
    expect(shouldCheckOcrOrientation([], 0)).toBe(true);
    expect(shouldCheckOcrOrientation([{ text: 'noise', confidence: 0.2, bbox: [0, 0, 1, 1] }], 0)).toBe(true);
  });
});
