'use client';

import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { countUnsyncedPendingScans, PENDING_SCANS_CHANGED_EVENT } from '@/lib/offline-scans';
import {
  PENDING_SCANS_CHANGED_MESSAGE,
  syncSinglePendingScan,
  triggerForegroundSync,
} from '@/lib/offline-sync';
import {
  deletePendingScan,
  getPendingOrFailedScans,
  type PendingScanRecord,
} from '@/lib/storage';

export function SyncStatusIndicator({ className }: { className?: string }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [records, setRecords] = useState<PendingScanRecord[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void countUnsyncedPendingScans()
      .then((count) => {
        setPendingCount(count);
        if (count === 0 && !isSyncing) {
          // Keep open if user is viewing or closed
        }
      })
      .catch(() => setPendingCount(0));
    void getPendingOrFailedScans()
      .then(setRecords)
      .catch(() => setRecords([]));
  }, [isSyncing]);

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

  async function handleSyncAll() {
    if (!online) {
      setSyncError('Cannot sync while offline. Please connect to the internet.');
      return;
    }
    setIsSyncing(true);
    setSyncError(null);
    try {
      const result = await triggerForegroundSync();
      if (result.failed > 0) {
        setSyncError(`${result.failed} scan(s) could not be synced. Check server status.`);
      }
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setIsSyncing(false);
      refresh();
    }
  }

  async function handleSyncOne(record: PendingScanRecord) {
    if (!online) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      await syncSinglePendingScan(record);
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setIsSyncing(false);
      refresh();
    }
  }

  async function handleDeleteOne(localId: string) {
    await deletePendingScan(localId);
    refresh();
  }

  if (pendingCount === 0 && records.length === 0) return null;

  const Icon = online ? RefreshCw : CloudOff;

  return (
    <>
      <button
        type="button"
        role="status"
        aria-live="polite"
        onClick={() => {
          refresh();
          setIsOpen(true);
        }}
        className={cn(
          'inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 text-xs font-semibold text-warn transition-colors hover:bg-warn/20 active:scale-[0.98]',
          className
        )}
      >
        <Icon aria-hidden="true" className={cn('size-4', isSyncing && 'animate-spin')} />
        <span>
          {pendingCount} scan{pendingCount === 1 ? '' : 's'} pending sync
        </span>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="space-y-1">
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="text-base font-semibold">Offline Sync Queue</DialogTitle>
              <div
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                  online
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                )}
              >
                {online ? <Cloud className="size-3.5" /> : <CloudOff className="size-3.5" />}
                {online ? 'Online' : 'Offline'}
              </div>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {records.length} scan{records.length === 1 ? '' : 's'} stored on this device waiting to sync with the server.
            </DialogDescription>
          </DialogHeader>

          {syncError && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{syncError}</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-border/50 py-1 space-y-2 pr-1">
            {records.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <CheckCircle2 className="mx-auto size-8 text-emerald-500 mb-2" />
                All offline scans have synced successfully.
              </div>
            ) : (
              records.map((record) => (
                <div key={record.local_id} className="pt-2 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {record.local_id.slice(0, 8)}...
                      </span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.2 text-[10px] font-semibold uppercase',
                          record.sync_status === 'failed'
                            ? 'bg-rose-500/20 text-rose-600'
                            : record.sync_status === 'syncing'
                              ? 'bg-sky-500/20 text-sky-600'
                              : 'bg-amber-500/20 text-amber-600'
                        )}
                      >
                        {record.sync_status}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-[11px] mt-0.5">
                      {new Date(record.captured_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}{' '}
                      · {record.verdicts?.length ?? 0} verdict(s) · {record.scan_context?.category || 'unknown'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {record.sync_status === 'failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!online || isSyncing}
                        onClick={() => handleSyncOne(record)}
                        className="h-7 px-2 text-xs"
                      >
                        Retry
                      </Button>
                    )}
                    <button
                      type="button"
                      aria-label="Discard pending scan"
                      onClick={() => handleDeleteOne(record.local_id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="mt-2 pt-2 border-t flex-row items-center justify-between gap-2 sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-xs"
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={handleSyncAll}
              disabled={!online || isSyncing || records.length === 0}
              className="text-xs gap-1.5"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" />
                  Sync All Now
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
