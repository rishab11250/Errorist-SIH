import type { BoundingBox, OCRWord } from './rules/domain';

export interface SpatialRow {
  centerY: number;
  height: number;
  words: OCRWord[];
  text: string;
  bbox: BoundingBox;
}

export interface ColumnLayout {
  isMultiColumn: boolean;
  columnCount: number;
  columnBoundaries: Array<{ xMin: number; xMax: number }>;
  rows: SpatialRow[];
}

/**
 * Calculates vertical center of a bounding box.
 */
function getCenterY(word: OCRWord): number {
  return word.bbox[1] + word.bbox[3] / 2;
}

/**
 * Merges bounding boxes of a list of OCR words.
 */
function mergeBboxes(words: OCRWord[]): BoundingBox {
  if (words.length === 0) return [0, 0, 0, 0];
  const left = Math.min(...words.map((w) => w.bbox[0]));
  const top = Math.min(...words.map((w) => w.bbox[1]));
  const right = Math.max(...words.map((w) => w.bbox[0] + w.bbox[2]));
  const bottom = Math.max(...words.map((w) => w.bbox[1] + w.bbox[3]));
  return [left, top, Math.max(0, right - left), Math.max(0, bottom - top)];
}

/**
 * Groups OCR words into visual horizontal rows.
 * Overcomes Tesseract's block-by-block column order by clustering tokens
 * that lie within the same horizontal band.
 */
export function groupWordsIntoSpatialRows(
  words: OCRWord[],
  yToleranceMultiplier = 0.65
): SpatialRow[] {
  if (!words || words.length === 0) return [];

  const validWords = words.filter(
    (w) => w.bbox && w.bbox[2] > 0 && w.bbox[3] > 0 && w.text.trim()
  );
  if (validWords.length === 0) return [];

  // Sort by Y-center primarily, then X
  const sorted = validWords.slice().sort((a, b) => {
    const cyA = getCenterY(a);
    const cyB = getCenterY(b);
    if (Math.abs(cyA - cyB) > 0.001) {
      return cyA - cyB;
    }
    return a.bbox[0] - b.bbox[0];
  });

  const rowBuckets: Array<{
    centerY: number;
    height: number;
    words: OCRWord[];
  }> = [];

  for (const word of sorted) {
    const cy = getCenterY(word);
    const h = word.bbox[3];

    // Find existing row bucket where vertical overlap is significant
    let bestBucket: (typeof rowBuckets)[0] | null = null;
    let minDelta = Infinity;

    for (const bucket of rowBuckets) {
      const allowedDelta = Math.max(bucket.height, h) * yToleranceMultiplier;
      const delta = Math.abs(cy - bucket.centerY);
      if (delta <= allowedDelta && delta < minDelta) {
        minDelta = delta;
        bestBucket = bucket;
      }
    }

    if (bestBucket) {
      bestBucket.words.push(word);
      // Update running averages
      bestBucket.centerY =
        bestBucket.words.reduce((sum, w) => sum + getCenterY(w), 0) /
        bestBucket.words.length;
      bestBucket.height = Math.max(...bestBucket.words.map((w) => w.bbox[3]));
    } else {
      rowBuckets.push({
        centerY: cy,
        height: h,
        words: [word],
      });
    }
  }

  // Sort rows top-to-bottom
  rowBuckets.sort((a, b) => a.centerY - b.centerY);

  // Within each row, sort words left-to-right
  const spatialRows: SpatialRow[] = rowBuckets.map((bucket) => {
    bucket.words.sort((a, b) => a.bbox[0] - b.bbox[0]);
    return {
      centerY: bucket.centerY,
      height: bucket.height,
      words: bucket.words,
      text: bucket.words.map((w) => w.text).join(' '),
      bbox: mergeBboxes(bucket.words),
    };
  });

  return spatialRows;
}

/**
 * Reorders OCR words into natural row-by-row reading order (top-to-bottom, left-to-right).
 * In 2-column packaging layouts (Left Column = Label, Right Column = Value),
 * this places labels and their corresponding values adjacent in the array.
 */
export function sortWordsSpatially(words: OCRWord[]): OCRWord[] {
  const rows = groupWordsIntoSpatialRows(words);
  return rows.flatMap((row) => row.words);
}

/**
 * Detects whether the token layout forms two or more distinct vertical columns.
 */
export function analyzeColumnLayout(words: OCRWord[]): ColumnLayout {
  const rows = groupWordsIntoSpatialRows(words);
  if (words.length < 6 || rows.length < 2) {
    return {
      isMultiColumn: false,
      columnCount: 1,
      columnBoundaries: [{ xMin: 0, xMax: 1 }],
      rows,
    };
  }

  // Check how many rows have a significant horizontal gap between adjacent words
  let multiColumnRowCount = 0;
  const col1Rights: number[] = [];
  const col2Lefts: number[] = [];

  for (const row of rows) {
    if (row.words.length >= 2) {
      for (let i = 0; i < row.words.length - 1; i++) {
        const leftWord = row.words[i];
        const rightWord = row.words[i + 1];
        const gap = rightWord.bbox[0] - (leftWord.bbox[0] + leftWord.bbox[2]);
        // A gap greater than 10% of image width between words on same row indicates column separation
        if (gap > 0.08) {
          multiColumnRowCount++;
          col1Rights.push(leftWord.bbox[0] + leftWord.bbox[2]);
          col2Lefts.push(rightWord.bbox[0]);
          break;
        }
      }
    }
  }

  const isMultiColumn = multiColumnRowCount >= 2;
  const columnBoundaries = isMultiColumn
    ? [
        {
          xMin: 0,
          xMax:
            col1Rights.length > 0
              ? Math.max(...col1Rights)
              : 0.5,
        },
        {
          xMin:
            col2Lefts.length > 0
              ? Math.min(...col2Lefts)
              : 0.5,
          xMax: 1,
        },
      ]
    : [{ xMin: 0, xMax: 1 }];

  return {
    isMultiColumn,
    columnCount: isMultiColumn ? 2 : 1,
    columnBoundaries,
    rows,
  };
}

/**
 * Finds words in the same horizontal row located to the right of a given anchor word.
 * Useful for table-style declarations: Label on Left -> Value on Right.
 */
export function findWordsToRightInRow(
  anchorWord: OCRWord,
  allWords: OCRWord[],
  maxVerticalTolMultiplier = 1.2
): OCRWord[] {
  const anchorCy = getCenterY(anchorWord);
  const anchorH = anchorWord.bbox[3];
  const anchorRight = anchorWord.bbox[0] + anchorWord.bbox[2];
  const allowedDeltaY = anchorH * maxVerticalTolMultiplier;

  return allWords
    .filter((w) => {
      if (w === anchorWord) return false;
      const cy = getCenterY(w);
      const isSameRow = Math.abs(cy - anchorCy) <= allowedDeltaY;
      const isToRight = w.bbox[0] >= anchorRight - 0.01;
      return isSameRow && isToRight;
    })
    .sort((a, b) => a.bbox[0] - b.bbox[0]);
}
