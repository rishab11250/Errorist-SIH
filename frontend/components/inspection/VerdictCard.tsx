import type { Verdict } from '@/lib/types';
import { cn } from '@/lib/cn';

import { VerdictBadge } from './VerdictBadge';

const methods: Record<Verdict['measurement_method'], string> = {
  direct_metadata: 'Direct image metadata',
  geometry_estimate: 'Image geometry estimate',
  relative_readability: 'Relative readability',
  not_measurable: 'Not measurable from this image',
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
        'surface-panel overflow-hidden transition-colors',
        active && 'border-primary ring-2 ring-primary/20'
      )}
    >
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${verdict.citation}: ${verdict.status}`}
        className="w-full space-y-3 p-4 text-left"
        onClick={onSelect}
        onFocus={onSelect}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-heading text-sm font-semibold">{verdict.rule_id}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{verdict.citation}</p>
          </div>
          <VerdictBadge status={verdict.status} />
        </div>
        <p className="text-sm leading-6">{verdict.reasoning}</p>
        {verdict.evidence ? (
          <p className="text-sm">
            <span className="font-semibold">Detected evidence:</span>{' '}
            <code className="break-words rounded bg-muted px-1.5 py-0.5">{verdict.evidence}</code>
          </p>
        ) : null}
        {verdict.failure_message ? (
          <p className="rounded-md bg-muted p-3 text-sm">
            <span className="font-semibold">Next step:</span> {verdict.failure_message}
          </p>
        ) : null}
        <dl className="grid gap-3 border-t pt-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Confidence</dt>
            <dd className="mt-1 font-semibold">{Math.round(verdict.confidence * 100)}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Assessment method</dt>
            <dd className="mt-1 font-semibold">{methods[verdict.measurement_method]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Review state</dt>
            <dd className="mt-1 font-semibold capitalize">
              {(verdict.review_state ?? 'unreviewed').replaceAll('_', ' ')}
            </dd>
          </div>
        </dl>
      </button>
    </article>
  );
}
