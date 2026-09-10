import type { ExtractedField, ImageMeta, OCRWord } from '../domain';
import { avgConfidence, mergeBboxes } from './base';

export const ROLE_KEYWORDS =
  /\b(?:mfg|mfd|pkd|mktd|mfg\.?|mfd\.?|pkd\.?|mktd\.?|(?:mfg|mfd)\.?\s*(?:&|and)\s*pkd\.?\s*(?:by)?:?|manufactured\s+by:?|packed\s+by:?|pkd\.?\s*by:?|mktd\.?\s*by:?|imported\s+by:?|marketed\s+by:?|manufactured\s+for:?|imported\s+and\s+packed\s+by:?|manufacturer:?|packer:?)\b/i;

export const ADDRESS_HINT =
  /\b(?:pvt|ltd|limited|private|company|co\.|india|industries|foods|plot|road|street|sector|phase|marg|nagar|colony|estate|complex|tel|phone|email|pin|taluk|dist|district|village|khasra|survey|post|state|regd|office)\b/i;

function groupIntoLines(words: OCRWord[], yTolerance = 10.0): OCRWord[][] {
  if (words.length === 0) return [];
  const sortedW = words
    .slice()
    .sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
  const lines: OCRWord[][] = [[sortedW[0]]];
  for (let i = 1; i < sortedW.length; i++) {
    const w = sortedW[i];
    const prevLine = lines[lines.length - 1];
    const lastInPrevLine = prevLine[prevLine.length - 1];
    if (Math.abs(w.bbox[1] - lastInPrevLine.bbox[1]) <= yTolerance) {
      prevLine.push(w);
    } else {
      lines.push([w]);
    }
  }
  return lines;
}

function lineText(line: OCRWord[]): string {
  return line.map((w) => w.text).join(' ');
}

function lineIsAddress(line: OCRWord[], pinRegex: RegExp): boolean {
  const text = lineText(line);
  return pinRegex.test(text) || ADDRESS_HINT.test(text);
}

export function extractManufacturerAddress(
  ocrWords: OCRWord[],
  imageMeta: ImageMeta,
  pinRegexStr: string
): ExtractedField {
  const pinRe = new RegExp(pinRegexStr);
  const isNormalized =
    ocrWords.length > 0 &&
    ocrWords.every(
      (w) =>
        w.bbox[0] <= 1.0 &&
        w.bbox[1] <= 1.0 &&
        w.bbox[2] <= 1.0 &&
        w.bbox[3] <= 1.0
    );

  let yTol: number;
  if (isNormalized) {
    yTol =
      imageMeta.height > 0
        ? Math.max(10.0, Math.floor(imageMeta.height / 100)) / imageMeta.height
        : 0.02;
  } else {
    yTol = Math.max(10, Math.floor(imageMeta.height / 100));
  }

  const lines = groupIntoLines(ocrWords, yTol);
  let startIdx: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (ROLE_KEYWORDS.test(lineText(lines[i]))) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === null) {
    return {
      name: 'manufacturer_address',
      value: null,
      bbox: null,
      confidence: 0.0,
      evidence_spans: [],
    };
  }

  const blockLines: OCRWord[][] = [lines[startIdx]];
  const hasPin = blockLines[0].some((w) => pinRe.test(w.text));

  if (!hasPin) {
    const end = Math.min(startIdx + 7, lines.length);
    for (let j = startIdx + 1; j < end; j++) {
      if (lineIsAddress(lines[j], pinRe)) {
        blockLines.push(lines[j]);
        if (lines[j].some((w) => pinRe.test(w.text))) {
          break;
        }
      } else if (blockLines.length >= 2) {
        break;
      }
    }
  }

  const blockWords: OCRWord[] = [];
  for (const line of blockLines) {
    for (const w of line) {
      blockWords.push(w);
    }
  }

  const pinWord = blockWords.find((w) => pinRe.test(w.text));
  const pinBbox = pinWord ? pinWord.bbox : null;

  return {
    name: 'manufacturer_address',
    value: pinBbox ? blockLines.map(lineText).join(' ') : null,
    bbox: mergeBboxes(blockWords),
    confidence: pinBbox ? avgConfidence(blockWords) : 0.0,
    evidence_spans: pinBbox ? [pinBbox] : [],
  };
}
