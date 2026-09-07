export interface OCRWord {
  text: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface OCRLine {
  word_indexes: number[];
  bbox: [number, number, number, number];
  median_character_height: number;
}

export interface ImageMeta {
  width: number;
  height: number;
  dpi?: number;
  orientation: number;
}

export interface ScanContext {
  mode: 'retail_image' | 'ecommerce_listing';
  category: 'food' | 'non_food' | 'cosmetics' | 'seeds' | 'unknown';
  imported?: boolean | null;
  inspection_date?: string | null;
}

export interface ScanRequest {
  image_b64: string;
  image_meta: ImageMeta;
  ocr_payload: OCRWord[];
  scan_context?: ScanContext;
  schema_version?: 1 | 2;
  ocr_lines?: OCRLine[];
}

export type VerdictStatus = 'pass' | 'fail' | 'warn' | 'manual_review' | 'na';
export type OverallStatus = 'pass' | 'fail' | 'mixed' | 'manual_review';
export type QualityStatus =
  | 'acceptable'
  | 'usable_with_warnings'
  | 'retake_recommended'
  | 'unreadable';
export type MeasurementMethod =
  | 'direct_metadata'
  | 'geometry_estimate'
  | 'relative_readability'
  | 'not_measurable';
export type Severity = 'critical' | 'warning' | 'info';

export interface VisualMetric {
  name: string;
  value: number;
  unit: string;
  confidence: number;
  method: string;
  evidence_bboxes: [number, number, number, number][];
}

export interface QualitySummary {
  status: QualityStatus;
  score: number;
  metrics: VisualMetric[];
  guidance: string[];
}

export interface ExtractedField {
  name: string;
  value: string | null;
  bbox: [number, number, number, number] | null;
  confidence: number;
  evidence_bboxes: [number, number, number, number][];
}

export interface Verdict {
  rule_id: string;
  status: VerdictStatus;
  severity: Severity;
  citation: string;
  evidence: string;
  evidence_bboxes: [number, number, number, number][];
  confidence: number;
  reasoning: string;
  measurement_method: MeasurementMethod;
  failure_message: string | null;
  rule_version: string;
}

export interface LegacyScanResponse {
  scan_id: number;
  overall_status: 'pass' | 'fail' | 'mixed';
  verdicts: Verdict[];
}

export interface ScanAnalysisResponse {
  scan_id: number;
  processing_status: 'processing' | 'complete' | 'failed';
  quality: QualitySummary;
  extracted_fields: Record<string, ExtractedField | null>;
  verdicts: Verdict[];
  overall_status: OverallStatus;
  analysis_version: string;
}

export type ScanResponse = LegacyScanResponse | ScanAnalysisResponse;
