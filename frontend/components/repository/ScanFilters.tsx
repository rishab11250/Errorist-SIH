'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { emptyScanFilters, type ScanFiltersValue } from '@/lib/operations';

interface ScanFiltersProps {
  value: ScanFiltersValue;
  onApply: (value: ScanFiltersValue) => void;
  showOwner?: boolean;
}

export function ScanFilters({ value, onApply, showOwner = true }: ScanFiltersProps) {
  const [draft, setDraft] = useState(value);

  function update<Key extends keyof ScanFiltersValue>(key: Key, next: ScanFiltersValue[Key]) {
    setDraft((current) => ({ ...current, [key]: next }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onApply({ ...draft, q: draft.q.trim(), rule_id: draft.rule_id.trim() });
  }

  return (
    <form className="bg-white rounded-kinetic border border-[#EBE5DB] p-4 sm:p-5 shadow-sm space-y-4" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="scan-search" className="text-xs font-mono uppercase tracking-wider text-kinetic-textMuted font-medium">
            Search inspections
          </Label>
          <Input
            id="scan-search"
            type="search"
            value={draft.q}
            onChange={(event) => update('q', event.target.value)}
            placeholder="Product, OCR text, evidence, or rule"
            className="h-10 bg-[#FAF8F3] border-[#EBE5DB] rounded-kinetic text-xs sm:text-sm font-sans placeholder:text-zinc-400 focus:border-kinetic-terracotta focus:ring-kinetic-terracotta text-kinetic-charcoal"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scan-mode" className="text-xs font-mono uppercase tracking-wider text-kinetic-textMuted font-medium">
            Mode
          </Label>
          <select
            id="scan-mode"
            value={draft.mode}
            onChange={(event) => update('mode', event.target.value as ScanFiltersValue['mode'])}
            className="h-10 w-full rounded-kinetic border border-[#EBE5DB] bg-[#FAF8F3] px-3 text-xs sm:text-sm font-sans text-kinetic-charcoal focus:border-kinetic-terracotta focus:outline-none focus:ring-1 focus:ring-kinetic-terracotta cursor-pointer"
          >
            <option value="">All modes</option>
            <option value="retail_image">Retail package</option>
            <option value="ecommerce_listing">E-commerce listing</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="overall-status" className="text-xs font-mono uppercase tracking-wider text-kinetic-textMuted font-medium">
            Overall status
          </Label>
          <select
            id="overall-status"
            value={draft.overall_status}
            onChange={(event) =>
              update('overall_status', event.target.value as ScanFiltersValue['overall_status'])
            }
            className="h-10 w-full rounded-kinetic border border-[#EBE5DB] bg-[#FAF8F3] px-3 text-xs sm:text-sm font-sans text-kinetic-charcoal focus:border-kinetic-terracotta focus:outline-none focus:ring-1 focus:ring-kinetic-terracotta cursor-pointer"
          >
            <option value="">All statuses</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="mixed">Mixed</option>
            <option value="manual_review">Manual review</option>
          </select>
        </div>
      </div>

      <details className="rounded-kinetic border border-[#F2EDE4] bg-[#FAF8F3]/50 p-3.5 transition">
        <summary className="touch-target flex cursor-pointer items-center justify-between font-mono text-xs font-semibold uppercase tracking-wider text-kinetic-textMuted hover:text-kinetic-charcoal select-none">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-kinetic-terracotta"></span>
            Advanced filters
          </span>
          <span className="text-[11px] font-mono text-kinetic-textMuted lowercase font-normal">click to expand / collapse</span>
        </summary>
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 pt-3 border-t border-[#F2EDE4]">
          <div className="space-y-1">
            <Label htmlFor="scan-category" className="text-[11px] font-mono text-kinetic-textMuted">
              Category
            </Label>
            <select
              id="scan-category"
              value={draft.category}
              onChange={(event) =>
                update('category', event.target.value as ScanFiltersValue['category'])
              }
              className="h-9 w-full rounded-kinetic-sm border border-[#EBE5DB] bg-white px-2.5 text-xs font-sans text-kinetic-charcoal focus:border-kinetic-terracotta focus:outline-none"
            >
              <option value="">All categories</option>
              <option value="food">Food</option>
              <option value="non_food">Non-food</option>
              <option value="cosmetics">Cosmetics</option>
              <option value="seeds">Seeds</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rule-id" className="text-[11px] font-mono text-kinetic-textMuted">
              Rule ID
            </Label>
            <Input
              id="rule-id"
              value={draft.rule_id}
              onChange={(event) => update('rule_id', event.target.value)}
              placeholder="e.g. r7_font_size"
              className="h-9 rounded-kinetic-sm border-[#EBE5DB] bg-white text-xs font-mono placeholder:text-zinc-400 focus:border-kinetic-terracotta"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="verdict-status" className="text-[11px] font-mono text-kinetic-textMuted">
              Verdict status
            </Label>
            <select
              id="verdict-status"
              value={draft.verdict_status}
              onChange={(event) =>
                update('verdict_status', event.target.value as ScanFiltersValue['verdict_status'])
              }
              className="h-9 w-full rounded-kinetic-sm border border-[#EBE5DB] bg-white px-2.5 text-xs font-sans text-kinetic-charcoal focus:border-kinetic-terracotta focus:outline-none"
            >
              <option value="">All verdicts</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="warn">Warning</option>
              <option value="manual_review">Manual review</option>
              <option value="na">Not applicable</option>
            </select>
          </div>
          {showOwner ? (
            <div className="space-y-1">
              <Label htmlFor="owner-id" className="text-[11px] font-mono text-kinetic-textMuted">
                Owner ID
              </Label>
              <Input
                id="owner-id"
                inputMode="numeric"
                value={draft.owner_id}
                onChange={(event) => update('owner_id', event.target.value.replace(/\D/g, ''))}
                className="h-9 rounded-kinetic-sm border-[#EBE5DB] bg-white text-xs font-mono focus:border-kinetic-terracotta"
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="created-from" className="text-[11px] font-mono text-kinetic-textMuted">
              Created from
            </Label>
            <Input
              id="created-from"
              type="date"
              value={draft.created_from}
              onChange={(event) => update('created_from', event.target.value)}
              className="h-9 rounded-kinetic-sm border-[#EBE5DB] bg-white text-xs font-mono focus:border-kinetic-terracotta"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="created-to" className="text-[11px] font-mono text-kinetic-textMuted">
              Created to
            </Label>
            <Input
              id="created-to"
              type="date"
              value={draft.created_to}
              onChange={(event) => update('created_to', event.target.value)}
              className="h-9 rounded-kinetic-sm border-[#EBE5DB] bg-white text-xs font-mono focus:border-kinetic-terracotta"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="scan-sort" className="text-[11px] font-mono text-kinetic-textMuted">
              Sort
            </Label>
            <select
              id="scan-sort"
              value={draft.sort}
              onChange={(event) => update('sort', event.target.value as ScanFiltersValue['sort'])}
              className="h-9 w-full rounded-kinetic-sm border border-[#EBE5DB] bg-white px-2.5 text-xs font-sans text-kinetic-charcoal focus:border-kinetic-terracotta focus:outline-none"
            >
              <option value="created_desc">Newest first</option>
              <option value="created_asc">Oldest first</option>
            </select>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <Button
          type="submit"
          className="px-4 py-2 h-auto rounded-kinetic-sm bg-kinetic-terracotta hover:bg-kinetic-terracottaHover text-white text-xs font-semibold font-mono tracking-wide shadow-sm transition"
        >
          Apply filters
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft(emptyScanFilters);
            onApply(emptyScanFilters);
          }}
          className="px-3 py-2 h-auto rounded-kinetic-sm bg-[#FAF8F3] border border-[#EBE5DB] hover:border-kinetic-charcoal text-xs font-mono text-kinetic-charcoal transition"
        >
          Reset filters
        </Button>
      </div>
    </form>
  );
}
