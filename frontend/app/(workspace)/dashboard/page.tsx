'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { DashboardCards, type DashboardData } from '@/components/DashboardCards';
import { getDashboard } from '@/lib/api';

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getDashboard()
      .then((value) => setData(value as DashboardData))
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'unknown'));
  }, []);
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="text-h1">Dashboard</h1>
      {error ? <div role="alert" className="text-fail">{error}</div> : null}
      {!data && !error ? <p role="status">Loading dashboard…</p> : null}
      {data ? (
        <>
          <DashboardCards data={data} />
          <div>
            <h2 className="mb-2 text-h2">Recent activity</h2>
            {data.recent_activity.length === 0 ? (
              <p className="text-muted-foreground">No scans yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.recent_activity.map((row) => (
                  <li key={row.scan_id}>
                    <Link href={`/scan/${row.scan_id}`} className="text-primary hover:underline">
                      Scan #{row.scan_id}
                    </Link>{' '}
                    — {row.overall_status} @ {new Date(row.created_at).toLocaleString()}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
