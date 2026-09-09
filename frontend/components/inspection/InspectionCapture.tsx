'use client';

import { AlertTriangle, Camera, CheckCircle2, ImageUp, RotateCcw, X } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ScanProgress } from '@/components/ui/scan-progress';
import { Spotlight } from '@/components/ui/spotlight';
import { postScan } from '@/lib/api';
import { runOCR, type OCRRunResult } from '@/lib/ocr';
import type { ScanContext, ScanRequest, ScanResponse } from '@/lib/types';
import { CameraCaptureGuide } from './CameraCaptureGuide';

interface Props {
  onComplete: (result: OCRRunResult & { response: ScanResponse }) => void;
}

type CaptureStage = 'ready' | 'reading' | 'ocr' | 'analyzing' | 'saving' | 'complete' | 'error';
const MAX_IMAGE_BYTES = 10_000_000;
const progressStages = [
  { id: 'prepare', label: 'Prepare' },
  { id: 'ocr', label: 'Read text' },
  { id: 'analyze', label: 'Analyze' },
  { id: 'save', label: 'Save' },
] as const;
const modes: Array<{
  value: ScanContext['mode'];
  title: string;
  description: string;
}> = [
  {
    value: 'retail_image',
    title: 'Retail package photo',
    description: 'Take or upload a straight-on photo of the physical package.',
  },
  {
    value: 'ecommerce_listing',
    title: 'E-commerce screenshot',
    description: 'Use a saved product-page image; camera capture stays off.',
  },
];

export function buildScanRequest(ocr: OCRRunResult, scanContext: ScanContext): ScanRequest {
  const imageB64 = ocr.imageDataUrl.split(',', 2)[1];
  if (!imageB64) throw new Error('The selected image could not be prepared for analysis.');
  return {
    schema_version: 2,
    image_b64: imageB64,
    image_meta: { width: ocr.imageWidth, height: ocr.imageHeight, orientation: 1 },
    ocr_payload: ocr.words,
    ocr_lines: ocr.lines,
    scan_context: scanContext,
  };
}

function stageIndex(stage: CaptureStage) {
  return { ready: 0, reading: 0, ocr: 1, analyzing: 2, saving: 3, complete: 4, error: 0 }[stage];
}

