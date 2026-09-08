'use client';

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DashboardData, OverallFilter } from '@/lib/operations';

const labels: Record<OverallFilter, string> = {
  pass: 'Pass',
  fail: 'Fail',
  mixed: 'Mixed',
  manual_review: 'Manual review',
};

const colors: Record<OverallFilter, string> = {
  pass: '#15803d',
  fail: '#b91c1c',
  mixed: '#b45309',
  manual_review: '#7e22ce',
};

export function StatusChart({
  counts,
  trend = [],
}: {
  counts: DashboardData['status_counts'];
  trend?: DashboardData['daily_trend'];
}) {
  const data = (Object.keys(labels) as OverallFilter[]).map((status) => ({
    status,
    label: labels[status],
    count: counts[status],
    fill: colors[status],
  }));
  return (
    <section className="surface-panel space-y-5 p-5" aria-labelledby="status-chart-heading">
      <div>
        <h2 id="status-chart-heading" className="text-h2">
          Status distribution
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Exact totals for the active filter set.
        </p>
      </div>
      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} width={32} />
            <Tooltip formatter={(value) => [Number(value), 'Inspections']} />
            <Bar dataKey="count" name="Inspections" radius={[5, 5, 0, 0]}>
              {data.map((item) => (
                <Cell key={item.status} fill={item.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table aria-label="Scan status data" className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Status</th>
            <th className="py-2 text-right">Inspections</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.status} className="border-b last:border-0">
              <th scope="row" className="py-2 text-left font-medium">
                {item.label}
              </th>
              <td className="py-2 text-right tabular-nums">{item.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {trend.length ? (
        <div className="space-y-3 border-t pt-5">
          <h3 className="font-heading font-semibold">Inspection trend</h3>
          <div className="h-52" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} width={32} />
                <Tooltip formatter={(value) => [Number(value), 'Inspections']} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Inspections"
                  stroke="#1e40af"
                  strokeWidth={3}
                  dot
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table
            aria-label="Daily inspection trend data"
            className="w-full border-collapse text-sm"
          >
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Date</th>
                <th className="py-2 text-right">Inspections</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((item) => (
                <tr key={item.date} className="border-b last:border-0">
                  <th scope="row" className="py-2 text-left font-medium">
                    {item.date}
                  </th>
                  <td className="py-2 text-right tabular-nums">{item.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
