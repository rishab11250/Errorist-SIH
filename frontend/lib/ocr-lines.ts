import type { OCRLine, OCRWord } from './types';

const centerY = (word: OCRWord) => word.bbox[1] + word.bbox[3] / 2;

function upperMedian(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

export function groupWordsIntoLines(words: OCRWord[]): OCRLine[] {
  const indexed = words
    .map((word, index) => ({ word, index }))
    .filter(({ word }) => word.bbox[2] > 0 && word.bbox[3] > 0)
    .sort(
      (left, right) =>
        centerY(left.word) - centerY(right.word) ||
        left.word.bbox[0] - right.word.bbox[0] ||
        left.index - right.index
    );
  const groups: Array<Array<{ word: OCRWord; index: number }>> = [];

  for (const item of indexed) {
    const match = groups.find((group) => {
      const medianHeight = upperMedian(group.map(({ word }) => word.bbox[3]));
      const meanY = group.reduce((sum, value) => sum + centerY(value.word), 0) / group.length;
      return (
        Math.abs(centerY(item.word) - meanY) <= Math.max(medianHeight, item.word.bbox[3]) * 0.6
      );
    });
    if (match) {
      match.push(item);
    } else {
      groups.push([item]);
    }
  }

  return groups.map((group) => {
    group.sort((left, right) => left.word.bbox[0] - right.word.bbox[0] || left.index - right.index);
    const x0 = Math.min(...group.map(({ word }) => word.bbox[0]));
    const y0 = Math.min(...group.map(({ word }) => word.bbox[1]));
    const x1 = Math.max(...group.map(({ word }) => word.bbox[0] + word.bbox[2]));
    const y1 = Math.max(...group.map(({ word }) => word.bbox[1] + word.bbox[3]));

    return {
      word_indexes: group.map(({ index }) => index),
      bbox: [x0, y0, x1 - x0, y1 - y0],
      median_character_height: upperMedian(group.map(({ word }) => word.bbox[3])),
    };
  });
}
