import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InspectionCapture } from '@/components/inspection/InspectionCapture';
import {
  closeOfflineDB,
  deletePendingScan,
  getOfflineDB,
  getPendingOrFailedScans,
  getPendingScan,
  savePendingScan,
  STORE_NAME,
  updateSyncStatus,
  validatePendingScanRecord,
  type PendingScanRecord,
} from '@/lib/storage';

const runOCRMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ocr', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ocr')>('@/lib/ocr');
  return { ...actual, runOCR: runOCRMock };
});

const OCR_SAMPLE = {
  words: [
    {
      text: 'MRP',
      confidence: 0.95,
      bbox: [0.1, 0.1, 0.2, 0.1] as [number, number, number, number],
    },
    {
      text: '99',
      confidence: 0.95,
      bbox: [0.3, 0.1, 0.4, 0.1] as [number, number, number, number],
    },
  ],
  lines: [
    {
      word_indexes: [0, 1],
      bbox: [0.1, 0.1, 0.4, 0.1] as [number, number, number, number],
      median_character_height: 0.1,
    },
  ],
  imageDataUrl: 'data:image/png;base64,aGVsbG8=',
  imageWidth: 800,
  imageHeight: 600,
};

function createSampleRecord(overrides: Partial<PendingScanRecord> = {}): PendingScanRecord {
  return {
    local_id: 'c8d0e123-4567-489a-bcde-f0123456789a',
    captured_at: '2026-09-10T12:00:00.000Z',
    rule_version: '2026-09',
    image_blob: new Blob(['evidence-bytes'], { type: 'image/jpeg' }),
    ocr_payload: [{ text: 'MRP', confidence: 0.95, bbox: [0.1, 0.1, 0.2, 0.1] }],
    scan_context: { mode: 'retail_image', category: 'food', imported: false },
    verdicts: [
      {
        rule_id: 'r6_1_e_mrp',
        status: 'pass',
        severity: 'critical',
        citation: 'Rule 6(1)(e)',
        evidence: 'MRP 99',
        evidence_bboxes: [[0.1, 0.1, 0.2, 0.1]],
        confidence: 0.95,
        reasoning: 'MRP declaration found',
        measurement_method: 'not_measurable',
        failure_message: null,
        rule_version: '2026-09',
      },
    ],
    sync_status: 'pending',
    sync_attempts: 0,
    ...overrides,
  };
}

