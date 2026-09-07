import { describe, expect, it } from 'vitest';

import { groupWordsIntoLines } from '@/lib/ocr-lines';
import type { OCRWord } from '@/lib/types';

describe('groupWordsIntoLines', () => {
  it('groups horizontally aligned words and sorts them left-to-right', () => {
    const lines = groupWordsIntoLines([
      { text: '99', confidence: 0.9, bbox: [0.3, 0.1, 0.05, 0.04] },
      { text: 'MRP', confidence: 0.9, bbox: [0.1, 0.11, 0.1, 0.04] },
      { text: '500g', confidence: 0.9, bbox: [0.1, 0.4, 0.12, 0.05] },
    ]);
    expect(lines.map((line) => line.word_indexes)).toEqual([[1, 0], [2]]);
    expect(lines[0].median_character_height).toBeCloseTo(0.04);
    lines[0].bbox.forEach((value, index) => {
      expect(value).toBeCloseTo([0.1, 0.1, 0.25, 0.05][index]);
    });
  });

  it('drops zero-area boxes without mutating words', () => {
    const words: OCRWord[] = [
      { text: 'x', confidence: 1, bbox: [0, 0, 0, 0.1] },
      { text: 'valid', confidence: 1, bbox: [0.1, 0.2, 0.2, 0.1] },
    ];
    const snapshot = structuredClone(words);
    expect(groupWordsIntoLines(words)).toEqual([
      {
        word_indexes: [1],
        bbox: [0.1, 0.2, 0.20000000000000004, 0.10000000000000003],
        median_character_height: 0.1,
      },
    ]);
    expect(words).toEqual(snapshot);
  });

  it('returns deterministic lines regardless of input vertical ordering', () => {
    const words: OCRWord[] = [
      { text: 'second', confidence: 0.9, bbox: [0.2, 0.4, 0.1, 0.04] },
      { text: 'first', confidence: 0.9, bbox: [0.1, 0.1, 0.1, 0.04] },
    ];
    expect(groupWordsIntoLines(words).map((line) => line.word_indexes)).toEqual([[1], [0]]);
  });
});
