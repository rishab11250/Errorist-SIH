import { CheckCircle2, CircleHelp, MinusCircle, TriangleAlert, XCircle } from 'lucide-react';

import type { VerdictStatus } from '@/lib/types';

const presentation: Record<
  VerdictStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  pass: { label: 'Pass', className: 'bg-pass text-white', icon: CheckCircle2 },
  fail: { label: 'Fail', className: 'bg-fail text-white', icon: XCircle },
  warn: { label: 'Warning', className: 'bg-warn text-white', icon: TriangleAlert },
  manual_review: {
    label: 'Manual review',
    className: 'bg-review text-white',
    icon: CircleHelp,
  },
  na: { label: 'Not applicable', className: 'bg-na text-white', icon: MinusCircle },
};

export function statusLabel(status: VerdictStatus) {
  return presentation[status].label;
}

export function statusClass(status: VerdictStatus) {
  return presentation[status].className;
}

export function VerdictBadge({ status }: { status: VerdictStatus }) {
  const Icon = presentation[status].icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-mono font-bold ${statusClass(status)}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {statusLabel(status)}
    </span>
  );
}
