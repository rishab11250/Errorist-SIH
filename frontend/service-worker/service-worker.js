importScripts('/offline/idb.js');

const CACHE_PREFIX = 'lmpc-inspector';
const CACHE_VERSION = __CACHE_VERSION__;
const PRECACHE_NAME = `${CACHE_PREFIX}-precache-${CACHE_VERSION}`;
const RUNTIME_NAME = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;
const CAPTURE_SHELL_URL = '/';
const PRECACHE_URLS = __PRECACHE_URLS__;
const PENDING_SCANS_SYNC_TAG = 'lmpc-sync-pending-scans';
const SYNC_PENDING_SCANS_MESSAGE = 'SYNC_PENDING_SCANS';
const PENDING_SCANS_CHANGED_MESSAGE = 'PENDING_SCANS_CHANGED';
const offlineDatabase = self.LMPCOfflineDb;
let pendingSyncPromise;

function validatePendingScan(record) {
  if (!record.local_id || !record.captured_at || !record.rule_version) {
    throw new Error('Pending scan is missing immutable capture metadata.');
  }
  if (!(record.image_blob instanceof Blob)) {
    throw new Error('Pending scan image_blob is invalid.');
  }
  if (!Array.isArray(record.verdicts) || record.verdicts.length === 0) {
    throw new Error('Pending scan has no pre-computed verdict snapshot.');
  }
  if (record.verdicts.some((verdict) => verdict.rule_version !== record.rule_version)) {
    throw new Error('Pending scan verdict rule_version does not match capture-time rule_version.');
  }
}

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function notifyPendingScansChanged() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: PENDING_SCANS_CHANGED_MESSAGE });
  }
}

async function syncPendingScan(record) {
  validatePendingScan(record);
  const response = await fetch('/api/scan/sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      local_id: record.local_id,
      captured_at: record.captured_at,
      rule_version: record.rule_version,
      image_b64: await blobToBase64(record.image_blob),
      ocr_payload: record.ocr_payload,
      scan_context: record.scan_context,
      verdicts: record.verdicts,
    }),
  });
  if (!response.ok) {
    throw new Error(`Pending scan sync failed with HTTP ${response.status}.`);
  }
}

async function performPendingScansSync() {
  await offlineDatabase.requeueSyncingRecords();
  const attempted = [];
  const failures = [];
  while (true) {
    const record = await offlineDatabase.claimNextRecord(attempted);
    if (!record) break;
    attempted.push(record.local_id);
    await notifyPendingScansChanged();
    try {
      await syncPendingScan(record);
      await offlineDatabase.setRecordStatus(record.local_id, 'synced');
    } catch (error) {
      await offlineDatabase.setRecordStatus(record.local_id, 'failed');
      failures.push(error);
    }
    await notifyPendingScansChanged();
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} pending scan sync attempt(s) failed.`);
  }
}

function syncPendingScans() {
  if (!pendingSyncPromise) {
    pendingSyncPromise = performPendingScansSync().finally(() => {
      pendingSyncPromise = undefined;
    });
  }
  return pendingSyncPromise;
}

async function cacheRequiredAssets() {
  const cache = await caches.open(PRECACHE_NAME);
  await cache.addAll(
    PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload', credentials: 'same-origin' }))
  );
}

async function cacheCaptureShell() {
  try {
    const request = new Request(CAPTURE_SHELL_URL, {
      cache: 'reload',
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    });
    const response = await fetch(request);
    const finalUrl = new URL(response.url);
    if (response.ok && finalUrl.origin === self.location.origin && finalUrl.pathname === '/') {
      const cache = await caches.open(RUNTIME_NAME);
      await cache.put(CAPTURE_SHELL_URL, response);
    }
  } catch {
    // The static precache can install even when an authenticated shell is unavailable.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([cacheRequiredAssets(), cacheCaptureShell()]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith(`${CACHE_PREFIX}-`) && ![PRECACHE_NAME, RUNTIME_NAME].includes(name)
            )
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function navigationNetworkFirst(request) {
  try {
    const response = await fetch(request);
    const responseUrl = new URL(response.url);
    if (
      response.ok &&
      responseUrl.origin === self.location.origin &&
      responseUrl.pathname === new URL(request.url).pathname
    ) {
      const cache = await caches.open(RUNTIME_NAME);
      await cache.put(request, response.clone());
      if (responseUrl.pathname === '/') {
        await cache.put(CAPTURE_SHELL_URL, response.clone());
      }
    }
    return response;
  } catch {
    const runtime = await caches.open(RUNTIME_NAME);
    return (
      (await runtime.match(request)) || (await runtime.match(CAPTURE_SHELL_URL)) || Response.error()
    );
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/tesseract/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/offline/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_CAPTURE_SHELL') {
    event.waitUntil(cacheCaptureShell());
  }
  if (event.data?.type === SYNC_PENDING_SCANS_MESSAGE) {
    event.waitUntil(syncPendingScans().catch(() => undefined));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === PENDING_SCANS_SYNC_TAG) {
    event.waitUntil(syncPendingScans());
  }
});
