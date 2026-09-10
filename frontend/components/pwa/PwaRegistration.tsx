'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { installPendingScanSyncTriggers } from '@/lib/offline-sync';

export async function registerPwaServiceWorker(warmCaptureShell = false) {
  if (!('serviceWorker' in navigator)) return null;

  const registration = await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  });
  const readyRegistration = await navigator.serviceWorker.ready;
  if (warmCaptureShell) {
    readyRegistration.active?.postMessage({ type: 'CACHE_CAPTURE_SHELL' });
  }
  return readyRegistration;
}

export function PwaRegistration() {
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    let removeSyncTriggers: (() => void) | undefined;
    void registerPwaServiceWorker(pathname === '/')
      .then((registration) => {
        if (registration) removeSyncTriggers = installPendingScanSyncTriggers(registration);
      })
      .catch((error: unknown) => {
        console.error('PWA service worker registration failed.', error);
      });
    return () => removeSyncTriggers?.();
  }, [pathname]);

  return null;
}
