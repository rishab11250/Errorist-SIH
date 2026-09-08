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
  const initialFilters = useMemo(() => filtersFromParams(initialSearchParams), []);
  const [filters, setFilters] = useState(initialFilters);
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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Analytics</p>
        <h1 className="text-h1">Compliance dashboard</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Operational totals and failure patterns for exactly the same scope as the repository.
        </p>
      </header>
      <ScanFilters value={filters} onApply={applyFilters} showOwner={user?.role === 'admin'} />
      {loading ? <p role="status">Loading dashboard…</p> : null}
      {error ? (
        <div role="alert" className="surface-panel space-y-3 border-fail/30 p-5 text-fail">
          <p className="font-semibold">Unable to load dashboard</p>
          <p>{error}</p>
          <Button type="button" variant="outline" onClick={() => setReload((value) => value + 1)}>
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
            <section className="surface-panel p-5" aria-labelledby="recent-activity-heading">
              <h2 id="recent-activity-heading" className="text-h2">
                Recent activity
              </h2>
              <ul className="mt-4 divide-y">
                {data.recent_activity.map((row) => (
                  <li
                    key={row.scan_id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <Link
                        href={`/scan/${row.scan_id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        Inspection #{row.scan_id}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {row.product || 'Unnamed product'} ·{' '}
                        {new Date(row.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span className="text-sm font-semibold capitalize">
                      {row.overall_status.replaceAll('_', ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <div className="surface-panel p-8 text-center">
            <h2 className="text-h2">No inspections in this scope</h2>
            <p className="mt-2 text-muted-foreground">
              Reset the filters or start a new inspection.
            </p>
            <Button asChild className="mt-4">
              <Link href="/">New inspection</Link>
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}
