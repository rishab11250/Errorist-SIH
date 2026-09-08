'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import { AnnotatedImage } from '@/components/AnnotatedImage';
import { VerdictCard } from '@/components/VerdictCard';
import { getReportUrl, getScan } from '@/lib/api';
import type { OverallStatus, QualityStatus, QualitySummary, Verdict } from '@/lib/types';

interface ScanResult {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  verdicts: Verdict[];
  quality: QualitySummary;
  overallStatus: OverallStatus;
  processingStatus: 'processing' | 'complete' | 'failed';
  analysisVersion: string;
}

const overallLabels: Record<OverallStatus, string> = {
  pass: 'Pass',
  fail: 'Fail',
  mixed: 'Mixed findings',
  manual_review: 'Manual review',
};

const overallClasses: Record<OverallStatus, string> = {
  pass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  fail: 'border-red-200 bg-red-50 text-red-900',
  mixed: 'border-amber-200 bg-amber-50 text-amber-950',
  manual_review: 'border-violet-200 bg-violet-50 text-violet-950',
};

const qualityLabels: Record<QualityStatus, string> = {
  acceptable: 'Image quality acceptable',
  usable_with_warnings: 'Usable with warnings',
  retake_recommended: 'Retake recommended',
  unreadable: 'Image unreadable',
};

const qualityClasses: Record<QualityStatus, string> = {
  acceptable: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  usable_with_warnings: 'border-amber-200 bg-amber-50 text-amber-950',
  retake_recommended: 'border-orange-200 bg-orange-50 text-orange-950',
  unreadable: 'border-red-200 bg-red-50 text-red-950',
};

function isScanResult(value: unknown): value is ScanResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ScanResult>;
  return Boolean(
    candidate.imageDataUrl
      && Array.isArray(candidate.verdicts)
      && candidate.quality
      && candidate.overallStatus,
  );
}

export default function ScanResultPage() {
  const params = useParams<{ id: string }>();
  const scanId = Number.parseInt(params.id, 10);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cached = sessionStorage.getItem(`scan:${scanId}`);
    if (cached) {
      try {
        const parsed: unknown = JSON.parse(cached);
        if (isScanResult(parsed)) {
          setScan(parsed);
          return;
        }
      } catch {
        sessionStorage.removeItem(`scan:${scanId}`);
      }
    }

    getScan(scanId)
      .then((data) => setScan({
        imageDataUrl: `data:image/png;base64,${data.scan.image_b64}`,
        imageWidth: data.scan.image_meta.width,
        imageHeight: data.scan.image_meta.height,
        verdicts: data.verdicts,
        quality: data.scan.quality_summary,
        overallStatus: data.scan.overall_status,
        processingStatus: data.scan.processing_status,
        analysisVersion: data.scan.analysis_version,
      }))
      .catch((reason) => setError(
        reason instanceof Error ? reason.message : 'The scan could not be loaded.',
      ));
  }, [scanId]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
          <h1 className="text-lg font-bold">Unable to load scan</h1>
          <p className="mt-2">{error}</p>
          <a href="/" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-red-800 px-4 py-2 font-semibold text-white">
            Start a new scan
          </a>
        </div>
      </div>
    );
  }

  if (!scan) return <div className="p-6 text-slate-700" role="status">Loading scan results…</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-700">Inspection result</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Scan #{scanId}</h1>
          <p className="mt-1 text-xs text-slate-500">Analysis: {scan.analysisVersion}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href="/" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-blue-100">
            New scan
          </a>
          <a href={getReportUrl(scanId)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200">
            Download PDF
          </a>
        </div>
      </header>

      <section aria-labelledby="quality-heading" className={`rounded-xl border p-5 ${qualityClasses[scan.quality.status]}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider">Image assessment</p>
            <h2 id="quality-heading" className="mt-1 text-lg font-bold">{qualityLabels[scan.quality.status]}</h2>
          </div>
          <p className="rounded-full bg-white/70 px-3 py-1 text-sm font-semibold">Quality score {Math.round(scan.quality.score * 100)}%</p>
        </div>
        {scan.quality.guidance.length > 0 ? (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm leading-6">
            {scan.quality.guidance.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : (
          <p className="mt-3 text-sm">The image is suitable for automated inspection.</p>
        )}
      </section>

      <section aria-label="Overall compliance status" className={`rounded-xl border p-5 ${overallClasses[scan.overallStatus]}`}>
        <p className="text-xs font-semibold uppercase tracking-wider">Overall status</p>
        <p className="mt-1 text-xl font-bold">{overallLabels[scan.overallStatus]}</p>
        {scan.overallStatus === 'manual_review' && (
          <p className="mt-2 text-sm">The image does not provide enough reliable evidence for a final automated decision.</p>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,1fr)]">
        <section aria-label="Annotated package image" className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-6">
          <AnnotatedImage imageSrc={scan.imageDataUrl} verdicts={scan.verdicts} />
        </section>
        <section aria-labelledby="checks-heading" className="space-y-3">
          <h2 id="checks-heading" className="text-xl font-bold text-slate-950">Declaration checks</h2>
          {scan.verdicts.map((verdict) => <VerdictCard key={verdict.rule_id} verdict={verdict} />)}
        </section>
      </div>
    </div>
  );
}
