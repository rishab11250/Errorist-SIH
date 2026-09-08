import type { ScanRequest, ScanResponse, StoredScanResponse } from './types';
import { apiFetch } from './api-client';

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

export async function getHistory(limit = 20) {
  const response = await apiFetch<{ items: unknown[] }>(`/api/history?page_size=${limit}`);
  return response.items;
}

export async function getDashboard() {
  return apiFetch('/api/dashboard');
}
