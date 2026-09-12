import type { ProductHistoryResponse, ScanRequest, ScanResponse, StoredScanResponse } from './types';
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

export async function getProduct(productId: string): Promise<ProductHistoryResponse['product']> {
  return apiFetch<ProductHistoryResponse['product']>(`/api/products/${encodeURIComponent(productId)}`);
}

export async function getProductScans(productId: string, query = 'page_size=20'): Promise<ProductHistoryResponse> {
  return apiFetch<ProductHistoryResponse>(`/api/products/${encodeURIComponent(productId)}/scans?${query}`);
}

export async function confirmProductMatch(scanId: number, productId: string): Promise<StoredScanResponse> {
  return apiFetch<StoredScanResponse>(`/api/scans/${scanId}/confirm-product-match`, {
    method: 'POST',
    body: JSON.stringify({ product_id: productId }),
  });
}

export async function rejectProductMatch(scanId: number): Promise<StoredScanResponse> {
  return apiFetch<StoredScanResponse>(`/api/scans/${scanId}/reject-product-match`, { method: 'POST' });
}

export async function linkProduct(scanId: number, productId: string): Promise<StoredScanResponse> {
  return apiFetch<StoredScanResponse>(`/api/scans/${scanId}/link-product`, {
    method: 'POST',
    body: JSON.stringify({ product_id: productId }),
  });
}

export async function getDashboard(query = 'page_size=20'): Promise<DashboardData> {
  return apiFetch<DashboardData>(`/api/dashboard?${query}`);
}