describe('offline IndexedDB storage', () => {
  beforeEach(async () => {
    runOCRMock.mockReset();
    const db = await getOfflineDB();
    await db.clear(STORE_NAME);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    closeOfflineDB();
  });

  it('saves a scan to IndexedDB with the exact required schema', async () => {
    const record = createSampleRecord();
    await savePendingScan(record);

    const saved = await getPendingScan(record.local_id);
    expect(saved).toBeDefined();
    expect(saved?.local_id).toBe(record.local_id);
    expect(saved?.captured_at).toBe('2026-09-10T12:00:00.000Z');
    expect(saved?.rule_version).toBe('2026-09');
    expect(record.image_blob).toBeInstanceOf(Blob);
    expect(saved?.image_blob).toBeDefined();
    expect(saved?.ocr_payload).toEqual(record.ocr_payload);
    expect(saved?.scan_context).toEqual(record.scan_context);
    expect(saved?.verdicts).toHaveLength(1);
    expect(saved?.verdicts[0].rule_id).toBe('r6_1_e_mrp');
    expect(saved?.verdicts[0].rule_version).toBe('2026-09');
    expect(saved?.sync_status).toBe('pending');
    expect(saved?.sync_attempts).toBe(0);
  });

  it('getPendingOrFailedScans returns records with pending or failed status', async () => {
    const rec1 = createSampleRecord({ local_id: 'id-pending', sync_status: 'pending' });
    const rec2 = createSampleRecord({ local_id: 'id-failed', sync_status: 'failed' });
    const rec3 = createSampleRecord({ local_id: 'id-synced', sync_status: 'synced' });
    const rec4 = createSampleRecord({ local_id: 'id-syncing', sync_status: 'syncing' });

    await savePendingScan(rec1);
    await savePendingScan(rec2);
    await savePendingScan(rec3);
    await savePendingScan(rec4);

    const pendingOrFailed = await getPendingOrFailedScans();
    const localIds = pendingOrFailed.map((r) => r.local_id);

    expect(localIds).toContain('id-pending');
    expect(localIds).toContain('id-failed');
    expect(localIds).not.toContain('id-synced');
    expect(localIds).not.toContain('id-syncing');
  });

  it('updating sync_status to synced excludes it from getPendingOrFailedScans', async () => {
    const record = createSampleRecord({ local_id: 'transition-test', sync_status: 'pending' });
    await savePendingScan(record);

    let pending = await getPendingOrFailedScans();
    expect(pending.some((r) => r.local_id === 'transition-test')).toBe(true);

    await updateSyncStatus('transition-test', 'syncing', 1);
    pending = await getPendingOrFailedScans();
    expect(pending.some((r) => r.local_id === 'transition-test')).toBe(false);

    await updateSyncStatus('transition-test', 'synced');
    pending = await getPendingOrFailedScans();
    expect(pending.some((r) => r.local_id === 'transition-test')).toBe(false);

    const check = await getPendingScan('transition-test');
    expect(check?.sync_status).toBe('synced');
    expect(check?.sync_attempts).toBe(1);

    // Fail it
    await updateSyncStatus('transition-test', 'failed', 2);
    pending = await getPendingOrFailedScans();
    expect(pending.some((r) => r.local_id === 'transition-test')).toBe(true);

    // Delete
    await deletePendingScan('transition-test');
    expect(await getPendingScan('transition-test')).toBeUndefined();
  });

  it('validates required fields and verdict rule_version matching', () => {
    expect(() =>
      validatePendingScanRecord({
        ...createSampleRecord(),
        local_id: '',
      })
    ).toThrow(/local_id/);

    expect(() =>
      validatePendingScanRecord({
        ...createSampleRecord(),
        image_blob: 'not-a-blob' as unknown as Blob,
      })
    ).toThrow(/image_blob/);

    const mismatched = createSampleRecord();
    mismatched.verdicts[0].rule_version = 'mismatched-version';
    expect(() => validatePendingScanRecord(mismatched)).toThrow(/rule_version/);
  });

  it('capture flow displays verdicts and saves to IndexedDB when navigator.onLine is false', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    runOCRMock.mockResolvedValue(OCR_SAMPLE);

    const onComplete = vi.fn();
    const user = userEvent.setup();

    render(<InspectionCapture onComplete={onComplete} />);
    await user.upload(
      screen.getByLabelText('Evidence image'),
      new File(['test'], 'offline-label.jpg', { type: 'image/jpeg' })
    );
    await user.click(screen.getByRole('button', { name: 'Start inspection' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const result = onComplete.mock.calls[0][0];
    expect(result.response.processing_status).toBe('complete');
    expect(result.response.verdicts.length).toBeGreaterThan(0);
    expect(result.response.overall_status).toBeDefined();

    // Verify written to pending_scans
    const pending = await getPendingOrFailedScans();
    expect(pending.length).toBeGreaterThanOrEqual(1);
    const saved = pending.find((r) => r.scan_context.mode === 'retail_image');
    expect(saved).toBeDefined();
    expect(saved?.sync_status).toBe('pending');
    expect(saved?.sync_attempts).toBe(0);
  });

  it('capture flow displays verdicts and saves to IndexedDB when backend is unreachable', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: true });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    runOCRMock.mockResolvedValue(OCR_SAMPLE);

    const onComplete = vi.fn();
    const user = userEvent.setup();

    render(<InspectionCapture onComplete={onComplete} />);
    await user.upload(
      screen.getByLabelText('Evidence image'),
      new File(['test'], 'unreachable-label.png', { type: 'image/png' })
    );
    await user.click(screen.getByRole('button', { name: 'Start inspection' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    const result = onComplete.mock.calls[0][0];
    expect(result.response.processing_status).toBe('complete');
    expect(result.response.verdicts.length).toBeGreaterThan(0);

    // Verify written to pending_scans with sync_status: 'pending'
    const pending = await getPendingOrFailedScans();
    expect(pending.length).toBeGreaterThanOrEqual(1);
    const saved = pending.find((r) => r.sync_status === 'pending');
    expect(saved).toBeDefined();
    expect(saved?.sync_attempts).toBe(0);
  });
});
