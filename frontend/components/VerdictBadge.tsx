import type { VerdictStatus } from '@/lib/types';

const colours: Record<VerdictStatus, string> = {
  pass: 'bg-pass text-white',
  fail: 'bg-fail text-white',
  warn: 'bg-warn text-white',
  manual_review: 'bg-purple-700 text-white',
  na: 'bg-na text-white',
};

export function VerdictBadge({ status }: { status: VerdictStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${colours[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}
