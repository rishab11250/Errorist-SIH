import type { Verdict } from '@/lib/types';
import { VerdictBadge } from './VerdictBadge';

const methods: Record<Verdict['measurement_method'], string> = {
  direct_metadata: 'Direct image metadata',
  geometry_estimate: 'Image geometry estimate',
  relative_readability: 'Relative readability',
  not_measurable: 'Not measurable from this image',
};

export function VerdictCard({ verdict }: { verdict: Verdict }) {
  return (
    <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-mono text-sm font-semibold text-slate-900">{verdict.rule_id}</h3>
          <p className="mt-1 text-xs text-slate-500">{verdict.citation}</p>
        </div>
        <VerdictBadge status={verdict.status} />
      </div>
      <p className="text-sm leading-6 text-slate-700">{verdict.reasoning}</p>
      {verdict.evidence && (
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Detected evidence:</span>{' '}
          <code className="break-words rounded bg-slate-100 px-1.5 py-0.5">{verdict.evidence}</code>
        </p>
      )}
      {verdict.failure_message && (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <span className="font-semibold">Next step:</span> {verdict.failure_message}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
        <div>
          <dt className="text-slate-500">Confidence</dt>
          <dd className="mt-1 font-semibold text-slate-800">{Math.round(verdict.confidence * 100)}%</dd>
        </div>
        <div>
          <dt className="text-slate-500">Assessment method</dt>
          <dd className="mt-1 font-semibold text-slate-800">{methods[verdict.measurement_method]}</dd>
        </div>
      </dl>
    </article>
  );
}
