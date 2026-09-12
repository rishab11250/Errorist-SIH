import { CircleCheckBig, ClipboardList, ShieldAlert, TrendingUp } from 'lucide-react';

import { NumberTicker } from '@/components/ui/number-ticker';
import { cn } from '@/lib/cn';
import type { DashboardData } from '@/lib/operations';

export function MetricCards({ data }: { data: DashboardData }) {
  const metrics = [
    {
      label: 'Total inspections',
      value: data.total_scans,
      suffix: '',
      icon: ClipboardList,
      borderClass: 'border-l-kinetic-terracotta',
      iconClass: 'bg-kinetic-terracottaLight text-kinetic-terracotta',
      subtitle: 'Across all ingestion channels',
    },
    {
      label: 'Statutory pass rate',
      value: Math.round(data.pass_rate * 100),
      suffix: '%',
      icon: CircleCheckBig,
      borderClass: 'border-l-kinetic-forest',
      iconClass: 'bg-kinetic-forestLight text-kinetic-forest',
      subtitle: `${data.status_counts.pass} conforming scans`,
    },
    {
      label: 'Needs attention',
      value: data.status_counts.fail + data.status_counts.manual_review,
      suffix: '',
      icon: ShieldAlert,
      borderClass: 'border-l-kinetic-review',
      iconClass: 'bg-kinetic-reviewLight text-kinetic-review',
      subtitle: `${data.status_counts.manual_review} review / ${data.status_counts.fail} fail`,
    },
    {
      label: 'Top failed rule',
      text: data.top_failed_rule ?? 'No failures',
      icon: TrendingUp,
      borderClass: 'border-l-kinetic-fail',
      iconClass: 'bg-kinetic-failLight text-kinetic-fail',
      subtitle: 'Highest frequency infraction',
    },
  ] as const;

  return (
    <section aria-label="Inspection metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, icon: Icon, borderClass, iconClass, subtitle, ...metric }) => (
        <article
          key={label}
          className={cn(
            'bg-white rounded-r-kinetic border-l-4 p-4 border-y border-r border-[#EBE5DB] shadow-sm',
            borderClass
          )}
        >
          <div className="flex items-center justify-between gap-3 text-xs text-kinetic-textMuted mb-1">
            <span className="font-mono text-[11px] uppercase tracking-wider font-medium">{label}</span>
            <div className={cn('w-7 h-7 rounded-full flex items-center justify-center', iconClass)}>
              <Icon aria-hidden="true" className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-kinetic-charcoal">
              {'text' in metric ? (
                <span className="text-xl sm:text-2xl font-mono">{metric.text}</span>
              ) : (
                <>
                  <NumberTicker value={metric.value} />
                  {metric.suffix}
                </>
              )}
            </span>
          </div>
          <p className="text-[11px] font-mono text-kinetic-textMuted mt-1">{subtitle}</p>
        </article>
      ))}
    </section>
  );
}
