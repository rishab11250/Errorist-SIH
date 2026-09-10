import type {
  ExtractedField,
  ImageMeta,
  OCRWord,
  QualitySummary,
  RulesConfig,
  ScanContext,
  ScanResponse,
  Verdict,
  VisualMetric,
} from './domain';
import { overallStatus, runEngine } from './engine';
import { extractAll } from './extractors/registry';
import type { OCRRunResult } from '../ocr';

export const KNOWN_BRANDS = new Set<string>([
  'sunfeast', 'yippee', 'maggi', 'knorr', 'parle', 'britannia', 'amul', 'cadbury',
  'colgate', 'dettol', 'lifebuoy', 'surf excel', 'ariel', 'rin', 'vim', 'lizol',
  'harpic', 'lays', 'kurkure', 'doritos', 'pringles', 'tropicana', 'real', 'frooti',
  'maaza', 'slice', 'thums up', 'sprite', 'coca-cola', 'coca cola', 'pepsi', 'oreo',
  'good day', 'marie gold', 'bourbon', '5 star', 'dairy milk', 'kitkat', 'munch',
  'perk', 'haldiram', "haldiram's", 'tata', 'nestle', 'dabur', 'marico', 'godrej',
  'patanjali', 'fortune', 'saffola', 'aashirvaad', 'bingo', 'classmate', 'vivel',
  'fiama', 'savlon', 'eveready', 'bikaji', 'mccain', 'mtr', 'everest', 'mdh', 'catch',
]);

export const BRAND_AFFILIATIONS: Record<string, string> = {
  sunfeast: 'itc',
  yippee: 'itc',
  aashirvaad: 'itc',
  bingo: 'itc',
  classmate: 'itc',
  vivel: 'itc',
  fiama: 'itc',
  savlon: 'itc',
  maggi: 'nestle',
  kitkat: 'nestle',
  munch: 'nestle',
  nescafe: 'nestle',
  lays: 'pepsico',
  kurkure: 'pepsico',
  doritos: 'pepsico',
  tropicana: 'pepsico',
  oreo: 'mondelez',
  cadbury: 'mondelez',
  'dairy milk': 'mondelez',
  '5 star': 'mondelez',
  bourbon: 'britannia',
  'good day': 'britannia',
  'marie gold': 'britannia',
  'surf excel': 'hul',
  rin: 'hul',
  vim: 'hul',
  lifebuoy: 'hul',
  dettol: 'reckitt',
  harpic: 'reckitt',
  lizol: 'reckitt',
};

const FSSAI_REGEX = /\b(?:fssai|lic\.?\s*no\.?)[:\s]*([0-9]{14})\b|\b(1[0-9]{13})\b/gi;
const BARCODE_REGEX = /\b([0-9]{8}|[0-9]{12,14})\b/;
const BATCH_REGEX = /\b(?:batch|lot|b\.?\s*no\.?)[:\s]*([a-zA-Z0-9\/-]{4,15})\b/gi;

export interface ProductAnchors {
  brands: string[];
  fssai: string[];
  barcodes: string[];
  batches: string[];
}

export function extractProductAnchors(words: OCRWord[]): ProductAnchors {
  const joined = words.map((w) => w.text).join(' ');
  const lowerText = joined.toLowerCase();

  const detectedBrands = new Set<string>();
  for (const brand of KNOWN_BRANDS) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(lowerText)) {
      detectedBrands.add(brand);
    }
  }

  const fssaiMatches = new Set<string>();
  let match: RegExpExecArray | null;
  const fssaiPattern = new RegExp(FSSAI_REGEX.source, 'gi');
  while ((match = fssaiPattern.exec(joined)) !== null) {
    const lic = match[1] || match[2];
    if (lic && lic.length === 14) {
      fssaiMatches.add(lic);
    }
  }

  const barcodes = new Set<string>();
  for (const w of words) {
    const digits = w.text.replace(/\D/g, '');
    if ((digits.length === 8 || digits.length >= 12 && digits.length <= 14) && BARCODE_REGEX.test(digits)) {
      barcodes.add(digits);
    }
  }

  const batches = new Set<string>();
  const batchPattern = new RegExp(BATCH_REGEX.source, 'gi');
  while ((match = batchPattern.exec(joined)) !== null) {
    const b = match[1].trim();
    if (b.length >= 4 && !/^\d+$/.test(b)) {
      batches.add(b.toUpperCase());
    }
  }

  return {
    brands: Array.from(detectedBrands).sort(),
    fssai: Array.from(fssaiMatches).sort(),
    barcodes: Array.from(barcodes).sort(),
    batches: Array.from(batches).sort(),
  };
}

