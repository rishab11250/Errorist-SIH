import { CircleCheckBig, ClipboardList, ShieldAlert, TrendingUp } from 'lucide-react';

import { NumberTicker } from '@/components/ui/number-ticker';
import type { DashboardData } from '@/lib/operations';

export function MetricCards({ data }: { data: DashboardData }) {
  const metrics = [
    { label: 'Total inspections', value: data.total_scans, suffix: '', icon: ClipboardList },
    {
      label: 'Pass rate',
      value: Math.round(data.pass_rate * 100),
      suffix: '%',
      icon: CircleCheckBig,
    },
    {
      label: 'Needs attention',
      value: data.status_counts.fail + data.status_counts.manual_review,
      suffix: '',
      icon: ShieldAlert,
    },
    {
      label: 'Top failed rule',
      text: data.top_failed_rule ?? 'No failures',
      icon: TrendingUp,
    },
  ] as const;
  return (
    <section aria-label="Inspection metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, icon: Icon, ...metric }) => (
        <article key={label} className="surface-panel p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-muted-foreground">{label}</p>
            <Icon aria-hidden="true" className="size-5 text-primary" />
          </div>
          <p className="mt-3 font-heading text-3xl font-semibold">
            {'text' in metric ? (
              <span className="text-xl">{metric.text}</span>
            ) : (
              <>
                <NumberTicker value={metric.value} />
                {metric.suffix}
              </>
            )}
          </p>
        </article>
      ))}
    </section>
  );
}
