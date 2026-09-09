import { HttpResponse, http } from 'msw';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InspectionCapture } from '@/components/inspection/InspectionCapture';
import { InspectionResult } from '@/components/inspection/InspectionResult';
import { ReviewForm } from '@/components/inspection/ReviewForm';
import { ScanProgress } from '@/components/ui/scan-progress';
import type { InspectionResultData } from '@/components/inspection/InspectionResult';
import { server } from './server';

const runOCRMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ocr', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ocr')>('@/lib/ocr');
  return { ...actual, runOCR: runOCRMock };
});

const OCR_RESULT = {
  words: [{ text: 'MRP', confidence: 0.96, bbox: [0.1, 0.1, 0.2, 0.1] }],
  lines: [{ word_indexes: [0], bbox: [0.1, 0.1, 0.2, 0.1], median_character_height: 0.1 }],
  imageDataUrl: 'data:image/png;base64,aGVsbG8=',
  imageWidth: 800,
  imageHeight: 600,
};

const MANUAL_REVIEW_RESULT: InspectionResultData = {
  scanId: 12,
  imageDataUrl: 'data:image/png;base64,aGVsbG8=',
  imageWidth: 800,
  imageHeight: 600,
  overallStatus: 'manual_review',
  processingStatus: 'complete',
  analysisVersion: 'inspection-v2',
  quality: {
    status: 'usable_with_warnings',
    score: 0.68,
    metrics: [],
    guidance: ['Use a straight-on image for a more reliable measurement.'],
  },
  verdicts: [
    {
      rule_id: 'r7_font_size',
      status: 'manual_review',
      severity: 'warning',
      citation: 'Rule 7 minimum character height',
      evidence: 'MRP ₹99',
      evidence_bboxes: [[0.1, 0.2, 0.3, 0.1]],
      confidence: 0.52,
      reasoning: 'Physical scale cannot be established from this screenshot.',
      measurement_method: 'not_measurable',
      failure_message: 'Compare the declaration against the physical package.',
      rule_version: '2026-09',
      review_state: 'unreviewed',
    },
  ],
  reviewActions: [],
};

const SUCCESS_RESPONSE = {
  scan_id: 13,
  processing_status: 'complete',
  quality: MANUAL_REVIEW_RESULT.quality,
  extracted_fields: {},
  verdicts: MANUAL_REVIEW_RESULT.verdicts,
  overall_status: 'manual_review',
  analysis_version: 'inspection-v2',
};

