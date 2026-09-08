'use client';
import Link from 'next/link';
export interface HistoryRow {
  scan_id: number;
  thumbnail_b64: string;
  overall_status: string;
  verdict_summary: { pass: number; fail: number; warn: number; manual_review: number; na: number };
  created_at: string;
}
export function ScanHistoryTable({ rows }: { rows: HistoryRow[] }) {
  if (!rows.length) return <p className="text-muted-foreground">No scans yet.</p>;
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-muted">
          <th className="p-2 text-left text-sm">Scan</th>
          <th className="p-2 text-left text-sm">Status</th>
          <th className="p-2 text-left text-sm">Pass / Fail / Warn / NA</th>
          <th className="p-2 text-left text-sm">When</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.scan_id} className="border-t hover:bg-muted/50">
            <td className="p-2 font-mono text-sm">#{row.scan_id}</td>
            <td className="p-2 text-sm">{row.overall_status}</td>
            <td className="p-2 text-sm">
              {row.verdict_summary.pass} / {row.verdict_summary.fail} / {row.verdict_summary.warn} /{' '}
              {row.verdict_summary.na}
            </td>
            <td className="p-2 text-sm text-muted-foreground">
              {new Date(row.created_at).toLocaleString()}
            </td>
            <td className="p-2 text-sm">
              <Link href={`/scan/${row.scan_id}`} className="text-blue-600 hover:underline">
                View
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
