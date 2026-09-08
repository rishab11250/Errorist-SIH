'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { DashboardData } from '@/lib/operations';

export function RuleFailuresChart({ rules }: { rules: DashboardData['top_failed_rules'] }) {
  return (
    <section className="surface-panel space-y-5 p-5" aria-labelledby="rule-failures-heading">
      <div>
        <h2 id="rule-failures-heading" className="text-h2">
          Most failed rules
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Failed verdicts grouped by rule.</p>
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
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="rule_id" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [Number(value), 'Failures']} />
                <Bar dataKey="count" name="Failures" fill="#b91c1c" radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table aria-label="Failed rule data" className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Rule</th>
                <th className="py-2 text-right">Failures</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((item) => (
                <tr key={item.rule_id} className="border-b last:border-0">
                  <th scope="row" className="py-2 text-left font-mono font-medium">
                    {item.rule_id}
                  </th>
                  <td className="py-2 text-right tabular-nums">{item.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <div className="rounded-md bg-pass/10 p-5 text-sm text-pass">
          <p className="font-semibold">No failed rules in this filter set.</p>
          <p>Broaden the filters to compare other inspection periods.</p>
        </div>
      )}
    </section>
  );
}
