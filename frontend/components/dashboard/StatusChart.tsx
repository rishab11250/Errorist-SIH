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
  pass: '#1F4B3F',
  fail: '#B3261E',
  mixed: '#B8860B',
  manual_review: '#9C4221',
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
    <section className="bg-white rounded-kinetic border border-[#EBE5DB] p-5 shadow-sm space-y-5" aria-labelledby="status-chart-heading">
      <div>
        <h2 id="status-chart-heading" className="text-base font-bold font-display text-kinetic-charcoal">
          Statutory Status Distribution
        </h2>
        <p className="mt-0.5 text-xs text-kinetic-textMuted">
          Exact totals for the active filter set.
        </p>
      </div>

      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE5DB" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B6862' }} />
            <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11, fill: '#6B6862' }} />
            <Tooltip
              formatter={(value) => [Number(value), 'Inspections']}
              contentStyle={{
                backgroundColor: '#FAF8F3',
                border: '1px solid #EBE5DB',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="count" name="Inspections" radius={[6, 6, 0, 0]}>
              {data.map((item) => (
                <Cell key={item.status} fill={item.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto">
        <table aria-label="Scan status data" className="w-full border-collapse text-xs text-left font-sans">
          <thead className="bg-[#FAF8F3] text-kinetic-textMuted text-[11px] font-mono border-b border-[#EBE5DB]">
            <tr>
              <th className="p-2.5 rounded-l">Status</th>
              <th className="p-2.5 text-right rounded-r">Inspections</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F2EDE4]">
            {data.map((item) => (
              <tr key={item.status} className="hover:bg-[#FAF8F3]/50 transition-colors">
                <th scope="row" className="p-2.5 text-left font-medium text-kinetic-charcoal">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.fill }} />
                    {item.label}
                  </span>
                </th>
                <td className="p-2.5 text-right tabular-nums font-mono font-semibold text-kinetic-charcoal">
                  {item.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {trend.length ? (
        <div className="space-y-3 border-t border-[#F2EDE4] pt-5">
          <h3 className="text-sm font-bold font-display text-kinetic-charcoal">Daily Inspection Trend</h3>
          <div className="h-52" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBE5DB" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B6862' }} />
                <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11, fill: '#6B6862' }} />
                <Tooltip
                  formatter={(value) => [Number(value), 'Inspections']}
                  contentStyle={{
                    backgroundColor: '#FAF8F3',
                    border: '1px solid #EBE5DB',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#1C1B19"
                  strokeWidth={2}
                  name="Total"
                  dot={{ fill: '#1C1B19', r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="pass"
                  stroke="#1F4B3F"
                  strokeWidth={2}
                  name="Pass"
                  dot={{ fill: '#1F4B3F', r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="fail"
                  stroke="#B3261E"
                  strokeWidth={2}
                  name="Fail"
                  dot={{ fill: '#B3261E', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table
              aria-label="Daily inspection trend data"
              className="w-full border-collapse text-xs text-left font-sans"
            >
              <thead className="bg-[#FAF8F3] text-kinetic-textMuted text-[11px] font-mono border-b border-[#EBE5DB]">
                <tr>
                  <th className="p-2.5 rounded-l">Date</th>
                  <th className="p-2.5 text-right rounded-r">Inspections</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2EDE4]">
                {trend.map((item) => (
                  <tr key={item.date} className="hover:bg-[#FAF8F3]/50 transition-colors">
                    <th scope="row" className="p-2.5 text-left font-mono text-kinetic-charcoal">
                      {item.date}
                    </th>
                    <td className="p-2.5 text-right tabular-nums font-mono font-semibold text-kinetic-charcoal">
                      {item.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
