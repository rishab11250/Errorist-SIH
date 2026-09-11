import { createWorker, type Worker } from 'tesseract.js';

import { normaliseBbox } from './bbox';
import { groupWordsIntoLines } from './ocr-lines';
import {
  applyOtsuBinarization,
  detectDocumentQuad,
  warpPerspective,
} from './perspective';
import {
  extractAll,
  loadDefaultRules,
  type ExtractedField,
  type ImageMeta,
  type RulesConfig,
  type ScanContext,
} from './rules';
import type { OCRLine, OCRWord } from './types';

let worker: Worker | null = null;
let _progressListener: ((progress: number) => void) | undefined;
export const OCR_ASSET_PATHS = {
  workerPath: '/tesseract/worker.min.js',
  corePath: '/tesseract/core',
  langPath: '/tesseract/lang',
} as const;

let _workerBusy = false;
let _workerLanguagesKey: string | null = null;

export async function terminateWorker(): Promise<void> {
  if (worker) {
    try {
      await worker.terminate();
    } catch {
      // ignore termination error
    }
    worker = null;
    _workerLanguagesKey = null;
    _workerBusy = false;
    _progressListener = undefined;
  }
}

async function getWorker(
  onProgress?: (progress: number) => void,
  languages: string | string[] = ['eng']
): Promise<Worker> {
  const langArray = Array.isArray(languages) ? languages : [languages];
  const langKey = langArray.slice().sort().join('+');

  if (_workerBusy) {
    throw new Error('An OCR operation is already in progress. Please wait.');
  }

  // If worker exists but languages changed, recreate it
  if (worker && _workerLanguagesKey !== langKey) {
    try {
      await worker.terminate();
    } catch {
      // ignore termination error
    }
    worker = null;
    _workerLanguagesKey = null;
  }

  _progressListener = onProgress;
  _workerBusy = true;
  if (worker) return worker;
  try {
    worker = await createWorker(languages, undefined, {
      ...OCR_ASSET_PATHS,
      workerBlobURL: false,
      logger: (message) => {
        if (typeof message.progress === 'number') {
          _progressListener?.(message.progress);
        }
      },
    });
    _workerLanguagesKey = langKey;
    return worker;
  } catch (err) {
    _workerBusy = false;
    worker = null;
    _workerLanguagesKey = null;
    throw err;
  }
}

function releaseWorker() {
  _workerBusy = false;
  _progressListener = undefined;
}

export interface OCRDisagreement {
  field: string;
  pass1Value: string | null;
  pass1Confidence: number;
  pass2Value: string | null;
  pass2Confidence: number;
  selectedPass: 1 | 2;
  resolvedValue: string | null;
  resolvedConfidence: number;
}

export interface OCRRunOptions {
  enablePerspectiveWarp?: boolean;
  enableDualPass?: boolean;
  languages?: string | string[];
  scanContext?: ScanContext;
  rules?: RulesConfig;
}

export interface OCRRunResult {
  words: OCRWord[];
  lines: OCRLine[];
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  perspectiveCorrected?: boolean;
  dualPassDisagreements?: OCRDisagreement[];
  extractedFields?: Record<string, ExtractedField | null>;
}

/**
 * Normalizes predictable OCR misrecognitions on Indian commodity packaging.
 * Cleans up character-level noise for statutory declarations without fabricating data.
 */
