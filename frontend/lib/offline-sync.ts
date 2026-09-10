import { PENDING_SCAN_QUEUED_EVENT, PENDING_SCANS_CHANGED_EVENT } from './offline-scans';

export const PENDING_SCANS_SYNC_TAG = 'lmpc-sync-pending-scans';
export const SYNC_PENDING_SCANS_MESSAGE = 'SYNC_PENDING_SCANS';
export const PENDING_SCANS_CHANGED_MESSAGE = 'PENDING_SCANS_CHANGED';

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
  const relayWorkerChange = (event: MessageEvent) => {
    if (event.data?.type === PENDING_SCANS_CHANGED_MESSAGE) {
      window.dispatchEvent(new Event(PENDING_SCANS_CHANGED_EVENT));
    }
  };

  window.addEventListener('online', requestSync);
  window.addEventListener(PENDING_SCAN_QUEUED_EVENT, requestSync);
  navigator.serviceWorker.addEventListener('message', relayWorkerChange);
  if (navigator.onLine) requestSync();

  return () => {
    window.removeEventListener('online', requestSync);
    window.removeEventListener(PENDING_SCAN_QUEUED_EVENT, requestSync);
    navigator.serviceWorker.removeEventListener('message', relayWorkerChange);
  };
}
