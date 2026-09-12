import type { BoundingBox, ExtractedField, OCRWord } from '../domain';

export function wordsToText(words: OCRWord[]): string {
  return words.map((w) => w.text).join(' ');
}

export function findWordWithText(
  words: OCRWord[],
  pattern: RegExp | string
): OCRWord[] {
  const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
  return words.filter((w) => regex.test(w.text));
}

export function avgConfidence(words: OCRWord[]): number {
  if (words.length === 0) return 0.0;
  const sum = words.reduce((acc, w) => acc + w.confidence, 0);
  return sum / words.length;
}

export function mergeBboxes(words: OCRWord[]): BoundingBox | null {
  if (words.length === 0) return null;
  const left = Math.min(...words.map((w) => w.bbox[0]));
  const top = Math.min(...words.map((w) => w.bbox[1]));
  const right = Math.max(...words.map((w) => w.bbox[0] + w.bbox[2]));
  const bottom = Math.max(...words.map((w) => w.bbox[1] + w.bbox[3]));
  return [left, top, right - left, bottom - top];
}

/**
 * Group normalized OCR words into stable visual lines.
 * Mirrors Python backend `group_words_into_lines` in extractors/base.py exactly.
 */
export function groupWordsIntoLines(words: OCRWord[]): OCRWord[][] {
  const ordered = words
    .filter((w) => w.bbox[2] > 0 && w.bbox[3] > 0)
    .slice()
    .sort((a, b) => {
      const centerY_A = a.bbox[1] + a.bbox[3] / 2;
      const centerY_B = b.bbox[1] + b.bbox[3] / 2;
      if (centerY_A !== centerY_B) {
        return centerY_A - centerY_B;
      }
      return a.bbox[0] - b.bbox[0];
    });

  const lines: OCRWord[][] = [];
  for (const word of ordered) {
    const centerY = word.bbox[1] + word.bbox[3] / 2;
    let matchingLine: OCRWord[] | undefined;

    for (const line of lines) {
      const lineMeanCenterY =
        line.reduce((sum, item) => sum + (item.bbox[1] + item.bbox[3] / 2), 0) /
        line.length;
      const maxLineH = Math.max(...line.map((item) => item.bbox[3]));
      const threshold = Math.max(word.bbox[3], maxLineH) * 0.6;
      if (Math.abs(centerY - lineMeanCenterY) <= threshold) {
        matchingLine = line;
        break;
      }
    }

    if (!matchingLine) {
      lines.push([word]);
    } else {
      matchingLine.push(word);
    }
  }

  for (const line of lines) {
    line.sort((a, b) => a.bbox[0] - b.bbox[0]);
  }
  return lines;
}

export function emptyField(name: string): ExtractedField {
  return {
    name,
    value: null,
    bbox: null,
    confidence: 0.0,
    evidence_spans: [],
  };
}


/**
 * Clean inline python flag prefix `(?i)` if present.
 */
export function compileRegex(pattern: string, defaultFlags = ''): RegExp {
  let pat = pattern;
  let flags = defaultFlags;
  if (pat.startsWith('(?i)')) {
    pat = pat.slice(4);
    if (!flags.includes('i')) flags += 'i';
  }
  return new RegExp(pat, flags);
}

/**
 * Match a label in one line, a bounded window of following lines, or across adjacent columns in a row.
 * Handles both standard stacked layouts and multi-column tables (Label in Col 1, Value in Col 2).
 */
export function extractLabeledField(
  words: OCRWord[],
  options: {
    name: string;
    pattern: RegExp | string;
    maxFollowingLines?: number;
  }
): ExtractedField {
  const { name, pattern, maxFollowingLines = 2 } = options;
  const regex = typeof pattern === 'string' ? compileRegex(pattern, 'i') : pattern;

  // Pass 1: Standard line window search
  const lines = groupWordsIntoLines(words);
  for (let start = 0; start < lines.length; start++) {
    for (let following = 0; following <= maxFollowingLines; following++) {
      if (start + following + 1 > lines.length) break;
      const selectedLines = lines.slice(start, start + following + 1);
      const selectedWords: OCRWord[] = [];
      for (const l of selectedLines) {
        for (const w of l) {
          selectedWords.push(w);
        }
      }
      const text = wordsToText(selectedWords);
      const match = regex.exec(text);
      if (!match) continue;
      const rawCaptured = match[1] ?? match[0];
      const value = rawCaptured.trim().replace(/^[\s:-]+|[\s:-]+$/g, '');
      if (!value) continue;
      const merged = mergeBboxes(selectedWords);
      console.log(`[Extractor:${name}] Matched via line window: "${value}" (conf: ${avgConfidence(selectedWords).toFixed(2)})`);
      return {
        name,
        value,
        bbox: merged,
        confidence: avgConfidence(selectedWords),
        evidence_spans: selectedWords.map((w) => w.bbox),
      };
    }
  }

  // Pass 2: Spatial row search (handles multi-column layouts where Tesseract ordered by column blocks)
  // Cluster words by horizontal center Y
  const sorted = words.filter((w) => w.bbox && w.bbox[2] > 0 && w.bbox[3] > 0);
  const rowBuckets: Array<{ cy: number; h: number; words: OCRWord[] }> = [];

  for (const word of sorted) {
    const cy = word.bbox[1] + word.bbox[3] / 2;
    const h = word.bbox[3];
    let matchedBucket = rowBuckets.find((b) => Math.abs(cy - b.cy) <= Math.max(b.h, h) * 0.7);
    if (matchedBucket) {
      matchedBucket.words.push(word);
      matchedBucket.cy = matchedBucket.words.reduce((sum, w) => sum + (w.bbox[1] + w.bbox[3] / 2), 0) / matchedBucket.words.length;
      matchedBucket.h = Math.max(...matchedBucket.words.map((w) => w.bbox[3]));
    } else {
      rowBuckets.push({ cy, h, words: [word] });
    }
  }

  rowBuckets.sort((a, b) => a.cy - b.cy);
  for (const bucket of rowBuckets) {
    bucket.words.sort((a, b) => a.bbox[0] - b.bbox[0]);
    const rowText = wordsToText(bucket.words);
    const match = regex.exec(rowText);
    if (match) {
      const rawCaptured = match[1] ?? match[0];
      const value = rawCaptured.trim().replace(/^[\s:-]+|[\s:-]+$/g, '');
      if (value) {
        const merged = mergeBboxes(bucket.words);
        console.log(`[Extractor:${name}] Matched via spatial row: "${value}" in row "${rowText}"`);
        return {
          name,
          value,
          bbox: merged,
          confidence: avgConfidence(bucket.words),
          evidence_spans: bucket.words.map((w) => w.bbox),
        };
      }
    }
  }

  return emptyField(name);
}