export function normalizePackagingLexicon(rawText: string): string {
  if (!rawText) return rawText;
  let text = rawText.trim();

  // Currency corrections (?99, F99, t99 -> ₹99)
  text = text.replace(/^[?ftF](\d+(?:\.\d+)?)$/, '₹$1');

  // MRP prefix noise
  text = text.replace(/^M\.?\s*R\.?\s*P\.?[:.]?$/i, 'MRP:');

  // Net Quantity abbreviations (Net Oty, Net Qlv, Net Otv -> Net Qty)
  text = text.replace(/\bNet\s*Oty\b/i, 'Net Qty');
  text = text.replace(/\bNet\s*Qlv\b/i, 'Net Qty');
  text = text.replace(/\bNet\s*Otv\b/i, 'Net Qty');
  text = text.replace(/\bNet\s*Ouantity\b/i, 'Net Quantity');

  // Metric unit confusion: 500q -> 500g, 200q -> 200g (q or 9 mistaken for g)
  text = text.replace(/^(\d+)[q9]$/, '$1g');
  text = text.replace(/^(\d+)k[q9]$/i, '$1kg');
  text = text.replace(/^(\d+)m[1I|]$/i, '$1ml');

  // FSSAI misreadings (ESsat, FSSAL, Issai)
  if (/^(?:ESsat|FSSAL|Fssal|Issai)$/i.test(text)) {
    text = 'FSSAI';
  }

  // License prefix
  if (/^Lie\.?\s*No\.?$/i.test(text)) {
    text = 'Lic. No.';
  }

  // Customer care misreadings
  text = text.replace(/\bCustormer\s*Care\b/i, 'Customer Care');
  text = text.replace(/\bCustmer\s*Care\b/i, 'Customer Care');

  return text;
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
  signal?: AbortSignal,
  options?: OCRRunOptions
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

  let recognizeTarget1: string = imageDataUrl;
  let recognizeTarget2: string | null = null;
  let perspectiveCorrected = false;
  let mapBboxToOriginal: (bbox: [number, number, number, number]) => [number, number, number, number] = (b) => b;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (ctx) {
    ctx.drawImage(imageElement, 0, 0, width, height);

    let ocrCanvas: HTMLCanvasElement | null = null;

    // 1. Document-edge detection & perspective correction
    if (options?.enablePerspectiveWarp !== false) {
      const quadInfo = detectDocumentQuad(ctx, width, height);
      if (quadInfo && quadInfo.needsWarp) {
        const warped = warpPerspective(ctx, width, height, quadInfo.quad, 1600);
        if (warped) {
          ocrCanvas = warped.canvas;
          mapBboxToOriginal = warped.mapBboxToOriginal;
          perspectiveCorrected = true;
        }
      }
    }

    // Fallback: standard vertical crop & scale if perspective warp was not applied
    if (!ocrCanvas) {
      let offsetX = 0;
      let offsetY = 0;
      let cropWidth = width;
      let cropHeight = height;
      let scale = 1;

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

      const MAX_OCR_DIMENSION = 1600;
      const maxCropDim = Math.max(cropWidth, cropHeight);
      if (maxCropDim > MAX_OCR_DIMENSION) {
        scale = MAX_OCR_DIMENSION / maxCropDim;
      } else if (cropHeight < 500) {
        scale = Math.min(4, Math.max(2, Math.ceil(600 / cropHeight)));
      } else if (cropWidth < 800) {
        scale = 2;
      }

      ocrCanvas = document.createElement('canvas');
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
      }
      mapBboxToOriginal = ([bx, by, bw, bh]) => [
        offsetX + bx / scale,
        offsetY + by / scale,
        bw / scale,
        bh / scale,
      ];
    }

    // Preprocessing Pass 1: Adaptive Contrast
    if (ocrCanvas) {
      const p1Canvas = document.createElement('canvas');
      p1Canvas.width = ocrCanvas.width;
      p1Canvas.height = ocrCanvas.height;
      const p1Ctx = p1Canvas.getContext('2d', { willReadFrequently: true });
      if (p1Ctx) {
        p1Ctx.drawImage(ocrCanvas, 0, 0);
        applyAdaptiveContrast(p1Ctx, p1Canvas.width, p1Canvas.height);
        recognizeTarget1 = p1Canvas.toDataURL('image/jpeg', 0.90);
      }

      // Preprocessing Pass 2: Otsu Binarization (if dual-pass enabled)
      const enableDualPass = options?.enableDualPass ?? true;
      if (enableDualPass) {
        const p2Canvas = document.createElement('canvas');
        p2Canvas.width = ocrCanvas.width;
        p2Canvas.height = ocrCanvas.height;
        const p2Ctx = p2Canvas.getContext('2d', { willReadFrequently: true });
        if (p2Ctx) {
          p2Ctx.drawImage(ocrCanvas, 0, 0);
          applyOtsuBinarization(p2Ctx, p2Canvas.width, p2Canvas.height);
          recognizeTarget2 = p2Canvas.toDataURL('image/png');
        }
      }
    }
  }

  const isDualPass = Boolean(recognizeTarget2);
  const languages = options?.languages ?? ['eng'];
  const activeWorker = await getWorker((p) => {
    if (isDualPass) {
      onProgress?.(p * 0.5);
    } else {
      onProgress?.(p);
    }
  }, languages);

  try {
    // --- PASS 1 RECOGNITION ---
    const res1 = await activeWorker.recognize(recognizeTarget1);
    throwIfAborted(signal);

    const parseWords = (rawWords: Array<{ bbox: { x0: number; y0: number; x1: number; y1: number }; text: string; confidence: number }>): OCRWord[] => {
      return rawWords.map((word) => {
        const { x0, y0, x1, y1 } = word.bbox;
        const origBox = mapBboxToOriginal([x0, y0, x1 - x0, y1 - y0]);
        return {
          text: normalizePackagingLexicon(word.text),
          confidence: word.confidence / 100,
          bbox: normaliseBbox(origBox, width, height),
        };
      });
    };

    const words1 = parseWords(res1.data.words ?? []);

    // --- OPTIONAL PASS 2 RECOGNITION ---
    let words2: OCRWord[] = [];
    if (isDualPass && recognizeTarget2) {
      _progressListener = (p) => onProgress?.(0.5 + p * 0.5);
      const res2 = await activeWorker.recognize(recognizeTarget2);
      throwIfAborted(signal);
      words2 = parseWords(res2.data.words ?? []);
    }

    // --- FIELD-BY-FIELD EXTRACTION & DISAGREEMENT RESOLUTION ---
    const scanContext: ScanContext = options?.scanContext ?? {
      mode: 'retail_image',
      category: 'food',
      imported: false,
    };
    const rules: RulesConfig = options?.rules ?? loadDefaultRules();
    const imageMeta: ImageMeta = { width, height, orientation: 1 };

    const fields1 = extractAll(words1, imageMeta, scanContext, rules);
    let resolvedFields = fields1;
    const disagreements: OCRDisagreement[] = [];
    let finalWords = words1;

    if (words2.length > 0) {
      const fields2 = extractAll(words2, imageMeta, scanContext, rules);
      resolvedFields = { ...fields1 };
      const allFieldKeys = Array.from(
        new Set([...Object.keys(fields1), ...Object.keys(fields2)])
      );

      let pass2Wins = 0;
      let pass1Wins = 0;

      for (const key of allFieldKeys) {
        const f1 = fields1[key] ?? null;
        const f2 = fields2[key] ?? null;
        const v1 = f1?.value?.trim() ?? null;
        const v2 = f2?.value?.trim() ?? null;
        const c1 = f1?.confidence ?? 0;
        const c2 = f2?.confidence ?? 0;

        if (v1 !== v2) {
          let chosenPass: 1 | 2 = 1;
          if (!v1 && v2) {
            chosenPass = 2;
          } else if (v1 && !v2) {
            chosenPass = 1;
          } else if (c2 > c1) {
            chosenPass = 2;
          } else {
            chosenPass = 1;
          }

          if (chosenPass === 2) {
            resolvedFields[key] = f2;
            pass2Wins++;
          } else {
            resolvedFields[key] = f1;
            pass1Wins++;
          }

          const winner = chosenPass === 2 ? f2 : f1;
          disagreements.push({
            field: key,
            pass1Value: v1,
            pass1Confidence: c1,
            pass2Value: v2,
            pass2Confidence: c2,
            selectedPass: chosenPass,
            resolvedValue: winner?.value ?? null,
            resolvedConfidence: winner?.confidence ?? 0,
          });

          console.info(
            `[DualPassOCR] Disagreement on field "${key}": Pass 1 ("${v1}", conf: ${c1.toFixed(2)}) vs Pass 2 ("${v2}", conf: ${c2.toFixed(2)}) -> Preferred Pass ${chosenPass}`
          );
        }
      }

      if (pass2Wins > pass1Wins || (words1.length === 0 && words2.length > 0)) {
        finalWords = words2;
      }
    }

    return {
      words: finalWords,
      lines: groupWordsIntoLines(finalWords),
      imageDataUrl,
      imageWidth: width,
      imageHeight: height,
      perspectiveCorrected,
      dualPassDisagreements: disagreements,
      extractedFields: resolvedFields,
    };
  } finally {
    releaseWorker();
  }
}
