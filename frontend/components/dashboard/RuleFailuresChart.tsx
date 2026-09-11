'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { DashboardData } from '@/lib/operations';

export function RuleFailuresChart({ rules }: { rules: DashboardData['top_failed_rules'] }) {
  return (
    <section className="bg-white rounded-kinetic border border-[#EBE5DB] p-5 shadow-sm space-y-5" aria-labelledby="rule-failures-heading">
      <div>
        <h2 id="rule-failures-heading" className="text-base font-bold font-display text-kinetic-charcoal">
          Most Breached Legal Rules
        </h2>
        <p className="mt-0.5 text-xs text-kinetic-textMuted">Failed verdicts grouped by statutory rule citation.</p>
      </div>
      {rules.length ? (
        <>
          <div className="h-64" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rules}
                layout="vertical"
                margin={{ top: 8, right: 8, bottom: 8, left: 18 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EBE5DB" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#6B6862' }} />
                <YAxis
                  type="category"
                  dataKey="rule_id"
                  width={110}
                  tick={{ fontSize: 11, fill: '#1C1B19', fontFamily: 'var(--font-mono)' }}
                />
                <Tooltip
                  formatter={(value) => [Number(value), 'Failures']}
                  contentStyle={{
                    backgroundColor: '#FAF8F3',
                    border: '1px solid #EBE5DB',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Failures" fill="#B3261E" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table aria-label="Failed rule data" className="w-full border-collapse text-xs text-left font-sans">
              <thead className="bg-[#FAF8F3] text-kinetic-textMuted text-[11px] font-mono border-b border-[#EBE5DB]">
                <tr>
                  <th className="p-2.5 rounded-l">Rule Citation</th>
                  <th className="p-2.5 text-right rounded-r">Failures</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2EDE4]">
                {rules.map((item) => (
                  <tr key={item.rule_id} className="hover:bg-[#FAF8F3]/50 transition-colors">
                    <th scope="row" className="p-2.5 text-left font-mono font-semibold text-kinetic-fail">
                      {item.rule_id}
                    </th>
                    <td className="p-2.5 text-right tabular-nums font-mono font-semibold text-kinetic-charcoal">
                      {item.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="rounded-kinetic bg-kinetic-forestLight border border-kinetic-forest/20 p-5 text-xs text-kinetic-forest font-mono">
          <p className="font-semibold text-sm font-sans mb-0.5">No failed rules in this filter set.</p>
          <p>Broaden the filters to compare other inspection periods.</p>
        </div>
      )}
    </section>
  );
}
