import type { Verdict } from '@/lib/types';
import { VerdictBadge } from './VerdictBadge';

export function VerdictCard({ verdict }: { verdict: Verdict }) { return <div className="space-y-2 rounded-lg border bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-mono text-sm font-semibold">{verdict.rule_id}</h3><VerdictBadge status={verdict.status} /></div><p className="text-xs text-slate-500">{verdict.citation}</p>{verdict.evidence && <p className="text-sm"><span className="font-medium">Evidence:</span> <code className="rounded bg-slate-100 px-1">{verdict.evidence}</code></p>}{verdict.failure_message && <p className="text-sm text-slate-700"><span className="font-medium">Note:</span> {verdict.failure_message}</p>}</div>; }
