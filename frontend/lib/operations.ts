export type ScanMode = 'retail_image' | 'ecommerce_listing';
export type ScanCategory = 'food' | 'non_food' | 'cosmetics' | 'seeds' | 'unknown';
export type OverallFilter = 'pass' | 'fail' | 'mixed' | 'manual_review';
export type VerdictFilter = 'pass' | 'fail' | 'warn' | 'manual_review' | 'na';
export type ScanSort = 'created_desc' | 'created_asc';

export interface ScanFiltersValue {
  q: string;
  mode: '' | ScanMode;
  category: '' | ScanCategory;
  overall_status: '' | OverallFilter;
  rule_id: string;
  verdict_status: '' | VerdictFilter;
  owner_id: string;
  created_from: string;
  created_to: string;
  sort: ScanSort;
}

export const emptyScanFilters: ScanFiltersValue = {
  q: '',
  mode: '',
  category: '',
  overall_status: '',
  rule_id: '',
  verdict_status: '',
  owner_id: '',
  created_from: '',
  created_to: '',
  sort: 'created_desc',
};

export interface HistoryItem {
  scan_id: number;
  local_id: string | null;
  thumbnail_b64: string;
  overall_status: OverallFilter;
  verdict_count: number;
  product: string | null;
  mode: ScanMode;
  category: ScanCategory;
  owner_user_id: number | null;
  verdict_summary: Record<VerdictFilter, number>;
  rule_version: string | null;
  rule_versions: string[];
  created_at: string;
}

export interface HistoryResponse {
  items: HistoryItem[];
  page: number;
  page_size: number;
  total: number;
}

export interface DashboardData {
  total_scans: number;
  status_counts: Record<OverallFilter, number>;
  pass_rate: number;
  top_failed_rule: string | null;
  top_failed_rules: Array<{ rule_id: string; count: number }>;
  daily_trend: Array<{ date: string; total: number }>;
  recent_activity: HistoryItem[];
}

export function filtersFromParams(
  params: Record<string, string | string[] | undefined>
): ScanFiltersValue {
  const value = (key: keyof ScanFiltersValue) => {
    const raw = params[key];
    return Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  };
  return {
    q: value('q'),
    mode: value('mode') as ScanFiltersValue['mode'],
    category: value('category') as ScanFiltersValue['category'],
    overall_status: value('overall_status') as ScanFiltersValue['overall_status'],
    rule_id: value('rule_id'),
    verdict_status: value('verdict_status') as ScanFiltersValue['verdict_status'],
    owner_id: value('owner_id'),
    created_from: value('created_from'),
    created_to: value('created_to'),
    sort: value('sort') === 'created_asc' ? 'created_asc' : 'created_desc',
  };
}

export function filtersToParams(filters: ScanFiltersValue, page = 1): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, raw]) => {
    const value = raw.trim();
    if (value && !(key === 'sort' && value === 'created_desc')) params.set(key, value);
  });
  if (page > 1) params.set('page', String(page));
  params.set('page_size', '20');
  return params;
}
