import type { ScanRequest, ScanResponse } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

export async function postScan(request: ScanRequest): Promise<ScanResponse> {
  const response = await fetch(`${API_BASE}/api/scan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(`scan_failed: ${detail.detail ?? response.statusText}`);
  }
  return response.json();
}

export function getReportUrl(scanId: number): string { return `${API_BASE}/api/report/${scanId}`; }

export async function getScan(scanId: number) {
  const response = await fetch(`${API_BASE}/api/scan/${scanId}`);
  if (!response.ok) throw new Error(`scan_not_found: ${scanId}`);
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
