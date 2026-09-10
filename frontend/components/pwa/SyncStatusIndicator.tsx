'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { countUnsyncedPendingScans, PENDING_SCANS_CHANGED_EVENT } from '@/lib/offline-scans';
import { PENDING_SCANS_CHANGED_MESSAGE } from '@/lib/offline-sync';
import { cn } from '@/lib/cn';

export function SyncStatusIndicator({ className }: { className?: string }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(() => {
    void countUnsyncedPendingScans()
      .then(setPendingCount)
      .catch(() => setPendingCount(0));
  }, []);

  useEffect(() => {
    const workerChanged = (event: MessageEvent) => {
      if (event.data?.type === PENDING_SCANS_CHANGED_MESSAGE) refresh();
    };
    const updateConnection = () => setOnline(navigator.onLine);
    updateConnection();
    refresh();
    window.addEventListener(PENDING_SCANS_CHANGED_EVENT, refresh);
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    navigator.serviceWorker?.addEventListener('message', workerChanged);
    return () => {
      window.removeEventListener(PENDING_SCANS_CHANGED_EVENT, refresh);
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      navigator.serviceWorker?.removeEventListener('message', workerChanged);
    };
  }, [refresh]);

  if (pendingCount === 0) return null;
  const Icon = online ? RefreshCw : CloudOff;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex min-h-9 items-center gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 text-xs font-semibold text-warn',
        className
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {pendingCount} scan{pendingCount === 1 ? '' : 's'} pending sync
    </div>
  );
}
