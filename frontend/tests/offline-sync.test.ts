import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  installPendingScanSyncTriggers,
  PENDING_SCANS_SYNC_TAG,
  requestPendingScanSync,
  SYNC_PENDING_SCANS_MESSAGE,
} from '@/lib/offline-sync';
import { type PendingScanRecord, validatePendingScanRecord } from '@/lib/offline-scans';

afterEach(() => vi.unstubAllGlobals());

function pendingRecord(): PendingScanRecord {
  return {
    local_id: 'a6a9fbfd-5964-46ed-87d0-c7d468613ef7',
    captured_at: '2026-09-10T08:30:00.000Z',
    rule_version: 'capture-version',
    image_blob: new Blob(['image'], { type: 'image/png' }),
    ocr_payload: [{ text: 'MRP', confidence: 0.95, bbox: [0.1, 0.1, 0.2, 0.1] }],
    scan_context: { mode: 'retail_image', category: 'non_food', imported: false },
    verdicts: [
      {
        rule_id: 'r6_1_e_mrp',
        status: 'pass',
        severity: 'critical',
        citation: 'Rule 6(1)(e)',
        evidence: 'MRP 99 inclusive of all taxes',
        evidence_bboxes: [[0.1, 0.1, 0.2, 0.1]],
        confidence: 0.95,
        reasoning: 'The declaration is present.',
        measurement_method: 'not_measurable',
        failure_message: null,
        rule_version: 'capture-version',
      },
    ],
    sync_status: 'pending',
    sync_attempts: 0,
  };
}

describe('offline scan sync', () => {
  it('rejects a verdict snapshot whose version differs from capture time', () => {
    const record = pendingRecord();
    record.verdicts[0].rule_version = 'new-backend-version';
    expect(() => validatePendingScanRecord(record)).toThrow(/capture-time|captured|rule_version/i);
  });

  it('registers the Background Sync tag when the API is available', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: {}, onLine: false });
    const registration = {
      sync: { register },
      active: { postMessage },
    } as unknown as ServiceWorkerRegistration;

    await expect(requestPendingScanSync(registration)).resolves.toBe('background');
    expect(register).toHaveBeenCalledWith(PENDING_SCANS_SYNC_TAG);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('posts a foreground retry when Background Sync is unavailable and connectivity returns', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: {}, onLine: true });
    const registration = { active: { postMessage } } as unknown as ServiceWorkerRegistration;

    await expect(requestPendingScanSync(registration)).resolves.toBe('foreground');
    expect(postMessage).toHaveBeenCalledWith({ type: SYNC_PENDING_SCANS_MESSAGE });
  });

  it('keeps the foreground fallback pending while the browser is offline', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: {}, onLine: false });
    const registration = { active: { postMessage } } as unknown as ServiceWorkerRegistration;

    await expect(requestPendingScanSync(registration)).resolves.toBe('offline');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('retries through the service worker when a fallback browser comes online', async () => {
    const postMessage = vi.fn();
    const serviceWorker = new EventTarget();
    const navigatorState = { serviceWorker, onLine: false };
    vi.stubGlobal('navigator', navigatorState);
    const registration = { active: { postMessage } } as unknown as ServiceWorkerRegistration;

    const removeTriggers = installPendingScanSyncTriggers(registration);
    expect(postMessage).not.toHaveBeenCalled();

    navigatorState.onLine = true;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({ type: SYNC_PENDING_SCANS_MESSAGE })
    );
    removeTriggers();
  });

  it('wires the worker to the fixed store and immutable sync endpoint', async () => {
    const worker = await readFile(
      join(process.cwd(), 'service-worker', 'service-worker.js'),
      'utf8'
    );
    expect(worker).toContain("importScripts('/offline/idb.js')");
    expect(worker).toContain("fetch('/api/scan/sync'");
    expect(worker).toContain('event.tag === PENDING_SCANS_SYNC_TAG');
    expect(worker).toContain('verdict.rule_version !== record.rule_version');
    expect(worker).toContain("setRecordStatus(record.local_id, 'synced')");
    expect(worker).toContain("setRecordStatus(record.local_id, 'failed')");
  });
});
