import type { ScanRequest, ScanResponse, StoredScanResponse } from './types';
import { apiFetch } from './api-client';
import type { DashboardData, HistoryResponse } from './operations';

export async function postScan(request: ScanRequest, signal?: AbortSignal): Promise<ScanResponse> {
  return apiFetch<ScanResponse>('/api/scan', {
    method: 'POST',
    body: JSON.stringify(request),
    signal,
  });
}

export function getReportUrl(scanId: number): string {
  return `/api/report/${scanId}`;
}

export async function getScan(scanId: number): Promise<StoredScanResponse> {
  return apiFetch<StoredScanResponse>(`/api/scan/${scanId}`);
}

export async function getHistory(query = 'page_size=20'): Promise<HistoryResponse> {
  return apiFetch<HistoryResponse>(`/api/history?${query}`);
}

export async function getDashboard(query = 'page_size=20'): Promise<DashboardData> {
  return apiFetch<DashboardData>(`/api/dashboard?${query}`);
}
