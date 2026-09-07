'use client';

import { useCallback, useState } from 'react';

import { postScan } from '@/lib/api';
import { runOCR, type OCRRunResult } from '@/lib/ocr';
import type { ScanContext, ScanResponse } from '@/lib/types';

interface Props { onComplete: (result: OCRRunResult & { response: ScanResponse }) => void; }

export function UploadDropzone({ onComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<ScanContext['category']>('unknown');

  const handleFile = useCallback((selected: File) => {
    setFile(selected); setError(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(selected);
  }, []);
  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => { event.preventDefault(); const selected = event.dataTransfer.files?.[0]; if (selected) handleFile(selected); }, [handleFile]);
  const onSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (selected) handleFile(selected); }, [handleFile]);

  async function handleScan() {
    if (!file) return;
    setBusy(true); setProgress(0); setError(null);
    try {
      const ocr = await runOCR(file, setProgress);
      const response = await postScan({ image_b64: ocr.imageDataUrl.split(',')[1], image_meta: { width: ocr.imageWidth, height: ocr.imageHeight, orientation: 1 }, ocr_payload: ocr.words, scan_context: { mode: 'retail_image', category } });
      onComplete({ ...ocr, response });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'unknown error'); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-2xl space-y-4 p-6">
    <h1 className="text-3xl font-bold">LMPC Compliance Checker</h1>
    <p className="text-slate-600">Upload a product label photo to check it against the Legal Metrology (Packaged Commodities) Rules, 2011.</p>
    <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className="rounded-lg border-2 border-dashed border-slate-300 p-8 text-center transition hover:border-slate-500">
      {preview ? <img src={preview} alt="Label preview" className="mx-auto max-h-64 rounded" /> : <p className="text-slate-500">Drag a label photo here, or click to select</p>}
      <input type="file" accept="image/*" capture="environment" onChange={onSelect} className="mx-auto mt-4 block" />
    </div>
    <div className="flex items-center gap-3"><label className="text-sm font-medium">Category:</label><select value={category} onChange={(event) => setCategory(event.target.value as ScanContext['category'])} className="rounded border px-2 py-1" disabled={busy}><option value="unknown">Unknown (auto)</option><option value="food">Food</option><option value="non_food">Non-food</option><option value="cosmetics">Cosmetics</option><option value="seeds">Seeds</option></select></div>
    <button onClick={handleScan} disabled={!file || busy} className="rounded bg-blue-600 px-6 py-2 text-white disabled:opacity-50">{busy ? `Scanning… ${Math.round(progress * 100)}%` : 'Scan label'}</button>
    {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</div>}
  </div>;
}
