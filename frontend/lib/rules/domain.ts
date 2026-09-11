export type BoundingBox = [number, number, number, number];

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface ImageMeta {
  width: number;
  height: number;
  dpi?: number | null;
  orientation?: number;
}

export interface ExtractedField {
  name: string;
  value: string | null;
  bbox: BoundingBox | null;
  confidence: number;
  evidence_spans: BoundingBox[];
  conflicting_values?: string[];
}

export type Mode = 'retail_image' | 'ecommerce_listing';
export type Category = 'food' | 'non_food' | 'cosmetics' | 'seeds' | 'unknown';

export interface ScanContext {
  mode?: Mode;
  category?: Category;
  imported?: boolean | null;
  inspection_date?: string | null;
}

export type MeasurementMethod =
  | 'direct_metadata'
  | 'geometry_estimate'
  | 'relative_readability'
  | 'not_measurable';

export type QualityStatus =
  | 'acceptable'
  | 'usable_with_warnings'
  | 'retake_recommended'
  | 'unreadable';

export type VerdictStatus = 'pass' | 'fail' | 'warn' | 'manual_review' | 'na';
export type OverallStatus = 'pass' | 'fail' | 'mixed' | 'manual_review';
export type Severity = 'critical' | 'warning' | 'info';

export interface Verdict {
  rule_id: string;
  status: VerdictStatus;
  severity: Severity;
  citation: string;
  evidence: string;
  evidence_bboxes: BoundingBox[];
  failure_message: string | null;
  rule_version: string;
  confidence: number;
  reasoning: string;
  measurement_method: MeasurementMethod;
}

export interface VisualMetric {
  name: string;
  value: number;
  unit: string;
  confidence: number;
  method: string;
  evidence_bboxes?: BoundingBox[];
}

export interface QualitySummary {
  status: QualityStatus;
  score: number;
  metrics: VisualMetric[];
  guidance: string[];
}

export interface ReadabilityAssessment {
  score: number;
  character_height_px: number;
  estimated_mm: number | null;
  error_mm: number | null;
  method: MeasurementMethod;
  scale_confidence: number;
  status: VerdictStatus;
  reasoning: string;
  evidence_bboxes?: BoundingBox[];
}

export interface PlacementResult {
  status: VerdictStatus;
  relationship: string;
  confidence: number;
  reasoning: string;
  evidence_bboxes?: BoundingBox[];
}

export interface AnalysisInput {
  extracted: Record<string, ExtractedField | null | undefined>;
  quality: QualitySummary;
  readability?: Record<string, ReadabilityAssessment>;
  placement?: Record<string, PlacementResult>;
}

export interface ScanResponse {
  scan_id: number;
  processing_status: 'processing' | 'complete' | 'failed';
  quality: QualitySummary;
  extracted_fields: Record<string, ExtractedField | null>;
  verdicts: Verdict[];
  overall_status: OverallStatus;
  analysis_version: string;
}

export interface ApplicabilityDecision {
  has_required_context: boolean;
  skipped: boolean;
  reasoning: string;
}

export interface FontSizeBracket {
  max_value: number | null;
  normal_mm: number;
  blown_mm: number;
}

export interface FontSizeTable {
  brackets: FontSizeBracket[];
}

export interface FontSizeRuleSet {
  key: string;
  citation: string;
  effective_from: string;
  superseded_date: string | null;
  table_I?: FontSizeTable | null;
  table_II?: FontSizeTable | null;
  letter_min_mm?: number | null;
  letter_blown_min_mm?: number | null;
}

export interface FontSizeRules {
  versions: Record<string, FontSizeRuleSet>;
  default_version: string;
  exemption_applies_when_another_law_governs: boolean;
  exempted_declarations: string[];
  exempted_categories: string[];
  enforcement_scale_confidence: number;
  boundary_error_policy: 'manual_review';
}

export interface AppliesWhenConfig {
  mode_in?: string[];
  category_in?: string[];
  imported?: boolean;
  context_required?: string[];
}

export interface CheckConfig {
  rule_id: string;
  citation: string;
  field: string;
  check_type: string;
  severity: Severity;
  requires: string[];
  failure_message: string;
  tax_inclusive_phrase_regex?: string | null;
  requires_unit_in?: string[] | null;
  pin_code_regex?: string | null;
  email_regex?: string | null;
  phone_regex?: string | null;
  date_format_regex?: string | null;
  skipped_when_category_in?: string[] | null;
  skipped_when_mode?: string | null;
  applies_when?: AppliesWhenConfig;
  placement?: Record<string, unknown>;
  readability?: Record<string, unknown>;
  effective_from?: string | null;
  exemption?: Record<string, unknown>;
}

export interface ConfidenceThresholds {
  pass_min: number;
  warn_min: number;
}

export interface RulesConfig {
  version: string;
  schema_version: number;
  font_size: FontSizeRules;
  confidence_thresholds: ConfidenceThresholds;
  checks: CheckConfig[];
}
