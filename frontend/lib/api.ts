import type { ScanRequest, ScanResponse, StoredScanResponse } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

async function apiError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => null) as
    | { detail?: string; error?: string; request_id?: string }
    | null;
  const message = body?.detail ?? body?.error ?? response.statusText ?? fallback;
  const requestId = body?.request_id ? ` (request ${body.request_id})` : '';
  return new Error(`${message}${requestId}`);
}

export async function postScan(request: ScanRequest): Promise<ScanResponse> {
  const response = await fetch(`${API_BASE}/api/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  if (!response.ok) {
    throw await apiError(response, 'The scan could not be completed.');
  }
  return response.json();
}

export function getReportUrl(scanId: number): string { return `${API_BASE}/api/report/${scanId}`; }

export async function getScan(scanId: number): Promise<StoredScanResponse> {
  const response = await fetch(`${API_BASE}/api/scan/${scanId}`);
  if (!response.ok) throw await apiError(response, `Scan ${scanId} was not found.`);
  return response.json();
}

export async function getHistory(limit = 20) {
  const response = await fetch(`${API_BASE}/api/history?limit=${limit}`);
  if (!response.ok) throw new Error('history_failed');
  return response.json();
}

export async function getDashboard() {
  const response = await fetch(`${API_BASE}/api/dashboard`);
  if (!response.ok) throw new Error('dashboard_failed');
  return response.json();
}
