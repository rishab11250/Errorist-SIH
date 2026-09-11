'use client';

import { Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Pagination } from '@/components/repository/Pagination';
import { ScanFilters } from '@/components/repository/ScanFilters';
import { ScanResults } from '@/components/repository/ScanResults';
import { Button } from '@/components/ui/button';
import { getHistory } from '@/lib/api';
import { useOptionalAuth } from '@/lib/auth';
import {
  filtersFromParams,
  filtersToParams,
  type HistoryResponse,
  type ScanFiltersValue,
} from '@/lib/operations';

type SearchParams = Record<string, string | string[] | undefined>;

export function RepositoryPage({
  initialSearchParams = {},
}: {
  initialSearchParams?: SearchParams;
}) {
  const router = useRouter();
  const auth = useOptionalAuth();
  const sourceParams = initialSearchParams;
  const initialPage = Math.max(1, Number.parseInt(String(sourceParams.page ?? '1'), 10) || 1);
  const [filters, setFilters] = useState(() => filtersFromParams(sourceParams));
  const [page, setPage] = useState(initialPage);
  const [result, setResult] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const announceRef = useRef<HTMLParagraphElement>(null);
  const focusAfterLoad = useRef(false);

  const query = useMemo(() => filtersToParams(filters, page).toString(), [filters, page]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getHistory(query)
      .then((response) => {
        if (!active) return;
        setResult(response);
        if (focusAfterLoad.current) {
          requestAnimationFrame(() => announceRef.current?.focus());
          focusAfterLoad.current = false;
        }
      })
      .catch((reason) => {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : 'The repository could not be loaded.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query]);

  useEffect(() => {
    if (!result) return;
    const savedScroll = Number.parseInt(sessionStorage.getItem('repository-scroll-y') ?? '', 10);
    if (Number.isFinite(savedScroll)) {
      requestAnimationFrame(() => window.scrollTo({ top: savedScroll }));
      sessionStorage.removeItem('repository-scroll-y');
    }
  }, [result]);

  function updateLocation(nextFilters: ScanFiltersValue, nextPage: number) {
    const nextQuery = filtersToParams(nextFilters, nextPage).toString();
    router.replace(`/history?${nextQuery}`, { scroll: false });
  }

  function applyFilters(next: ScanFiltersValue) {
    focusAfterLoad.current = true;
    setFilters(next);
    setPage(1);
    updateLocation(next, 1);
  }

  function changePage(nextPage: number) {
    focusAfterLoad.current = true;
    setPage(nextPage);
    updateLocation(filters, nextPage);
  }

  const stats = useMemo(() => {
    if (!result || !result.items) return { pass: 0, fail: 0, review: 0, total: 0 };
    let pass = 0;
    let fail = 0;
    let review = 0;
    for (const item of result.items) {
      if (item.overall_status === 'pass') pass++;
      else if (item.overall_status === 'fail') fail++;
      else if (item.overall_status === 'manual_review') review++;
    }
    return { pass, fail, review, total: result.total };
  }, [result]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Page Header & Main Export CTA */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-[#EBE5DB]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase font-mono tracking-wider text-kinetic-terracotta font-semibold">
              Compliance Repository
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-kinetic-terracotta"></span>
            <span className="text-xs font-mono text-kinetic-textMuted">LMPC Rule 6 &amp; 11 Records</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-kinetic-charcoal">
            Inspection Repository
          </h1>
          <p className="text-sm text-kinetic-textMuted mt-1 max-w-2xl">
            Search evidence, narrow compliance findings, and reopen the exact inspection record.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            asChild
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 h-auto rounded-kinetic bg-kinetic-charcoal hover:bg-kinetic-charcoalLight text-white text-xs font-mono font-semibold tracking-wide transition shadow-sm group"
          >
            <a href={`/api/exports/scans.csv?${query}`}>
              <Download aria-hidden="true" className="w-4 h-4 text-[#F7A678] group-hover:translate-y-0.5 transition-transform" />
              <span>Download Filtered CSV</span>
            </a>
          </Button>
        </div>
      </div>

      {/* Quick Stat Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border-l-4 border-kinetic-terracotta p-3.5 rounded-r-kinetic border-y border-r border-[#EBE5DB] shadow-sm">
          <div className="text-[11px] font-mono text-kinetic-textMuted uppercase tracking-wider">Total Stored Scans</div>
          <div className="text-xl font-bold font-display text-kinetic-charcoal mt-1">
            {result ? result.total : 0}
          </div>
        </div>
        <div className="bg-white border-l-4 border-kinetic-forest p-3.5 rounded-r-kinetic border-y border-r border-[#EBE5DB] shadow-sm">
          <div className="text-[11px] font-mono text-kinetic-textMuted uppercase tracking-wider">Statutory Pass</div>
          <div className="text-xl font-bold font-display text-kinetic-forest mt-1">
            {stats.pass}
          </div>
        </div>
        <div className="bg-white border-l-4 border-kinetic-review p-3.5 rounded-r-kinetic border-y border-r border-[#EBE5DB] shadow-sm">
          <div className="text-[11px] font-mono text-kinetic-textMuted uppercase tracking-wider">Manual Review Req.</div>
          <div className="text-xl font-bold font-display text-kinetic-review mt-1">
            {stats.review}
          </div>
        </div>
        <div className="bg-white border-l-4 border-kinetic-fail p-3.5 rounded-r-kinetic border-y border-r border-[#EBE5DB] shadow-sm">
          <div className="text-[11px] font-mono text-kinetic-textMuted uppercase tracking-wider">Definitive Breaches</div>
          <div className="text-xl font-bold font-display text-kinetic-fail mt-1">
            {stats.fail}
          </div>
        </div>
      </div>

      <ScanFilters
        value={filters}
        onApply={applyFilters}
        showOwner={auth?.user?.role === 'admin'}
      />

      <div className="flex items-center justify-between px-1">
        <p
          ref={announceRef}
          role="status"
          aria-live="polite"
          tabIndex={-1}
          className="text-xs font-mono text-kinetic-textMuted flex items-center gap-2"
        >
          {loading ? (
            'Loading inspections…'
          ) : result ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-kinetic-terracotta" />
              <span>
                Showing <strong className="text-kinetic-charcoal font-semibold">{result.total}</strong> inspection{result.total === 1 ? '' : 's'} found.
              </span>
            </>
          ) : (
            ''
          )}
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-kinetic border border-kinetic-fail/30 bg-kinetic-failLight p-4 text-kinetic-fail text-xs font-mono">
          <p className="font-semibold text-sm font-display mb-1">Unable to load the repository</p>
          <p>{error}</p>
        </div>
      ) : null}

      {result && !loading ? (
        <div className="space-y-4">
          <ScanResults rows={result.items} returnQuery={`?${query}`} />
          <Pagination
            page={result.page}
            pageSize={result.page_size}
            total={result.total}
            onPageChange={changePage}
          />
        </div>
      ) : null}
    </div>
  );
}