export function verifyProductConsistency(
  sections: Array<{ words: OCRWord[]; label?: string }>
): { isConsistent: boolean; reason: string | null } {
  if (sections.length <= 1) {
    return { isConsistent: true, reason: null };
  }

  const sectionAnchors = sections.map((s) => ({
    label: s.label || 'Section',
    anchors: extractProductAnchors(s.words),
  }));

  // 1. Check FSSAI conflicts
  const fssaiSecs = sectionAnchors.filter((s) => s.anchors.fssai.length > 0);
  if (fssaiSecs.length > 1) {
    const firstFssai = new Set(fssaiSecs[0].anchors.fssai);
    for (let i = 1; i < fssaiSecs.length; i++) {
      const otherSet = new Set(fssaiSecs[i].anchors.fssai);
      const hasOverlap = Array.from(firstFssai).some((f) => otherSet.has(f));
      if (!hasOverlap) {
        return {
          isConsistent: false,
          reason: `Conflicting FSSAI license numbers detected between ${fssaiSecs[0].label} (${Array.from(firstFssai).join(', ')}) and ${fssaiSecs[i].label} (${Array.from(otherSet).join(', ')}). All captures must belong to the same package.`,
        };
      }
    }
  }

  // 2. Check Barcode conflicts
  const barcodeSecs = sectionAnchors.filter((s) => s.anchors.barcodes.length > 0);
  if (barcodeSecs.length > 1) {
    const firstBarcodes = new Set(barcodeSecs[0].anchors.barcodes);
    for (let i = 1; i < barcodeSecs.length; i++) {
      const otherSet = new Set(barcodeSecs[i].anchors.barcodes);
      const hasOverlap = Array.from(firstBarcodes).some((b) => otherSet.has(b));
      if (!hasOverlap) {
        return {
          isConsistent: false,
          reason: `Conflicting barcodes detected between ${barcodeSecs[0].label} (${Array.from(firstBarcodes).join(', ')}) and ${barcodeSecs[i].label} (${Array.from(otherSet).join(', ')}). All captures must belong to the same package.`,
        };
      }
    }
  }

  // 3. Check Batch number conflicts
  const batchSecs = sectionAnchors.filter((s) => s.anchors.batches.length > 0);
  if (batchSecs.length > 1) {
    const firstBatches = new Set(batchSecs[0].anchors.batches);
    for (let i = 1; i < batchSecs.length; i++) {
      const otherSet = new Set(batchSecs[i].anchors.batches);
      const hasOverlap = Array.from(firstBatches).some((b) => otherSet.has(b));
      if (!hasOverlap) {
        return {
          isConsistent: false,
          reason: `Conflicting batch numbers detected between ${batchSecs[0].label} (${Array.from(firstBatches).join(', ')}) and ${batchSecs[i].label} (${Array.from(otherSet).join(', ')}). All captures must belong to the same package.`,
        };
      }
    }
  }

  // 4. Check Brand conflicts
  const brandSecs = sectionAnchors.filter((s) => s.anchors.brands.length > 0);
  if (brandSecs.length > 1) {
    for (let i = 0; i < brandSecs.length; i++) {
      for (let j = i + 1; j < brandSecs.length; j++) {
        const brandsI = brandSecs[i].anchors.brands;
        const brandsJ = brandSecs[j].anchors.brands;
        const overlap = brandsI.some((b) => brandsJ.includes(b));
        if (overlap) continue;

        const affilsI = new Set(brandsI.map((b) => BRAND_AFFILIATIONS[b] || b));
        const affilsJ = new Set(brandsJ.map((b) => BRAND_AFFILIATIONS[b] || b));
        const affilOverlap = Array.from(affilsI).some((a) => affilsJ.has(a));
        if (!affilOverlap) {
          return {
            isConsistent: false,
            reason: `Incompatible brands detected between ${brandSecs[i].label} ('${brandsI.join(', ')}') and ${brandSecs[j].label} ('${brandsJ.join(', ')}'). All captured sections must belong to the same product.`,
          };
        }
      }
    }
  }

  return { isConsistent: true, reason: null };
}

