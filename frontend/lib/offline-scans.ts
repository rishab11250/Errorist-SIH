import '@/offline/idb.js';

import type { OCRWord, ScanContext, Verdict } from './types';

export const OFFLINE_DB_NAME = 'lmpc-offline';
export const OFFLINE_DB_VERSION = 1;
export const PENDING_SCANS_STORE = 'pending_scans';
export const PENDING_SCAN_QUEUED_EVENT = 'lmpc:pending-scan-queued';
export const PENDING_SCANS_CHANGED_EVENT = 'lmpc:pending-scans-changed';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface PendingScanRecord {
  local_id: string;
  captured_at: string;
  rule_version: string;
  image_blob: Blob;
  ocr_payload: OCRWord[];
  scan_context: ScanContext;
  verdicts: Verdict[];
  sync_status: SyncStatus;
  sync_attempts: number;
}

interface OfflineDatabaseRuntime {
  DB_NAME: string;
  DB_VERSION: number;
  STORE_NAME: string;
  putRecord(record: PendingScanRecord): Promise<PendingScanRecord>;
  getAllRecords(): Promise<PendingScanRecord[]>;
  countUnsyncedRecords(): Promise<number>;
}

declare global {
  var LMPCOfflineDb: OfflineDatabaseRuntime | undefined;
}

function runtime(): OfflineDatabaseRuntime {
  const database = globalThis.LMPCOfflineDb;
  if (!database) throw new Error('The offline scan database runtime did not initialize.');
  if (
    database.DB_NAME !== OFFLINE_DB_NAME ||
    database.DB_VERSION !== OFFLINE_DB_VERSION ||
    database.STORE_NAME !== PENDING_SCANS_STORE
  ) {
    throw new Error('The offline scan database schema does not match the sync contract.');
  }
  return database;
}

export function validatePendingScanRecord(record: PendingScanRecord): PendingScanRecord {
  if (!record.local_id || !record.captured_at || !record.rule_version) {
    throw new Error('Pending scans require local_id, captured_at, and rule_version.');
  }
  if (!(record.image_blob instanceof Blob)) {
    throw new Error('Pending scans require an image_blob.');
  }
  if (record.verdicts.some((verdict) => verdict.rule_version !== record.rule_version)) {
    throw new Error('Every verdict must use the rule_version captured with the pending scan.');
  }
  return record;
}

export async function putPendingScan(record: PendingScanRecord) {
  const saved = await runtime().putRecord(validatePendingScanRecord(record));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PENDING_SCANS_CHANGED_EVENT));
    window.dispatchEvent(new Event(PENDING_SCAN_QUEUED_EVENT));
  }
  return saved;
}

export function listPendingScans() {
  return runtime().getAllRecords();
}

export function countUnsyncedPendingScans() {
  return runtime().countUnsyncedRecords();
}

export async function getPendingOrFailedScans(): Promise<PendingScanRecord[]> {
  const records = await listPendingScans();
  return records.filter(
    (record) => record.sync_status === 'pending' || record.sync_status === 'failed'
  );
}
