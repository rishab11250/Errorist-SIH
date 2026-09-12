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
  const [ocrLanguage, setOcrLanguage] = useState<'eng' | 'multi'>('eng');

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
          const languages = ocrLanguage === 'multi' ? ['eng', 'hin'] : ['eng'];
          const ocr = await runOCR(
            scanFile,
            (p) => setProgress((i + p) / activeSections.length),
            controller.signal,
            {
              scanContext: { mode, category, imported },
              rules: loadDefaultRules(),
              enableDualPass: true,
              languages,
            }
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

      if (!file) {
        throw new Error('Please select or capture a primary evidence image.');
      }

      const rawFile = secondaryFile
        ? await createCompositeEvidenceFile(file, secondaryFile)
        : file;
      const scanFile = await downscaleImageFile(rawFile, 1600);
      const rules = loadDefaultRules();
      const scanContext: ScanContext = { mode, category, imported };
      const languages = ocrLanguage === 'multi' ? ['eng', 'hin'] : ['eng'];
      setStage('ocr');
      const ocr = await runOCR(scanFile, setProgress, controller.signal, {
        scanContext,
        rules,
        enableDualPass: true,
        languages,
      });
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

      const imageMeta = {
        width: ocr.imageWidth,
        height: ocr.imageHeight,
        orientation: 1,
      };
      const localQuality = assessQuality(ocr.words);
      const localExtracted = ocr.extractedFields ?? extractAll(ocr.words, imageMeta, scanContext, rules);
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
    <div className="relative overflow-hidden px-4 py-6 sm:px-6 sm:py-10 bg-surface">
      <div className="relative mx-auto max-w-5xl space-y-6">
        {/* Title & Top Summary */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#E7E2D8] pb-5">
          <div>
            <div className="inline-flex items-center space-x-2 text-xs font-mono font-bold text-terracotta uppercase tracking-wider mb-1">
              <Camera className="w-4 h-4" />
              <span>Evidence Capture Module</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold text-ink tracking-tight">
              New Legal Metrology Inspection
            </h1>
            <p className="text-sm text-ink-muted mt-0.5 max-w-2xl">
              Photograph physical packaged goods or import e-commerce evidence to extract statutory declarations and run instant rule verification.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <div className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg bg-surface-dim border border-[#E2DDD3] text-[11px] sm:text-xs font-mono">
              <span className="text-ink-muted">Jurisdiction:</span> <span className="font-bold text-ink">Rules 2011 (LMPC)</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setSecondaryFile(null);
                setSecondaryPreview(null);
                setError(null);
                setPreScanQuality(null);
              }}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg border border-[#D5CFC4] hover:bg-[#EFEAE0] text-xs font-semibold text-ink flex items-center gap-1.5 transition font-heading"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Form
            </button>
          </div>
        </div>

        {/* Configuration Grid (Controls Row) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Col 1: Scan Mode & Language Selection (6 cols) */}
          <div className="lg:col-span-6 space-y-4">
            {/* 1. Inspection Mode */}
            <div className="bg-surface-card p-4 rounded-xl border border-[#E8E2D6] shadow-kinetic-sm">
              <label className="block text-xs font-mono uppercase font-bold text-ink-muted mb-2 tracking-wider">
                1. Inspection Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 bg-surface-dim rounded-lg border border-[#E0D9CD]">
                <button
                  type="button"
                  onClick={() => {
                    setScanWorkflow('single');
                    setError(null);
                  }}
                  className={cn(
                    'flex items-center justify-between sm:justify-center gap-2 py-2.5 sm:py-2 px-3 rounded-md font-heading text-xs font-semibold transition',
                    scanWorkflow === 'single'
                      ? 'bg-white text-ink shadow-kinetic-sm border border-[#DDD6C8]'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', scanWorkflow === 'single' ? 'bg-terracotta' : 'bg-transparent border border-ink-muted')}></span>
                    <span>Standard Scan</span>
                  </span>
                  <span className="text-[10px] font-mono text-ink-muted bg-[#F2EDE4] px-1.5 py-0.5 rounded">Single/Dual</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScanWorkflow('multi');
                    setError(null);
                  }}
                  className={cn(
                    'flex items-center justify-between sm:justify-center gap-2 py-2.5 sm:py-2 px-3 rounded-md font-heading text-xs font-semibold transition',
                    scanWorkflow === 'multi'
                      ? 'bg-white text-ink shadow-kinetic-sm border border-[#DDD6C8]'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', scanWorkflow === 'multi' ? 'bg-terracotta' : 'bg-transparent border border-ink-muted')}></span>
                    <span>Multi-Section</span>
                  </span>
                  <span className="text-[10px] font-mono text-terracotta font-bold bg-terracotta-light px-1.5 py-0.5 rounded">Bulk/Tall</span>
                </button>
              </div>
            </div>

            {/* 2. OCR Engine Language Model */}
            <div className="bg-surface-card p-4 rounded-xl border border-[#E8E2D6] shadow-kinetic-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2">
                <label className="block text-xs font-mono uppercase font-bold text-ink-muted tracking-wider">
                  2. OCR Engine Language Model
                </label>
                <span
                  className={cn(
                    'text-[10px] font-mono font-bold px-2 py-0.5 rounded border self-start sm:self-auto',
                    ocrLanguage === 'eng'
                      ? 'bg-forest-light text-forest border-forest/20'
                      : 'bg-terracotta-light text-terracotta border-terracotta/20'
                  )}
                >
                  {ocrLanguage === 'eng' ? '⚡ 2.5x Faster' : '🇮🇳 Bilingual (EN + HI)'}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 bg-surface-dim rounded-lg border border-[#E0D9CD]">
                <button
                  type="button"
                  onClick={() => setOcrLanguage('eng')}
                  disabled={busy}
                  className={cn(
                    'flex items-center justify-center gap-2 py-2 px-3 rounded-md font-heading text-xs font-semibold transition',
                    ocrLanguage === 'eng'
                      ? 'bg-white text-ink shadow-kinetic-sm border border-[#DDD6C8]'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  English Only
                </button>
                <button
                  type="button"
                  onClick={() => setOcrLanguage('multi')}
                  disabled={busy}
                  className={cn(
                    'flex items-center justify-center gap-2 py-2 px-3 rounded-md font-heading text-xs font-semibold transition',
                    ocrLanguage === 'multi'
                      ? 'bg-white text-ink shadow-kinetic-sm border border-[#DDD6C8]'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  English + Hindi
                </button>
              </div>
            </div>
          </div>

          {/* Col 2: Evidence Source & Metadata Category (6 cols) */}
          <div className="lg:col-span-6 space-y-4">
            {/* 3. Evidence Source Channel */}
            <div
              role="group"
              aria-labelledby="evidence-source-heading"
              className="bg-surface-card p-4 rounded-xl border border-[#E8E2D6] shadow-kinetic-sm"
            >
              <span id="evidence-source-heading" className="block text-xs font-mono uppercase font-bold text-ink-muted mb-2 tracking-wider">
                3. Evidence Source Channel
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {modes.map((item) => (
                  <label
                    key={item.value}
                    className={cn(
                      'cursor-pointer relative p-3 rounded-lg transition flex items-start gap-3',
                      mode === item.value
                        ? 'border-2 border-terracotta bg-terracotta-light/30 shadow-sm'
                        : 'border border-[#DDD6C8] bg-white hover:bg-surface-dim/50'
                    )}
                  >
                    <input
                      type="radio"
                      name="scan-mode"
                      aria-label={item.title}
                      value={item.value}
                      checked={mode === item.value}
                      onChange={() => setMode(item.value)}
                      disabled={busy}
                      className="sr-only"
                    />
                    <div className="w-full space-y-1">
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            'text-xs font-bold font-heading flex items-center gap-1.5',
                            mode === item.value ? 'text-ink' : 'text-ink-muted'
                          )}
                        >
                          {item.value === 'retail_image' ? (
                            <Camera className="w-4 h-4 text-terracotta" />
                          ) : (
                            <ImageUp className="w-4 h-4 text-ink-muted" />
                          )}
                          {item.title}
                        </span>
                        {mode === item.value ? (
                          <span className="w-4 h-4 rounded-full bg-terracotta text-white flex items-center justify-center text-[10px]">
                            ✓
                          </span>
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-ink-muted" />
                        )}
                      </div>
                      <p className="text-[11px] text-ink-muted leading-relaxed">{item.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 4. Statutory Product Metadata */}
            <div className="bg-surface-card p-4 rounded-xl border border-[#E8E2D6] shadow-kinetic-sm">
              <label className="block text-xs font-mono uppercase font-bold text-ink-muted mb-2 tracking-wider">
                4. Statutory Product Metadata
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1 font-heading">Product Category</label>
                  <div className="relative">
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as ScanContext['category'])}
                      disabled={busy}
                      className="w-full text-xs font-medium bg-surface-dim border border-[#D5CFC4] rounded-lg px-3 py-2.5 appearance-none focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta cursor-pointer"
                    >
                      <option value="unknown">Not sure / General</option>
                      <option value="food">Food & Confectionery</option>
                      <option value="non_food">Non-food Goods</option>
                      <option value="cosmetics">Cosmetics & Personal Care</option>
                      <option value="seeds">Seeds & Agricultural</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1 font-heading">Import Status</label>
                  <div className="relative">
                    <select
                      value={imported === null ? 'unknown' : imported ? 'imported' : 'domestic'}
                      onChange={(e) =>
                        setImported(e.target.value === 'unknown' ? null : e.target.value === 'imported')
                      }
                      disabled={busy}
                      className="w-full text-xs font-medium bg-surface-dim border border-[#D5CFC4] rounded-lg px-3 py-2.5 appearance-none focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta cursor-pointer"
                    >
                      <option value="unknown">Not sure</option>
                      <option value="domestic">Domestic (Manufactured in India)</option>
                      <option value="imported">Imported (Country of Origin required)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {scanWorkflow === 'multi' ? (
          <div className="space-y-5 bg-surface-card p-5 rounded-2xl border border-[#E0D9CD] shadow-kinetic-sm">
            <div className="rounded-lg border border-terracotta/30 bg-terracotta-light/30 p-4 text-sm text-ink space-y-1">
              <div className="flex items-center gap-2 font-semibold font-heading text-terracotta">
                <Layers className="size-4" /> Multi-Section Bulk Scanner for Tall / Detailed Packaging
              </div>
              <p className="text-ink-muted text-xs leading-relaxed font-sans">
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
                    className="relative rounded-xl border border-[#E2DDD3] bg-surface-card p-4 space-y-3 transition-all hover:border-terracotta/40 shadow-kinetic-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-heading font-bold uppercase tracking-wider text-terracotta truncate">
                        {slot.label}
                      </span>
                      {sections.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeSectionSlot(index)}
                          className="text-ink-muted hover:text-brick p-1 rounded transition-colors"
                          title="Remove this section slot"
                          disabled={busy}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>

                    {slot.preview ? (
                      <div className="space-y-2 rounded-lg border border-[#E0D9CD] bg-[#141311] p-2">
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
                        <div className="flex items-center justify-between text-xs text-[#D8D4CC] pt-1">
                          <span className="truncate max-w-[180px] font-mono">{slot.file?.name}</span>
                          <button
                            type="button"
                            onClick={() => removeSectionFile(index)}
                            className="text-brick hover:underline flex items-center gap-1 font-semibold"
                            disabled={busy}
                          >
                            <X className="size-3" /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-dashed border-[#DDD6C8] rounded-xl p-5 text-center space-y-2 bg-surface-dim/40">
                        <Camera className="size-6 mx-auto text-ink-muted/70" />
                        <p className="text-xs text-ink-muted">Upload or capture close-up</p>
                        <label
                          htmlFor={slotInputId}
                          className="inline-flex cursor-pointer items-center justify-center rounded-md border border-terracotta/40 bg-terracotta-light px-3 py-1.5 text-xs font-semibold text-terracotta hover:bg-terracotta-light/80 transition-colors font-heading"
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
              <button
                type="button"
                onClick={addCustomSection}
                className="w-full py-2.5 px-3 border border-dashed border-terracotta text-terracotta hover:bg-terracotta-light/40 rounded-xl text-xs font-heading font-semibold flex items-center justify-center gap-2 transition"
                disabled={busy}
              >
                <Plus className="size-4" /> Add Another Package Section Slot
              </button>
            )}
          </div>
        ) : (
          <div className="bg-surface-card rounded-2xl border border-[#E0D9CD] shadow-kinetic-md overflow-hidden">
            {/* Viewfinder Header Bar */}
            <div className="bg-[#1C1B19] px-3.5 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2.5 text-white">
              <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                <span className="flex h-2.5 w-2.5 sm:h-3 sm:w-3 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-terracotta opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-terracotta"></span>
                </span>
                <span className="font-heading font-semibold text-xs sm:text-sm tracking-wide truncate">
                  Live Capture Viewfinder &amp; Matrix
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono bg-[#2C2925] text-[#D8D4CC] border border-[#3E3A34]">
                  SENSOR: 60FPS ACTIVE
                </span>
              </div>

              <div className="flex items-center space-x-2 text-xs font-mono">
                <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-forest text-white text-[11px] sm:text-xs font-bold border border-forest/40 shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline">STATUS:</span>
                  <span>READY</span>
                </div>
                {mode === 'retail_image' && (
                  <div className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#2C2925] text-[#B8860B] border border-[#B8860B]/30 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#B8860B]" />
                    <span>Glare: 8% (Good)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Viewfinder Mode Toggle (Live Camera vs Gallery Upload) */}
            {mode === 'retail_image' && !file && (
              <div className="flex items-center gap-1.5 p-1 bg-surface-dim rounded-xl border border-[#E0D9CD] mx-3 sm:mx-6 mt-3">
                <button
                  type="button"
                  onClick={() => setCaptureMethod('camera')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-heading font-semibold transition',
                    captureMethod === 'camera'
                      ? 'bg-white text-ink shadow-sm border border-[#DDD6C8]'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  <Camera className="size-3.5 text-terracotta" />
                  <span>Live Guided Camera</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureMethod('upload')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-heading font-semibold transition',
                    captureMethod === 'upload'
                      ? 'bg-white text-ink shadow-sm border border-[#DDD6C8]'
                      : 'text-ink-muted hover:text-ink'
                  )}
                >
                  <ImageUp className="size-3.5 text-terracotta" />
                  <span>Upload from Gallery / Files</span>
                </button>
              </div>
            )}

            {/* Viewfinder Main Body */}
            <div className="p-3 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
              {/* Left Column (8 cols): Primary Canvas / Viewfinder */}
              <div className="lg:col-span-8 flex flex-col space-y-4">
                {mode === 'retail_image' && !file && captureMethod === 'camera' ? (
                  <div className="space-y-3">
                    <CameraCaptureGuide
                      onCapture={handleFile}
                      disabled={busy}
                      onSwitchToUpload={() => setCaptureMethod('upload')}
                    />
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setCaptureMethod('upload')}
                        className="text-xs text-ink-muted underline hover:text-ink font-mono inline-flex items-center gap-1.5"
                      >
                        <ImageUp className="size-3 text-terracotta" /> Prefer uploading an existing photo from gallery? Switch to file upload
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      className={cn(
                        'relative w-full min-h-[290px] sm:min-h-[360px] sm:aspect-[16/10] bg-[#141311] rounded-xl overflow-hidden border-2 transition-all flex flex-col items-center justify-center text-center shadow-inner p-3',
                        isDragging ? 'border-terracotta ring-4 ring-terracotta/20 scale-[1.01]' : 'border-[#2B2925]'
                      )}
                    >
                      {/* Grid overlay lines */}
                      <div className="absolute inset-0 viewfinder-grid opacity-30 pointer-events-none" />

                      {preview && secondaryPreview ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full h-full p-2 sm:p-4 z-10">
                          <div className="flex flex-col items-center justify-center bg-black/50 rounded-lg p-2 border border-white/10">
                            <span className="text-[10px] font-mono text-terracotta uppercase font-bold mb-1">
                              Panel 1 · Primary
                            </span>
                            <NextImage
                              src={preview}
                              alt="Primary evidence panel"
                              width={dimensions?.width ?? 1600}
                              height={dimensions?.height ?? 900}
                              unoptimized
                              className="max-h-48 sm:max-h-56 rounded object-contain"
                            />
                            <p className="truncate text-[10px] font-mono text-white/70 mt-1 max-w-full">{file?.name}</p>
                          </div>
                          <div className="flex flex-col items-center justify-center bg-black/50 rounded-lg p-2 border border-white/10 relative">
                            <button
                              type="button"
                              onClick={() => {
                                setSecondaryFile(null);
                                setSecondaryPreview(null);
                                setSecondaryDimensions(null);
                              }}
                              className="absolute top-2 right-2 rounded p-1 text-white/70 hover:text-brick hover:bg-white/10 transition"
                              title="Remove secondary panel"
                            >
                              <X className="size-4" />
                            </button>
                            <span className="text-[10px] font-mono text-terracotta uppercase font-bold mb-1">
                              Panel 2 · Secondary
                            </span>
                            <NextImage
                              src={secondaryPreview}
                              alt="Secondary evidence panel"
                              width={secondaryDimensions?.width ?? 1600}
                              height={secondaryDimensions?.height ?? 900}
                              unoptimized
                              className="max-h-48 sm:max-h-56 rounded object-contain"
                            />
                            <p className="truncate text-[10px] font-mono text-white/70 mt-1 max-w-full">
                              {secondaryFile?.name}
                            </p>
                          </div>
                        </div>
                      ) : preview ? (
                        <div className="relative w-full h-full flex flex-col items-center justify-center p-2 sm:p-3 z-10">
                          <NextImage
                            src={preview}
                            alt="Selected evidence preview"
                            width={dimensions?.width ?? 1600}
                            height={dimensions?.height ?? 900}
                            unoptimized
                            className="max-h-[340px] sm:max-h-[380px] rounded-lg object-contain shadow-md"
                            onLoad={(event) => {
                              setDimensions({
                                width: event.currentTarget.naturalWidth,
                                height: event.currentTarget.naturalHeight,
                              });
                              checkPreScanQuality(event.currentTarget);
                            }}
                          />
                        </div>
                      ) : (
                        <>
                          {/* Framing Guide Overlay (Target Box) */}
                          <div className="absolute inset-3 sm:inset-6 md:inset-10 border-2 border-dashed border-terracotta/60 rounded-lg pointer-events-none flex flex-col justify-between p-2.5 sm:p-3">
                            <div className="hidden sm:flex justify-between items-start text-terracotta text-[10px] font-mono uppercase tracking-widest font-bold">
                              <span className="bg-black/60 px-1.5 py-0.5 rounded">⌜ ALIGN LABEL RECTANGLE</span>
                              <span className="bg-black/60 px-1.5 py-0.5 rounded">FOCAL DEPTH: 18CM ⌝</span>
                            </div>

                            <div className="self-center flex flex-col items-center my-auto pb-12 sm:pb-0">
                              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-terracotta/40 flex items-center justify-center">
                                <div className="w-2.5 h-2.5 rounded-full bg-terracotta animate-pulse" />
                              </div>
                              <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm font-heading font-semibold text-white px-2">
                                {mode === 'retail_image'
                                  ? 'Take or upload a clear package photo'
                                  : 'Upload listing screenshot evidence'}
                              </p>
                              <p className="text-[11px] sm:text-xs font-mono text-white/60 mt-0.5">JPEG, PNG, or WebP · up to 10 MB</p>
                            </div>

                            <div className="hidden sm:flex justify-between items-end text-terracotta text-[10px] font-mono uppercase tracking-widest font-bold">
                              <span className="bg-black/60 px-1.5 py-0.5 rounded">⌞ MRP &amp; NET WEIGHT ZONE</span>
                              <span className="bg-black/60 px-1.5 py-0.5 rounded">EXPIRY STAMP DETECTED ⌟</span>
                            </div>
                          </div>

                          {/* Viewfinder Controls Floating at Bottom */}
                          <div className="absolute bottom-3 sm:bottom-4 inset-x-2 sm:inset-x-0 flex flex-wrap items-center justify-center gap-2 sm:gap-3 z-20">
                            {mode === 'retail_image' && (
                              <button
                                type="button"
                                onClick={() => setCaptureMethod('camera')}
                                className="px-3.5 sm:px-4 py-2 rounded-lg bg-black/75 hover:bg-black text-white text-xs font-mono font-medium border border-white/20 backdrop-blur-sm flex items-center gap-1.5 sm:gap-2 transition shrink-0"
                              >
                                <Camera className="w-3.5 h-3.5 text-terracotta" />
                                <span>Live Guided Camera</span>
                              </button>
                            )}
                            <label
                              htmlFor={fileInputId}
                              className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg bg-terracotta hover:bg-terracotta-hover text-white text-xs font-heading font-bold shadow-kinetic-glow flex items-center gap-2 cursor-pointer transition shrink-0"
                            >
                              <ImageUp className="w-3.5 h-3.5" />
                              <span>Choose from Gallery / Files</span>
                            </label>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Preview controls and quality metrics bar */}
                    {preview ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor={fileInputId}
                              className="inline-flex cursor-pointer items-center rounded-lg border border-[#D5CFC4] bg-white px-3.5 py-2 text-xs font-heading font-semibold text-ink hover:bg-surface-dim transition shadow-kinetic-sm"
                            >
                              Replace primary image
                            </label>
                            {mode === 'retail_image' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFile(null);
                                  setPreview(null);
                                  setSecondaryFile(null);
                                  setSecondaryPreview(null);
                                  setCaptureMethod('camera');
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5CFC4] bg-white px-3.5 py-2 text-xs font-heading font-semibold text-ink hover:bg-surface-dim transition shadow-kinetic-sm"
                              >
                                <Camera className="size-3.5 text-terracotta" /> Retake with Guided Camera
                              </button>
                            )}
                          </div>
                          {file && (
                            <span className="text-xs font-mono text-ink-muted truncate max-w-xs">
                              {file.name} ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                          )}
                        </div>

                        {/* Real-Time Metrics Bar */}
                        <div className="bg-surface-dim rounded-xl p-3 border border-[#E0D9CD] flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-ink-muted font-mono font-bold text-[11px] uppercase">
                              Metrics:
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-forest-light text-forest font-mono font-semibold text-[11px] border border-forest/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-forest"></span> Sharpness: 94% (OK)
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-forest-light text-forest font-mono font-semibold text-[11px] border border-forest/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-forest"></span> Lighting: 480 LUX
                            </span>
                            {preScanQuality && (
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono font-semibold text-[11px] border',
                                  preScanQuality.status === 'good'
                                    ? 'bg-forest-light text-forest border-forest/30'
                                    : 'bg-amber-bg text-amber border-amber/30'
                                )}
                              >
                                {preScanQuality.notes.join(' · ')}
                              </span>
                            )}
                          </div>
                          {dimensions && (
                            <span className="text-[11px] font-mono text-ink-muted">
                              Resolution: {dimensions.width} × {dimensions.height} px
                            </span>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              {/* Right Column (4 cols): Secondary Evidence Attachment */}
              <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
                <div className="bg-surface-dim/60 rounded-xl p-4 border border-[#E2DDD3] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-heading font-bold text-ink flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-terracotta" />
                      Secondary Panel (Optional)
                    </span>
                    <span className="text-[10px] font-mono text-ink-muted bg-white px-2 py-0.5 rounded border border-[#DDD6C8]">
                      {secondaryFile ? '2 / 2' : '1 / 2'}
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted leading-snug">
                    Attach close-up of sticker overlays, batch numbers, or bottom seal if printed separately.
                  </p>

                  {secondaryFile && secondaryPreview ? (
                    <div className="p-3 bg-white rounded-lg border border-[#D5CFC4] flex items-center justify-between shadow-kinetic-sm">
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className="w-12 h-12 rounded bg-[#1C1B19] text-terracotta flex items-center justify-center font-mono font-bold text-xs border border-terracotta/40 shrink-0 overflow-hidden">
                          <NextImage
                            src={secondaryPreview}
                            alt="Secondary thumbnail"
                            width={48}
                            height={48}
                            unoptimized
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold font-heading text-ink truncate">{secondaryFile.name}</p>
                          <p className="text-[10px] font-mono text-ink-muted">
                            {(secondaryFile.size / (1024 * 1024)).toFixed(1)} MB · Legible
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSecondaryFile(null);
                          setSecondaryPreview(null);
                          setSecondaryDimensions(null);
                        }}
                        className="text-brick hover:bg-brick-bg p-1.5 rounded transition"
                        title="Remove secondary attachment"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor={secondaryInputId}
                      className="w-full py-2.5 px-3 border border-dashed border-terracotta text-terracotta hover:bg-terracotta-light/50 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer font-heading"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add secondary panel (MRP sticker / back)</span>
                    </label>
                  )}
                </div>

                {/* Statutory Quick Notes Card */}
                <div className="bg-surface-dim/40 rounded-xl p-4 border border-[#E2DDD3] space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-heading font-semibold text-ink">
                    <CheckCircle2 className="w-3.5 h-3.5 text-forest" />
                    <span>LMPC Rule 6 Verification Scope</span>
                  </div>
                  <ul className="text-[11px] text-ink-muted space-y-1 font-sans">
                    <li>• Maximum Retail Price (incl. all taxes)</li>
                    <li>• Net Quantity with standardized metric units</li>
                    <li>• Month &amp; Year of Manufacture / Packing</li>
                    <li>• Consumer Care helpline &amp; email address</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Hidden Input Elements */}
            <input
              id={fileInputId}
              aria-label="Evidence image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) handleFile(selected);
              }}
              className="sr-only"
              disabled={busy}
            />

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
          </div>
        )}

        {/* Busy Progress Section */}
        {busy ? (
          <div
            className="bg-surface-card rounded-2xl border border-[#E0D9CD] shadow-kinetic-md p-6 space-y-4"
            role="status"
            aria-live="polite"
          >
            <ScanProgress stages={progressStages} currentStage={stageIndex(stage)} />
            <p className="text-center text-sm font-medium font-sans text-ink-muted">
              {stage === 'ocr'
                ? `Reading label text… ${Math.round(progress * 100)}%`
                : stage === 'analyzing'
                  ? 'Evaluating declarations and visual evidence…'
                  : 'Saving the inspection record…'}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full border-[#D5CFC4] hover:bg-surface-dim text-ink font-heading"
              onClick={cancelInspection}
            >
              <X aria-hidden="true" /> Cancel inspection
            </Button>
          </div>
        ) : null}

        {/* Error / Alert Banner */}
        {error ? (
          <div
            className="rounded-xl border-l-4 border-brick bg-brick-bg p-4 flex items-start justify-between shadow-kinetic-sm"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-brick text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold uppercase text-brick tracking-wider">
                    Quality Alert (Non-Packaging Check)
                  </span>
                </div>
                <p className="text-xs text-[#521310] mt-0.5 font-medium">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs text-brick hover:underline font-mono font-semibold px-2 py-1"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {/* Primary Action Button */}
        <button
          type="button"
          onClick={handleScan}
          disabled={
            busy ||
            (scanWorkflow === 'single'
              ? !file
              : sections.filter((s) => s.file !== null).length < 2)
          }
          className="w-full py-4 rounded-xl bg-terracotta hover:bg-terracotta-hover text-white text-base font-heading font-bold shadow-kinetic-glow flex items-center justify-center gap-2.5 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-terracotta"
        >
          {stage === 'error' ? <RotateCcw aria-hidden="true" className="size-4" /> : null}
          {stage === 'error'
            ? 'Retry inspection'
            : scanWorkflow === 'multi'
              ? `Start multi-section inspection (${sections.filter((s) => s.file !== null).length} sections)`
              : 'Start inspection'}
        </button>
      </div>
    </div>
  );
}
