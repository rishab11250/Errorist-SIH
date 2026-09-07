'use client';

import { useRouter } from 'next/navigation';

import { UploadDropzone } from '@/components/UploadDropzone';
import type { OCRRunResult } from '@/lib/ocr';
import type { ScanResponse } from '@/lib/types';

export default function HomePage() {
  const router = useRouter();
  return <main><UploadDropzone onComplete={(result: OCRRunResult & { response: ScanResponse }) => {
    sessionStorage.setItem(`scan:${result.response.scan_id}`, JSON.stringify({ imageDataUrl: result.imageDataUrl, imageWidth: result.imageWidth, imageHeight: result.imageHeight, verdicts: result.response.verdicts }));
    router.push(`/scan/${result.response.scan_id}`);
  }} /></main>;
}
