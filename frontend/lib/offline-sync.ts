import { PENDING_SCAN_QUEUED_EVENT, PENDING_SCANS_CHANGED_EVENT } from './offline-scans';
import {
  getPendingOrFailedScans,
  updateSyncStatus,
  type PendingScanRecord,
} from './storage';

export const PENDING_SCANS_SYNC_TAG = 'lmpc-sync-pending-scans';
export const SYNC_PENDING_SCANS_MESSAGE = 'SYNC_PENDING_SCANS';
export const PENDING_SCANS_CHANGED_MESSAGE = 'PENDING_SCANS_CHANGED';

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    let str = '';
    for (let i = 0; i < chunk.length; i++) {
      str += String.fromCharCode(chunk[i]);
    }
    parts.push(str);
  }
  return btoa(parts.join(''));
}

export async function syncSinglePendingScan(record: PendingScanRecord): Promise<void> {
  await updateSyncStatus(record.local_id, 'syncing', (record.sync_attempts ?? 0) + 1);
  try {
    const image_b64 = await blobToBase64(record.image_blob);
    const response = await fetch('/api/scan/sync', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        local_id: record.local_id,
        captured_at: record.captured_at,
        rule_version: record.rule_version,
        image_b64,
        ocr_payload: record.ocr_payload,
        scan_context: record.scan_context,
        verdicts: record.verdicts,
      }),
    });
    if (!response.ok) {
      throw new Error(`Sync failed with HTTP ${response.status}`);
    }
    await updateSyncStatus(record.local_id, 'synced');
  } catch (err) {
    await updateSyncStatus(record.local_id, 'failed');
    throw err;
  }
}

export async function triggerForegroundSync(): Promise<{ succeeded: number; failed: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Device is offline. Connect to the internet to sync.');
  }
  const pending = await getPendingOrFailedScans();
  let succeeded = 0;
  let failed = 0;
  for (const record of pending) {
    try {
      await syncSinglePendingScan(record);
      succeeded++;
    } catch {
      failed++;
    }
  }
  return { succeeded, failed };
}

interface BackgroundSyncManager {
  register(tag: string): Promise<void>;
}

type SyncCapableRegistration = ServiceWorkerRegistration & {
  sync?: BackgroundSyncManager;
};

export type SyncRegistrationMode = 'background' | 'foreground' | 'offline' | 'unsupported';

export async function requestPendingScanSync(
  registration?: ServiceWorkerRegistration
): Promise<SyncRegistrationMode> {
  if (!('serviceWorker' in navigator)) return 'unsupported';

  const activeRegistration = (registration ??
    (await navigator.serviceWorker.ready)) as SyncCapableRegistration;
  if (activeRegistration.sync) {
    try {
      await activeRegistration.sync.register(PENDING_SCANS_SYNC_TAG);
      return 'background';
    } catch {
      // Fall through to the foreground trigger when registration is unavailable.
    }
  }

  if (!navigator.onLine) return 'offline';
  activeRegistration.active?.postMessage({ type: SYNC_PENDING_SCANS_MESSAGE });
  return activeRegistration.active ? 'foreground' : 'unsupported';
}

export function installPendingScanSyncTriggers(registration: ServiceWorkerRegistration) {
  const requestSync = () => void requestPendingScanSync(registration);
  const onVisible = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) requestSync();
  };
  const relayWorkerChange = (event: MessageEvent) => {
    if (event.data?.type === PENDING_SCANS_CHANGED_MESSAGE) {
      window.dispatchEvent(new Event(PENDING_SCANS_CHANGED_EVENT));
    }
  };

  window.addEventListener('online', requestSync);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener(PENDING_SCAN_QUEUED_EVENT, requestSync);
  navigator.serviceWorker.addEventListener('message', relayWorkerChange);
  if (navigator.onLine) requestSync();

  return () => {
    window.removeEventListener('online', requestSync);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener(PENDING_SCAN_QUEUED_EVENT, requestSync);
    navigator.serviceWorker.removeEventListener('message', relayWorkerChange);
  };
}
