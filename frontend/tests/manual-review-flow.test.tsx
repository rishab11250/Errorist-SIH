import { HttpResponse, http } from 'msw';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InspectionResult } from '@/components/inspection/InspectionResult';
import type { InspectionResultData } from '@/components/inspection/InspectionResult';
import { EvidenceCrop } from '@/components/inspection/EvidenceCrop';
import { VerdictCard } from '@/components/inspection/VerdictCard';
import type { Verdict } from '@/lib/types';
import { server } from './server';

// Real fixture: Balaji Wafers Back Panel (case_1_clean_balaji from e2e_real_test_results.json)
const BALAJI_MRP_VERDICT: Verdict = {
  id: 101,
  rule_id: 'r6_1_e_mrp',
  status: 'manual_review',
  severity: 'critical',
  citation: 'Rule 6(1)(e) of LMPC Rules 2011',
  evidence: '₹5.00 incl. of all taxes',
  evidence_bboxes: [
    [0.28996447602131437, 0.87175, 0.08348134991119005, 0.03375],
  ],
  confidence: 0.6787,
  reasoning: 'Image quality is insufficient to support an automatic compliance decision.',
  measurement_method: 'not_measurable',
  failure_message: null,
  rule_version: '2026-09',
  review_state: 'unreviewed',
};

// Real fixture: Missing Scale / Rule 7 (from e2e_real_test_results.json)
const BALAJI_FONT_SIZE_VERDICT: Verdict = {
  id: 102,
  rule_id: 'r7_font_size',
  status: 'manual_review',
  severity: 'warning',
  citation: 'Rule 7 minimum character height',
  evidence: '',
  evidence_bboxes: [],
  confidence: 0.6787,
  reasoning: 'No declaration readability measurements are available.',
  measurement_method: 'not_measurable',
  failure_message: 'Compare the declaration against the physical package.',
  rule_version: '2026-09',
  review_state: 'unreviewed',
};

// Real fixture: Sting Energy (off_1_8902080000227 curved surface OCR typo)
const STING_NET_QTY_VERDICT: Verdict = {
  id: 103,
  rule_id: 'r6_1_c_net_quantity',
  status: 'manual_review',
  severity: 'critical',
  citation: 'Rule 6(1)(c) read with Rule 13 of LMPC Rules 2011',
  evidence: '25O ml', // OCR typo: capital O instead of 0
  evidence_bboxes: [
    [0.45, 0.60, 0.12, 0.04],
  ],
  confidence: 0.48,
  reasoning: 'OCR confidence is too low to prove that the declaration is malformed.',
  measurement_method: 'not_measurable',
  failure_message: 'Net quantity must be declared in metric units (g/kg/ml/l)',
  rule_version: '2026-09',
  review_state: 'unreviewed',
};

const MOCK_IMAGE_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const REAL_STRESS_TEST_SCAN: InspectionResultData = {
  scanId: 42,
  imageDataUrl: MOCK_IMAGE_DATA,
  imageWidth: 1000,
  imageHeight: 1200,
  overallStatus: 'manual_review',
  processingStatus: 'complete',
  analysisVersion: 'inspection-v2',
  quality: {
    status: 'usable_with_warnings',
    score: 67.87,
    metrics: [],
    guidance: ['Review declarations under manual review to complete the inspection.'],
  },
  verdicts: [
    BALAJI_MRP_VERDICT,
    BALAJI_FONT_SIZE_VERDICT,
  ],
  reviewActions: [],
};

