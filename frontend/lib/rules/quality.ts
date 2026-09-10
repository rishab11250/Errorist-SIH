import type { BoundingBox, OCRWord, QualitySummary, VisualMetric } from './domain';

export const QUALITY_THRESHOLDS = {
  sharpness_warn: 80.0,
  sharpness_retake: 35.0,
  contrast_warn: 30.0,
  contrast_retake: 15.0,
  glare_warn_fraction: 0.08,
  glare_retake_fraction: 0.18,
  skew_warn_degrees: 8.0,
  skew_retake_degrees: 18.0,
  ocr_confidence_median_retake: 60.0,
  ocr_confidence_median_warn: 70.0,
  ocr_confidence_lower_quartile_retake: 35.0,
} as const;

export const GUIDANCE: Record<string, string> = {
  sharpness: 'Hold the camera steady and tap to focus on the declaration panel.',
  contrast: 'Use even lighting so the declaration text stands out from its background.',
  glare: 'Tilt the package or light source to remove reflections from the label.',
  skew: 'Position the camera parallel to the declaration panel.',
  ocr_confidence:
    'Hold the camera closer and steady so the printed text is sharp and legible.',
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round4(val: number): number {
  return Math.round(val * 10000) / 10000;
}

export function buildMetric(
  name: string,
  value: number,
  unit: string,
  method: string,
  confidence = 1.0,
  evidence_bboxes: BoundingBox[] = []
): VisualMetric {
  return {
    name,
    value: round4(clamp(value, 0.0, 100.0)),
    unit,
    confidence: round4(clamp(confidence, 0.0, 1.0)),
    method,
    evidence_bboxes,
  };
}

/**
 * Computes median and lower quartile (25th percentile) of OCR word confidence.
 * Exact mirror of Python `_confidence_distribution` in quality.py:
 * values = sorted(float(np.clip(word.confidence, 0.0, 1.0)) for word in words)
 * median = float(np.median(values))
 * lower_quartile = values[int((len(values) - 1) * 0.25)]
 */
export function computeConfidenceDistribution(
  words: OCRWord[]
): { median: number; lowerQuartile: number } {
  if (words.length === 0) {
    return { median: 0.0, lowerQuartile: 0.0 };
  }
  const values = words
    .map((w) => clamp(w.confidence, 0.0, 1.0))
    .sort((a, b) => a - b);

  const n = values.length;
  let median: number;
  if (n % 2 === 1) {
    median = values[Math.floor(n / 2)];
  } else {
    median = (values[n / 2 - 1] + values[n / 2]) / 2.0;
  }
  const lqIndex = Math.floor((n - 1) * 0.25);
  const lowerQuartile = values[lqIndex];

  return {
    median: median * 100.0,
    lowerQuartile: lowerQuartile * 100.0,
  };
}

/**
 * Union area of normalized bounding boxes (range 0..1).
 * Mirrors Python `_union_area(_clamped_boxes(words))` in quality.py.
 */
export function computeTextCoverage(words: OCRWord[]): number {
  const boxes: Array<[number, number, number, number]> = [];
  for (const w of words) {
    const [x, y, width, height] = w.bbox;
    const left = clamp(x, 0.0, 1.0);
    const top = clamp(y, 0.0, 1.0);
    const right = clamp(x + Math.max(width, 0.0), 0.0, 1.0);
    const bottom = clamp(y + Math.max(height, 0.0), 0.0, 1.0);
    if (right > left && bottom > top) {
      boxes.push([left, top, right, bottom]);
    }
  }

  if (boxes.length === 0) {
    return 0.0;
  }

  const xPointsSet = new Set<number>();
  for (const b of boxes) {
    xPointsSet.add(b[0]);
    xPointsSet.add(b[2]);
  }
  const xPoints = Array.from(xPointsSet).sort((a, b) => a - b);

  let totalArea = 0.0;
  for (let i = 0; i < xPoints.length - 1; i++) {
    const left = xPoints[i];
    const right = xPoints[i + 1];
    if (right <= left) continue;

    const intervals: Array<[number, number]> = [];
    for (const [bLeft, bTop, bRight, bBottom] of boxes) {
      if (bLeft < right && bRight > left) {
        intervals.push([bTop, bBottom]);
      }
    }
    if (intervals.length === 0) continue;

    intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    let mergedHeight = 0.0;
    let currentTop = intervals[0][0];
    let currentBottom = intervals[0][1];

    for (let j = 1; j < intervals.length; j++) {
      const [top, bottom] = intervals[j];
      if (top <= currentBottom) {
        currentBottom = Math.max(currentBottom, bottom);
      } else {
        mergedHeight += currentBottom - currentTop;
        currentTop = top;
        currentBottom = bottom;
      }
    }
    mergedHeight += currentBottom - currentTop;
    totalArea += (right - left) * mergedHeight;
  }

  return totalArea * 100.0;
}

export interface ClientQualityInput {
  sharpness?: number;
  contrast?: number;
  glareFraction?: number;
  skewDegrees?: number;
  perspectiveScore?: number;
}

/**
 * Deterministic quality gate and scoring.
 * Faithfully ports Python `analyze_quality` from backend/app/visual_analysis/quality.py,
 * including the OCR confidence thresholds (median < 60, lower_quartile < 35) and guidance.
 */
export function assessQuality(
  words: OCRWord[],
  measurements?: ClientQualityInput
): QualitySummary {
  const sharpness = measurements?.sharpness ?? 85.0;
  const contrast = measurements?.contrast ?? 50.0;
  const rawGlare = measurements?.glareFraction ?? 0.0;
  const skew = measurements?.skewDegrees ?? 0.0;
  const perspective = measurements?.perspectiveScore ?? 0.0;

  const coverage = computeTextCoverage(words);
  const { median: confidenceMedian, lowerQuartile: confidenceLowerQuartile } =
    computeConfidenceDistribution(words);

  const isCleanDocument = sharpness >= 80.0 && confidenceMedian >= 80.0;
  const effectiveGlare = isCleanDocument ? 0.0 : rawGlare;

  const metrics: VisualMetric[] = [
    buildMetric('sharpness', sharpness, 'score', 'laplacian_variance'),
    buildMetric('contrast', contrast, 'score', 'grayscale_standard_deviation'),
    buildMetric('glare', effectiveGlare * 100.0, 'percent', 'bright_pixel_fraction'),
    buildMetric('skew', skew, 'degrees', 'minimum_area_rectangle', 1.0),
    buildMetric(
      'perspective',
      perspective,
      'score',
      'quadrilateral_rectangularity',
      1.0
    ),
    buildMetric('text_coverage', coverage, 'percent', 'ocr_bbox_union'),
    buildMetric(
      'ocr_confidence_distribution',
      confidenceMedian,
      'percent',
      'median'
    ),
    buildMetric(
      'ocr_confidence_lower_quartile',
      confidenceLowerQuartile,
      'percent',
      'lower_quartile'
    ),
  ];

  const retakeFailures: string[] = [];
  const warningFailures: string[] = [];

  if (sharpness < QUALITY_THRESHOLDS.sharpness_retake) {
    retakeFailures.push('sharpness');
  } else if (sharpness < QUALITY_THRESHOLDS.sharpness_warn) {
    warningFailures.push('sharpness');
  }

  if (contrast < QUALITY_THRESHOLDS.contrast_retake) {
    retakeFailures.push('contrast');
  } else if (contrast < QUALITY_THRESHOLDS.contrast_warn) {
    warningFailures.push('contrast');
  }

  if (effectiveGlare > QUALITY_THRESHOLDS.glare_retake_fraction) {
    retakeFailures.push('glare');
  } else if (effectiveGlare > QUALITY_THRESHOLDS.glare_warn_fraction) {
    warningFailures.push('glare');
  }

  if (skew > QUALITY_THRESHOLDS.skew_retake_degrees) {
    retakeFailures.push('skew');
  } else if (skew > QUALITY_THRESHOLDS.skew_warn_degrees) {
    warningFailures.push('skew');
  }

  if (words.length > 0) {
    if (
      confidenceMedian < QUALITY_THRESHOLDS.ocr_confidence_median_retake ||
      confidenceLowerQuartile <
        QUALITY_THRESHOLDS.ocr_confidence_lower_quartile_retake
    ) {
      retakeFailures.push('ocr_confidence');
    } else if (confidenceMedian < QUALITY_THRESHOLDS.ocr_confidence_median_warn) {
      warningFailures.push('ocr_confidence');
    }
  }

  let status: QualitySummary['status'];
  if (retakeFailures.includes('sharpness') && retakeFailures.includes('contrast')) {
    status = 'unreadable';
  } else if (retakeFailures.length > 0) {
    status = 'retake_recommended';
  } else if (warningFailures.length > 0) {
    status = 'usable_with_warnings';
  } else {
    status = 'acceptable';
  }

  const glareQuality = 100.0 - effectiveGlare * 100.0;
  const skewQuality = Math.max(0.0, 100.0 - (skew / 45.0) * 100.0);
  const score =
    0.35 * sharpness +
    0.25 * contrast +
    0.15 * glareQuality +
    0.15 * skewQuality +
    0.1 * perspective;

  const failedMetrics = Array.from(
    new Set([...retakeFailures, ...warningFailures])
  );
  const guidance = failedMetrics
    .map((name) => GUIDANCE[name])
    .filter(Boolean);

  return {
    status,
    score: Math.round(clamp(score, 0.0, 100.0) * 100) / 100,
    metrics,
    guidance,
  };
}
