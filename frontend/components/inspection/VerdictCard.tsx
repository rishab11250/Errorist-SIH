import type { Verdict } from '@/lib/types';
import { cn } from '@/lib/cn';
import { FileSearch, ShieldAlert } from 'lucide-react';

import { VerdictBadge } from './VerdictBadge';

const methods: Record<Verdict['measurement_method'], string> = {
  direct_metadata: 'Direct image metadata',
  geometry_estimate: 'Image geometry estimate',
  relative_readability: 'Relative readability',
  not_measurable: 'Not measurable from this image',
};

const statusBorderMap: Record<Verdict['status'], string> = {
  pass: 'border-l-4 border-l-pass hover:border-pass/80',
  fail: 'border-l-4 border-l-fail hover:border-fail/80',
  warn: 'border-l-4 border-l-warn hover:border-warn/80',
  manual_review: 'border-l-4 border-l-review hover:border-review/80',
  na: 'border-l-4 border-l-muted-foreground/30 hover:border-muted-foreground/60',
};

interface VerdictCardProps {
  verdict: Verdict;
  active?: boolean;
  onSelect?: () => void;
}

export function VerdictCard({ verdict, active = false, onSelect }: VerdictCardProps) {
  return (
    <article
      className={cn(
        'surface-panel overflow-hidden transition-all duration-200 hover:shadow-md',
        statusBorderMap[verdict.status] ?? '',
        active
          ? 'ring-2 ring-primary shadow-md border-primary bg-primary/[0.02]'
          : 'hover:border-border'
      )}
    >
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${verdict.citation}: ${verdict.status}`}
        className="w-full space-y-3.5 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={onSelect}
        onFocus={onSelect}
      >
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">
                {verdict.rule_id}
              </h3>
              {verdict.severity === 'critical' ? (
                <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                  Critical
                </span>
              ) : null}
            </div>
            <p className="font-heading text-sm font-semibold text-foreground">
              {verdict.citation}
            </p>
          </div>
          <VerdictBadge status={verdict.status} />
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {verdict.reasoning}
        </p>

        {verdict.evidence ? (
          <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
            <FileSearch className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-foreground">Detected evidence: </span>
              <code className="break-words font-mono font-medium text-foreground bg-background/80 px-1.5 py-0.5 rounded border border-border/40">
                {verdict.evidence}
              </code>
            </div>
          </div>
        ) : null}

        {verdict.failure_message ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <span className="font-semibold">Next step: </span>
              <span>{verdict.failure_message}</span>
            </div>
          </div>
        ) : null}

        <dl className="grid grid-cols-3 gap-2 border-t border-border/50 pt-3 text-xs">
          <div className="rounded bg-muted/40 p-2">
            <dt className="text-[11px] font-medium text-muted-foreground">Confidence</dt>
            <dd className="mt-0.5 font-semibold text-foreground">
              {Math.round(verdict.confidence * 100)}%
            </dd>
          </div>
          <div className="rounded bg-muted/40 p-2">
            <dt className="text-[11px] font-medium text-muted-foreground">Method</dt>
            <dd className="mt-0.5 truncate font-semibold text-foreground" title={methods[verdict.measurement_method]}>
              {methods[verdict.measurement_method]}
            </dd>
          </div>
          <div className="rounded bg-muted/40 p-2">
            <dt className="text-[11px] font-medium text-muted-foreground">Review state</dt>
            <dd className="mt-0.5 font-semibold capitalize text-foreground">
              {(verdict.review_state ?? 'unreviewed').replaceAll('_', ' ')}
            </dd>
          </div>
        </dl>
      </button>
    </article>
  );
}
