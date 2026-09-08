import type { DashboardData } from '@/lib/operations';

export function DashboardCards({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card label="Total scans" value={String(data.total_scans)} />
      <Card label="Pass rate" value={`${Math.round(data.pass_rate * 100)}%`} />
      <Card label="Top failed rule" value={data.top_failed_rule ?? '—'} mono />
      <Card label="Recent" value={`${data.recent_activity.length} scans`} />
    </div>
  );
}
function Card({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded border bg-card p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${mono ? 'font-mono text-sm' : ''}`}>{value}</div>
    </div>
  );
}
