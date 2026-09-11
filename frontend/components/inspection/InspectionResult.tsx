'use client';

import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  CircleHelp,
  Download,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import type { OverallStatus, QualitySummary, ReviewAction, Verdict } from '@/lib/types';

import { AnnotatedEvidence } from './AnnotatedEvidence';
import { QualityPanel } from './QualityPanel';
import { ReviewForm } from './ReviewForm';
import { VerdictCard } from './VerdictCard';

export interface InspectionResultData {
  scanId: number;
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  verdicts: Verdict[];
  quality: QualitySummary;
  overallStatus: OverallStatus;
  processingStatus: 'processing' | 'complete' | 'failed';
  analysisVersion: string;
  reviewActions: ReviewAction[];
}

type ResultFilter = 'all' | 'attention' | 'pass';

const overallPresentation: Record<
  OverallStatus,
  { label: string; detail: string; className: string; icon: typeof CheckCircle2 }
> = {
  pass: {
    label: 'Pass',
    detail: 'All mandatory packaging declarations are compliant with LMPC Rules.',
    className: 'border-pass/30 bg-pass/10',
    icon: CheckCircle2,
  },
  fail: {
    label: 'Fail',
    detail: 'One or more visible declarations require corrective action.',
    className: 'border-fail/30 bg-fail/10',
    icon: XCircle,
  },
  mixed: {
    label: 'Mixed findings',
    detail: 'Review the warning findings alongside the passing checks.',
    className: 'border-warn/30 bg-warn/10',
    icon: TriangleAlert,
  },
  manual_review: {
    label: 'Manual review',
    detail: 'One or more declarations require human verification against the packaging crop.',
    className: 'border-review/30 bg-review/10',
    icon: CircleHelp,
  },
};