export function InspectionCapture({ onComplete }: Props) {
  const fileInputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<CaptureStage>('ready');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ScanContext['mode']>('retail_image');
  const [category, setCategory] = useState<ScanContext['category']>('unknown');
  const [imported, setImported] = useState<boolean | null>(null);
  const [captureMethod, setCaptureMethod] = useState<'camera' | 'upload'>('camera');
  const [preScanQuality, setPreScanQuality] = useState<{
    status: 'good' | 'warning';
    notes: string[];
  } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const operationRef = useRef(0);

  const checkPreScanQuality = useCallback((img: HTMLImageElement) => {
    try {
      const canvas = document.createElement('canvas');
      const w = 320;
      const h = Math.round((img.naturalHeight / img.naturalWidth) * 320) || 240;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let sumL = 0;
      let glare = 0;
      const total = w * h;
      const gray = new Float32Array(total);
      for (let i = 0, p = 0; p < total; p++, i += 4) {
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        gray[p] = l;
        sumL += l;
        if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) glare++;
      }
      const avgBrightness = sumL / total;
      const glareFraction = glare / total;

      let lapSum = 0;
      let lapSumSq = 0;
      let count = 0;
      for (let y = 2; y < h - 2; y += 2) {
        const row = y * w;
        for (let x = 2; x < w - 2; x += 2) {
          const idx = row + x;
          const lap = gray[idx - w] + gray[idx + w] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
          lapSum += lap;
          lapSumSq += lap * lap;
          count++;
        }
      }
      const meanLap = lapSum / count;
      const sharpness = Math.max(0, lapSumSq / count - meanLap * meanLap);

      const notes: string[] = [];
      if (avgBrightness < 45) notes.push('Low brightness / underexposed');
      if (glareFraction > 0.08) notes.push('Specular glare reflections detected');
      if (sharpness < 22) notes.push('Soft focus / slight blur detected');

      setPreScanQuality({
        status: notes.length === 0 ? 'good' : 'warning',
        notes: notes.length === 0 ? ['Exposure, glare & sharpness look good'] : notes,
      });
    } catch {
      setPreScanQuality(null);
    }
  }, []);

  const handleFile = useCallback((selected: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setError('Choose a JPEG, PNG, or WebP evidence image.');
      setStage('error');
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setError('Choose an evidence image no larger than 10 MB.');
      setStage('error');
      return;
    }
    setFile(selected);
    setDimensions(null);
    setPreScanQuality(null);
    setError(null);
    setStage('ready');
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.onerror = () => {
      setError('The selected image could not be read. Try another file.');
      setStage('error');
    };
    reader.readAsDataURL(selected);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (busy) return;
      const selected = event.dataTransfer.files?.[0];
      if (selected) handleFile(selected);
    },
    [busy, handleFile]
  );

  function cancelInspection() {
    operationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
    setStage('error');
    setError('Inspection canceled. Your selected image is still available to retry.');
  }

  async function handleScan() {
    if (!file || busy) return;
    const operation = ++operationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setProgress(0);
    setError(null);
    setStage('reading');
    try {
      setStage('ocr');
      const ocr = await runOCR(file, setProgress, controller.signal);
      if (operation !== operationRef.current) return;
      if (ocr.words.length === 0 || !ocr.words.some((word) => word.text.trim())) {
        throw new Error('No readable text was found. Retake or upload a clearer label image.');
      }
      setStage('analyzing');
      const response = await postScan(
        buildScanRequest(ocr, { mode, category, imported }),
        controller.signal
      );
      if (operation !== operationRef.current) return;
      setStage('saving');
      setStage('complete');
      onComplete({ ...ocr, response });
    } catch (reason) {
      if (operation !== operationRef.current) return;
      setStage('error');
      setError(
        reason instanceof DOMException && reason.name === 'AbortError'
          ? 'Inspection canceled. Your selected image is still available to retry.'
          : reason instanceof Error
            ? reason.message
            : 'The inspection could not be completed. Try again.'
      );
    } finally {
      if (operation === operationRef.current) {
        setBusy(false);
        controllerRef.current = null;
      }
    }
  }

  return (
    <div className="relative overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
      {!file ? <Spotlight /> : null}
      <div className="relative mx-auto max-w-4xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Evidence-led inspection
          </p>
          <h1 className="text-h1">Check a package or online listing</h1>
          <p className="max-w-2xl text-muted-foreground">
            Capture visible declarations and receive explainable checks against the Legal Metrology
            (Packaged Commodities) Rules, 2011. Uncertain evidence is sent to manual review.
          </p>
        </header>

        <fieldset disabled={busy} className="space-y-3">
          <legend className="font-heading font-semibold">Evidence source</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {modes.map((option) => (
              <label
                key={option.value}
                className={`surface-panel flex min-h-24 cursor-pointer gap-3 p-4 transition-colors ${
                  mode === option.value ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                }`}
              >
                <input
                  type="radio"
                  aria-label={option.title}
                  name="scan-mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                  className="mt-1 size-5 shrink-0 accent-primary"
                />
                <span>
                  <span className="block font-semibold">{option.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold">
            Product category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ScanContext['category'])}
              className="h-11 w-full rounded-md border bg-background px-3 font-normal"
              disabled={busy}
            >
              <option value="unknown">Not sure</option>
              <option value="food">Food</option>
              <option value="non_food">Non-food</option>
              <option value="cosmetics">Cosmetics</option>
              <option value="seeds">Seeds</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-semibold">
            Import status
            <select
              value={imported === null ? 'unknown' : imported ? 'imported' : 'domestic'}
              onChange={(event) =>
                setImported(
                  event.target.value === 'unknown' ? null : event.target.value === 'imported'
                )
              }
              className="h-11 w-full rounded-md border bg-background px-3 font-normal"
              disabled={busy}
            >
              <option value="unknown">Not sure</option>
              <option value="domestic">Domestic</option>
              <option value="imported">Imported</option>
            </select>
          </label>
        </div>

        {mode === 'retail_image' && !file ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Button
                type="button"
                variant={captureMethod === 'camera' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCaptureMethod('camera')}
                className="gap-2 font-semibold"
              >
                <Camera className="size-4" /> Guided Camera
              </Button>
              <Button
                type="button"
                variant={captureMethod === 'upload' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCaptureMethod('upload')}
                className="gap-2 font-semibold"
              >
                <ImageUp className="size-4" /> Upload File
              </Button>
            </div>

            {captureMethod === 'camera' ? (
              <div className="space-y-3">
                <CameraCaptureGuide onCapture={handleFile} disabled={busy} />
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setCaptureMethod('upload')}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Having trouble? Switch to file upload
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === 'ecommerce_listing' || captureMethod === 'upload' || Boolean(file) ? (
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            className="surface-panel border-2 border-dashed p-5 text-center sm:p-8"
          >
            {preview ? (
              <div className="space-y-3">
                <img
                  src={preview}
                  alt="Selected evidence preview"
                  className="mx-auto max-h-80 rounded-md object-contain"
                  onLoad={(event) => {
                    setDimensions({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    });
                    checkPreScanQuality(event.currentTarget);
                  }}
                />
                {preScanQuality ? (
                  <div
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                      preScanQuality.status === 'good'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {preScanQuality.status === 'good' ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : (
                      <AlertTriangle className="size-3.5" />
                    )}
                    <span>Pre-scan: {preScanQuality.notes.join(' · ')}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="py-8">
                {mode === 'retail_image' ? (
                  <Camera aria-hidden="true" className="mx-auto size-9 text-primary" />
                ) : (
                  <ImageUp aria-hidden="true" className="mx-auto size-9 text-primary" />
                )}
                <p className="mt-3 font-semibold">
                  {mode === 'retail_image'
                    ? 'Take or upload a clear package photo'
                    : 'Upload listing screenshot evidence'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  JPEG, PNG, or WebP · up to 10 MB
                </p>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <label
                htmlFor={fileInputId}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-md border bg-background px-5 py-2 font-semibold hover:bg-muted"
              >
                {file ? 'Replace evidence image' : 'Choose evidence image'}
              </label>
              {file && mode === 'retail_image' ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setCaptureMethod('camera');
                  }}
                  className="gap-2"
                >
                  <Camera className="size-4" /> Retake with Guided Camera
                </Button>
              ) : null}
            </div>
            {file ? (
              <p className="mt-3 break-all text-sm text-muted-foreground">
                {file.name}
                {dimensions ? ` · ${dimensions.width} × ${dimensions.height}px` : ''}
              </p>
            ) : null}
          </div>
        ) : null}

        <input
          id={fileInputId}
          aria-label="Evidence image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture={mode === 'retail_image' ? 'environment' : undefined}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected) handleFile(selected);
          }}
          className="sr-only"
          disabled={busy}
        />

        {busy ? (
          <div className="surface-panel space-y-4 p-5" role="status" aria-live="polite">
            <ScanProgress stages={progressStages} currentStage={stageIndex(stage)} />
            <p className="text-center text-sm text-muted-foreground">
              {stage === 'ocr'
                ? `Reading label text… ${Math.round(progress * 100)}%`
                : stage === 'analyzing'
                  ? 'Evaluating declarations and visual evidence…'
                  : 'Saving the inspection record…'}
            </p>
            <Button type="button" variant="outline" className="w-full" onClick={cancelInspection}>
              <X aria-hidden="true" /> Cancel inspection
            </Button>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-md border border-fail/30 bg-fail/10 p-4 text-fail">
            <p className="font-semibold">Inspection needs attention</p>
            <p>{error}</p>
          </div>
        ) : null}

        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleScan}
          disabled={!file || busy}
        >
          {stage === 'error' ? <RotateCcw aria-hidden="true" /> : null}
          {stage === 'error' ? 'Retry inspection' : 'Start inspection'}
        </Button>
      </div>
    </div>
  );
}