export interface SectionCaptureData {
  id: string;
  label: string;
  file: File;
  ocr: OCRRunResult;
  quality: QualitySummary;
}

export function computeAverageQuality(qualities: QualitySummary[]): QualitySummary {
  if (qualities.length === 0) {
    return {
      status: 'acceptable',
      score: 100,
      guidance: [],
      metrics: [],
    };
  }

  const avgScore = Math.round(
    qualities.reduce((acc, q) => acc + q.score, 0) / qualities.length
  );

  let worstStatus: QualitySummary['status'] = 'acceptable';
  const statusPrecedence: Record<QualitySummary['status'], number> = {
    unreadable: 4,
    retake_recommended: 3,
    usable_with_warnings: 2,
    acceptable: 1,
  };

  for (const q of qualities) {
    if (statusPrecedence[q.status] > statusPrecedence[worstStatus]) {
      worstStatus = q.status;
    }
  }

  const allGuidance = Array.from(
    new Set(qualities.flatMap((q) => q.guidance || []))
  );

  // Average metric values by metric name
  const metricMap = new Map<string, { sum: number; count: number; unit: string; method: string }>();
  for (const q of qualities) {
    for (const m of q.metrics) {
      const existing = metricMap.get(m.name) || { sum: 0, count: 0, unit: m.unit, method: m.method };
      existing.sum += m.value;
      existing.count += 1;
      metricMap.set(m.name, existing);
    }
  }

  const averagedMetrics: VisualMetric[] = Array.from(metricMap.entries()).map(([name, data]) => ({
    name,
    value: Math.round((data.sum / data.count) * 10) / 10,
    unit: data.unit,
    confidence: 0.95,
    method: data.method,
    evidence_bboxes: [],
  }));

  return {
    status: worstStatus,
    score: avgScore,
    guidance: allGuidance,
    metrics: averagedMetrics,
  };
}

