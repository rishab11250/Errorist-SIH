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
  imported: boolean | null;
  inspection_date?: string | null;
}

export interface ScanRequest {
  schema_version: 2;
  image_b64: string;
  image_meta: ImageMeta;
  ocr_payload: OCRWord[];
  ocr_lines: OCRLine[];
  scan_context: ScanContext;
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
  id?: number;
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
  review_state?: string;
}

export interface ReviewAction {
  id: number;
  verdict_id: number | null;
  action: 'confirmed' | 'false_positive' | 'resolved' | 'needs_follow_up';
  note: string;
  actor_user_id: number;
  actor_display_name: string;
  created_at: string;
}

export interface ScanAnalysisResponse {
  scan_id: number;
  processing_status: 'processing' | 'complete' | 'failed';
  quality: QualitySummary;
  extracted_fields: Record<string, ExtractedField | null>;
  verdicts: Verdict[];
  overall_status: OverallStatus;
  analysis_version: string;
  product_id?: string | null;
  product_match_status?: ProductMatchStatus;
  product?: ProductSummary | null;
  product_candidates?: ProductMatchCandidate[];
  previous_scan?: PreviousScan | null;
}

export type ScanResponse = ScanAnalysisResponse;

export type ProductMatchStatus =
  | 'unmatched'
  | 'suggested'
  | 'confirmed'
  | 'rejected'
  | 'auto_matched';

export interface ProductSummary {
  id: string;
  manufacturer: string | null;
  common_name: string | null;
  quantity: string | null;
  unit: string | null;
  category: ScanContext['category'] | null;
  scan_count: number;
  first_scan: string | null;
  latest_scan: string | null;
}

export interface ProductMatchCandidate extends ProductSummary {
  similarity_score?: number | null;
}

export interface PreviousScanComparison {
  rule_id: string;
  status_before: VerdictStatus;
  status_after: VerdictStatus;
  changed: boolean;
  direction: 'improved' | 'regressed' | 'unchanged';
}

export interface PreviousScan {
  scan_id: number;
  scanned_at: string;
  overall_status: OverallStatus;
  comparison: PreviousScanComparison[];
}

export interface ProductHistoryResponse {
  product: ProductSummary;
  items: import('./operations').HistoryItem[];
  page: number;
  page_size: number;
  total: number;
}

export interface StoredScanResponse {
  scan: {
    id: number;
    local_id: string | null;
    mode: ScanContext['mode'];
    category: ScanContext['category'];
    overall_status: OverallStatus;
    image_b64: string;
    image_meta: ImageMeta;
    schema_version: number;
    processing_status: ScanAnalysisResponse['processing_status'];
    quality_summary: QualitySummary;
    analysis_version: string;
    processing_error_code: string | null;
    product_id?: string | null;
    product_match_status?: ProductMatchStatus;
    product?: ProductSummary | null;
    product_candidates?: ProductMatchCandidate[];
    previous_scan?: PreviousScan | null;
  };
  verdicts: Verdict[];
  review_actions: ReviewAction[];
}