export function InspectionResult({
  result,
  backHref = '/history',
}: {
  result: InspectionResultData;
  backHref?: string;
}) {
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [verdicts, setVerdicts] = useState<Verdict[]>(result.verdicts);
  const [overallStatus, setOverallStatus] = useState<OverallStatus>(result.overallStatus);
  const [reviews, setReviews] = useState<ReviewAction[]>(result.reviewActions);
  const [showUnreliableReview, setShowUnreliableReview] = useState(false);

  useEffect(() => {
    setVerdicts(result.verdicts);
    setOverallStatus(result.overallStatus);
    setReviews(result.reviewActions);
  }, [result]);

  const isRetakeRecommended =
    result.quality.status === 'retake_recommended' || result.quality.status === 'unreadable';

  const failedMetrics = useMemo(() => {
    const list: Array<{ label: string; current: string; expected: string }> = [];
    for (const m of result.quality.metrics) {
      if (m.name === 'ocr_confidence_distribution' && m.value < 60) {
        list.push({
          label: 'OCR Word Confidence (Median)',
          current: `${Math.round(m.value)}%`,
          expected: '≥ 60%',
        });
      } else if (m.name === 'ocr_confidence_lower_quartile' && m.value < 35) {
        list.push({
          label: 'OCR Word Confidence (Lower Quartile)',
          current: `${Math.round(m.value)}%`,
          expected: '≥ 35%',
        });
      } else if (m.name === 'sharpness' && m.value < 35) {
        list.push({
          label: 'Image Sharpness',
          current: `${Math.round(m.value)} / 100`,
          expected: '≥ 35',
        });
      } else if (m.name === 'contrast' && m.value < 15) {
        list.push({
          label: 'Grayscale Contrast',
          current: `${Math.round(m.value)} / 100`,
          expected: '≥ 15',
        });
      } else if (m.name === 'glare' && m.value > 18) {
        list.push({
          label: 'Specular Glare Area',
          current: `${Math.round(m.value)}%`,
          expected: '≤ 18%',
        });
      } else if (m.name === 'skew' && m.value > 18) {
        list.push({
          label: 'Package Skew Angle',
          current: `${Math.round(m.value)}°`,
          expected: '≤ 18°',
        });
      }
    }
    return list;
  }, [result.quality.metrics]);

  const activeVerdict = verdicts.find((verdict) => verdict.rule_id === activeRuleId);

  const visibleVerdicts = useMemo(() => {
    if (filter === 'pass') return verdicts.filter((verdict) => verdict.status === 'pass');
    if (filter === 'attention') {
      return verdicts.filter((verdict) =>
        ['fail', 'warn', 'manual_review'].includes(verdict.status)
      );
    }
    return verdicts;
  }, [filter, verdicts]);

  const remainingManualReviews = useMemo(
    () => verdicts.filter((v) => v.status === 'manual_review'),
    [verdicts]
  );

  async function handleVerdictReview(
    targetVerdict: Verdict,
    action: 'confirmed' | 'resolved' | 'false_positive',
    finalValue: string,
    note?: string
  ) {
    const updatedVerdicts = verdicts.map((v) => {
      if (v.rule_id !== targetVerdict.rule_id) return v;
      return {
        ...v,
        status: action === 'false_positive' ? ('fail' as const) : ('pass' as const),
        review_state: action,
        evidence: finalValue || v.evidence,
        reasoning:
          action === 'confirmed'
            ? `Declaration confirmed by reviewer: ${finalValue || v.evidence}`
            : action === 'resolved'
            ? `Declaration corrected and verified by reviewer: ${finalValue}`
            : note || 'Marked non-compliant/missing by reviewer',
      };
    });

    setVerdicts(updatedVerdicts);

    // Dynamic Overall Status Recalculation:
    // If any failure remains -> fail
    // Else if any manual_review remains -> manual_review
    // Else if any warning remains -> mixed
    // Else -> pass
    const statuses = new Set(updatedVerdicts.map((v) => v.status));
    let nextOverall: OverallStatus = 'pass';
    if (statuses.has('fail')) {
      nextOverall = 'fail';
    } else if (statuses.has('manual_review')) {
      nextOverall = 'manual_review';
    } else if (statuses.has('warn')) {
      nextOverall = 'mixed';
    } else {
      nextOverall = 'pass';
    }
    setOverallStatus(nextOverall);

    // Audit review action payload
    const reviewNote =
      note ||
      (action === 'confirmed'
        ? `Confirmed field [${targetVerdict.rule_id}]: ${finalValue || targetVerdict.evidence}`
        : action === 'resolved'
        ? `Corrected field [${targetVerdict.rule_id}] to: ${finalValue}`
        : `Marked [${targetVerdict.rule_id}] as false positive / missing`);

    try {
      const newReview = await apiFetch<ReviewAction>(`/api/scan/${result.scanId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          note: reviewNote,
          verdict_id: targetVerdict.id ?? undefined,
        }),
      });
      setReviews((prev) => [...prev, newReview]);
    } catch {
      // Create local optimistic review action for test environments or offline mode
      const localReview: ReviewAction = {
        id: Date.now(),
        verdict_id: targetVerdict.id ?? null,
        action,
        note: reviewNote,
        actor_user_id: 1,
        actor_display_name: 'Inspector',
        created_at: new Date().toISOString(),
      };
      setReviews((prev) => [...prev, localReview]);
    }

    // Persist to sessionStorage if present
    try {
      const cached = sessionStorage.getItem(`scan:${result.scanId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        sessionStorage.setItem(
          `scan:${result.scanId}`,
          JSON.stringify({
            ...parsed,
            verdicts: updatedVerdicts,
            overallStatus: nextOverall,
          })
        );
      }
    } catch {
      // Ignore cache persistence error
    }
  }

  const overall = overallPresentation[overallStatus];
  const OverallIcon = overall.icon;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Inspection result
          </p>
          <h1 className="mt-1 text-h1">Scan #{result.scanId}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analysis {result.analysisVersion} · {result.processingStatus}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={backHref}>
              <ArrowLeft aria-hidden="true" /> Back to repository
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/exports/scans/${result.scanId}.docx`}>
              <Download aria-hidden="true" /> DOCX
            </a>
          </Button>
          <Button asChild>
            <a href={`/api/exports/scans/${result.scanId}.pdf`}>
              <Download aria-hidden="true" /> PDF
            </a>
          </Button>
        </div>
      </header>

      {/* Quality Gate Intervention Card */}
      {isRetakeRecommended ? (
        <section
          aria-label="Quality Gate Intervention"
          className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-background p-6 sm:p-8 space-y-6 shadow-xl"
        >
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
            <div className="rounded-2xl bg-amber-500/20 border border-amber-500/30 p-3.5 text-amber-600 dark:text-amber-400 shrink-0 shadow-inner">
              <Camera className="size-8" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                <ShieldAlert className="size-3.5" />
                Quality Safeguard Active
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Photo quality insufficient for reliable inspection
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The image quality or OCR readability is below the required threshold to evaluate
                LMPC mandatory declarations reliably. Showing false non-compliance violations on
                unreadable evidence is misleading. Please retake the photo using the guided camera
                frame or review the extracted evidence crops below.
              </p>
            </div>
          </div>

          {result.quality.guidance.length ? (
            <div className="rounded-xl border border-border/80 bg-surface/90 p-4 sm:p-5 space-y-2.5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recommended Actions
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {result.quality.guidance.map((g) => (
                  <li key={g} className="font-medium text-foreground">
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {failedMetrics.length ? (
            <div className="rounded-xl border border-border/80 bg-surface/90 p-4 sm:p-5 space-y-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Failed Quality Checks
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {failedMetrics.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-lg border border-fail/20 bg-fail/5 p-3.5 text-sm transition-all"
                  >
                    <div>
                      <p className="font-semibold text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Expected: {item.expected}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-fail bg-fail/10 border border-fail/20 rounded-md px-2.5 py-1 text-sm">
                      {item.current}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              asChild
              size="lg"
              className="gap-2.5 font-bold shadow-md bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-6 text-base"
            >
              <Link href="/">
                <RotateCcw className="size-5" /> Retake photo (Guided camera)
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowUnreliableReview((prev) => !prev)}
              className="text-muted-foreground hover:text-foreground border-border hover:bg-muted/50"
            >
              {showUnreliableReview ? 'Hide raw results' : 'Review anyway (unreliable)'}
            </Button>
          </div>
        </section>
      ) : null}

      <QualityPanel quality={result.quality} />

      {/* Verified Resolution Banner: displayed when all manual review items are resolved */}
      {overallStatus === 'pass' && result.overallStatus === 'manual_review' ? (
        <section
          role="status"
          className="rounded-xl border-2 border-pass/50 bg-pass/10 p-5 shadow-sm flex items-start sm:items-center gap-3.5"
          data-testid="manual-review-resolved-banner"
        >
          <div className="rounded-full bg-pass/20 p-2 text-pass shrink-0">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="space-y-0.5 flex-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-pass">
              <Sparkles className="size-3.5" />
              Human Verification Complete
            </div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              All declarations verified by reviewer
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              All manual review items have been inspected and confirmed against packaging crops.
              This scan is audit-ready and approved for statutory documentation.
            </p>
          </div>
        </section>
      ) : null}

      <section
        className={`rounded-xl border p-5 sm:p-6 shadow-sm transition-all ${overall.className}`}
        aria-label="Overall status"
        data-testid="overall-status-banner"
      >
        <div className="flex items-center gap-3.5">
          <OverallIcon aria-hidden="true" className="size-8 shrink-0" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider">Overall status</p>
            <h2 className="font-heading text-xl sm:text-2xl font-bold">{overall.label}</h2>
          </div>
        </div>
        <p className="mt-2 text-sm leading-relaxed">{overall.detail}</p>
      </section>

      {isRetakeRecommended && !showUnreliableReview ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,1fr)]">
          <section
            aria-label="Annotated inspection evidence"
            className="surface-panel p-3 lg:sticky lg:top-6"
          >
            <AnnotatedEvidence
              imageSrc={result.imageDataUrl}
              imageWidth={result.imageWidth}
              imageHeight={result.imageHeight}
              verdicts={[]}
              activeRuleId={null}
            />
          </section>
          <div className="surface-panel p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="size-7 shrink-0" />
              <h3 className="font-heading text-lg font-bold">Automated checks paused</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              To prevent false non-compliance verdicts caused by garbled OCR reading, detailed rule
              verdicts are withheld. Click <strong>&quot;Retake photo&quot;</strong> to capture a
              clearer image of the primary declaration panel, or toggle{' '}
              <strong>&quot;Review anyway (unreliable)&quot;</strong> to inspect raw unverified
              detections and packaging crops.
            </p>
          </div>
        </div>
      ) : (
        <>
          {isRetakeRecommended && showUnreliableReview ? (
            <div
              role="alert"
              className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn shadow-sm"
            >
              <p className="font-semibold">⚠️ Displaying unverified findings</p>
              <p className="mt-1 text-xs sm:text-sm">
                Image quality was marked retake recommended. Detections below may contain false
                failures due to unreadable OCR. Use the evidence crops on each card to confirm or
                correct declarations.
              </p>
            </div>
          ) : null}

          <p role="status" aria-live="polite" className="sr-only">
            {activeVerdict
              ? `${activeVerdict.citation}. ${activeVerdict.reasoning}`
              : 'No finding selected.'}
          </p>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,1fr)]">
            <section
              aria-label="Annotated inspection evidence"
              className="surface-panel p-3 lg:sticky lg:top-6"
            >
              <AnnotatedEvidence
                imageSrc={result.imageDataUrl}
                imageWidth={result.imageWidth}
                imageHeight={result.imageHeight}
                verdicts={verdicts}
                activeRuleId={activeRuleId}
              />
            </section>
            <section aria-labelledby="findings-heading" className="space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="findings-heading" className="text-h2">
                    Declaration checks
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Showing {visibleVerdicts.length} of {verdicts.length} statutory checks
                    {remainingManualReviews.length > 0
                      ? ` · ${remainingManualReviews.length} require manual review`
                      : ''}
                  </p>
                </div>
                <label className="text-sm font-semibold">
                  <span className="sr-only">Filter findings</span>
                  <select
                    aria-label="Filter findings"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value as ResultFilter)}
                    className="h-11 rounded-lg border bg-background px-3 text-sm font-medium shadow-sm"
                  >
                    <option value="all">All findings ({verdicts.length})</option>
                    <option value="attention">Needs attention</option>
                    <option value="pass">Passing only</option>
                  </select>
                </label>
              </div>
              {visibleVerdicts.length ? (
                visibleVerdicts.map((verdict) => (
                  <VerdictCard
                    key={verdict.rule_id}
                    verdict={verdict}
                    active={activeRuleId === verdict.rule_id}
                    onSelect={() => setActiveRuleId(verdict.rule_id)}
                    imageDataUrl={result.imageDataUrl}
                    onReviewSubmit={handleVerdictReview}
                  />
                ))
              ) : (
                <p className="surface-panel p-6 text-center text-muted-foreground">
                  No findings match this filter.
                </p>
              )}
            </section>
          </div>
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2 pt-2">
        <ReviewForm
          scanId={result.scanId}
          onSubmitted={(review) => setReviews((all) => [...all, review])}
        />
        <section className="surface-panel p-6" aria-labelledby="review-history-heading">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 id="review-history-heading" className="text-h2">
              Review history
            </h2>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {reviews.length} actions
            </span>
          </div>
          {reviews.length ? (
            <ol className="mt-4 space-y-3.5">
              {reviews.map((review, index) => (
                <li
                  key={`${review.id}-${index}`}
                  className="rounded-lg border bg-surface p-3.5 text-sm shadow-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold capitalize text-foreground">
                      {review.action.replaceAll('_', ' ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(review.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <p className="text-sm text-foreground/90">{review.note || 'No note recorded.'}</p>
                  <p className="text-xs text-muted-foreground pt-0.5">
                    {review.actor_display_name} · {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground text-center py-6">
              No review actions recorded.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
