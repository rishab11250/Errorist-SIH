'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { MetricCards } from '@/components/dashboard/MetricCards';
import { RuleFailuresChart } from '@/components/dashboard/RuleFailuresChart';
import { StatusChart } from '@/components/dashboard/StatusChart';
import { ScanFilters } from '@/components/repository/ScanFilters';
import { Button } from '@/components/ui/button';
import { getDashboard } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  filtersFromParams,
  filtersToParams,
  type DashboardData,
  type ScanFiltersValue,
} from '@/lib/operations';

type SearchParams = Record<string, string | string[] | undefined>;

export function DashboardPage({
  initialSearchParams = {},
}: {
  initialSearchParams?: SearchParams;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [filters, setFilters] = useState(() => filtersFromParams(initialSearchParams));
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const query = useMemo(() => filtersToParams(filters).toString(), [filters]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getDashboard(query)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'The dashboard could not be loaded.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, reload]);

  function applyFilters(next: ScanFiltersValue) {
    setFilters(next);
    router.replace(`/dashboard?${filtersToParams(next).toString()}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#EBE5DB]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-mono tracking-wider text-kinetic-terracotta font-semibold">
              Analytics &amp; Performance
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-kinetic-terracotta"></span>
            <span className="text-xs font-mono text-kinetic-textMuted">Legal Metrology Audit Stream</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-kinetic-charcoal">
            Compliance Dashboard
          </h1>
          <p className="text-sm text-kinetic-textMuted mt-1 max-w-2xl">
            Real-time aggregated compliance intelligence, statutory pass rates, and rule violation distribution across processed packaged goods.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            asChild
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 h-auto rounded-kinetic bg-kinetic-terracotta hover:bg-kinetic-terracottaHover text-white text-xs font-mono font-semibold tracking-wide transition shadow-sm"
          >
            <Link href="/">
              <span>+ New Inspection</span>
            </Link>
          </Button>
        </div>
      </div>

      <ScanFilters value={filters} onApply={applyFilters} showOwner={user?.role === 'admin'} />

      {loading ? (
        <p role="status" className="text-xs font-mono text-kinetic-textMuted flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-kinetic-terracotta animate-pulse" />
          Loading dashboard…
        </p>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-kinetic border border-kinetic-fail/30 bg-kinetic-failLight p-5 text-kinetic-fail space-y-3 font-mono text-xs">
          <p className="font-semibold text-sm font-display text-kinetic-fail">Unable to load dashboard</p>
          <p>{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setReload((value) => value + 1)}
            className="px-3 py-1.5 h-auto rounded-kinetic-sm bg-white border border-kinetic-fail/30 text-kinetic-fail font-mono text-xs hover:bg-kinetic-failLight"
          >
            Try again
          </Button>
        </div>
      ) : null}

      {data && !loading && !error ? (
        data.total_scans ? (
          <>
            <MetricCards data={data} />
            <div className="grid gap-6 xl:grid-cols-2">
              <StatusChart counts={data.status_counts} trend={data.daily_trend} />
              <RuleFailuresChart rules={data.top_failed_rules} />
            </div>
            <section className="bg-white rounded-kinetic border border-[#EBE5DB] p-5 shadow-sm space-y-4" aria-labelledby="recent-activity-heading">
              <div className="flex items-center justify-between">
                <div>
                  <h2 id="recent-activity-heading" className="text-base font-bold font-display text-kinetic-charcoal">
                    Recent Activity
                  </h2>
                  <p className="text-xs text-kinetic-textMuted mt-0.5">
                    Latest statutory verification runs captured on this terminal.
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="h-auto">
                  <Link
                    href="/history"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-kinetic-sm bg-[#FAF8F3] border border-[#EBE5DB] font-mono text-xs text-kinetic-charcoal hover:border-kinetic-charcoal transition"
                  >
                    <span>View All in Repository</span>
                  </Link>
                </Button>
              </div>
              <ul className="divide-y divide-[#F2EDE4] text-xs">
                {data.recent_activity.map((row) => (
                  <li
                    key={row.scan_id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-[#FAF8F3]/50 px-2 rounded transition-colors"
                  >
                    <div>
                      <Link
                        href={`/scan/${row.scan_id}`}
                        className="font-mono font-semibold text-kinetic-charcoal hover:text-kinetic-terracotta transition-colors flex items-center gap-2"
                      >
                        <span>Inspection #{row.scan_id}</span>
                      </Link>
                      <p className="text-kinetic-textMuted mt-0.5">
                        <span className="font-medium text-kinetic-charcoal">{row.product || 'Unnamed product'}</span>
                        {' · '}
                        <span className="font-mono text-[11px]">{new Date(row.created_at).toLocaleString()}</span>
                      </p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium border bg-[#FAF8F3] border-[#EBE5DB] text-kinetic-charcoal capitalize">
                      {row.overall_status.replaceAll('_', ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <div className="bg-white rounded-kinetic border-2 border-dashed border-[#EBE5DB] p-8 text-center max-w-lg mx-auto shadow-sm my-6">
            <h2 className="font-display font-bold text-base text-kinetic-charcoal">No inspections in this scope</h2>
            <p className="text-xs text-kinetic-textMuted mt-1 mb-4 leading-relaxed">
              Reset the filters or start a new inspection.
            </p>
            <Button asChild className="px-4 py-2 h-auto rounded-kinetic-sm bg-kinetic-terracotta hover:bg-kinetic-terracottaHover text-white text-xs font-mono font-semibold shadow-sm transition">
              <Link href="/">New inspection</Link>
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}
