'use client';

import { useEffect, useState } from 'react';
import type { Verdict } from '@/lib/types';
import { cn } from '@/lib/cn';
import {
  Check,
  CheckCircle2,
  Edit3,
  FileSearch,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

import { VerdictBadge } from './VerdictBadge';
import { EvidenceCrop } from './EvidenceCrop';

const methods: Record<Verdict['measurement_method'], string> = {
  direct_metadata: 'Direct image metadata',
  geometry_estimate: 'Image geometry estimate',
  relative_readability: 'Relative readability',
  not_measurable: 'Not measurable from this image',
};

const statusBorderMap: Record<Verdict['status'], string> = {
  pass: 'border-l-[4px] border-l-forest hover:border-l-forest/80',
  fail: 'border-l-[4px] border-l-brick hover:border-l-brick/80',
  warn: 'border-l-[4px] border-l-amber hover:border-l-amber/80',
  manual_review: 'border-l-[4px] border-l-terracotta hover:border-l-terracotta/80',
  na: 'border-l-[4px] border-l-[#A8A49D] hover:border-l-[#A8A49D]/80',
};

export interface VerdictCardProps {
  verdict: Verdict;
  active?: boolean;
  onSelect?: () => void;
  imageDataUrl?: string;
  onReviewSubmit?: (
    verdict: Verdict,
    action: 'confirmed' | 'resolved' | 'false_positive',
    finalValue: string,
    note?: string
  ) => Promise<void> | void;
}

export function VerdictCard({
  verdict,
  active = false,
  onSelect,
  imageDataUrl,
  onReviewSubmit,
}: VerdictCardProps) {
  const isManualReview = verdict.status === 'manual_review';
  const isReviewed =
    verdict.review_state === 'confirmed' ||
    verdict.review_state === 'resolved' ||
    verdict.review_state === 'false_positive';

  const [editedValue, setEditedValue] = useState(verdict.evidence || '');
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setEditedValue(verdict.evidence || '');
  }, [verdict.evidence]);

  const hasCrop = Boolean(verdict.evidence_bboxes && verdict.evidence_bboxes.length > 0);

  async function handleConfirm(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onReviewSubmit) return;
    setSubmitting(true);
    try {
      await onReviewSubmit(verdict, 'confirmed', editedValue.trim() || verdict.evidence);
      setIsEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveUpdate(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onReviewSubmit) return;
    setSubmitting(true);
    try {
      await onReviewSubmit(verdict, 'resolved', editedValue.trim());
      setIsEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFlagMissing(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onReviewSubmit) return;
    setSubmitting(true);
    try {
      await onReviewSubmit(
        verdict,
        'false_positive',
        editedValue.trim(),
        'Declaration absent or invalid on physical package'
      );
      setIsEditing(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article
      className={cn(
        'card-lift rounded-xl bg-surface-card border border-[#E0D9CD] shadow-kinetic-sm overflow-hidden transition-all duration-200 animate-fade-in-up',
        statusBorderMap[verdict.status] ?? '',
        active
          ? 'ring-2 ring-terracotta/40 shadow-kinetic-md border-terracotta bg-terracotta/[0.02]'
          : 'hover:border-[#D5CFC4]'
      )}
      data-testid={`verdict-card-${verdict.rule_id}`}
    >
      {/* Header button selects the card and announces details */}
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${verdict.citation}: ${verdict.status}`}
        className="w-full space-y-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
        onClick={onSelect}
        onFocus={onSelect}
      >
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-xs font-bold tracking-wider text-ink-muted uppercase">
                {verdict.rule_id}
              </h3>
              {verdict.severity === 'critical' ? (
                <span className="rounded bg-brick-bg border border-brick/30 px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-brick">
                  Critical
                </span>
              ) : null}
            </div>
            <p className="font-heading text-sm font-semibold text-ink">
              {verdict.citation}
            </p>
          </div>
          <VerdictBadge status={verdict.status} />
        </div>

        <p className="text-sm leading-relaxed text-ink-muted">
          {verdict.reasoning}
        </p>

        {/* Show detected evidence pill if not currently showing manual review editor */}
        {verdict.evidence && !isManualReview && !isEditing ? (
          <div className="flex items-start gap-2 rounded-lg bg-surface-dim px-3 py-2 text-xs border border-[#E0D9CD]">
            <FileSearch className="mt-0.5 size-3.5 shrink-0 text-ink-muted" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-ink">Detected evidence: </span>
              <code className="break-words font-mono font-medium text-ink bg-white px-1.5 py-0.5 rounded border border-[#DDD6C8]">
                {verdict.evidence}
              </code>
            </div>
          </div>
        ) : null}

        {verdict.failure_message && !isReviewed ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber/30 bg-amber-bg p-3 text-xs text-[#523e00]">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber" />
            <div>
              <span className="font-semibold">Next step: </span>
              <span>{verdict.failure_message}</span>
            </div>
          </div>
        ) : null}
      </button>

      {/* Interactive Confirm/Edit flow for manual review or reviewed items */}
      {(isManualReview || isEditing || (isReviewed && onReviewSubmit)) ? (
        <div
          className="border-t border-[#E8E2D6] bg-surface-dim/40 px-4 pb-4 pt-3.5"
          onClick={(e) => e.stopPropagation()}
        >
          {isReviewed && !isEditing ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-forest/30 bg-forest-light p-3 text-xs text-ink">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="size-4 shrink-0 text-forest" />
                <div className="truncate">
                  <span className="font-semibold text-ink">Verified by reviewer: </span>
                  <code className="font-mono font-medium text-ink bg-white px-1.5 py-0.5 rounded border border-forest/30">
                    {verdict.evidence || 'Confirmed'}
                  </code>
                  <span className="text-ink-muted ml-1.5 capitalize font-mono text-[11px]">
                    ({(verdict.review_state ?? 'confirmed').replaceAll('_', ' ')})
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="h-7 shrink-0 gap-1 text-xs border-[#D5CFC4] hover:bg-white"
                data-testid={`edit-review-btn-${verdict.rule_id}`}
              >
                <Edit3 className="size-3" /> Edit
              </Button>
            </div>
          ) : (
            <section
              aria-label={`Confirm or correct declaration for ${verdict.citation}`}
              className="space-y-3 rounded-xl border-2 border-terracotta/40 bg-terracotta-light/30 p-3.5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold font-heading text-terracotta">
                  <Sparkles className="size-3.5 shrink-0" />
                  <span>Human-in-the-Loop Verification</span>
                </div>
                <span className="rounded-full bg-white border border-terracotta/30 px-2 py-0.5 text-[11px] font-mono font-bold text-terracotta">
                  Confidence: {Math.round(verdict.confidence * 100)}%
                </span>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                {/* Packaging Crop Viewport */}
                <div>
                  <EvidenceCrop
                    imageSrc={imageDataUrl || ''}
                    bbox={verdict.evidence_bboxes?.[0] || null}
                    citation={verdict.citation}
                    onExpand={onSelect}
                  />
                </div>

                {/* Editable Input & Verification Actions */}
                <div className="flex flex-col justify-between space-y-2.5">
                  <div className="space-y-1">
                    <label
                      htmlFor={`edit-field-${verdict.rule_id}`}
                      className="block text-xs font-semibold font-heading text-ink"
                    >
                      Extracted Value (Best Guess)
                    </label>
                    <p className="text-[11px] text-ink-muted">
                      {hasCrop
                        ? 'Compare against the packaging snippet on the left.'
                        : 'Review best-guess text and confirm or correct.'}
                    </p>
                    <input
                      id={`edit-field-${verdict.rule_id}`}
                      type="text"
                      value={editedValue}
                      onChange={(e) => setEditedValue(e.target.value)}
                      placeholder="e.g. ₹20.00 incl. of all taxes"
                      disabled={submitting}
                      className="h-9 w-full rounded-lg border border-[#D5CFC4] bg-white px-2.5 py-1 text-xs font-medium text-ink shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {editedValue.trim() &&
                    editedValue.trim() !== (verdict.evidence || '').trim() ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveUpdate}
                        disabled={submitting}
                        className="h-8 gap-1.5 text-xs font-heading font-semibold bg-terracotta hover:bg-terracotta-hover text-white shadow-xs rounded-lg"
                        data-testid={`update-review-btn-${verdict.rule_id}`}
                      >
                        <Edit3 className="size-3" />
                        {submitting ? 'Saving…' : 'Update & Verify'}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleConfirm}
                        disabled={submitting}
                        className="h-8 gap-1.5 text-xs font-heading font-semibold bg-forest hover:bg-forest/90 text-white shadow-xs rounded-lg"
                        data-testid={`confirm-review-btn-${verdict.rule_id}`}
                      >
                        <CheckCircle2 className="size-3" />
                        {submitting ? 'Confirming…' : 'Confirm OCR Value'}
                      </Button>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleFlagMissing}
                      disabled={submitting}
                      className="h-8 gap-1 text-xs font-heading font-semibold text-brick hover:bg-brick-bg border-brick/30 rounded-lg"
                      data-testid={`flag-missing-btn-${verdict.rule_id}`}
                    >
                      <XCircle className="size-3" /> Flag Missing
                    </Button>

                    {isEditing ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditing(false)}
                        className="h-8 text-xs text-ink-muted hover:text-ink font-heading"
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      ) : null}

      <div className="px-4 pb-4">
        <dl className="grid grid-cols-3 gap-2 border-t border-[#E8E2D6] pt-3 text-xs">
          <div className="rounded-lg bg-surface-dim p-2">
            <dt className="text-[11px] font-mono font-medium text-ink-muted">Confidence</dt>
            <dd className="mt-0.5 font-mono font-bold text-ink">
              {Math.round(verdict.confidence * 100)}%
            </dd>
          </div>
          <div className="rounded-lg bg-surface-dim p-2">
            <dt className="text-[11px] font-mono font-medium text-ink-muted">Method</dt>
            <dd
              className="mt-0.5 truncate font-mono font-semibold text-ink"
              title={methods[verdict.measurement_method]}
            >
              {methods[verdict.measurement_method]}
            </dd>
          </div>
          <div className="rounded-lg bg-surface-dim p-2">
            <dt className="text-[11px] font-mono font-medium text-ink-muted">Review state</dt>
            <dd className="mt-0.5 font-mono font-semibold capitalize text-ink">
              {(verdict.review_state ?? 'unreviewed').replaceAll('_', ' ')}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