describe('inspection experience', () => {
  beforeEach(() => runOCRMock.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it('changes capture guidance when screenshot mode is selected', async () => {
    render(<InspectionCapture onComplete={() => undefined} />);
    await userEvent.click(screen.getByRole('radio', { name: 'E-commerce screenshot' }));
    expect(screen.getByText(/upload listing screenshot/i)).toBeVisible();
    expect(screen.getByLabelText(/evidence image/i)).not.toHaveAttribute('capture');
  });

  it('selecting a verdict highlights its evidence and announces details', async () => {
    render(<InspectionResult result={MANUAL_REVIEW_RESULT} />);
    await userEvent.click(screen.getByRole('button', { name: /Rule 7/i }));
    expect(screen.getByTestId('evidence-box-r7_font_size-0')).toHaveAttribute(
      'data-active',
      'true'
    );
    expect(screen.getByRole('status')).toHaveTextContent('Physical scale cannot be established');
    expect(screen.getByText(/straight-on image/i)).toBeVisible();
  });

  it('requires an explanatory note before submitting a false positive', async () => {
    const submitted = vi.fn();
    let requests = 0;
    server.use(
      http.post('/api/scan/12/reviews', () => {
        requests += 1;
        return HttpResponse.json({ id: 1, action: 'false_positive', note: 'Glare' });
      })
    );
    render(<ReviewForm scanId={12} onSubmitted={submitted} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Review action'), 'false_positive');
    await user.click(screen.getByRole('button', { name: 'Record review' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add a note');
    expect(requests).toBe(0);
    await user.type(screen.getByLabelText('Review note'), 'Glare caused the OCR mismatch.');
    await user.click(screen.getByRole('button', { name: 'Record review' }));
    expect(submitted).toHaveBeenCalled();
    expect(requests).toBe(1);
  });

  it('shows loading state and cancels before the API submission', async () => {
    let requests = 0;
    let ocrStopped = false;
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    server.use(
      http.post('/api/scan', () => {
        requests += 1;
        return HttpResponse.json(SUCCESS_RESPONSE);
      })
    );
    runOCRMock.mockImplementation(
      (_file: File, _onProgress: unknown, signal?: AbortSignal) =>
        new Promise((resolve, reject) => {
          setTimeout(() => {
            ocrStopped = signal?.aborted ?? false;
            if (ocrStopped) reject(new DOMException('Canceled', 'AbortError'));
            else resolve(OCR_RESULT);
          }, 100);
        })
    );
    const user = userEvent.setup();
    render(<InspectionCapture onComplete={() => undefined} />);
    await user.upload(
      screen.getByLabelText('Evidence image'),
      new File(['image'], 'label.png', { type: 'image/png' })
    );
    await user.click(screen.getByRole('button', { name: 'Start inspection' }));
    expect(screen.getByRole('status')).toHaveTextContent('Reading label text');
    await user.click(screen.getByRole('button', { name: 'Cancel inspection' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Inspection canceled');
    expect(screen.getByRole('button', { name: 'Retry inspection' })).toBeEnabled();
    await waitFor(() => expect(ocrStopped).toBe(true));
    expect(requests).toBe(0);
  });

  it('keeps the image available when OCR finds no readable text', async () => {
    runOCRMock.mockResolvedValue({ ...OCR_RESULT, words: [], lines: [] });
    const user = userEvent.setup();
    render(<InspectionCapture onComplete={() => undefined} />);
    await user.upload(
      screen.getByLabelText('Evidence image'),
      new File(['image'], 'blank.webp', { type: 'image/webp' })
    );
    await user.click(screen.getByRole('button', { name: 'Start inspection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No readable text was found');
    expect(screen.getByRole('button', { name: 'Retry inspection' })).toBeEnabled();
  });

  it('retries after an API error without asking for the image again', async () => {
    const onComplete = vi.fn();
    runOCRMock.mockResolvedValue(OCR_RESULT);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({
          error: 'analysis_failed',
          detail: 'Analysis service unavailable.',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => SUCCESS_RESPONSE,
      });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<InspectionCapture onComplete={onComplete} />);
    await user.upload(
      screen.getByLabelText('Evidence image'),
      new File(['image'], 'label.jpg', { type: 'image/jpeg' })
    );
    await user.click(screen.getByRole('button', { name: 'Start inspection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Analysis service unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry inspection' }));
    await waitFor(() =>
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining(OCR_RESULT))
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('announces progress without relying on animation or color in reduced-motion mode', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    render(
      <ScanProgress
        stages={[
          { id: 'upload', label: 'Upload' },
          { id: 'ocr', label: 'Read text' },
          { id: 'analysis', label: 'Analyze' },
        ]}
        currentStage={1}
      />
    );
    expect(screen.getByLabelText('Inspection progress: step 2 of 3')).toBeVisible();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('gates declaration checks and provides review override when quality is retake_recommended', async () => {
    const RETAKE_RESULT: InspectionResultData = {
      ...MANUAL_REVIEW_RESULT,
      scanId: 15,
      quality: {
        status: 'retake_recommended',
        score: 35.0,
        metrics: [
          {
            name: 'ocr_confidence_distribution',
            value: 28.5,
            unit: 'percent',
            confidence: 1,
            method: 'median',
            evidence_bboxes: [],
          },
        ],
        guidance: ['Hold the camera closer and steady so the printed text is sharp and legible.'],
      },
    };
    render(<InspectionResult result={RETAKE_RESULT} />);
    expect(screen.getByText(/Photo quality insufficient for reliable inspection/i)).toBeVisible();
    expect(screen.getByText(/OCR Word Confidence \(Median\)/i)).toBeVisible();
    expect(screen.getByText('29%')).toBeVisible();
    expect(screen.getByRole('link', { name: /Retake photo/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Rule 7/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Automated checks paused/i)).toBeVisible();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Review anyway/i }));
    expect(screen.getByRole('button', { name: /Rule 7/i })).toBeVisible();
    expect(screen.getByText(/Displaying unverified findings/i)).toBeVisible();
  });

  it('allows adding a secondary panel in retail image mode', async () => {
    render(<InspectionCapture onComplete={() => undefined} />);
    const primaryFile = new File(['primary'], 'front-panel.jpg', { type: 'image/jpeg' });
    const user = userEvent.setup();
    await user.upload(screen.getByLabelText(/evidence image/i), primaryFile);
    await waitFor(() => {
      expect(screen.getByText(/Add secondary panel/i)).toBeVisible();
    });
  });
});
