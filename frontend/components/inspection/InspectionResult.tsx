'use client';

import { CheckCircle2, CircleHelp, Download, TriangleAlert, XCircle } from 'lucide-react';
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

export function InspectionResult({ result }: { result: InspectionResultData }) {
  const [activeRuleId, setActiveRuleId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [reviews, setReviews] = useState(result.reviewActions);
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

      <QualityPanel quality={result.quality} />

      <section className={`rounded-lg border p-5 ${overall.className}`} aria-label="Overall status">
        <div className="flex items-center gap-3">
          <OverallIcon aria-hidden="true" className="size-7" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider">Overall status</p>
            <h2 className="font-heading text-xl font-semibold">{overall.label}</h2>
          </div>
        </div>
        <p className="mt-2 text-sm">{overall.detail}</p>
      </section>

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
        <section aria-labelledby="findings-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="findings-heading" className="text-h2">
              Declaration checks
            </h2>
            <label className="text-sm font-semibold">
              <span className="sr-only">Filter findings</span>
              <select
                aria-label="Filter findings"
                value={filter}
                onChange={(event) => setFilter(event.target.value as ResultFilter)}
                className="h-11 rounded-md border bg-background px-3"
              >
                <option value="all">All findings</option>
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
            <p className="surface-panel p-5 text-muted-foreground">
              No findings match this filter.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ReviewForm
          scanId={result.scanId}
          onSubmitted={(review) => setReviews((all) => [...all, review])}
        />
        <section className="surface-panel p-5" aria-labelledby="review-history-heading">
          <h2 id="review-history-heading" className="text-h2">
            Review history
          </h2>
          {reviews.length ? (
            <ol className="mt-4 space-y-4">
              {reviews.map((review) => (
                <li key={review.id} className="border-l-2 border-primary pl-3 text-sm">
                  <p className="font-semibold capitalize">{review.action.replaceAll('_', ' ')}</p>
                  <p>{review.note || 'No note recorded.'}</p>
                  <p className="text-muted-foreground">
                    {review.actor_display_name} · {new Date(review.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No review actions recorded.</p>
          )}
        </section>
      </div>
    </div>
  );
}
