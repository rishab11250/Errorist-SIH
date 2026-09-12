import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { OCRWord, ScanContext, Verdict } from '@/lib/rules/domain';

export const OFFLINE_DB_NAME = 'lmpc-offline';
export const OFFLINE_DB_VERSION = 1;
export const STORE_NAME = 'pending_scans';

export const PENDING_SCAN_QUEUED_EVENT = 'lmpc:pending-scan-queued';
export const PENDING_SCANS_CHANGED_EVENT = 'lmpc:pending-scans-changed';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface PendingScanRecord {
  local_id: string;
  captured_at: string; // ISO timestamp
  rule_version: string;
  image_blob: Blob;
  ocr_payload: OCRWord[];
  scan_context: ScanContext;
  verdicts: Verdict[];
  sync_status: SyncStatus;
  sync_attempts: number;
}

interface PendingScansDB extends DBSchema {
  pending_scans: {
    key: string;
    value: PendingScanRecord;
    indexes: {
      'by-sync-status': SyncStatus;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<PendingScansDB>> | null = null;

export function getOfflineDB(): Promise<IDBPDatabase<PendingScansDB>> {
  if (typeof window === 'undefined' && typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is only available in browser environment'));
  }
  if (!dbPromise) {
    dbPromise = openDB<PendingScansDB>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'local_id',
          });
          store.createIndex('by-sync-status', 'sync_status');
        }
      },
    });
  }
  return dbPromise;
}

export function closeOfflineDB(): void {
  if (dbPromise) {
    dbPromise.then((db) => db.close()).catch(() => {});
    dbPromise = null;
  }
}

export function validatePendingScanRecord(record: PendingScanRecord): PendingScanRecord {
  if (!record.local_id || !record.captured_at || !record.rule_version) {
    throw new Error('Pending scans require local_id, captured_at, and rule_version.');
  }
  if (!(record.image_blob instanceof Blob)) {
    throw new Error('Pending scans require an image_blob.');
  }
  if (!Array.isArray(record.verdicts) || record.verdicts.length === 0) {
    throw new Error('Pending scans require pre-computed verdicts.');
  }
  if (record.verdicts.some((verdict) => verdict.rule_version !== record.rule_version)) {
    throw new Error('Every verdict must use the rule_version captured with the pending scan.');
  }
  return record;
}

/**
 * Save a newly captured scan record to pending_scans.
 */
export async function savePendingScan(record: PendingScanRecord): Promise<PendingScanRecord> {
  validatePendingScanRecord(record);
  const db = await getOfflineDB();
  await db.put(STORE_NAME, record);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PENDING_SCANS_CHANGED_EVENT));
    window.dispatchEvent(new Event(PENDING_SCAN_QUEUED_EVENT));
  }
  return record;
}

/**
 * Query/list all pending_scans records that need syncing (status 'pending' or 'failed').
 * Interface contract for Vineet's sync engine (Phase 4a).
 */
export async function getPendingOrFailedScans(): Promise<PendingScanRecord[]> {
  const db = await getOfflineDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);

  const index = store.index('by-sync-status');
  const [pending, failed] = await Promise.all([index.getAll('pending'), index.getAll('failed')]);
  await tx.done;
  return [...pending, ...failed];
}

export const getPendingScans = getPendingOrFailedScans;

/**
 * Get a specific pending scan by local_id.
 */
export async function getPendingScan(localId: string): Promise<PendingScanRecord | undefined> {
  const db = await getOfflineDB();
  return db.get(STORE_NAME, localId);
}

/**
 * Update the sync status and attempt count of a pending scan.
 */
export async function updateSyncStatus(
  localId: string,
  sync_status: SyncStatus,
  sync_attempts?: number
): Promise<void> {
  const db = await getOfflineDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const existing = await store.get(localId);
  if (!existing) return;

  existing.sync_status = sync_status;
  if (typeof sync_attempts === 'number') {
    existing.sync_attempts = sync_attempts;
  }
  await store.put(existing);
  await tx.done;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PENDING_SCANS_CHANGED_EVENT));
  }
}

/**
 * Delete a pending scan by local_id once fully synced or discarded.
 */
export async function deletePendingScan(localId: string): Promise<void> {
  const db = await getOfflineDB();
  await db.delete(STORE_NAME, localId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PENDING_SCANS_CHANGED_EVENT));
  }
}
