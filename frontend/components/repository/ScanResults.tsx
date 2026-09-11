'use client';

import { ArrowRight, CircleHelp, Eye, ShieldCheck, ShieldX, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { HistoryItem } from '@/lib/operations';

const statusPresentation = {
  pass: {
    label: 'Pass',
    icon: ShieldCheck,
    badgeClass: 'bg-kinetic-forestLight text-kinetic-forest border-kinetic-forest/20',
    dotClass: 'bg-kinetic-forest',
    borderClass: 'border-l-kinetic-forest',
  },
  fail: {
    label: 'Fail',
    icon: ShieldX,
    badgeClass: 'bg-kinetic-failLight text-kinetic-fail border-kinetic-fail/20',
    dotClass: 'bg-kinetic-fail',
    borderClass: 'border-l-kinetic-fail',
  },
  mixed: {
    label: 'Mixed',
    icon: TriangleAlert,
    badgeClass: 'bg-kinetic-warnLight text-kinetic-warn border-kinetic-warn/20',
    dotClass: 'bg-kinetic-warn',
    borderClass: 'border-l-kinetic-warn',
  },
  manual_review: {
    label: 'Manual Review',
    icon: CircleHelp,
    badgeClass: 'bg-kinetic-reviewLight text-kinetic-review border-kinetic-review/20',
    dotClass: 'bg-kinetic-review',
    borderClass: 'border-l-kinetic-review',
  },
} as const;

function ResultLink({ row, returnQuery }: { row: HistoryItem; returnQuery: string }) {
  const href = `/scan/${row.scan_id}?returnTo=${encodeURIComponent(`/history${returnQuery}`)}`;
  return (
    <Button asChild variant="outline" size="sm" className="h-auto">
      <Link
        href={href}
        onClick={() => {
          sessionStorage.setItem('repository-scroll-y', String(window.scrollY));
        }}
        aria-label={`View inspection ${row.scan_id}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kinetic-sm bg-white border border-[#EBE5DB] hover:border-kinetic-terracotta hover:text-kinetic-terracotta font-mono text-xs font-medium text-kinetic-charcoal shadow-sm transition"
      >
        <Eye aria-hidden="true" className="w-3.5 h-3.5 text-zinc-400" />
        <span>View</span>
        <ArrowRight aria-hidden="true" className="w-3 h-3 text-zinc-400" />
      </Link>
    </Button>
  );
}

function Status({ status }: { status: HistoryItem['overall_status'] }) {
  const item = statusPresentation[status];
  const Icon = item.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium border',
        item.badgeClass
      )}
    >
      <Icon aria-hidden="true" className="w-3 h-3" />
      <span>{item.label}</span>
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
      <div className="bg-white rounded-kinetic border-2 border-dashed border-[#EBE5DB] p-8 text-center max-w-lg mx-auto shadow-sm my-6">
        <div className="w-12 h-12 rounded-full bg-kinetic-terracottaLight text-kinetic-terracotta mx-auto flex items-center justify-center mb-3">
          <CircleHelp className="w-6 h-6" />
        </div>
        <h2 className="font-display font-bold text-base text-kinetic-charcoal">No matching inspections</h2>
        <p className="text-xs text-kinetic-textMuted mt-1 leading-relaxed">
          Reset or broaden the active filters.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-kinetic border border-[#EBE5DB] bg-white shadow-sm md:block">
        <table className="w-full text-left border-collapse text-xs font-sans">
          <caption className="sr-only">Filtered inspection results</caption>
          <thead className="bg-[#FAF8F3] border-b border-[#EBE5DB] text-[11px] font-mono uppercase tracking-wider text-kinetic-textMuted">
            <tr>
              <th scope="col" className="py-3 px-4 font-semibold">
                Inspection
              </th>
              <th scope="col" className="py-3 px-4 font-semibold">
                Product
              </th>
              <th scope="col" className="py-3 px-4 font-semibold">
                Status
              </th>
              <th scope="col" className="py-3 px-4 font-semibold">
                Mode
              </th>
              <th scope="col" className="py-3 px-4 font-semibold">
                Findings P/F/W/MR
              </th>
              <th scope="col" className="py-3 px-4 font-semibold">
                Created
              </th>
              <th scope="col" className="py-3 px-4 text-right font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F2EDE4]">
            {rows.map((row) => {
              const item = statusPresentation[row.overall_status];
              return (
                <tr key={row.scan_id} className="hover:bg-kinetic-terracottaLight/20 transition-colors group">
                  <th scope="row" className="py-3.5 px-4 font-mono font-semibold text-kinetic-charcoal text-left">
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full', item.dotClass)} />
                      <span className="group-hover:text-kinetic-terracotta transition-colors">#{row.scan_id}</span>
                    </div>
                  </th>
                  <td className="max-w-56 truncate py-3.5 px-4 font-medium text-kinetic-charcoal">
                    {row.product || 'Unnamed product'}
                  </td>
                  <td className="py-3.5 px-4">
                    <Status status={row.overall_status} />
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-mono text-[11px] bg-[#FAF8F3] px-2 py-0.5 rounded border border-[#EBE5DB] text-kinetic-charcoal capitalize">
                      {row.mode.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-kinetic-forestLight text-kinetic-forest font-bold text-[11px]">
                        {row.verdict_summary.pass} P
                      </span>
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-kinetic-failLight text-kinetic-fail font-bold text-[11px]">
                        {row.verdict_summary.fail} F
                      </span>
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-kinetic-warnLight text-kinetic-warn font-bold text-[11px]">
                        {row.verdict_summary.warn} W
                      </span>
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-kinetic-reviewLight text-kinetic-review font-bold text-[11px]">
                        {row.verdict_summary.manual_review} R
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-kinetic-textMuted">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <ResultLink row={row} returnQuery={returnQuery} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => {
          const item = statusPresentation[row.overall_status];
          return (
            <article
              key={row.scan_id}
              className={cn(
                'bg-white rounded-kinetic border border-[#EBE5DB] border-l-4 p-4 shadow-sm space-y-3',
                item.borderClass
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-kinetic-textMuted font-bold">Inspection #{row.scan_id}</p>
                  <h2 className="font-display font-semibold text-sm text-kinetic-charcoal mt-0.5">
                    {row.product || 'Unnamed product'}
                  </h2>
                </div>
                <Status status={row.overall_status} />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-xs font-mono pt-2 border-t border-[#F2EDE4]">
                <div>
                  <dt className="text-kinetic-textMuted text-[11px]">Mode</dt>
                  <dd className="capitalize text-kinetic-charcoal font-medium mt-0.5">
                    {row.mode.replaceAll('_', ' ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-kinetic-textMuted text-[11px]">Created</dt>
                  <dd className="text-kinetic-charcoal font-medium mt-0.5">
                    {new Date(row.created_at).toLocaleDateString()}
                  </dd>
                </div>
              </dl>
              <div className="pt-2">
                <ResultLink row={row} returnQuery={returnQuery} />
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
