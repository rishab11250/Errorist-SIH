'use client';

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ImageUp,
  Layers,
  Plus,
  RotateCcw,
  RotateCw,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import NextImage from 'next/image';
import { useCallback, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ScanProgress } from '@/components/ui/scan-progress';
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
    description: 'Straight-on physical photo; supports camera framing & secondary panel.',
  },
  {
    value: 'ecommerce_listing',
    title: 'E-commerce screenshot',
    description: 'Saved digital catalog screenshot or e-commerce listing graphic.',
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
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function createCompositeEvidenceFile(file1: File, file2: File): Promise<File> {
  try {
    const [img1, img2] = await Promise.all([loadImage(file1), loadImage(file2)]);
    const targetW = Math.max(img1.naturalWidth || img1.width, img2.naturalWidth || img2.width);
    const scale1 = targetW / (img1.naturalWidth || img1.width);
    const scale2 = targetW / (img2.naturalWidth || img2.width);
    const h1 = (img1.naturalHeight || img1.height) * scale1;
    const h2 = (img2.naturalHeight || img2.height) * scale2;
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = Math.round(h1 + h2 + 20);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file1;

    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img1, 0, 0, targetW, h1);
    ctx.drawImage(img2, 0, h1 + 20, targetW, h2);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.90)
    );
    if (!blob) return file1;
    return new File([blob], file1.name.replace(/\.[^.]+$/, '.jpg'), {
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

    ctx.drawImage(img, 0, 0, targetW, targetH);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type || 'image/jpeg', 0.90)
    );
    if (!blob) return file;

    return new File([blob], file.name, {
      type: file.type || 'image/jpeg',
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
  const [captureMethod, setCaptureMethod] = useState<'camera' | 'upload'>('upload');
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
  const [showSettings, setShowSettings] = useState(true);

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

  const removeSectionSlot = useCallback((index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addCustomSection = useCallback(() => {
    const nextIdx = sections.length + 1;
    setSections((prev) => [
      ...prev,
      {
        id: `sec-${Date.now()}`,
        label: `${nextIdx}. Extra Package Panel / Flap`,
        file: null,
        preview: null,
        dimensions: null,
        preScanQuality: null,
      },
    ]);
  }, [sections.length]);

  const checkPreScanQuality = useCallback((img: HTMLImageElement) => {
    try {
      const canvas = document.createElement('canvas');
      const w = Math.min(img.naturalWidth || img.width, 200);
      const h = Math.min(img.naturalHeight || img.height, 200);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let totalBrightness = 0;
      let minBrightness = 255;
      let maxBrightness = 0;
      const pixelCount = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const br = 0.299 * r + 0.587 * g + 0.114 * b;
        totalBrightness += br;
        if (br < minBrightness) minBrightness = br;
        if (br > maxBrightness) maxBrightness = br;
      }
      const avgBrightness = totalBrightness / pixelCount;
      const contrast = maxBrightness - minBrightness;

      const notes: string[] = [];
      if (avgBrightness < 40) notes.push('Low light: Ensure adequate lighting');
      if (avgBrightness > 220) notes.push('Overexposed: Reduce glare');
      if (contrast < 50) notes.push('Low contrast: Text may be hard to distinguish');
      if ((img.naturalWidth || img.width) < 600) notes.push('Low resolution: Move closer');

      setPreScanQuality({
        status: notes.length === 0 ? 'good' : 'warning',
        notes: notes.length === 0 ? ['Optimal exposure & sharpness'] : notes,
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

  const handleRotateImage = useCallback(async () => {
    if (!file || !preview) return;
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = preview;
      });
      const rotCanvas = document.createElement('canvas');
      rotCanvas.width = img.naturalHeight || img.height;
      rotCanvas.height = img.naturalWidth || img.width;
      const ctx = rotCanvas.getContext('2d');
      if (!ctx) return;
      ctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
      ctx.rotate((90 * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const rotatedBlob = await new Promise<Blob | null>((resolve) =>
        rotCanvas.toBlob(resolve, file.type || 'image/jpeg', 0.92)
      );
      if (rotatedBlob) {
        const rotatedFile = new File([rotatedBlob], file.name, {
          type: file.type || 'image/jpeg',
          lastModified: Date.now(),
        });
        setFile(rotatedFile);
        const newPreview = rotCanvas.toDataURL('image/jpeg', 0.92);
        setPreview(newPreview);
        setDimensions({ width: rotCanvas.width, height: rotCanvas.height });
      }
    } catch (err) {
      console.error('[InspectionCapture] Failed to rotate image:', err);
    }
  }, [file, preview]);

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

  const cancelInspection = useCallback(() => {
    operationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
    setProgress(0);
    setStage('error');
    setError('Inspection canceled. Your selected image is still available to retry.');
  }, []);

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
        console.warn('[InspectionCapture] Low statutory anchor count detected. Proceeding to inspection analysis with unblocked review.');
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

  const hasActiveImage = !!file || !!preview;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
      {/* Studio Header & Workflow Selector */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#EBE5DB] pb-6">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-kinetic-terracotta mb-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-kinetic-terracotta" />
            Inspection Studio // LMPC Rules 2011
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-kinetic-charcoal">
            New Package Inspection
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-kinetic-textMuted max-w-xl">
            Capture or upload packaged commodity labels for automated Legal Metrology compliance checks.
          </p>
        </div>

        {/* Workflow Segmented Pill Switcher */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex items-center p-1 rounded-kinetic-sm bg-[#F0ECE1] border border-[#E0D9CD]">
            <button
              type="button"
              onClick={() => {
                setScanWorkflow('single');
                setError(null);
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-semibold font-mono transition-all',
                scanWorkflow === 'single'
                  ? 'bg-white text-kinetic-charcoal shadow-sm'
                  : 'text-kinetic-textMuted hover:text-kinetic-charcoal'
              )}
            >
              <Camera className="size-3.5 text-kinetic-terracotta" />
              <span>Standard Scan</span>
              <span className="hidden sm:inline text-[10px] text-kinetic-textMuted font-normal">(Single/Dual)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setScanWorkflow('multi');
                setError(null);
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-semibold font-mono transition-all',
                scanWorkflow === 'multi'
                  ? 'bg-white text-kinetic-charcoal shadow-sm'
                  : 'text-kinetic-textMuted hover:text-kinetic-charcoal'
              )}
            >
              <Layers className="size-3.5 text-kinetic-terracotta" />
              <span>Multi-Section</span>
              <span className="hidden sm:inline text-[10px] text-kinetic-textMuted font-normal">(Bulk/Tall)</span>
            </button>
          </div>

          {hasActiveImage && (
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
              className="p-2 rounded-kinetic-sm border border-[#DDD6C8] bg-white text-kinetic-charcoal hover:bg-[#FAF8F3] transition shadow-sm"
              title="Reset image and start over"
            >
              <RotateCcw className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Studio Area */}
      {scanWorkflow === 'multi' ? (
        /* Multi-Section Workspace */
        <div className="space-y-6 rounded-kinetic border border-[#EBE5DB] bg-white p-5 sm:p-7 shadow-sm">
          <div className="rounded-kinetic-sm border border-kinetic-terracotta/30 bg-[#FAF8F3] p-4 text-xs leading-relaxed text-kinetic-textMuted space-y-1">
            <div className="flex items-center gap-2 font-bold font-mono text-kinetic-terracotta uppercase tracking-wider text-xs">
              <Layers className="size-4" /> Multi-Section Bulk Scanner
            </div>
            <p>
              Capture individual close-ups for tall, cylindrical, or multi-panel packages. All sections are verified for consistency and fused into a single audit record.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {sections.map((slot, index) => {
              const slotInputId = `section-slot-input-${slot.id}`;
              return (
                <div
                  key={slot.id}
                  className="relative rounded-kinetic-sm border border-[#EBE5DB] bg-[#FAF8F3] p-4 space-y-3 transition hover:border-kinetic-terracotta/50 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-kinetic-charcoal truncate">
                      {slot.label}
                    </span>
                    {sections.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeSectionSlot(index)}
                        className="text-kinetic-textMuted hover:text-rose-600 p-1 rounded transition"
                        title="Remove slot"
                        disabled={busy}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>

                  {slot.preview ? (
                    <div className="space-y-2 rounded-lg border border-[#EBE5DB] bg-neutral-950 p-2.5">
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
                      <div className="flex items-center justify-between text-[11px] font-mono text-white/80 pt-1">
                        <span className="truncate max-w-[180px]">{slot.file?.name}</span>
                        <button
                          type="button"
                          onClick={() => removeSectionFile(index)}
                          className="text-rose-400 hover:underline flex items-center gap-1 font-semibold"
                          disabled={busy}
                        >
                          <X className="size-3" /> Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed border-[#D5CFC4] rounded-lg p-5 text-center space-y-2 bg-white">
                      <Camera className="size-6 mx-auto text-kinetic-textMuted/60" />
                      <p className="text-xs text-kinetic-textMuted font-mono">Upload panel photo</p>
                      <label
                        htmlFor={slotInputId}
                        className="inline-flex cursor-pointer items-center justify-center rounded-kinetic-sm bg-kinetic-terracotta px-3 py-1.5 text-xs font-mono font-semibold text-white hover:bg-kinetic-terracottaHover transition shadow-sm"
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
              className="w-full py-2.5 px-3 border border-dashed border-kinetic-terracotta/60 text-kinetic-terracotta hover:bg-[#FAF8F3] rounded-kinetic-sm text-xs font-mono font-semibold flex items-center justify-center gap-2 transition"
              disabled={busy}
            >
              <Plus className="size-4" /> Add Another Package Section Slot
            </button>
          )}
        </div>
      ) : (
        /* Standard Inspection Studio */
        <div className="space-y-5">
          {/* Main Hero Viewport */}
          <div className="rounded-kinetic border border-[#EBE5DB] bg-white p-4 sm:p-6 shadow-sm">
            {mode === 'retail_image' && !hasActiveImage && captureMethod === 'camera' ? (
              <div className="space-y-4">
                <CameraCaptureGuide
                  onCapture={handleFile}
                  disabled={busy}
                  onSwitchToUpload={() => setCaptureMethod('upload')}
                />
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setCaptureMethod('upload')}
                    className="text-xs text-kinetic-textMuted underline hover:text-kinetic-charcoal font-mono inline-flex items-center gap-1.5"
                  >
                    <ImageUp className="size-3.5 text-kinetic-terracotta" /> Prefer uploading a photo? Switch to gallery upload
                  </button>
                </div>
              </div>
            ) : hasActiveImage && preview ? (
              /* Photo Preview Active */
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Primary & Secondary Previews */}
                  <div className={cn('space-y-3', secondaryPreview ? 'lg:col-span-8' : 'lg:col-span-8')}>
                    <div className="relative overflow-hidden rounded-xl bg-neutral-950 p-3 sm:p-4 border border-neutral-800 shadow-inner flex flex-col items-center justify-center min-h-[300px]">
                      {secondaryPreview ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                          <div className="flex flex-col items-center bg-black/60 rounded-lg p-2 border border-white/10">
                            <span className="text-[10px] font-mono text-kinetic-terracotta uppercase font-bold mb-1">
                              Panel 1 · Primary
                            </span>
                            <NextImage
                              src={preview}
                              alt="Selected evidence preview"
                              width={dimensions?.width ?? 1600}
                              height={dimensions?.height ?? 900}
                              unoptimized
                              className="max-h-52 rounded object-contain shadow-md"
                            />
                            <p className="truncate text-[10px] font-mono text-white/70 mt-1">{file?.name}</p>
                          </div>
                          <div className="flex flex-col items-center bg-black/60 rounded-lg p-2 border border-white/10 relative">
                            <button
                              type="button"
                              onClick={() => {
                                setSecondaryFile(null);
                                setSecondaryPreview(null);
                                setSecondaryDimensions(null);
                              }}
                              className="absolute top-1.5 right-1.5 p-1 text-white/60 hover:text-rose-400 transition"
                              title="Remove secondary panel"
                            >
                              <X className="size-4" />
                            </button>
                            <span className="text-[10px] font-mono text-kinetic-terracotta uppercase font-bold mb-1">
                              Panel 2 · Secondary
                            </span>
                            <NextImage
                              src={secondaryPreview}
                              alt="Secondary evidence preview"
                              width={secondaryDimensions?.width ?? 1600}
                              height={secondaryDimensions?.height ?? 900}
                              unoptimized
                              className="max-h-52 rounded object-contain shadow-md"
                            />
                            <p className="truncate text-[10px] font-mono text-white/70 mt-1">{secondaryFile?.name}</p>
                          </div>
                        </div>
                      ) : (
                        <NextImage
                          src={preview}
                          alt="Selected evidence preview"
                          width={dimensions?.width ?? 1600}
                          height={dimensions?.height ?? 900}
                          unoptimized
                          className="max-h-[360px] rounded-lg object-contain shadow-md"
                          onLoad={(event) => {
                            setDimensions({
                              width: event.currentTarget.naturalWidth,
                              height: event.currentTarget.naturalHeight,
                            });
                            checkPreScanQuality(event.currentTarget);
                          }}
                        />
                      )}
                    </div>

                    {/* Image Action Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <label
                          htmlFor={fileInputId}
                          className="cursor-pointer inline-flex items-center gap-1.5 rounded-kinetic-sm border border-[#DDD6C8] bg-white px-3 py-1.5 text-xs font-mono font-semibold text-kinetic-charcoal hover:bg-[#FAF8F3] transition shadow-sm"
                        >
                          <Upload className="size-3.5 text-kinetic-terracotta" />
                          <span>Replace primary image</span>
                        </label>
                        <button
                          type="button"
                          onClick={handleRotateImage}
                          className="inline-flex items-center gap-1.5 rounded-kinetic-sm border border-[#DDD6C8] bg-white px-3 py-1.5 text-xs font-mono font-semibold text-kinetic-charcoal hover:bg-[#FAF8F3] transition shadow-sm"
                        >
                          <RotateCw className="size-3.5 text-kinetic-terracotta" />
                          <span>Rotate 90°</span>
                        </button>
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
                            className="inline-flex items-center gap-1.5 rounded-kinetic-sm border border-[#DDD6C8] bg-white px-3 py-1.5 text-xs font-mono font-semibold text-kinetic-charcoal hover:bg-[#FAF8F3] transition shadow-sm"
                          >
                            <Camera className="size-3.5 text-kinetic-terracotta" />
                            <span>Retake photo</span>
                          </button>
                        )}
                      </div>

                      {file && (
                        <span className="text-[11px] font-mono text-kinetic-textMuted truncate max-w-xs">
                          {file.name} ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Secondary Panel & Statutory Scope Card */}
                  <div className="lg:col-span-4 space-y-3">
                    {/* Secondary Attachment Slot */}
                    <div className="rounded-kinetic-sm border border-[#EBE5DB] bg-[#FAF8F3] p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold uppercase tracking-wider text-kinetic-charcoal flex items-center gap-1.5">
                          <Plus className="size-3.5 text-kinetic-terracotta" />
                          Secondary Panel (Optional)
                        </span>
                        <span className="text-[10px] font-mono text-kinetic-textMuted bg-white px-2 py-0.5 rounded border border-[#E0D9CD]">
                          {secondaryFile ? '2/2 attached' : '1/2 attached'}
                        </span>
                      </div>
                      <p className="text-[11px] text-kinetic-textMuted leading-relaxed">
                        Add a close-up of separate MRP stickers, bottom seals, or batch info.
                      </p>

                      {secondaryFile && secondaryPreview ? (
                        <div className="p-2.5 bg-white rounded-lg border border-[#DDD6C8] flex items-center justify-between shadow-sm">
                          <div className="flex items-center space-x-2.5 overflow-hidden">
                            <div className="size-10 rounded bg-neutral-900 overflow-hidden shrink-0">
                              <NextImage
                                src={secondaryPreview}
                                alt="Secondary thumbnail"
                                width={40}
                                height={40}
                                unoptimized
                                className="size-full object-cover"
                              />
                            </div>
                            <div className="overflow-hidden">
                              <p className="text-xs font-bold text-kinetic-charcoal truncate">{secondaryFile.name}</p>
                              <p className="text-[10px] font-mono text-kinetic-textMuted">
                                {(secondaryFile.size / (1024 * 1024)).toFixed(1)} MB
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
                            className="text-kinetic-textMuted hover:text-rose-600 p-1 rounded"
                            title="Remove secondary image"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor={secondaryInputId}
                          className="w-full py-2 px-3 border border-dashed border-kinetic-terracotta text-kinetic-terracotta hover:bg-white rounded-kinetic-sm text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                          <Plus className="size-3.5" />
                          <span>+ Add secondary panel (MRP sticker / back)</span>
                        </label>
                      )}
                    </div>

                    {/* Pre-Scan Quality Badge */}
                    <div className="rounded-kinetic-sm border border-[#EBE5DB] bg-white p-3 space-y-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-kinetic-textMuted">
                        Pre-Scan Quality Assessment
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-mono font-semibold border border-emerald-200">
                          <span className="size-1.5 rounded-full bg-emerald-500" /> Sharpness &amp; Exposure OK
                        </span>
                        {dimensions && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F5F2EA] text-kinetic-charcoal text-[10px] font-mono border border-[#E0D9CD]">
                            {dimensions.width} × {dimensions.height} px
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Dropzone Hero (No Photo Selected) */
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={cn(
                  'relative w-full rounded-xl border-2 border-dashed p-8 sm:p-12 text-center transition-all flex flex-col items-center justify-center space-y-4',
                  isDragging
                    ? 'border-kinetic-terracotta bg-[#FAF8F3] ring-4 ring-kinetic-terracotta/20 scale-[1.005]'
                    : 'border-[#D5CFC4] bg-[#FAF8F3]/60 hover:border-kinetic-terracotta/60'
                )}
              >
                <div className="size-14 rounded-full bg-[#EBE5DB] flex items-center justify-center text-kinetic-terracotta shadow-sm">
                  <Upload className="size-7" />
                </div>

                <div className="space-y-1 max-w-md">
                  <h3 className="font-display text-base sm:text-lg font-bold text-kinetic-charcoal">
                    {mode === 'retail_image'
                      ? 'Upload or photograph product packaging'
                      : 'Upload listing screenshot evidence'}
                  </h3>
                  <p className="text-xs text-kinetic-textMuted font-mono">
                    Drag and drop your image here, or choose an option below
                  </p>
                  <p className="text-[11px] font-mono text-kinetic-textMuted/80">
                    Supports JPEG, PNG, or WebP · Up to 10 MB
                  </p>
                </div>

                {/* Main Capture Action Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <label
                    htmlFor={fileInputId}
                    className="cursor-pointer inline-flex items-center gap-2 rounded-kinetic-sm bg-kinetic-terracotta px-5 py-2.5 text-xs font-mono font-semibold text-white hover:bg-kinetic-terracottaHover transition shadow-sm"
                  >
                    <ImageUp className="size-4" />
                    <span>Choose from Gallery / Files</span>
                  </label>

                  {mode === 'retail_image' && (
                    <button
                      type="button"
                      onClick={() => setCaptureMethod('camera')}
                      className="inline-flex items-center gap-2 rounded-kinetic-sm border border-[#DDD6C8] bg-white px-4 py-2.5 text-xs font-mono font-semibold text-kinetic-charcoal hover:bg-[#FAF8F3] transition shadow-sm"
                    >
                      <Camera className="size-4 text-kinetic-terracotta" />
                      <span>Use Live Camera</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Hidden File Inputs */}
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

          {/* Collapsible Inspection Configuration Group */}
          <div className="rounded-kinetic border border-[#EBE5DB] bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              className="w-full flex items-center justify-between text-left font-mono text-xs font-semibold uppercase tracking-wider text-kinetic-charcoal"
            >
              <span className="flex items-center gap-2">
                <Settings2 className="size-4 text-kinetic-terracotta" />
                <span>Inspection Parameters &amp; Metadata</span>
              </span>
              <div className="flex items-center gap-2 text-kinetic-textMuted text-[11px] font-normal lowercase">
                <span className="hidden sm:inline">
                  {mode === 'retail_image' ? 'retail photo' : 'e-comm screenshot'} · {ocrLanguage === 'eng' ? 'EN' : 'EN+HI'}
                </span>
                <ChevronDown className={cn('size-4 transition-transform', showSettings ? 'rotate-180' : '')} />
              </div>
            </button>

            {showSettings && (
              <div className="mt-4 pt-4 border-t border-[#EBE5DB] grid gap-4 sm:grid-cols-3">
                {/* 1. Evidence Source Channel */}
                <div role="group" aria-labelledby="evidence-source-heading" className="space-y-2">
                  <span id="evidence-source-heading" className="block text-[11px] font-mono font-bold uppercase text-kinetic-textMuted">
                    Evidence Source
                  </span>
                  <div className="space-y-2">
                    {modes.map((item) => (
                      <label
                        key={item.value}
                        className={cn(
                          'cursor-pointer flex items-start gap-2.5 p-2.5 rounded-kinetic-sm border text-xs transition',
                          mode === item.value
                            ? 'border-kinetic-terracotta bg-[#FAF8F3] font-semibold text-kinetic-charcoal'
                            : 'border-[#EBE5DB] bg-white text-kinetic-textMuted hover:bg-[#FAF8F3]'
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
                          className="mt-0.5"
                        />
                        <div className="space-y-0.5">
                          <span className="block font-bold">{item.title}</span>
                          <span className="block text-[10px] text-kinetic-textMuted leading-tight">{item.description}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 2. OCR Engine Language Model */}
                <div className="space-y-2">
                  <span className="block text-[11px] font-mono font-bold uppercase text-kinetic-textMuted">
                    OCR Language Model
                  </span>
                  <div className="space-y-2">
                    <div className="flex p-1 bg-[#F0ECE1] rounded-kinetic-sm border border-[#E0D9CD]">
                      <button
                        type="button"
                        onClick={() => setOcrLanguage('eng')}
                        disabled={busy}
                        className={cn(
                          'flex-1 py-1.5 px-2 rounded-[5px] text-xs font-mono font-semibold transition',
                          ocrLanguage === 'eng'
                            ? 'bg-white text-kinetic-charcoal shadow-sm'
                            : 'text-kinetic-textMuted hover:text-kinetic-charcoal'
                        )}
                      >
                        English Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setOcrLanguage('multi')}
                        disabled={busy}
                        className={cn(
                          'flex-1 py-1.5 px-2 rounded-[5px] text-xs font-mono font-semibold transition',
                          ocrLanguage === 'multi'
                            ? 'bg-white text-kinetic-charcoal shadow-sm'
                            : 'text-kinetic-textMuted hover:text-kinetic-charcoal'
                        )}
                      >
                        English + Hindi
                      </button>
                    </div>
                    <div className="p-2 rounded-kinetic-sm bg-[#FAF8F3] border border-[#EBE5DB] text-[11px] font-mono text-kinetic-textMuted flex items-center justify-between">
                      {ocrLanguage === 'eng' ? (
                        <>
                          <span className="font-semibold text-kinetic-charcoal">⚡ 2.5x Faster</span>
                          <span className="text-[10px] text-kinetic-textMuted">Latin model</span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-kinetic-charcoal">🇮🇳 Bilingual (EN + HI)</span>
                          <span className="text-[10px] text-kinetic-textMuted">Devanagari model</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Product Metadata */}
                <div className="space-y-2">
                  <span className="block text-[11px] font-mono font-bold uppercase text-kinetic-textMuted">
                    Product Metadata
                  </span>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[10px] font-mono text-kinetic-textMuted mb-1">Category</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as ScanContext['category'])}
                        disabled={busy}
                        className="w-full text-xs font-mono bg-[#FAF8F3] border border-[#DDD6C8] rounded-kinetic-sm px-2.5 py-1.5 focus:outline-none focus:border-kinetic-terracotta"
                      >
                        <option value="unknown">General / Standard</option>
                        <option value="food">Food &amp; Confectionery</option>
                        <option value="non_food">Non-food Commodities</option>
                        <option value="cosmetics">Cosmetics &amp; Personal Care</option>
                        <option value="seeds">Seeds &amp; Agricultural</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-kinetic-textMuted mb-1">Origin Status</label>
                      <select
                        value={imported === null ? 'unknown' : imported ? 'imported' : 'domestic'}
                        onChange={(e) =>
                          setImported(e.target.value === 'unknown' ? null : e.target.value === 'imported')
                        }
                        disabled={busy}
                        className="w-full text-xs font-mono bg-[#FAF8F3] border border-[#DDD6C8] rounded-kinetic-sm px-2.5 py-1.5 focus:outline-none focus:border-kinetic-terracotta"
                      >
                        <option value="unknown">Not sure</option>
                        <option value="domestic">Domestic (Made in India)</option>
                        <option value="imported">Imported (Country of Origin required)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Busy Progress Indicator */}
      {busy && (
        <div
          className="rounded-kinetic border border-[#EBE5DB] bg-white p-6 shadow-sm space-y-4"
          role="status"
          aria-live="polite"
        >
          <ScanProgress stages={progressStages} currentStage={stageIndex(stage)} />
          <p className="text-center text-xs font-mono font-semibold text-kinetic-textMuted">
            {stage === 'ocr' || stage === 'reading' || stage === 'ready'
              ? `Reading label text… ${Math.round(progress * 100)}%`
              : stage === 'analyzing'
                ? 'Evaluating statutory declarations and rule logic…'
                : 'Saving inspection record…'}
          </p>
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="font-mono text-xs border-[#DDD6C8]"
              onClick={cancelInspection}
            >
              <X className="size-3.5 mr-1" /> Cancel inspection
            </Button>
          </div>
        </div>
      )}

      {/* Error & Alert Banner */}
      {error && (
        <div
          className="rounded-kinetic-sm border border-rose-200 bg-rose-50 p-4 flex items-start justify-between shadow-sm"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-mono font-bold uppercase text-rose-800">Inspection Alert</p>
              <p className="text-xs font-medium text-rose-700">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs font-mono font-semibold text-rose-700 hover:underline px-2"
          >
            Dismiss
          </button>
        </div>
      )}

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
        className="w-full py-4 rounded-kinetic-sm bg-kinetic-terracotta hover:bg-kinetic-terracottaHover text-white text-sm font-mono font-bold shadow-sm flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {stage === 'error' ? <RotateCcw aria-hidden="true" className="size-4" /> : null}
        {stage === 'error'
          ? 'Retry inspection'
          : scanWorkflow === 'multi'
            ? `Start multi-section inspection (${sections.filter((s) => s.file !== null).length} sections)`
            : 'Start inspection'}
      </button>
    </div>
  );
}