export function fuseMultiSectionExtractions(
  sections: SectionCaptureData[],
  rules: RulesConfig,
  context: ScanContext
): {
  mergedExtracted: Record<string, ExtractedField | null>;
  allWords: OCRWord[];
  fusedVerdicts: Verdict[];
} {
  const allWords: OCRWord[] = [];
  const fieldCandidates: Record<string, ExtractedField[]> = {};

  for (const sec of sections) {
    allWords.push(...sec.ocr.words);
    const meta: ImageMeta = {
      width: sec.ocr.imageWidth,
      height: sec.ocr.imageHeight,
      orientation: 1,
    };
    const extracted = extractAll(sec.ocr.words, meta, context, rules);
    for (const [key, field] of Object.entries(extracted)) {
      if (field && field.value) {
        if (!fieldCandidates[key]) fieldCandidates[key] = [];
        fieldCandidates[key].push(field);
      }
    }
  }

  // For each field, select the candidate with highest confidence / completeness
  const mergedExtracted: Record<string, ExtractedField | null> = {};
  for (const key of Object.keys(rules.checks.map((c) => c.field))) {
    mergedExtracted[key] = null;
  }

  for (const [key, candidates] of Object.entries(fieldCandidates)) {
    if (candidates.length === 1) {
      mergedExtracted[key] = candidates[0];
      continue;
    }

    // If MRP, collect all distinct conflicting prices across all sections
    if (key === 'mrp') {
      const allPrices = new Set<string>();
      for (const c of candidates) {
        if (c.value) allPrices.add(c.value);
        if (c.conflicting_values) {
          c.conflicting_values.forEach((p) => allPrices.add(p));
        }
      }
      const best = candidates.reduce((prev, curr) =>
        curr.confidence > prev.confidence ? curr : prev
      );
      mergedExtracted[key] = {
        ...best,
        conflicting_values: allPrices.size > 1 ? Array.from(allPrices) : [],
      };
      continue;
    }

    // Pick highest confidence candidate
    const best = candidates.reduce((prev, curr) =>
      curr.confidence > prev.confidence ? curr : prev
    );
    mergedExtracted[key] = best;
  }

  const averageQuality = computeAverageQuality(sections.map((s) => s.quality));
  const fusedVerdicts = runEngine(
    { extracted: mergedExtracted, quality: averageQuality },
    rules,
    context
  );

  return {
    mergedExtracted,
    allWords,
    fusedVerdicts,
  };
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
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

export async function createMultiSectionComposite(
  sections: SectionCaptureData[]
): Promise<{
  compositeFile: File;
  compositeOCR: OCRRunResult;
}> {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    process.env.NODE_ENV === 'test' ||
    sections.length === 0
  ) {
    const allWords = sections.flatMap((s) => s.ocr.words);
    return {
      compositeFile: sections[0]?.file || new File([], 'composite.jpg'),
      compositeOCR: {
        words: allWords,
        lines: sections[0]?.ocr.lines || [],
        imageDataUrl: sections[0]?.ocr.imageDataUrl || 'data:image/jpeg;base64,mock',
        imageWidth: sections[0]?.ocr.imageWidth || 1600,
        imageHeight: sections[0]?.ocr.imageHeight || 1200,
      },
    };
  }

  try {
    const images = await Promise.all(sections.map((s) => loadImageElement(s.file)));
    const targetW = Math.max(...images.map((img) => img.naturalWidth || img.width), 1200);

    const headerH = 40;
    const scaledHeights = images.map((img) => {
      const w = img.naturalWidth || img.width || 1200;
      const h = img.naturalHeight || img.height || 800;
      return Math.round(h * (targetW / w));
    });

    const sectionOffsets: number[] = [];
    let currentY = 0;
    for (let i = 0; i < sections.length; i++) {
      currentY += headerH;
      sectionOffsets.push(currentY);
      currentY += scaledHeights[i] + 20;
    }
    const totalH = currentY;

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create canvas context');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, targetW, totalH);

    const remappedWords: OCRWord[] = [];

    for (let i = 0; i < sections.length; i++) {
      const img = images[i];
      const sec = sections[i];
      const offsetY = sectionOffsets[i];
      const h = scaledHeights[i];

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, offsetY - headerH, targetW, headerH);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(sec.label.toUpperCase(), 20, offsetY - headerH + 26);

      ctx.drawImage(img, 0, offsetY, targetW, h);

      for (const w of sec.ocr.words) {
        const [normX, normY, normW, normH] = w.bbox;
        const remappedY = (offsetY + normY * h) / totalH;
        const remappedH = (normH * h) / totalH;
        remappedWords.push({
          text: w.text,
          confidence: w.confidence,
          bbox: [normX, remappedY, normW, remappedH],
        });
      }
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    );
    const compositeFile = new File(
      [blob || new Blob([])],
      `bulk-scan-composite-${Date.now()}.jpg`,
      { type: 'image/jpeg', lastModified: Date.now() }
    );

    return {
      compositeFile,
      compositeOCR: {
        words: remappedWords,
        lines: [],
        imageDataUrl: dataUrl,
        imageWidth: targetW,
        imageHeight: totalH,
      },
    };
  } catch (err) {
    console.warn('Fallback in createMultiSectionComposite:', err);
    return {
      compositeFile: sections[0].file,
      compositeOCR: sections[0].ocr,
    };
  }
}
