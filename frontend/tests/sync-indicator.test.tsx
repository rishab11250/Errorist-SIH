import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SyncStatusIndicator } from '@/components/pwa/SyncStatusIndicator';

vi.mock('@/lib/offline-scans', async () => {
  const actual = await vi.importActual<typeof import('@/lib/offline-scans')>('@/lib/offline-scans');
  return {
    ...actual,
    countUnsyncedPendingScans: vi.fn().mockResolvedValue(3),
  };
});

describe('pending scan indicator', () => {
  it('surfaces the number of records that still need synchronization', async () => {
    render(<SyncStatusIndicator />);
    expect(await screen.findByRole('status')).toHaveTextContent('3 scans pending sync');
  });
});
