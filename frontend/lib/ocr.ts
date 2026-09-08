import { createWorker, type Worker } from 'tesseract.js';

import { normaliseBbox } from './bbox';
import { groupWordsIntoLines } from './ocr-lines';
import type { OCRLine, OCRWord } from './types';

let worker: Worker | null = null;
let progressListener: ((progress: number) => void) | undefined;

async function getWorker(onProgress?: (progress: number) => void): Promise<Worker> {
  progressListener = onProgress;
  if (worker) return worker;
  worker = await createWorker('eng', undefined, {
    logger: (message) => progressListener?.(message.progress),
  });
  return worker;
}

export interface OCRRunResult {
  words: OCRWord[];
  lines: OCRLine[];
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('The inspection was canceled.', 'AbortError');
}

export async function runOCR(
  file: File,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<OCRRunResult> {
  throwIfAborted(signal);
  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  throwIfAborted(signal);
  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = imageDataUrl;
  });
  throwIfAborted(signal);
  const activeWorker = await getWorker(onProgress);
  const { data } = await activeWorker.recognize(imageDataUrl);
  throwIfAborted(signal);
  const words = (data.words ?? []).map((word) => {
    const { x0, y0, x1, y1 } = word.bbox;
    return {
      text: word.text,
      confidence: word.confidence / 100,
      bbox: normaliseBbox([x0, y0, x1 - x0, y1 - y0], dimensions.width, dimensions.height),
    };
  });
  return {
    words,
    lines: groupWordsIntoLines(words),
    imageDataUrl,
    imageWidth: dimensions.width,
    imageHeight: dimensions.height,
  };
}
