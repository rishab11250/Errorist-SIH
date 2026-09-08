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

export default function RepositoryPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const router = useRouter();
  const auth = useOptionalAuth();
  const sourceParams = searchParams;
  const initialFilters = useMemo(() => filtersFromParams(sourceParams), []);
  const initialPage = Math.max(1, Number.parseInt(String(sourceParams.page ?? '1'), 10) || 1);
  const [filters, setFilters] = useState(initialFilters);
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

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">Operations</p>
          <h1 className="text-h1">Inspection repository</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Search evidence, narrow compliance findings, and reopen the exact inspection record.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`/api/exports/scans.csv?${query}`}>
            <Download aria-hidden="true" /> Download filtered CSV
          </a>
        </Button>
      </header>

      <ScanFilters
        value={filters}
        onApply={applyFilters}
        showOwner={auth?.user?.role === 'admin'}
      />

      <p
        ref={announceRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className="text-sm text-muted-foreground"
      >
        {loading
          ? 'Loading inspections…'
          : result
            ? `${result.total} inspection${result.total === 1 ? '' : 's'} found.`
            : ''}
      </p>
      {error ? (
        <div role="alert" className="rounded-md border border-fail/30 bg-fail/10 p-4 text-fail">
          <p className="font-semibold">Unable to load the repository</p>
          <p>{error}</p>
        </div>
      ) : null}
      {result && !loading ? (
        <>
          <ScanResults rows={result.items} returnQuery={`?${query}`} />
          <Pagination
            page={result.page}
            pageSize={result.page_size}
            total={result.total}
            onPageChange={changePage}
          />
        </>
      ) : null}
    </div>
  );
}
