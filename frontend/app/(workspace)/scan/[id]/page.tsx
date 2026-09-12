'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  InspectionResult,
  type InspectionResultData,
} from '@/components/inspection/InspectionResult';
import { getScan } from '@/lib/api';
import { safeNextPath } from '@/lib/api-client';

function cachedResult(scanId: number): InspectionResultData | null {
  const cached = sessionStorage.getItem(`scan:${scanId}`);
  if (!cached) return null;
  try {
    const value = JSON.parse(cached) as Partial<InspectionResultData>;
    if (!value.imageDataUrl || !Array.isArray(value.verdicts) || !value.quality) return null;
    return {
      scanId,
      imageDataUrl: value.imageDataUrl,
      imageWidth: value.imageWidth ?? 1,
      imageHeight: value.imageHeight ?? 1,
      verdicts: value.verdicts,
      quality: value.quality,
      overallStatus: value.overallStatus ?? 'manual_review',
      processingStatus: value.processingStatus ?? 'complete',
      analysisVersion: value.analysisVersion ?? 'inspection-v2',
      reviewActions: value.reviewActions ?? [],
      productId: value.productId,
      productMatchStatus: value.productMatchStatus,
      product: value.product,
      productCandidates: value.productCandidates,
      previousScan: value.previousScan,
    };
  } catch {
    sessionStorage.removeItem(`scan:${scanId}`);
    return null;
  }
}

export default function ScanResultPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const scanId = Number.parseInt(params.id, 10);
  const backHref = safeNextPath(searchParams.get('returnTo'), '/history');
  const [result, setResult] = useState<InspectionResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(cachedResult(scanId));
    getScan(scanId)
      .then((data) => {
        const b64 = data.scan.image_b64;
        let mime = 'image/png';
        if (b64.startsWith('/9j/')) mime = 'image/jpeg';
        else if (b64.startsWith('UklGR')) mime = 'image/webp';
        setResult({
          scanId,
          imageDataUrl: `data:${mime};base64,${b64}`,
          imageWidth: data.scan.image_meta.width,
          imageHeight: data.scan.image_meta.height,
          verdicts: data.verdicts,
          quality: data.scan.quality_summary,
          overallStatus: data.scan.overall_status,
          processingStatus: data.scan.processing_status,
          analysisVersion: data.scan.analysis_version,
          reviewActions: data.review_actions ?? [],
          productId: data.scan.product_id,
          productMatchStatus: data.scan.product_match_status,
          product: data.scan.product,
          productCandidates: data.scan.product_candidates,
          previousScan: data.scan.previous_scan,
        });
      })
      .catch((reason) => {
        if (!cachedResult(scanId)) {
          setError(
            reason instanceof Error ? reason.message : 'The inspection could not be loaded.'
          );
        }
      });
  }, [scanId]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div role="alert" className="rounded-lg border border-fail/30 bg-fail/10 p-5 text-fail">
          <h1 className="text-h2">Unable to load inspection</h1>
          <p className="mt-2">{error}</p>
          <Link href="/" className="mt-4 inline-flex min-h-11 items-center font-semibold underline">
            Start a new inspection
          </Link>
        </div>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="p-6 text-muted-foreground" role="status">
        Loading inspection results…
      </div>
    );
  }
  return <InspectionResult result={result} backHref={backHref} />;
}
