export interface OCRWord {
  text: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface ImageMeta { width: number; height: number; dpi?: number; orientation: number; }
export interface ScanContext {
  mode: 'retail_image' | 'ecommerce_listing';
  category: 'food' | 'non_food' | 'cosmetics' | 'seeds' | 'unknown';
}
export interface ScanRequest { image_b64: string; image_meta: ImageMeta; ocr_payload: OCRWord[]; scan_context?: ScanContext; }
export type VerdictStatus = 'pass' | 'fail' | 'warn' | 'na';
export type Severity = 'critical' | 'warning' | 'info';
export interface Verdict {
  rule_id: string; status: VerdictStatus; severity: Severity; citation: string; evidence: string;
  evidence_bboxes: [number, number, number, number][]; failure_message: string | null; rule_version: string;
}
export interface ScanResponse { scan_id: number; overall_status: 'pass' | 'fail' | 'mixed'; verdicts: Verdict[]; }
