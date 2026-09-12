'use client';

import { useRouter } from 'next/navigation';

import { InspectionCapture } from '@/components/inspection/InspectionCapture';
import type { OCRRunResult } from '@/lib/ocr';
import type { ScanContext, ScanResponse } from '@/lib/types';

export default function HomePage() {
  const router = useRouter();
  return (
    <div>
      <InspectionCapture
        onComplete={(
          result: OCRRunResult & { response: ScanResponse; scanContext: ScanContext }
        ) => {
          sessionStorage.setItem(
            `scan:${result.response.scan_id}`,
            JSON.stringify({
              imageDataUrl: result.imageDataUrl,
              imageWidth: result.imageWidth,
              imageHeight: result.imageHeight,
              ocrWords: result.words,
              verdicts: result.response.verdicts,
              quality: result.response.quality,
              overallStatus: result.response.overall_status,
              processingStatus: result.response.processing_status,
              analysisVersion: result.response.analysis_version,
              captureMode: result.scanContext.mode,
              category: result.scanContext.category,
            })
          );
          router.push(`/scan/${result.response.scan_id}`);
        }}
      />
    </div>
  );
}
