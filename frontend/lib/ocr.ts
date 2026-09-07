import { createWorker, type Worker } from 'tesseract.js';

import { normaliseBbox } from './bbox';
import type { OCRWord } from './types';

let worker: Worker | null = null;

async function getWorker(onProgress?: (progress: number) => void): Promise<Worker> {
  if (worker) return worker;
  worker = await createWorker('eng', undefined, {
    logger: (message) => onProgress?.(message.progress),
  });
  return worker;
}

export interface OCRRunResult { words: OCRWord[]; imageDataUrl: string; imageWidth: number; imageHeight: number; }

export async function runOCR(file: File, onProgress?: (progress: number) => void): Promise<OCRRunResult> {
  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = imageDataUrl;
  });
  const activeWorker = await getWorker(onProgress);
  const { data } = await activeWorker.recognize(imageDataUrl);
  const words = (data.words ?? []).map((word) => {
    const { x0, y0, x1, y1 } = word.bbox;
    return {
      text: word.text,
      confidence: word.confidence / 100,
      bbox: normaliseBbox([x0, y0, x1 - x0, y1 - y0], dimensions.width, dimensions.height),
    };
  });
  return { words, imageDataUrl, imageWidth: dimensions.width, imageHeight: dimensions.height };
}
