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
  pass: 'border-l-4 border-l-pass hover:border-pass/80',
  fail: 'border-l-4 border-l-fail hover:border-fail/80',
  warn: 'border-l-4 border-l-warn hover:border-warn/80',
  manual_review: 'border-l-4 border-l-review hover:border-review/80',
  na: 'border-l-4 border-l-muted-foreground/30 hover:border-muted-foreground/60',
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
        'surface-panel overflow-hidden transition-all duration-200 card-hover-lift animate-fade-in-up',
        statusBorderMap[verdict.status] ?? '',
        active
          ? 'ring-2 ring-primary shadow-md border-primary bg-primary/[0.02]'
          : 'hover:border-border'
      )}
      data-testid={`verdict-card-${verdict.rule_id}`}
    >
      {/* Header button selects the card and announces details */}
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${verdict.citation}: ${verdict.status}`}
        className="w-full space-y-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={onSelect}
        onFocus={onSelect}
      >
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">
                {verdict.rule_id}
              </h3>
              {verdict.severity === 'critical' ? (
                <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                  Critical
                </span>
              ) : null}
            </div>
            <p className="font-heading text-sm font-semibold text-foreground">
              {verdict.citation}
            </p>
          </div>
          <VerdictBadge status={verdict.status} />
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {verdict.reasoning}
        </p>

        {/* Show detected evidence pill if not currently showing manual review editor */}
        {verdict.evidence && !isManualReview && !isEditing ? (
          <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
            <FileSearch className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-foreground">Detected evidence: </span>
              <code className="break-words font-mono font-medium text-foreground bg-background/80 px-1.5 py-0.5 rounded border border-border/40">
                {verdict.evidence}
              </code>
            </div>
          </div>
        ) : null}

        {verdict.failure_message && !isReviewed ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
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
          className="border-t border-border/60 bg-muted/20 px-4 pb-4 pt-3.5"
          onClick={(e) => e.stopPropagation()}
        >
          {isReviewed && !isEditing ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-pass/30 bg-pass/10 p-3 text-xs text-foreground">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="size-4 shrink-0 text-pass" />
                <div className="truncate">
                  <span className="font-semibold text-foreground">Verified by reviewer: </span>
                  <code className="font-mono font-medium text-foreground bg-background/80 px-1.5 py-0.5 rounded border border-border/40">
                    {verdict.evidence || 'Confirmed'}
                  </code>
                  <span className="text-muted-foreground ml-1.5 capitalize">
                    ({(verdict.review_state ?? 'confirmed').replaceAll('_', ' ')})
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="h-7 shrink-0 gap-1 text-xs"
                data-testid={`edit-review-btn-${verdict.rule_id}`}
              >
                <Edit3 className="size-3" /> Edit
              </Button>
            </div>
          ) : (
            <section
              aria-label={`Confirm or correct declaration for ${verdict.citation}`}
              className="space-y-3 rounded-lg border border-review/30 bg-review/5 p-3.5 shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-review">
                  <Sparkles className="size-3.5 shrink-0" />
                  <span>Human-in-the-Loop Verification</span>
                </div>
                <span className="rounded-full bg-review/10 px-2 py-0.5 text-[11px] font-medium text-review">
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
                      className="block text-xs font-semibold text-foreground"
                    >
                      Extracted Value (Best Guess)
                    </label>
                    <p className="text-[11px] text-muted-foreground">
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
                      className="h-9 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
                        className="h-8 gap-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
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
                        className="h-8 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
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
                      className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
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
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
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
        <dl className="grid grid-cols-3 gap-2 border-t border-border/50 pt-3 text-xs">
          <div className="rounded bg-muted/40 p-2">
            <dt className="text-[11px] font-medium text-muted-foreground">Confidence</dt>
            <dd className="mt-0.5 font-semibold text-foreground">
              {Math.round(verdict.confidence * 100)}%
            </dd>
          </div>
          <div className="rounded bg-muted/40 p-2">
            <dt className="text-[11px] font-medium text-muted-foreground">Method</dt>
            <dd
              className="mt-0.5 truncate font-semibold text-foreground"
              title={methods[verdict.measurement_method]}
            >
              {methods[verdict.measurement_method]}
            </dd>
          </div>
          <div className="rounded bg-muted/40 p-2">
            <dt className="text-[11px] font-medium text-muted-foreground">Review state</dt>
            <dd className="mt-0.5 font-semibold capitalize text-foreground">
              {(verdict.review_state ?? 'unreviewed').replaceAll('_', ' ')}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
