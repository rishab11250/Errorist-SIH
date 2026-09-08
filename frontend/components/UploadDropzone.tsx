'use client';

import { useCallback, useId, useState } from 'react';

import { postScan } from '@/lib/api';
import { runOCR, type OCRRunResult } from '@/lib/ocr';
import type { ScanContext, ScanRequest, ScanResponse } from '@/lib/types';

interface Props {
  onComplete: (result: OCRRunResult & { response: ScanResponse }) => void;
}

const modes: Array<{
  value: ScanContext['mode'];
  title: string;
  description: string;
}> = [
  {
    value: 'retail_image',
    title: 'Package photo',
    description: 'Use a clear photo of the physical package or label.',
  },
  {
    value: 'ecommerce_listing',
    title: 'Online listing',
    description: 'Use a screenshot of the product page or listing image.',
  },
];

export function buildScanRequest(ocr: OCRRunResult, scanContext: ScanContext): ScanRequest {
  const imageB64 = ocr.imageDataUrl.split(',', 2)[1];
  if (!imageB64) throw new Error('The selected image could not be prepared for analysis.');
  return {
    schema_version: 2,
    image_b64: imageB64,
    image_meta: {
      width: ocr.imageWidth,
      height: ocr.imageHeight,
      orientation: 1,
    },
    ocr_payload: ocr.words,
    ocr_lines: ocr.lines,
    scan_context: scanContext,
  };
}

export function UploadDropzone({ onComplete }: Props) {
  const fileInputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ScanContext['mode']>('retail_image');
  const [category, setCategory] = useState<ScanContext['category']>('unknown');
  const [imported, setImported] = useState<boolean | null>(null);

  const handleFile = useCallback((selected: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setError('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    setFile(selected);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.onerror = () => setError('The selected image could not be read. Try another file.');
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

  const onSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selected = event.target.files?.[0];
      if (selected) handleFile(selected);
    },
    [handleFile]
  );

  async function handleScan() {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const ocr = await runOCR(file, setProgress);
      const response = await postScan(buildScanRequest(ocr, { mode, category, imported }));
      onComplete({ ...ocr, response });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The scan could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-7 px-4 py-8 sm:px-6 sm:py-12">
      <header className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">
          LMPC inspection assistant
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Check a package or online listing
        </h1>
        <p className="max-w-2xl text-base leading-7 text-slate-600">
          Upload a product label image to check visible declarations against the Legal Metrology
          (Packaged Commodities) Rules, 2011. The checker flags uncertainty for human review.
        </p>
      </header>

      <fieldset disabled={busy} className="space-y-3">
        <legend className="text-base font-semibold text-slate-900">What are you inspecting?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {modes.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-24 cursor-pointer gap-3 rounded-xl border-2 p-4 transition focus-within:ring-4 focus-within:ring-blue-200 ${
                mode === option.value
                  ? 'border-blue-700 bg-blue-50'
                  : 'border-slate-200 bg-white hover:border-slate-400'
              }`}
            >
              <input
                type="radio"
                name="scan-mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="mt-1 h-5 w-5 shrink-0 accent-blue-700"
              />
              <span>
                <span className="block font-semibold text-slate-900">{option.title}</span>
                <span className="mt-1 block text-sm leading-5 text-slate-600">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-semibold text-slate-800">
          Product category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as ScanContext['category'])}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal focus:border-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
            disabled={busy}
          >
            <option value="unknown">Not sure</option>
            <option value="food">Food</option>
            <option value="non_food">Non-food</option>
            <option value="cosmetics">Cosmetics</option>
            <option value="seeds">Seeds</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-semibold text-slate-800">
          Import status
          <select
            value={imported === null ? 'unknown' : imported ? 'imported' : 'domestic'}
            onChange={(event) =>
              setImported(
                event.target.value === 'unknown' ? null : event.target.value === 'imported'
              )
            }
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal focus:border-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
            disabled={busy}
          >
            <option value="unknown">Not sure</option>
            <option value="domestic">Domestic</option>
            <option value="imported">Imported</option>
          </select>
        </label>
      </div>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center transition focus-within:border-blue-700 focus-within:ring-4 focus-within:ring-blue-100 sm:p-8"
      >
        {preview ? (
          <img
            src={preview}
            alt="Selected image preview"
            className="mx-auto max-h-72 rounded-lg object-contain"
          />
        ) : (
          <div className="py-8">
            <p className="font-semibold text-slate-800">
              {mode === 'retail_image'
                ? 'Take or upload a clear package photo'
                : 'Upload a product-listing screenshot'}
            </p>
            <p className="mt-2 text-sm text-slate-500">JPEG, PNG, or WebP</p>
          </div>
        )}
        <label
          htmlFor={fileInputId}
          className="mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2 font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
        >
          {file
            ? 'Choose a different image'
            : mode === 'retail_image'
              ? 'Choose or take photo'
              : 'Choose screenshot'}
        </label>
        <input
          id={fileInputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture={mode === 'retail_image' ? 'environment' : undefined}
          onChange={onSelect}
          className="sr-only"
          disabled={busy}
        />
        {file && <p className="mt-3 break-all text-sm text-slate-600">Selected: {file.name}</p>}
      </div>

      {busy && (
        <div className="space-y-2" role="status" aria-live="polite">
          <div className="flex justify-between text-sm font-medium text-slate-700">
            <span>Reading visible label text…</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div
              className="h-full bg-blue-700 transition-[width] motion-reduce:transition-none"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleScan}
        disabled={!file || busy}
        className="min-h-12 w-full rounded-xl bg-blue-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Analysing image…' : 'Run compliance check'}
      </button>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <p className="font-semibold">We could not analyse this image.</p>
          <p className="mt-1">{error} Try a clearer image or choose another file.</p>
        </div>
      )}
    </div>
  );
}
