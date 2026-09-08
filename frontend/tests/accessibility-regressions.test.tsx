import { HttpResponse, http } from 'msw';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/components/auth/LoginForm';
import { VerdictBadge } from '@/components/inspection/VerdictBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { NumberTicker } from '@/components/ui/number-ticker';
import { Toaster } from '@/components/ui/toaster';
import { OCR_ASSET_PATHS } from '@/lib/ocr';
import { server } from './server';

describe('accessibility regressions', () => {
  it('keeps controls at least 44px with a visible keyboard focus treatment', () => {
    render(<Button aria-label="Create inspection">Create</Button>);
    const button = screen.getByRole('button', { name: 'Create inspection' });
    expect(button).toHaveClass('h-11');
    expect(button.className).toContain('focus-visible:ring-2');
  });

  it('gives icon controls accessible names and returns focus when a dialog closes', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button size="icon" aria-label="Open options">
            +
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Options</DialogTitle>
          <DialogDescription>Choose an option.</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    const trigger = screen.getByRole('button', { name: 'Open options' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(trigger).toHaveFocus();
  });

  it('announces API errors and polite toast updates', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json(
          { error: 'invalid_credentials', detail: 'Sign-in failed.' },
          { status: 401 }
        )
      )
    );
    render(
      <>
        <LoginForm onAuthenticated={() => undefined} />
        <Toaster />
      </>
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Username'), 'person');
    await user.type(screen.getByLabelText('Password'), 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in failed');
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it('renders status as text and not only as color', () => {
    render(<VerdictBadge status="manual_review" />);
    expect(screen.getByText('Manual review')).toBeVisible();
  });

  it('shows the final number without a transform when reduced motion is requested', () => {
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
    render(<NumberTicker value={42} />);
    expect(screen.getByText('42')).not.toHaveAttribute('style');
    vi.unstubAllGlobals();
  });

  it('loads every OCR runtime asset from the same origin', () => {
    expect(Object.values(OCR_ASSET_PATHS)).toEqual([
      '/tesseract/worker.min.js',
      '/tesseract/core',
      '/tesseract/lang',
    ]);
    expect(JSON.stringify(OCR_ASSET_PATHS)).not.toMatch(/https?:\/\//);
  });
});
