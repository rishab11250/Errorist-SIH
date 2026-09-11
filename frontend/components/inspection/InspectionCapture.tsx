'use client';

import { AlertTriangle, Camera, CheckCircle2, ImageUp, Layers, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import NextImage from 'next/image';
import { useCallback, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ScanProgress } from '@/components/ui/scan-progress';
import { Spotlight } from '@/components/ui/spotlight';
import { cn } from '@/lib/cn';
import { postScan } from '@/lib/api';
import { runOCR, type OCRRunResult } from '@/lib/ocr';
import {
  assessPackageContent,
  assessQuality,
  extractAll,
  loadDefaultRules,
  overallStatus,
  runEngine,
} from '@/lib/rules';
import {
  computeAverageQuality,
  createMultiSectionComposite,
  fuseMultiSectionExtractions,
  verifyProductConsistency,
  type SectionCaptureData,
} from '@/lib/rules/multi-section';
import { savePendingScan, updateSyncStatus, type PendingScanRecord } from '@/lib/storage';
import type { ScanContext, ScanRequest, ScanResponse } from '@/lib/types';
import { CameraCaptureGuide } from './CameraCaptureGuide';

interface SectionSlot {
  id: string;
  label: string;
  file: File | null;
  preview: string | null;
  dimensions: { width: number; height: number } | null;
  preScanQuality: { status: 'good' | 'warning'; notes: string[] } | null;
}

const DEFAULT_SECTIONS: SectionSlot[] = [
  { id: 'sec-1', label: '1. Front / Brand & Product Name', file: null, preview: null, dimensions: null, preScanQuality: null },
  { id: 'sec-2', label: '2. Nutrition & Ingredients Panel', file: null, preview: null, dimensions: null, preScanQuality: null },
  { id: 'sec-3', label: '3. Manufacturer, FSSAI & Barcode', file: null, preview: null, dimensions: null, preScanQuality: null },
  { id: 'sec-4', label: '4. MRP, Net Quantity & Dates Flap', file: null, preview: null, dimensions: null, preScanQuality: null },
];

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

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function createCompositeEvidenceFile(file1: File, file2: File): Promise<File> {
  try {
    const [img1, img2] = await Promise.all([loadImage(file1), loadImage(file2)]);
    const targetW = Math.max(img1.naturalWidth, img2.naturalWidth, 1000);
    const h1 = Math.round(img1.naturalHeight * (targetW / img1.naturalWidth));
    const h2 = Math.round(img2.naturalHeight * (targetW / img2.naturalWidth));
    const gap = Math.max(650, Math.round((h1 + h2) * 0.25));
    const totalH = h1 + gap + h2;

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file1;

    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, targetW, totalH);
    ctx.drawImage(img1, 0, 0, targetW, h1);
    ctx.drawImage(img2, 0, h1 + gap, targetW, h2);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );
    if (!blob) return file1;
    return new File([blob], `composite-evidence-${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file1;
  }
}

async function downscaleImageFile(file: File, maxDimension = 1600): Promise<File> {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    process.env.NODE_ENV === 'test'
  ) {
    return file;
  }
  if (file.type === 'image/svg+xml') return file;

  try {
    const img = await Promise.race([
      loadImage(file),
      new Promise<null>((r) => setTimeout(() => r(null), 8000)),
    ]);
    if (!img) return file;

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const maxSide = Math.max(width, height);

    if (!width || !height || (maxSide <= maxDimension && file.size <= 1_500_000)) {
      return file;
    }

    const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.90)
    );
    if (!blob) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

function stageIndex(stage: CaptureStage) {
  return { ready: 0, reading: 0, ocr: 1, analyzing: 2, saving: 3, complete: 4, error: 0 }[stage];
}

export function InspectionCapture({ onComplete }: Props) {
  const fileInputId = useId();
  const secondaryInputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [secondaryFile, setSecondaryFile] = useState<File | null>(null);
  const [secondaryPreview, setSecondaryPreview] = useState<string | null>(null);
  const [secondaryDimensions, setSecondaryDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
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
  const [isDragging, setIsDragging] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const operationRef = useRef(0);
  const [scanWorkflow, setScanWorkflow] = useState<'single' | 'multi'>('single');
  const [sections, setSections] = useState<SectionSlot[]>(DEFAULT_SECTIONS);

  const handleSectionFile = useCallback((index: number, selected: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setError('Choose a JPEG, PNG, or WebP evidence image.');
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setError('Choose an evidence image no larger than 10 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSections((prev) => {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          file: selected,
          preview: reader.result as string,
          dimensions: null,
          preScanQuality: null,
        };
        return copy;
      });
    };
    reader.readAsDataURL(selected);
  }, []);

  const removeSectionFile = useCallback((index: number) => {
    setSections((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        file: null,
        preview: null,
        dimensions: null,
        preScanQuality: null,
      };
      return copy;
    });
  }, []);

  const addCustomSection = useCallback(() => {
    setSections((prev) => {
      if (prev.length >= 6) return prev;
      return [
        ...prev,
        {
          id: `sec-${Date.now()}`,
          label: `Section ${prev.length + 1} · Additional Panel`,
          file: null,
          preview: null,
          dimensions: null,
          preScanQuality: null,
        },
      ];
    });
  }, []);

  const removeSectionSlot = useCallback((index: number) => {
    setSections((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

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

  const handleSecondaryFile = useCallback((selected: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setError('Choose a JPEG, PNG, or WebP evidence image.');
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setError('Choose an evidence image no larger than 10 MB.');
      return;
    }
    setSecondaryFile(selected);
    setSecondaryDimensions(null);
    const reader = new FileReader();
    reader.onload = () => setSecondaryPreview(reader.result as string);
    reader.readAsDataURL(selected);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
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
    if (busy) return;
    if (scanWorkflow === 'single' && !file) return;
    if (scanWorkflow === 'multi' && sections.filter((s) => s.file !== null).length < 2) return;

    const operation = ++operationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setProgress(0);
    setError(null);
    setStage('reading');

    try {
      if (scanWorkflow === 'multi') {
        const activeSections = sections.filter((s) => s.file !== null) as Array<
          SectionSlot & { file: File }
        >;
        if (activeSections.length < 2) {
          throw new Error(
            'Capture or upload at least 2 package sections (e.g. front & nutrition/MRP) to perform a multi-section bulk inspection.'
          );
        }

        setStage('ocr');
        const sectionCaptures: SectionCaptureData[] = [];

        for (let i = 0; i < activeSections.length; i++) {
          const sec = activeSections[i];
          const scanFile = await downscaleImageFile(sec.file, 1600);
          const ocr = await runOCR(
            scanFile,
            (p) => setProgress((i + p) / activeSections.length),
            controller.signal
          );
          if (operation !== operationRef.current) return;
          if (ocr.words.length === 0 || !ocr.words.some((w) => w.text.trim())) {
            throw new Error(
              `Section "${sec.label}" has no readable text. Retake or upload a clearer close-up image.`
            );
          }
          const quality = assessQuality(ocr.words);
          sectionCaptures.push({
            id: sec.id,
            label: sec.label,
            file: scanFile,
            ocr,
            quality,
          });
        }

        // 1. Cross-section product consistency verification
        const consistency = verifyProductConsistency(
          sectionCaptures.map((s) => ({ words: s.ocr.words, label: s.label }))
        );
        if (!consistency.isConsistent) {
          throw new Error(
            `Product Mismatch Rejected: The scanned sections appear to be from different products (${consistency.reason}). Ensure all close-up captures are from the same package.`
          );
        }

        // 2. Statutory packaging verification across all captured words
        const allWords = sectionCaptures.flatMap((s) => s.ocr.words);
        const packageCheck = assessPackageContent(allWords);
        if (!packageCheck.isPackage) {
          throw new Error(
            'Non-packaging image detected. No statutory product declarations (MRP, Net Quantity, Batch, or Manufacturer details) were found across any scanned sections. Please scan a physical product label or e-commerce listing.'
          );
        }

        setStage('analyzing');
        const rules = loadDefaultRules();
        const scanContext: ScanContext = { mode, category, imported };
        const avgQuality = computeAverageQuality(sectionCaptures.map((s) => s.quality));
        const { mergedExtracted, fusedVerdicts } = fuseMultiSectionExtractions(
          sectionCaptures,
          rules,
          scanContext
        );
        const localOverall = overallStatus(fusedVerdicts);

        const { compositeFile, compositeOCR } = await createMultiSectionComposite(sectionCaptures);
        if (operation !== operationRef.current) return;

        const localId =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        const offlineNumericId =
          Math.abs(
            localId.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
          ) || Date.now();

        const qualitySummary: ScanResponse['quality'] = {
          status: avgQuality.status,
          score: avgQuality.score,
          guidance: avgQuality.guidance,
          metrics: avgQuality.metrics.map((m) => ({
            name: m.name,
            value: m.value,
            unit: m.unit,
            confidence: m.confidence,
            method: m.method,
            evidence_bboxes: m.evidence_bboxes ?? [],
          })),
        };

        const extractedFields: ScanResponse['extracted_fields'] = {};
        for (const [key, field] of Object.entries(mergedExtracted)) {
          extractedFields[key] = field
            ? {
                name: field.name,
                value: field.value,
                bbox: field.bbox,
                confidence: field.confidence,
                evidence_bboxes: field.evidence_spans || [],
              }
            : null;
        }

        const localResponse: ScanResponse = {
          scan_id: offlineNumericId,
          processing_status: 'complete',
          quality: qualitySummary,
          extracted_fields: extractedFields,
          verdicts: fusedVerdicts,
          overall_status: localOverall,
          analysis_version: rules.version,
        };

        const pendingRecord: PendingScanRecord = {
          local_id: localId,
          captured_at: new Date().toISOString(),
          rule_version: rules.version,
          image_blob: compositeFile,
          ocr_payload: compositeOCR.words,
          scan_context: scanContext,
          verdicts: fusedVerdicts,
          sync_status: 'pending',
          sync_attempts: 0,
        };

        try {
          await savePendingScan(pendingRecord);
        } catch (storageErr) {
          console.warn('Could not save pending scan to IndexedDB:', storageErr);
        }
        if (operation !== operationRef.current) return;

        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        if (isOffline) {
          setStage('saving');
          setStage('complete');
          onComplete({ ...compositeOCR, response: localResponse });
          return;
        }

        let finalResponse = localResponse;
        try {
          finalResponse = await postScan(
            buildScanRequest(compositeOCR, scanContext),
            controller.signal
          );
          if (operation !== operationRef.current) return;
          try {
            await updateSyncStatus(localId, 'synced');
          } catch {}
        } catch (err) {
          if (operation !== operationRef.current) return;
          if (err instanceof DOMException && err.name === 'AbortError') {
            throw err;
          }
          const isNetworkFailure =
            err instanceof TypeError ||
            (err instanceof Error &&
              /failed to fetch|fetch failed|network|load failed|offline/i.test(err.message));
          if (isNetworkFailure) {
            finalResponse = localResponse;
          } else {
            throw err;
          }
        }

        setStage('saving');
        setStage('complete');
        onComplete({ ...compositeOCR, response: finalResponse });
        return;
      }

      const rawFile = secondaryFile
        ? await createCompositeEvidenceFile(file, secondaryFile)
        : file;
      const scanFile = await downscaleImageFile(rawFile, 1600);
      setStage('ocr');
      const ocr = await runOCR(scanFile, setProgress, controller.signal);
      if (operation !== operationRef.current) return;
      if (ocr.words.length === 0 || !ocr.words.some((word) => word.text.trim())) {
        throw new Error('No readable text was found. Retake or upload a clearer label image.');
      }
      const packageCheck = assessPackageContent(ocr.words);
      if (!packageCheck.isPackage) {
        throw new Error(
          'Non-packaging image detected. No statutory product declarations (MRP, Net Quantity, Batch, or Manufacturer details) were found. Please scan a physical product label or e-commerce listing.'
        );
      }
      setStage('analyzing');

      const rules = loadDefaultRules();
      const imageMeta = {
        width: ocr.imageWidth,
        height: ocr.imageHeight,
        orientation: 1,
      };
      const scanContext: ScanContext = { mode, category, imported };
      const localQuality = assessQuality(ocr.words);
      const localExtracted = extractAll(ocr.words, imageMeta, scanContext, rules);
      const localVerdicts = runEngine(
        { extracted: localExtracted, quality: localQuality },
        rules,
        scanContext
      );
      const localOverall = overallStatus(localVerdicts);

      const localId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const pendingRecord: PendingScanRecord = {
        local_id: localId,
        captured_at: new Date().toISOString(),
        rule_version: rules.version,
        image_blob: scanFile,
        ocr_payload: ocr.words,
        scan_context: scanContext,
        verdicts: localVerdicts,
        sync_status: 'pending',
        sync_attempts: 0,
      };

      try {
        await savePendingScan(pendingRecord);
      } catch (storageErr) {
        console.warn('Could not save pending scan to IndexedDB:', storageErr);
      }
      if (operation !== operationRef.current) return;

      const offlineNumericId =
        Math.abs(
          localId.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
        ) || Date.now();

      const qualitySummary: ScanResponse['quality'] = {
        status: localQuality.status,
        score: localQuality.score,
        guidance: localQuality.guidance,
        metrics: localQuality.metrics.map((m) => ({
          name: m.name,
          value: m.value,
          unit: m.unit,
          confidence: m.confidence,
          method: m.method,
          evidence_bboxes: m.evidence_bboxes ?? [],
        })),
      };

      const extractedFields: ScanResponse['extracted_fields'] = {};
      for (const [key, field] of Object.entries(localExtracted)) {
        extractedFields[key] = field
          ? {
              name: field.name,
              value: field.value,
              bbox: field.bbox,
              confidence: field.confidence,
              evidence_bboxes: field.evidence_spans || [],
            }
          : null;
      }

      const localResponse: ScanResponse = {
        scan_id: offlineNumericId,
        processing_status: 'complete',
        quality: qualitySummary,
        extracted_fields: extractedFields,
        verdicts: localVerdicts,
        overall_status: localOverall,
        analysis_version: rules.version,
      };

      const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (isOffline) {
        setStage('saving');
        setStage('complete');
        onComplete({ ...ocr, response: localResponse });
        return;
      }

      let finalResponse = localResponse;
      try {
        finalResponse = await postScan(buildScanRequest(ocr, scanContext), controller.signal);
        if (operation !== operationRef.current) return;
        try {
          await updateSyncStatus(localId, 'synced');
        } catch {}
      } catch (err) {
        if (operation !== operationRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        const isNetworkFailure =
          err instanceof TypeError ||
          (err instanceof Error &&
            /failed to fetch|fetch failed|network|load failed|offline/i.test(err.message));
        if (isNetworkFailure) {
          finalResponse = localResponse;
        } else {
          throw err;
        }
      }

      setStage('saving');
      setStage('complete');
      onComplete({ ...ocr, response: finalResponse });
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

        {/* Scan Workflow Selector */}
        <div className="flex items-center justify-center p-1 bg-muted/60 rounded-xl border max-w-md mx-auto">
          <button
            type="button"
            onClick={() => {
              setScanWorkflow('single');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
              scanWorkflow === 'single'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Standard Scan
          </button>
          <button
            type="button"
            onClick={() => {
              setScanWorkflow('multi');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              scanWorkflow === 'multi'
                ? 'bg-background text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers className="size-4" /> Multi-Section (Bulk / Tall)
          </button>
        </div>

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

        {scanWorkflow === 'multi' ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground space-y-1">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <Layers className="size-4" /> Multi-Section Bulk Scanner for Tall / Detailed Packaging
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Capture small close-up sections of long or tall packages (e.g. noodles, rolls) at native resolution.
                The engine verifies all sections belong to the same product, averages quality scores, and synthesizes a complete statutory report.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {sections.map((slot, index) => {
                const slotInputId = `section-slot-input-${slot.id}`;
                return (
                  <div
                    key={slot.id}
                    className="relative rounded-lg border bg-card p-4 space-y-3 transition-colors hover:border-primary/40 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-primary truncate">
                        {slot.label}
                      </span>
                      {sections.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeSectionSlot(index)}
                          className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                          title="Remove this section slot"
                          disabled={busy}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>

                    {slot.preview ? (
                      <div className="space-y-2 rounded border bg-background/60 p-2">
                        <NextImage
                          src={slot.preview}
                          alt={slot.label}
                          width={slot.dimensions?.width ?? 800}
                          height={slot.dimensions?.height ?? 600}
                          unoptimized
                          className="mx-auto max-h-40 rounded object-contain"
                          onLoad={(e) => {
                            const img = e.currentTarget;
                            setSections((prev) => {
                              const copy = [...prev];
                              copy[index] = {
                                ...copy[index],
                                dimensions: { width: img.naturalWidth, height: img.naturalHeight },
                              };
                              return copy;
                            });
                          }}
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="truncate max-w-[180px]">{slot.file?.name}</span>
                          <button
                            type="button"
                            onClick={() => removeSectionFile(index)}
                            className="text-fail hover:underline flex items-center gap-1 font-medium"
                            disabled={busy}
                          >
                            <X className="size-3" /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-dashed rounded-lg p-5 text-center space-y-2 bg-muted/20">
                        <Camera className="size-6 mx-auto text-muted-foreground/70" />
                        <p className="text-xs text-muted-foreground">Upload or capture close-up</p>
                        <label
                          htmlFor={slotInputId}
                          className="inline-flex cursor-pointer items-center justify-center rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                        >
                          <span>Select Image</span>
                        </label>
                        <input
                          id={slotInputId}
                          aria-label={slot.label}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleSectionFile(index, f);
                          }}
                          disabled={busy}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {sections.length < 6 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomSection}
                className="w-full gap-2 border-dashed"
                disabled={busy}
              >
                <Plus className="size-4" /> Add Another Package Section Slot
              </Button>
            )}
          </div>
        ) : (
          <>
            {mode === 'retail_image' && !file ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <div className="inline-flex rounded-lg border border-border/80 bg-muted/40 p-1 shadow-inner">
                    <Button
                      type="button"
                      variant={captureMethod === 'camera' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCaptureMethod('camera')}
                      className={cn(
                        'gap-2 font-semibold transition-all',
                        captureMethod === 'camera' && 'shadow-sm'
                      )}
                    >
                      <Camera className="size-4" /> Guided Camera
                    </Button>
                    <Button
                      type="button"
                      variant={captureMethod === 'upload' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setCaptureMethod('upload')}
                      className={cn(
                        'gap-2 font-semibold transition-all',
                        captureMethod === 'upload' && 'shadow-sm'
                      )}
                    >
                      <ImageUp className="size-4" /> Upload File
                    </Button>
                  </div>
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
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={cn(
                  'surface-panel relative rounded-xl border-2 border-dashed p-5 text-center transition-all duration-200 sm:p-8',
                  isDragging
                    ? 'border-primary bg-primary/10 shadow-lg ring-4 ring-primary/20 scale-[1.01]'
                    : 'border-border/80 hover:border-primary/50'
                )}
              >
                {preview && secondaryPreview ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 rounded-lg border bg-background/50 p-3 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                            Panel 1 · Primary
                          </span>
                        </div>
                        <NextImage
                          src={preview}
                          alt="Primary evidence panel"
                          width={dimensions?.width ?? 1600}
                          height={dimensions?.height ?? 900}
                          unoptimized
                          className="mx-auto max-h-64 rounded object-contain"
                        />
                        <p className="truncate text-xs text-muted-foreground">{file?.name}</p>
                      </div>
                      <div className="space-y-2 rounded-lg border bg-background/50 p-3 text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                            Panel 2 · Secondary / Sticker
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSecondaryFile(null);
                              setSecondaryPreview(null);
                              setSecondaryDimensions(null);
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Remove secondary panel"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                        <NextImage
                          src={secondaryPreview}
                          alt="Secondary evidence panel"
                          width={secondaryDimensions?.width ?? 1600}
                          height={secondaryDimensions?.height ?? 900}
                          unoptimized
                          className="mx-auto max-h-64 rounded object-contain"
                        />
                        <p className="truncate text-xs text-muted-foreground">{secondaryFile?.name}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Multi-panel mode active: Panels will be composited into a single evidence
                      inspection.
                    </p>
                  </div>
                ) : preview ? (
                  <div className="space-y-3">
                    <NextImage
                      src={preview}
                      alt="Selected evidence preview"
                      width={dimensions?.width ?? 1600}
                      height={dimensions?.height ?? 900}
                      unoptimized
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
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-md border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    {file ? 'Replace primary image' : 'Choose evidence image'}
                  </label>
                  {file && mode === 'retail_image' && !secondaryFile ? (
                    <label
                      htmlFor={secondaryInputId}
                      className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
                    >
                      + Add secondary panel (MRP sticker / back)
                    </label>
                  ) : null}
                  {file && mode === 'retail_image' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFile(null);
                        setPreview(null);
                        setSecondaryFile(null);
                        setSecondaryPreview(null);
                        setCaptureMethod('camera');
                      }}
                      className="gap-2"
                    >
                      <Camera className="size-4" /> Retake with Guided Camera
                    </Button>
                  ) : null}
                </div>
                {file && !secondaryFile ? (
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

            {mode === 'retail_image' ? (
              <input
                id={secondaryInputId}
                aria-label="Secondary package panel"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) handleSecondaryFile(selected);
                }}
                className="sr-only"
                disabled={busy}
              />
            ) : null}
          </>
        )}

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
          disabled={
            busy ||
            (scanWorkflow === 'single'
              ? !file
              : sections.filter((s) => s.file !== null).length < 2)
          }
        >
          {stage === 'error' ? <RotateCcw aria-hidden="true" /> : null}
          {stage === 'error'
            ? 'Retry inspection'
            : scanWorkflow === 'multi'
              ? `Start multi-section inspection (${sections.filter((s) => s.file !== null).length} sections)`
              : 'Start inspection'}
        </Button>
      </div>
    </div>
  );
}
