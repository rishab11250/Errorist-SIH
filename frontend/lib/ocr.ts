import { createWorker, type Worker } from 'tesseract.js';

import { normaliseBbox } from './bbox';
import { groupWordsIntoLines } from './ocr-lines';
import type { OCRLine, OCRWord } from './types';

let worker: Worker | null = null;
let _progressListener: ((progress: number) => void) | undefined;
export const OCR_ASSET_PATHS = {
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract/core',
  langPath: '/tesseract/lang',
} as const;

let _workerBusy = false;

async function getWorker(onProgress?: (progress: number) => void): Promise<Worker> {
  if (_workerBusy) {
    throw new Error('An OCR operation is already in progress. Please wait.');
  }
  _progressListener = onProgress;
  _workerBusy = true;
  if (worker) return worker;
  worker = await createWorker('eng', undefined, {
    ...OCR_ASSET_PATHS,
    logger: (message) => _progressListener?.(message.progress),
  });
  return worker;
}

function releaseWorker() {
  _workerBusy = false;
  _progressListener = undefined;
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

/**
 * Adaptively stretch contrast on canvas image data if dynamic range is compressed.
 */
function applyAdaptiveContrast(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): boolean {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const total = width * height;
  if (total < 10) return false;

  const hist = new Uint32Array(256);
  const step = Math.max(1, Math.floor(total / 10000));
  let sampleCount = 0;
  for (let i = 0; i < data.length; i += step * 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    hist[lum]++;
    sampleCount++;
  }

  const p2Count = sampleCount * 0.02;
  const p98Count = sampleCount * 0.98;
  let cum = 0;
  let pLow = 0;
  let pHigh = 255;
  for (let i = 0; i < 256; i++) {
    cum += hist[i];
    if (cum >= p2Count && pLow === 0) pLow = i;
    if (cum >= p98Count) {
      pHigh = i;
      break;
    }
  }

  const range = pHigh - pLow;
  if (range >= 180 || range <= 15) {
    return false;
  }

  const factor = 255 / range;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, (data[i] - pLow) * factor));
    data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - pLow) * factor));
    data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - pLow) * factor));
  }

  ctx.putImageData(imgData, 0, 0);
  return true;
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
  const { width, height, imageElement } = await new Promise<{
    width: number;
    height: number;
    imageElement: HTMLImageElement;
  }>((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight, imageElement: image });
    image.onerror = reject;
    image.src = imageDataUrl;
  });
  throwIfAborted(signal);

  let recognizeTarget: string = imageDataUrl;
  let offsetX = 0;
  let offsetY = 0;
  let cropWidth = width;
  let cropHeight = height;
  let scale = 1;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(imageElement, 0, 0, width, height);
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let top = 0;
    for (let y = 0; y < height; y++) {
      let hasContent = false;
      for (let x = 0; x < width; x += 8) {
        const idx = (y * width + x) * 4;
        if (data[idx] < 240 || data[idx + 1] < 240 || data[idx + 2] < 240) {
          hasContent = true;
          break;
        }
      }
      if (hasContent) {
        top = Math.max(0, y - 4);
        break;
      }
    }

    let bottom = height;
    for (let y = height - 1; y >= 0; y--) {
      let hasContent = false;
      for (let x = 0; x < width; x += 8) {
        const idx = (y * width + x) * 4;
        if (data[idx] < 240 || data[idx + 1] < 240 || data[idx + 2] < 240) {
          hasContent = true;
          break;
        }
      }
      if (hasContent) {
        bottom = Math.min(height, y + 4);
        break;
      }
    }

    const contentH = bottom - top;
    if (contentH > 20 && contentH < height * 0.85) {
      offsetY = top;
      cropHeight = contentH;
    }

    const effectiveH = cropHeight;
    if (effectiveH < 500) {
      scale = Math.min(4, Math.max(2, Math.ceil(600 / effectiveH)));
    } else if (cropWidth < 800) {
      scale = 2;
    }

    const ocrCanvas = document.createElement('canvas');
    ocrCanvas.width = cropWidth * scale;
    ocrCanvas.height = cropHeight * scale;
    const ocrCtx = ocrCanvas.getContext('2d', { willReadFrequently: true });
    if (ocrCtx) {
      ocrCtx.imageSmoothingEnabled = true;
      ocrCtx.imageSmoothingQuality = 'high';
      ocrCtx.drawImage(
        imageElement,
        offsetX,
        offsetY,
        cropWidth,
        cropHeight,
        0,
        0,
        ocrCanvas.width,
        ocrCanvas.height
      );
      applyAdaptiveContrast(ocrCtx, ocrCanvas.width, ocrCanvas.height);
      recognizeTarget = ocrCanvas.toDataURL('image/png');
    }
  }

  const activeWorker = await getWorker(onProgress);
  try {
    const { data } = await activeWorker.recognize(recognizeTarget);
    throwIfAborted(signal);
    const words = (data.words ?? []).map((word) => {
      const { x0, y0, x1, y1 } = word.bbox;
      const origX = offsetX + x0 / scale;
      const origY = offsetY + y0 / scale;
      const origW = (x1 - x0) / scale;
      const origH = (y1 - y0) / scale;
      return {
        text: word.text,
        confidence: word.confidence / 100,
        bbox: normaliseBbox([origX, origY, origW, origH], width, height),
      };
    });
    return {
      words,
      lines: groupWordsIntoLines(words),
      imageDataUrl,
      imageWidth: width,
      imageHeight: height,
    };
  } finally {
    releaseWorker();
  }
}
