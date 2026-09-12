import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label="Inspection result pages"
      className="bg-white rounded-kinetic border border-[#EBE5DB] px-5 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm"
    >
      <div className="text-xs font-mono text-kinetic-textMuted">
        Displaying <strong className="text-kinetic-charcoal">{start}–{end}</strong> of{' '}
        <strong className="text-kinetic-charcoal">{total}</strong> filtered records (Page {page} of {pages})
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 h-auto rounded-kinetic-sm bg-[#FAF8F3] border border-[#EBE5DB] font-mono text-xs text-kinetic-charcoal hover:border-kinetic-charcoal disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </Button>
        <div className="inline-flex items-center px-3 py-1 rounded-kinetic-sm bg-kinetic-terracotta text-white font-mono text-xs font-bold shadow-sm">
          Page {page} of {pages}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-1 px-3 py-1.5 h-auto rounded-kinetic-sm bg-[#FAF8F3] border border-[#EBE5DB] font-mono text-xs text-kinetic-charcoal hover:border-kinetic-charcoal disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </Button>
      </div>
    </nav>
  );
}
