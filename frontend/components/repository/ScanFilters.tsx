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
    <form className="surface-panel space-y-4 p-4 sm:p-5" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="scan-search">Search inspections</Label>
          <Input
            id="scan-search"
            type="search"
            value={draft.q}
            onChange={(event) => update('q', event.target.value)}
            placeholder="Product, OCR text, evidence, or rule"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scan-mode">Mode</Label>
          <select
            id="scan-mode"
            value={draft.mode}
            onChange={(event) => update('mode', event.target.value as ScanFiltersValue['mode'])}
            className="h-11 w-full rounded-md border bg-background px-3"
          >
            <option value="">All modes</option>
            <option value="retail_image">Retail package</option>
            <option value="ecommerce_listing">E-commerce listing</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="overall-status">Overall status</Label>
          <select
            id="overall-status"
            value={draft.overall_status}
            onChange={(event) =>
              update('overall_status', event.target.value as ScanFiltersValue['overall_status'])
            }
            className="h-11 w-full rounded-md border bg-background px-3"
          >
            <option value="">All statuses</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="mixed">Mixed</option>
            <option value="manual_review">Manual review</option>
          </select>
        </div>
      </div>

      <details className="rounded-md border bg-muted/30 p-3">
        <summary className="touch-target flex cursor-pointer items-center font-semibold">
          Advanced filters
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="scan-category">Category</Label>
            <select
              id="scan-category"
              value={draft.category}
              onChange={(event) =>
                update('category', event.target.value as ScanFiltersValue['category'])
              }
              className="h-11 w-full rounded-md border bg-background px-3"
            >
              <option value="">All categories</option>
              <option value="food">Food</option>
              <option value="non_food">Non-food</option>
              <option value="cosmetics">Cosmetics</option>
              <option value="seeds">Seeds</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rule-id">Rule ID</Label>
            <Input
              id="rule-id"
              value={draft.rule_id}
              onChange={(event) => update('rule_id', event.target.value)}
              placeholder="e.g. r7_font_size"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="verdict-status">Verdict status</Label>
            <select
              id="verdict-status"
              value={draft.verdict_status}
              onChange={(event) =>
                update('verdict_status', event.target.value as ScanFiltersValue['verdict_status'])
              }
              className="h-11 w-full rounded-md border bg-background px-3"
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
            <div className="space-y-2">
              <Label htmlFor="owner-id">Owner ID</Label>
              <Input
                id="owner-id"
                inputMode="numeric"
                value={draft.owner_id}
                onChange={(event) => update('owner_id', event.target.value.replace(/\D/g, ''))}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="created-from">Created from</Label>
            <Input
              id="created-from"
              type="date"
              value={draft.created_from}
              onChange={(event) => update('created_from', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="created-to">Created to</Label>
            <Input
              id="created-to"
              type="date"
              value={draft.created_to}
              onChange={(event) => update('created_to', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scan-sort">Sort</Label>
            <select
              id="scan-sort"
              value={draft.sort}
              onChange={(event) => update('sort', event.target.value as ScanFiltersValue['sort'])}
              className="h-11 w-full rounded-md border bg-background px-3"
            >
              <option value="created_desc">Newest first</option>
              <option value="created_asc">Oldest first</option>
            </select>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap gap-3">
        <Button type="submit">Apply filters</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft(emptyScanFilters);
            onApply(emptyScanFilters);
          }}
        >
          Reset filters
        </Button>
      </div>
    </form>
  );
}
