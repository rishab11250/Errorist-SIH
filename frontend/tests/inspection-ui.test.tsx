import { HttpResponse, http } from 'msw';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InspectionCapture } from '@/components/inspection/InspectionCapture';
import { InspectionResult } from '@/components/inspection/InspectionResult';
import { ReviewForm } from '@/components/inspection/ReviewForm';
import { CameraCaptureGuide } from '@/components/inspection/CameraCaptureGuide';
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

  it('shows a fallback when camera permission is denied', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });

    render(<CameraCaptureGuide onCapture={() => undefined} />);

    expect(
      await screen.findByText('Camera permission denied. Allow camera access or upload an image.')
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try camera again' })).toBeVisible();
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
      })
    );
  });

  it('stops camera tracks when the guided capture unmounts', async () => {
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });

    const { unmount } = render(<CameraCaptureGuide onCapture={() => undefined} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    unmount();

    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('changes capture guidance when screenshot mode is selected', async () => {
    render(<InspectionCapture onComplete={() => undefined} />);
    await userEvent.click(screen.getByRole('radio', { name: 'E-commerce screenshot' }));
    expect(screen.getByText(/upload listing screenshot/i)).toBeVisible();
    expect(screen.getByLabelText(/evidence image/i)).not.toHaveAttribute('capture');
  });

  it('stops a camera granted after the capture screen has already unmounted', async () => {
    const stop = vi.fn();
    let grant!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { grant = resolve; }));
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
    const { unmount } = render(<CameraCaptureGuide onCapture={() => undefined} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    unmount();
    grant({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
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

  it('renders a synced snapshot without inventing a missing quality assessment', () => {
    render(<InspectionResult result={{ ...MANUAL_REVIEW_RESULT, quality: null }} />);
    expect(screen.getByText('Image assessment unavailable')).toBeVisible();
    expect(screen.queryByText(/Quality score/)).not.toBeInTheDocument();
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
      http.post('/api/scan/sync', () => {
        requests += 1;
        return HttpResponse.json(SUCCESS_RESPONSE);
      })
    );
    runOCRMock.mockImplementation(
      (_file: File, _onProgress: unknown, signal?: AbortSignal) =>
        new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            ocrStopped = signal?.aborted ?? false;
            if (ocrStopped) reject(new DOMException('Canceled', 'AbortError'));
            else resolve(OCR_RESULT);
          }, 1000);
          signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            ocrStopped = true;
            reject(new DOMException('Canceled', 'AbortError'));
          });
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

  it('switches to multi-section bulk mode and displays section slots', async () => {
    render(<InspectionCapture onComplete={() => undefined} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Multi-Section/i }));
    expect(screen.getByText(/Multi-Section Bulk Scanner/i)).toBeVisible();
    expect(screen.getByText(/1\. Front \/ Brand & Product Name/i)).toBeVisible();
    expect(screen.getByText(/2\. Nutrition & Ingredients Panel/i)).toBeVisible();
    expect(screen.getByText(/3\. Manufacturer, FSSAI & Barcode/i)).toBeVisible();
    expect(screen.getByText(/4\. MRP, Net Quantity & Dates Flap/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /Start multi-section inspection \(0 sections\)/i })).toBeDisabled();
  });

  it('rejects multi-section scan when sections belong to different products', async () => {
    runOCRMock.mockImplementation(async (file?: File) => {
      if (file?.name?.includes('maggi')) {
        return {
          words: [
            { text: 'Maggi', confidence: 0.99, bbox: [0.1, 0.1, 0.3, 0.1] },
            { text: 'Noodles', confidence: 0.95, bbox: [0.1, 0.2, 0.3, 0.1] },
            { text: 'MRP ₹20.00', confidence: 0.95, bbox: [0.1, 0.3, 0.3, 0.1] },
          ],
          lines: [],
          imageDataUrl: 'data:image/jpeg;base64,bWFnZ2k=',
          imageWidth: 800,
          imageHeight: 600,
        };
      }
      return {
        words: [
          { text: 'Sunfeast YiPPee!', confidence: 0.99, bbox: [0.1, 0.1, 0.3, 0.1] },
          { text: 'Net Quantity: 70g', confidence: 0.95, bbox: [0.1, 0.2, 0.3, 0.1] },
          { text: 'Batch No: AB12', confidence: 0.95, bbox: [0.1, 0.3, 0.3, 0.1] },
        ],
        lines: [],
        imageDataUrl: 'data:image/jpeg;base64,eWlwcGVl',
        imageWidth: 800,
        imageHeight: 600,
      };
    });

    render(<InspectionCapture onComplete={() => undefined} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Multi-Section/i }));

    const file1 = new File(['sec1'], 'brand-maggi.jpg', { type: 'image/jpeg' });
    const file2 = new File(['sec2'], 'brand-yippee.jpg', { type: 'image/jpeg' });

    const slot1Input = screen.getByLabelText(/1\. Front \/ Brand & Product Name/i);
    const slot2Input = screen.getByLabelText(/2\. Nutrition & Ingredients Panel/i);

    await user.upload(slot1Input, file1);
    await user.upload(slot2Input, file2);

    const startBtn = screen.getByRole('button', { name: /Start multi-section inspection \(2 sections\)/i });
    expect(startBtn).not.toBeDisabled();
    await user.click(startBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Product Mismatch Rejected/i);
    });
  });

  it('fuses multi-section scan for consistent product captures and invokes onComplete', async () => {
    const onComplete = vi.fn();
    let submittedSnapshot: { local_id: string; rule_version: string; verdicts: unknown[] } | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('/api/scan/sync');
      submittedSnapshot = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ scan_id: 88 }), { status: 201 });
    }));

    runOCRMock.mockImplementation(async (file?: File) => {
      if (file?.name?.includes('front')) {
        return {
          words: [
            { text: 'Sunfeast', confidence: 0.99, bbox: [0.1, 0.1, 0.3, 0.1] },
            { text: 'YiPPee!', confidence: 0.99, bbox: [0.1, 0.2, 0.3, 0.1] },
            { text: 'Noodles', confidence: 0.95, bbox: [0.1, 0.3, 0.3, 0.1] },
          ],
          lines: [],
          imageDataUrl: 'data:image/jpeg;base64,eWlwcGVlMQ==',
          imageWidth: 800,
          imageHeight: 600,
        };
      }
      return {
        words: [
          { text: 'Sunfeast', confidence: 0.98, bbox: [0.1, 0.1, 0.3, 0.1] },
          { text: 'MRP ₹20.00', confidence: 0.95, bbox: [0.1, 0.2, 0.3, 0.1] },
          { text: 'Net Qty: 70g', confidence: 0.95, bbox: [0.1, 0.3, 0.3, 0.1] },
          { text: 'Lic. No. 10012011000123', confidence: 0.95, bbox: [0.1, 0.4, 0.3, 0.1] },
        ],
        lines: [],
        imageDataUrl: 'data:image/jpeg;base64,eWlwcGVlMg==',
        imageWidth: 800,
        imageHeight: 600,
      };
    });

    render(<InspectionCapture onComplete={onComplete} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Multi-Section/i }));

    const file1 = new File(['sec1'], 'panel-front.jpg', { type: 'image/jpeg' });
    const file2 = new File(['sec2'], 'panel-mrp.jpg', { type: 'image/jpeg' });

    const slot1Input = screen.getByLabelText(/1\. Front \/ Brand & Product Name/i);
    const slot2Input = screen.getByLabelText(/2\. Nutrition & Ingredients Panel/i);

    await user.upload(slot1Input, file1);
    await user.upload(slot2Input, file2);

    const startBtn = screen.getByRole('button', { name: /Start multi-section inspection \(2 sections\)/i });
    await user.click(startBtn);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    const callArg = onComplete.mock.calls[0][0];
    expect(callArg.response.scan_id).toBe(88);
    expect(submittedSnapshot?.local_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(submittedSnapshot?.verdicts).toEqual(callArg.response.verdicts);
    expect(submittedSnapshot?.rule_version).toBe(callArg.response.analysis_version);
  });

  it('toggles OCR language between English Only and English + Hindi', async () => {
    render(<InspectionCapture onComplete={vi.fn()} />);
    const user = userEvent.setup();

    const englishBtn = screen.getByRole('button', { name: 'English Only' });
    const multiBtn = screen.getByRole('button', { name: 'English + Hindi' });

    expect(englishBtn).toBeVisible();
    expect(multiBtn).toBeVisible();
    expect(screen.getByText('⚡ 2.5x Faster')).toBeInTheDocument();

    await user.click(multiBtn);
    expect(screen.getByText('🇮🇳 Bilingual (EN + HI)')).toBeInTheDocument();

    await user.click(englishBtn);
    expect(screen.getByText('⚡ 2.5x Faster')).toBeInTheDocument();
  });
});
