import type { VerdictStatus } from '@/lib/types';

const labels: Record<VerdictStatus, string> = {
  pass: 'Pass',
  fail: 'Fail',
  warn: 'Warning',
  manual_review: 'Manual review',
  na: 'Not applicable',
};

const colours: Record<VerdictStatus, string> = {
  pass: 'bg-pass text-white',
  fail: 'bg-fail text-white',
  warn: 'bg-warn text-white',
  manual_review: 'status-review bg-violet-700 text-white',
  na: 'bg-na text-white',
};

export function statusLabel(status: VerdictStatus): string {
  return labels[status];
}

export function statusClass(status: VerdictStatus): string {
  return colours[status];
}

export function VerdictBadge({ status }: { status: VerdictStatus }) {
  return (
    <span
      className={`inline-block rounded px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}
