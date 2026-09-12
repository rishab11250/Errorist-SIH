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
import { cn } from '@/lib/cn';
import { confirmProductMatch, linkProduct, rejectProductMatch } from '@/lib/api';
import { apiFetch } from '@/lib/api-client';
import { useOptionalAuth } from '@/lib/auth';
import type {
  OverallStatus,
  ProductMatchCandidate,
  ProductMatchStatus,
  ProductSummary,
  PreviousScan,
  QualitySummary,
  ReviewAction,
  Verdict,
} from '@/lib/types';

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
  productId?: string | null;
  productMatchStatus?: ProductMatchStatus;
  product?: ProductSummary | null;
  productCandidates?: ProductMatchCandidate[];
  previousScan?: PreviousScan | null;
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
  const [productState, setProductState] = useState({
    id: result.productId ?? null,
    status: result.productMatchStatus,
    product: result.product ?? null,
    candidates: result.productCandidates ?? [],
  });
  const [productBusy, setProductBusy] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [manualProductId, setManualProductId] = useState('');
  const auth = useOptionalAuth();

  useEffect(() => {
    setVerdicts(result.verdicts);
    setOverallStatus(result.overallStatus);
    setReviews(result.reviewActions);
    setProductState({
      id: result.productId ?? null,
      status: result.productMatchStatus,
      product: result.product ?? null,
      candidates: result.productCandidates ?? [],
    });
  }, [result]);

  async function updateProduct(action: 'confirm' | 'reject' | 'link', productId?: string) {
    setProductBusy(true);
    setProductError(null);
    try {
      const response =
        action === 'confirm' && productId
          ? await confirmProductMatch(result.scanId, productId)
          : action === 'reject'
            ? await rejectProductMatch(result.scanId)
            : await linkProduct(result.scanId, productId ?? manualProductId.trim());
      setProductState({
        id: response.scan.product_id ?? null,
        status: response.scan.product_match_status,
        product: response.scan.product ?? null,
        candidates: response.scan.product_candidates ?? [],
      });
      setManualProductId('');
    } catch (reason) {
      setProductError(reason instanceof Error ? reason.message : 'The product relationship could not be updated.');
    } finally {
      setProductBusy(false);
    }
  }

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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 bg-surface">
      {/* Page Title Block & Top-Right Actions */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#E7E2D8] pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-terracotta">
              Inspection Result
            </span>
            <span className="text-xs text-ink-muted">•</span>
            <span className="text-xs font-mono text-ink-muted">LMPC Rule 6 (Packaged Commodities)</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold tracking-tight text-ink flex items-center gap-3">
            Scan #{result.scanId}
            <span className="text-xs font-mono font-medium px-2.5 py-1 rounded-full bg-surface-dim border border-[#DDD6C8] text-ink">
              BATCH #{result.scanId}
            </span>
          </h1>
          <p className="text-xs md:text-sm text-ink-muted mt-1">
            Analysis version <span className="font-mono font-semibold text-ink">{result.analysisVersion}</span> • Processing Status: <span className="text-forest font-semibold capitalize">{result.processingStatus}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button asChild variant="outline" className="border-[#D5CFC4] hover:bg-surface-dim font-mono text-xs text-ink">
            <Link href={backHref}>
              <ArrowLeft aria-hidden="true" className="w-3.5 h-3.5 mr-1.5" /> Back to repository
            </Link>
          </Button>
          <Button asChild variant="outline" className="border-[#D5CFC4] hover:bg-surface-dim font-mono text-xs text-terracotta font-semibold">
            <a href={`/api/exports/scans/${result.scanId}.docx`}>
              <Download aria-hidden="true" className="w-3.5 h-3.5 mr-1.5" /> DOCX
            </a>
          </Button>
          <Button asChild variant="outline" className="border-[#D5CFC4] hover:bg-surface-dim font-mono text-xs text-brick font-semibold">
            <a href={`/api/exports/scans/${result.scanId}.pdf`}>
              <Download aria-hidden="true" className="w-3.5 h-3.5 mr-1.5" /> PDF
            </a>
          </Button>
        </div>
      </header>

      {productState.status || productState.product || productState.candidates.length ? (
        <section className="rounded-xl border border-[#E0D9CD] bg-surface-card p-5 shadow-kinetic-sm" aria-labelledby="product-history-heading">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-mono font-bold uppercase tracking-wider text-terracotta">Product identity</p>
              <h2 id="product-history-heading" className="mt-1 font-heading text-lg font-bold text-ink">
                {productState.product?.common_name || productState.product?.manufacturer || 'Product relationship'}
              </h2>
              <p className="mt-1 text-xs text-ink-muted">
                {productState.status === 'suggested'
                  ? 'This scan may belong to an existing product.'
                  : productState.product
                    ? `${productState.product.scan_count} scan${productState.product.scan_count === 1 ? '' : 's'} in product history.`
                    : 'No product has been linked to this scan.'}
              </p>
            </div>
            {productState.id ? (
              <Button asChild variant="outline" className="border-[#D5CFC4] font-mono text-xs text-ink">
                <Link href={`/products/${encodeURIComponent(productState.id)}`}>View product history</Link>
              </Button>
            ) : null}
          </div>

          {productState.product ? (
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-4">
              {[
                ['Manufacturer', productState.product.manufacturer],
                ['Quantity', [productState.product.quantity, productState.product.unit].filter(Boolean).join(' ')],
                ['Category', productState.product.category],
                ['Latest scan', productState.product.latest_scan ? new Date(productState.product.latest_scan).toLocaleDateString() : null],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[#E0D9CD] bg-surface-dim p-3">
                  <dt className="font-mono uppercase tracking-wider text-ink-muted">{label}</dt>
                  <dd className="mt-1 font-semibold capitalize text-ink">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {productState.status === 'suggested' && productState.candidates.length ? (
            <div className="mt-4 space-y-2">
              {productState.candidates.map((candidate) => (
                <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E0D9CD] bg-surface-dim p-3 text-xs">
                  <div>
                    <p className="font-semibold text-ink">{candidate.common_name || candidate.manufacturer || candidate.id}</p>
                    <p className="mt-1 text-ink-muted">
                      {[candidate.manufacturer, candidate.quantity && `${candidate.quantity} ${candidate.unit ?? ''}`, candidate.category].filter(Boolean).join(' · ')}
                      {candidate.similarity_score != null ? ` · ${Math.round(candidate.similarity_score * 100)}% match` : ''}
                    </p>
                  </div>
                  <Button type="button" size="sm" disabled={productBusy} onClick={() => updateProduct('confirm', candidate.id)}>
                    {productBusy ? 'Confirming…' : 'Confirm'}
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" disabled={productBusy} onClick={() => updateProduct('reject')}>
                {productBusy ? 'Updating…' : 'Reject suggestion'}
              </Button>
            </div>
          ) : null}

          {auth?.user?.role === 'admin' && productState.id == null ? (
            <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void updateProduct('link'); }}>
              <label className="sr-only" htmlFor="manual-product-id">Product ID</label>
              <input id="manual-product-id" value={manualProductId} onChange={(event) => setManualProductId(event.target.value)} placeholder="Product ID" className="min-h-9 rounded-lg border border-[#D5CFC4] bg-white px-3 text-xs font-mono" />
              <Button type="submit" size="sm" disabled={productBusy || !manualProductId.trim()}>{productBusy ? 'Linking…' : 'Link product'}</Button>
            </form>
          ) : null}
          {productError ? <p role="alert" className="mt-3 text-xs font-mono text-brick">{productError}</p> : null}
        </section>
      ) : null}

      {result.previousScan ? <PreviousScanPanel previousScan={result.previousScan} /> : null}

      {/* OVERALL-STATUS HERO BANNER */}
      <section
        className={cn(
          'relative overflow-hidden rounded-xl bg-gradient-to-r from-[#1C1B19] to-[#2B2723] text-[#FAF8F3] p-5 md:p-6 shadow-md border-l-[6px] transition-all animate-fade-in-up',
          overallStatus === 'pass'
            ? 'border-l-[#1F4B3F]'
            : overallStatus === 'fail'
              ? 'border-l-[#B3261E]'
              : overallStatus === 'mixed'
                ? 'border-l-[#B8860B]'
                : 'border-l-[#9C4221]'
        )}
        aria-label="Overall status"
        data-testid="overall-status-banner"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start md:items-center gap-4">
            <div
              className={cn(
                'w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center shrink-0 p-3 border',
                overallStatus === 'pass'
                  ? 'bg-forest/25 border-forest/50 text-emerald-400'
                  : overallStatus === 'fail'
                    ? 'bg-brick/25 border-brick/50 text-rose-400'
                    : overallStatus === 'mixed'
                      ? 'bg-amber/25 border-amber/50 text-amber-300'
                      : 'bg-terracotta/25 border-terracotta/50 text-terracotta'
              )}
            >
              <OverallIcon aria-hidden="true" className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold tracking-widest uppercase text-[#D6D2CA]">
                  Overall Statutory Verdict
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono',
                    overallStatus === 'pass'
                      ? 'bg-forest text-white'
                      : overallStatus === 'fail'
                        ? 'bg-brick text-white'
                        : overallStatus === 'mixed'
                          ? 'bg-amber text-white'
                          : 'bg-[#9C4221] text-white'
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  {overall.label.toUpperCase()}
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold font-heading mt-1 text-white">
                {overall.label}
              </h2>
              <p className="text-xs md:text-sm text-[#FAF8F3]/80 mt-1 max-w-3xl leading-relaxed">
                {overall.detail}
              </p>
            </div>
          </div>

          {/* Quick Summary Counts Chips */}
          <div className="flex items-center gap-3 md:border-l md:border-white/10 md:pl-6 shrink-0">
            <div className="text-center px-3 py-2 rounded-lg bg-white/5 border border-white/10 min-w-[60px]">
              <span className="block text-xl font-bold font-mono text-emerald-400">
                {verdicts.filter((v) => v.status === 'pass').length}
              </span>
              <span className="text-[10px] font-mono uppercase text-[#FAF8F3]/60">Passing</span>
            </div>
            <div className="text-center px-3 py-2 rounded-lg bg-white/5 border border-white/10 min-w-[60px]">
              <span className="block text-xl font-bold font-mono text-rose-400">
                {verdicts.filter((v) => v.status === 'fail').length}
              </span>
              <span className="text-[10px] font-mono uppercase text-[#FAF8F3]/60">Breaches</span>
            </div>
            <div className="text-center px-3 py-2 rounded-lg bg-white/5 border border-white/10 min-w-[60px]">
              <span className="block text-xl font-bold font-mono text-amber-300">
                {verdicts.filter((v) => v.status === 'manual_review' || v.status === 'warn').length}
              </span>
              <span className="text-[10px] font-mono uppercase text-amber-200">Review</span>
            </div>
          </div>
        </div>
      </section>

      {/* Quality Gate Intervention Card */}
      {isRetakeRecommended ? (
        <section
          aria-label="Quality Gate Intervention"
          className="rounded-xl border-2 border-amber/50 bg-surface-card p-6 shadow-kinetic-sm space-y-5"
        >
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="rounded-xl bg-amber-bg border border-amber/30 p-3 text-amber shrink-0 shadow-inner">
              <Camera className="size-7" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber-bg px-2.5 py-0.5 text-xs font-mono font-bold uppercase tracking-wider text-amber">
                <ShieldAlert className="size-3.5" />
                Quality Safeguard Active
              </div>
              <h2 className="text-xl font-bold font-heading text-ink">
                Photo quality insufficient for reliable inspection
              </h2>
              <p className="text-sm text-ink-muted leading-relaxed">
                The image quality or OCR readability is below the required threshold to evaluate
                LMPC mandatory declarations reliably. Showing false non-compliance violations on
                unreadable evidence is misleading. Please retake the photo using the guided camera
                frame or review the extracted evidence crops below.
              </p>
            </div>
          </div>

          {result.quality.guidance.length ? (
            <div className="rounded-xl border border-[#E0D9CD] bg-surface-dim p-4 space-y-2 shadow-xs">
              <p className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted">
                Recommended Actions
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-xs font-sans">
                {result.quality.guidance.map((g) => (
                  <li key={g} className="font-medium text-ink">
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {failedMetrics.length ? (
            <div className="rounded-xl border border-[#E0D9CD] bg-surface-dim p-4 space-y-3 shadow-xs">
              <p className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted">
                Failed Quality Checks
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {failedMetrics.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-lg border border-brick/30 bg-brick-bg p-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-ink font-heading">{item.label}</p>
                      <p className="text-[11px] text-ink-muted mt-0.5 font-mono">
                        Expected: {item.expected}
                      </p>
                    </div>
                    <span className="font-mono font-bold text-brick bg-white border border-brick/30 rounded px-2.5 py-1 text-xs">
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
              className="gap-2 font-heading font-bold shadow-kinetic-glow bg-terracotta hover:bg-terracotta-hover text-white px-6 py-5 text-sm rounded-xl"
            >
              <Link href="/">
                <RotateCcw className="size-4 mr-1" /> Retake photo (Guided camera)
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowUnreliableReview((prev) => !prev)}
              className="text-ink-muted hover:text-ink border-[#D5CFC4] hover:bg-surface-dim font-heading text-xs rounded-xl"
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
          className="rounded-xl border-2 border-forest/40 bg-forest-light p-5 shadow-sm flex items-start sm:items-center gap-3.5 animate-fade-in-up"
          data-testid="manual-review-resolved-banner"
        >
          <div className="rounded-full bg-forest p-2 text-white shrink-0 animate-pulse-subtle">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="space-y-0.5 flex-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-forest">
              <Sparkles className="size-3.5" />
              Human Verification Complete
            </div>
            <h2 className="font-heading text-lg font-bold text-ink">
              All declarations verified by reviewer
            </h2>
            <p className="text-xs sm:text-sm text-ink-muted">
              All manual review items have been inspected and confirmed against packaging crops.
              This scan is audit-ready and approved for statutory documentation.
            </p>
          </div>
        </section>
      ) : null}

      {isRetakeRecommended && !showUnreliableReview ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,1fr)]">
          <section
            aria-label="Annotated inspection evidence"
            className="bg-surface-card rounded-xl border border-[#E0D9CD] shadow-kinetic-sm p-3 lg:sticky lg:top-6"
          >
            <AnnotatedEvidence
              imageSrc={result.imageDataUrl}
              imageWidth={result.imageWidth}
              imageHeight={result.imageHeight}
              verdicts={[]}
              activeRuleId={null}
            />
          </section>
          <div className="bg-surface-card rounded-xl border border-[#E0D9CD] shadow-kinetic-sm p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-3 text-amber">
              <ShieldAlert className="size-7 shrink-0" />
              <h3 className="font-heading text-lg font-bold text-ink">Automated checks paused</h3>
            </div>
            <p className="text-sm text-ink-muted leading-relaxed">
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
              className="rounded-xl border border-amber/40 bg-amber-bg p-4 text-sm text-amber shadow-sm"
            >
              <p className="font-semibold font-heading">⚠️ Displaying unverified findings</p>
              <p className="mt-1 text-xs sm:text-sm text-[#523e00]">
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
            {/* Left Column: Annotated Evidence & Legend */}
            <div className="space-y-4 lg:sticky lg:top-6">
              <section
                aria-label="Annotated inspection evidence"
                className="bg-surface-card rounded-xl border border-[#E0D9CD] shadow-kinetic-sm p-3"
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-ink flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-terracotta" />
                    Evidence Document [Optical Extract]
                  </h3>
                  <span className="text-[11px] font-mono text-ink-muted">
                    {result.imageWidth} × {result.imageHeight} px
                  </span>
                </div>
                <div className="bg-[#141311] rounded-lg overflow-hidden border border-[#2B2925] p-2">
                  <AnnotatedEvidence
                    imageSrc={result.imageDataUrl}
                    imageWidth={result.imageWidth}
                    imageHeight={result.imageHeight}
                    verdicts={verdicts}
                    activeRuleId={activeRuleId}
                  />
                </div>
              </section>

              {/* Bounding Box Visual Legend */}
              <div className="p-3 bg-surface-card rounded-xl border border-[#E0D9CD] text-xs font-mono space-y-2 shadow-kinetic-sm">
                <span className="text-[10px] font-bold uppercase text-ink-muted tracking-wider block">
                  Bounding Box Legend
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-1 bg-forest rounded-full inline-block"></span>
                    <span className="text-ink">Solid: Verified Pass (&gt;90%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-1 border-b-2 border-dashed border-terracotta inline-block"></span>
                    <span className="text-ink">Dashed: Manual Review</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-1 border-b-2 border-dotted border-brick inline-block"></span>
                    <span className="text-ink">Dotted: Statutory Failure</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-1 bg-amber rounded-full inline-block"></span>
                    <span className="text-ink">Amber: Low Quality Warning</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Findings List */}
            <section aria-labelledby="findings-heading" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-card rounded-xl border border-[#E0D9CD] shadow-kinetic-sm">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 id="findings-heading" className="font-heading font-bold text-ink text-base">
                      Statutory Declarations
                    </h2>
                    <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-surface-dim text-ink font-bold border border-[#DDD6C8]">
                      {verdicts.length} Total
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted mt-0.5 font-sans">
                    Showing {visibleVerdicts.length} of {verdicts.length} statutory checks
                    {remainingManualReviews.length > 0
                      ? ` · ${remainingManualReviews.length} require manual review`
                      : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-mono text-ink-muted">Filter:</label>
                  <select
                    aria-label="Filter findings"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value as ResultFilter)}
                    className="text-xs font-mono font-semibold px-3 py-1.5 rounded-lg border border-[#D5CFC4] bg-surface-dim text-ink focus:outline-none focus:ring-2 focus:ring-terracotta cursor-pointer"
                  >
                    <option value="all">All findings ({verdicts.length})</option>
                    <option value="attention">Needs attention</option>
                    <option value="pass">Passing only</option>
                  </select>
                </div>
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
                <p className="bg-surface-card rounded-xl border border-[#E0D9CD] p-6 text-center text-ink-muted font-heading">
                  No findings match this filter.
                </p>
              )}
            </section>
          </div>
        </>
      )}

      {/* Review Form & History Footer Sections */}
      <div className="grid gap-6 lg:grid-cols-2 pt-2">
        <ReviewForm
          scanId={result.scanId}
          onSubmitted={(review) => setReviews((all) => [...all, review])}
        />
        <section className="bg-surface-card rounded-xl border border-[#E0D9CD] shadow-kinetic-sm p-6" aria-labelledby="review-history-heading">
          <div className="flex items-center justify-between border-b border-[#E8E2D6] pb-3">
            <h2 id="review-history-heading" className="text-h2 font-heading text-ink">
              Review history
            </h2>
            <span className="rounded-full bg-surface-dim px-2.5 py-0.5 text-xs font-mono font-bold text-ink-muted border border-[#DDD6C8]">
              {reviews.length} actions
            </span>
          </div>
          {reviews.length ? (
            <ol className="mt-4 space-y-3.5">
              {reviews.map((review, index) => (
                <li
                  key={`${review.id}-${index}`}
                  className="rounded-lg border border-[#E0D9CD] bg-surface-dim/50 p-3.5 text-sm space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold capitalize text-ink font-heading">
                      {review.action.replaceAll('_', ' ')}
                    </p>
                    <p className="text-xs font-mono text-ink-muted">
                      {new Date(review.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <p className="text-sm text-ink/90 font-sans">{review.note || 'No note recorded.'}</p>
                  <p className="text-xs text-ink-muted pt-0.5 font-mono">
                    {review.actor_display_name} · {new Date(review.created_at).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm text-ink-muted text-center py-6 font-sans">
              No review actions recorded.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function PreviousScanPanel({ previousScan }: { previousScan: PreviousScan }) {
  return (
    <section className="rounded-xl border border-[#E0D9CD] bg-surface-card p-5 shadow-kinetic-sm" aria-labelledby="previous-scan-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-mono font-bold uppercase tracking-wider text-terracotta">Re-scan comparison</p>
          <h2 id="previous-scan-heading" className="mt-1 font-heading text-lg font-bold text-ink">Previous scan #{previousScan.scan_id}</h2>
        </div>
        <span className="text-xs font-mono text-ink-muted">{new Date(previousScan.scanned_at).toLocaleString()}</span>
      </div>
      {previousScan.comparison.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {previousScan.comparison.map((item) => (
            <div key={item.rule_id} className="flex items-center justify-between rounded-lg border border-[#E0D9CD] bg-surface-dim px-3 py-2 text-xs">
              <span className="font-mono text-ink">{item.rule_id}</span>
              <span className={cn(
                'rounded-full px-2 py-0.5 font-mono font-semibold capitalize',
                item.direction === 'improved' ? 'bg-forest-light text-forest' : item.direction === 'regressed' ? 'bg-brick-bg text-brick' : 'bg-white text-ink-muted'
              )}>
                {item.direction} · {item.status_before} → {item.status_after}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