describe('Manual Review Confirm / Edit Flow (QA Verification)', () => {
  beforeEach(() => {
    server.use(
      http.post('/api/scan/42/reviews', async ({ request }) => {
        const body = (await request.json()) as { action: string; note: string; verdict_id?: number };
        return HttpResponse.json({
          id: Math.floor(Math.random() * 1000) + 1,
          scan_id: 42,
          verdict_id: body.verdict_id ?? null,
          action: body.action,
          note: body.note,
          actor_user_id: 1,
          actor_display_name: 'Inspector',
          created_at: new Date().toISOString(),
        });
      })
    );
  });

  describe('EvidenceCrop component', () => {
    it('renders SVG viewport and highlight box when bbox is present', () => {
      render(
        <EvidenceCrop
          imageSrc={MOCK_IMAGE_DATA}
          bbox={[0.2, 0.8, 0.1, 0.05]}
          citation="Rule 6(1)(e) MRP"
        />
      );

      const crop = screen.getByTestId('evidence-crop');
      expect(crop).toBeVisible();

      const svg = crop.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('viewBox');

      const image = svg?.querySelector('image');
      expect(image).toHaveAttribute('href', MOCK_IMAGE_DATA);

      const rect = svg?.querySelector('rect');
      expect(rect).toHaveAttribute('stroke', '#a855f7');
    });

    it('renders graceful fallback when bbox is missing or empty', () => {
      render(
        <EvidenceCrop
          imageSrc={MOCK_IMAGE_DATA}
          bbox={null}
          citation="Rule 7 font size"
        />
      );

      expect(screen.getByTestId('evidence-crop-fallback')).toBeVisible();
      expect(screen.getByText(/No localized bounding box on packaging/i)).toBeVisible();
    });
  });

  describe('VerdictCard inline confirm/edit interaction', () => {
    it('displays OCR best-guess value and evidence crop in manual_review state', () => {
      render(
        <VerdictCard
          verdict={BALAJI_MRP_VERDICT}
          imageDataUrl={MOCK_IMAGE_DATA}
        />
      );

      // Best-guess input pre-filled with OCR value
      const input = screen.getByLabelText(/Extracted Value \(Best Guess\)/i) as HTMLInputElement;
      expect(input).toBeVisible();
      expect(input.value).toBe('₹5.00 incl. of all taxes');

      // Evidence crop is rendered
      expect(screen.getByTestId('evidence-crop')).toBeVisible();

      // Quick confirm button is visible
      expect(screen.getByTestId('confirm-review-btn-r6_1_e_mrp')).toHaveTextContent(/Confirm OCR Value/i);
    });

    it('switches to "Update & Verify" when the reviewer corrects an OCR typo', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();

      render(
        <VerdictCard
          verdict={STING_NET_QTY_VERDICT}
          imageDataUrl={MOCK_IMAGE_DATA}
          onReviewSubmit={onSubmit}
        />
      );

      const input = screen.getByLabelText(/Extracted Value \(Best Guess\)/i);
      expect(input).toHaveValue('25O ml');

      // Before editing, button says "Confirm OCR Value"
      expect(screen.getByTestId('confirm-review-btn-r6_1_c_net_quantity')).toBeVisible();

      // Correct "25O ml" -> "250 ml"
      await user.clear(input);
      await user.type(input, '250 ml');

      // Now button dynamically switches to "Update & Verify"
      const updateBtn = screen.getByTestId('update-review-btn-r6_1_c_net_quantity');
      expect(updateBtn).toBeVisible();
      expect(updateBtn).toHaveTextContent(/Update & Verify/i);

      await user.click(updateBtn);
      expect(onSubmit).toHaveBeenCalledWith(
        STING_NET_QTY_VERDICT,
        'resolved',
        '250 ml'
      );
    });

    it('allows flagging non-compliant / missing declarations', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();

      render(
        <VerdictCard
          verdict={BALAJI_MRP_VERDICT}
          imageDataUrl={MOCK_IMAGE_DATA}
          onReviewSubmit={onSubmit}
        />
      );

      const flagBtn = screen.getByTestId('flag-missing-btn-r6_1_e_mrp');
      await user.click(flagBtn);

      expect(onSubmit).toHaveBeenCalledWith(
        BALAJI_MRP_VERDICT,
        'false_positive',
        '₹5.00 incl. of all taxes',
        expect.stringContaining('Declaration absent or invalid')
      );
    });
  });

  describe('End-to-End Inspection Completion Flow (Unblocking Reviewers)', () => {
    it('allows reviewer to confirm all manual_review fields and completes the inspection', async () => {
      const user = userEvent.setup();

      // Mock the reviews API
      let recordedReviewPayload: unknown = null;
      server.use(
        http.post('/api/scan/42/reviews', async ({ request }) => {
          recordedReviewPayload = await request.json();
          return HttpResponse.json({
            id: 801,
            scan_id: 42,
            verdict_id: 101,
            action: 'confirmed',
            note: 'Confirmed field [r6_1_e_mrp]: ₹5.00 incl. of all taxes',
            actor_user_id: 1,
            actor_display_name: 'Inspector',
            created_at: new Date().toISOString(),
          });
        })
      );

      render(<InspectionResult result={REAL_STRESS_TEST_SCAN} />);

      // Initial state: scan is stuck in Manual Review
      expect(screen.getByTestId('overall-status-banner')).toHaveTextContent(/Manual review/i);
      expect(screen.getByText(/2 require manual review/i)).toBeVisible();

      // Step 1: Reviewer confirms the MRP declaration (Rule 6(1)(e))
      const confirmMrpBtn = screen.getByTestId('confirm-review-btn-r6_1_e_mrp');
      await user.click(confirmMrpBtn);

      // MRP verdict should now show confirmed state banner
      await waitFor(() => {
        expect(screen.getByText(/Verified by reviewer:/i)).toBeVisible();
      });
      expect(recordedReviewPayload).toEqual(
        expect.objectContaining({
          action: 'confirmed',
          verdict_id: 101,
        })
      );

      // 1 manual review field remaining
      expect(screen.getByText(/1 require manual review/i)).toBeVisible();

      // Step 2: Reviewer reviews Rule 7 font size (enters verified height measurement)
      const fontCard = screen.getByTestId('verdict-card-r7_font_size');
      const fontInput = fontCard.querySelector('#edit-field-r7_font_size') as HTMLInputElement;
      expect(fontInput).toBeVisible();
      await user.type(fontInput, '1.5 mm compliant');

      const updateFontBtn = screen.getByTestId('update-review-btn-r7_font_size');
      await user.click(updateFontBtn);

      // All manual reviews are now resolved!
      // The scan status must dynamically transition to PASS
      await waitFor(() => {
        expect(screen.getByTestId('overall-status-banner')).toHaveTextContent(/Pass/i);
      });

      // The human verification complete banner must be displayed
      expect(screen.getByTestId('manual-review-resolved-banner')).toBeVisible();
      expect(screen.getByText(/All declarations verified by reviewer/i)).toBeVisible();

      // Audit review history now shows the logged actions
      expect(screen.getByText(/Review history/i)).toBeVisible();
      expect(screen.getByText(/2 actions/i)).toBeVisible();
    });

    it('supports re-editing a confirmed declaration if the reviewer needs to make corrections', async () => {
      const user = userEvent.setup();

      render(<InspectionResult result={REAL_STRESS_TEST_SCAN} />);

      // Confirm MRP
      await user.click(screen.getByTestId('confirm-review-btn-r6_1_e_mrp'));

      await waitFor(() => {
        expect(screen.getByTestId('edit-review-btn-r6_1_e_mrp')).toBeVisible();
      });

      // Click Edit to reopen the editor
      await user.click(screen.getByTestId('edit-review-btn-r6_1_e_mrp'));

      // Editor reopens with input
      const mrpCard = screen.getByTestId('verdict-card-r6_1_e_mrp');
      const input = mrpCard.querySelector('#edit-field-r6_1_e_mrp') as HTMLInputElement;
      expect(input).toBeVisible();

      fireEvent.change(input, { target: { value: '₹5.50 incl. of all taxes' } });

      await user.click(screen.getByTestId('update-review-btn-r6_1_e_mrp'));

      await waitFor(() => {
        expect(screen.getAllByText(/5\.50 incl\. of all taxes/i).length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
