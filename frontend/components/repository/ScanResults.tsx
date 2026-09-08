'use client';

import { CircleHelp, Eye, ShieldCheck, ShieldX, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { HistoryItem } from '@/lib/operations';

const statusPresentation = {
  pass: { label: 'Pass', icon: ShieldCheck, className: 'text-pass' },
  fail: { label: 'Fail', icon: ShieldX, className: 'text-fail' },
  mixed: { label: 'Mixed', icon: TriangleAlert, className: 'text-warn' },
  manual_review: { label: 'Manual review', icon: CircleHelp, className: 'text-review' },
} as const;

function ResultLink({ row, returnQuery }: { row: HistoryItem; returnQuery: string }) {
  const href = `/scan/${row.scan_id}?returnTo=${encodeURIComponent(`/history${returnQuery}`)}`;
  return (
    <Button asChild variant="outline" size="sm">
      <Link
        href={href}
        onClick={() => {
          sessionStorage.setItem('repository-scroll-y', String(window.scrollY));
        }}
        aria-label={`View inspection ${row.scan_id}`}
      >
        <Eye aria-hidden="true" /> View
      </Link>
    </Button>
  );
}

function Status({ status }: { status: HistoryItem['overall_status'] }) {
  const item = statusPresentation[status];
  const Icon = item.icon;
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold', item.className)}>
      <Icon aria-hidden="true" className="size-4" /> {item.label}
    </span>
  );
}

interface ScanResultsProps {
  rows: HistoryItem[];
  returnQuery: string;
}

export function ScanResults({ rows, returnQuery }: ScanResultsProps) {
  if (!rows.length) {
    return (
      <div className="surface-panel p-8 text-center">
        <h2 className="text-h2">No matching inspections</h2>
        <p className="mt-2 text-muted-foreground">Reset or broaden the active filters.</p>
      </div>
    );
  }
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border bg-surface md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Filtered inspection results</caption>
          <thead className="bg-muted/70 text-left">
            <tr>
              <th scope="col" className="p-3">
                Inspection
              </th>
              <th scope="col" className="p-3">
                Product
              </th>
              <th scope="col" className="p-3">
                Status
              </th>
              <th scope="col" className="p-3">
                Mode
              </th>
              <th scope="col" className="p-3">
                Findings P/F/W/MR
              </th>
              <th scope="col" className="p-3">
                Created
              </th>
              <th scope="col" className="p-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.scan_id} className="border-t">
                <th scope="row" className="p-3 text-left font-mono">
                  #{row.scan_id}
                </th>
                <td className="max-w-52 truncate p-3">{row.product || 'Unnamed product'}</td>
                <td className="p-3">
                  <Status status={row.overall_status} />
                </td>
                <td className="p-3 capitalize">{row.mode.replaceAll('_', ' ')}</td>
                <td className="p-3 tabular-nums">
                  {row.verdict_summary.pass}/{row.verdict_summary.fail}/{row.verdict_summary.warn}/
                  {row.verdict_summary.manual_review}
                </td>
                <td className="p-3">{new Date(row.created_at).toLocaleString()}</td>
                <td className="p-3">
                  <ResultLink row={row} returnQuery={returnQuery} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 md:hidden">
        {rows.map((row) => (
          <article key={row.scan_id} className="surface-panel space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-sm">Inspection #{row.scan_id}</p>
                <h2 className="font-heading font-semibold">{row.product || 'Unnamed product'}</h2>
              </div>
              <Status status={row.overall_status} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Mode</dt>
                <dd className="capitalize">{row.mode.replaceAll('_', ' ')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd>{new Date(row.created_at).toLocaleDateString()}</dd>
              </div>
            </dl>
            <ResultLink row={row} returnQuery={returnQuery} />
          </article>
        ))}
      </div>
    </>
  );
}
