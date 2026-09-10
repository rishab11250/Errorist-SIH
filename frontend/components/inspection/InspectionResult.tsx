'use client';

import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  CircleHelp,
  Download,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
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
    detail: 'No non-compliant visible declarations were detected.',
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
    detail: 'The evidence does not support a reliable final automated decision.',
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
  const [reviews, setReviews] = useState(result.reviewActions);
  const [showUnreliableReview, setShowUnreliableReview] = useState(false);

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

  const activeVerdict = result.verdicts.find((verdict) => verdict.rule_id === activeRuleId);
  const visibleVerdicts = useMemo(() => {
    if (filter === 'pass') return result.verdicts.filter((verdict) => verdict.status === 'pass');
    if (filter === 'attention') {
      return result.verdicts.filter((verdict) =>
        ['fail', 'warn', 'manual_review'].includes(verdict.status)
      );
    }
    return result.verdicts;
  }, [filter, result.verdicts]);
  const overall = overallPresentation[result.overallStatus];
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
                frame.
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
                      <p className="text-xs text-muted-foreground mt-0.5">Expected: {item.expected}</p>
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
            <Button asChild size="lg" className="gap-2.5 font-bold shadow-md bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-6 text-base">
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

      <section className={`rounded-xl border p-5 sm:p-6 shadow-sm ${overall.className}`} aria-label="Overall status">
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
              detections.
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
                failures due to unreadable OCR.
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
                verdicts={result.verdicts}
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
                    Showing {visibleVerdicts.length} of {result.verdicts.length} statutory checks
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
                    <option value="all">All findings ({result.verdicts.length})</option>
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
              {reviews.map((review) => (
                <li key={review.id} className="rounded-lg border bg-surface p-3.5 text-sm shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold capitalize text-foreground">{review.action.replaceAll('_', ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(review.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
            <p className="mt-4 text-sm text-muted-foreground text-center py-6">No review actions recorded.</p>
          )}
        </section>
      </div>
    </div>
  );
}
