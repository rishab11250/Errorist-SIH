import { describe, expect, it } from 'vitest';

import { buildScanRequest } from '@/components/UploadDropzone';
import { statusClass, statusLabel } from '@/components/VerdictBadge';
import type { OCRRunResult } from '@/lib/ocr';

const ocrFixture: OCRRunResult = {
  words: [
    { text: 'Country', confidence: 0.95, bbox: [0.1, 0.1, 0.2, 0.05] },
    { text: 'India', confidence: 0.94, bbox: [0.32, 0.1, 0.12, 0.05] },
  ],
  lines: [
    {
      word_indexes: [0, 1],
      bbox: [0.1, 0.1, 0.34, 0.05],
      median_character_height: 0.05,
    },
  ],
  imageDataUrl: 'data:image/png;base64,aGVsbG8=',
  imageWidth: 800,
  imageHeight: 600,
};

describe('scan v2 contract', () => {
  it('emits the version-2 listing contract', () => {
    const request = buildScanRequest(ocrFixture, {
      mode: 'ecommerce_listing',
      category: 'unknown',
      imported: null,
    });
    expect(request.schema_version).toBe(2);
    expect(request.scan_context.mode).toBe('ecommerce_listing');
    expect(request.ocr_lines).toHaveLength(1);
    expect(request.image_b64).toBe('aGVsbG8=');
  });

  it('uses manual-review status without collapsing it to warn', () => {
    expect(statusLabel('manual_review')).toBe('Manual review');
    expect(statusClass('manual_review')).toContain('review');
    expect(statusLabel('na')).toBe('Not applicable');
  });
});
