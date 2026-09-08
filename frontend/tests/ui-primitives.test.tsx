import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

function DialogExample() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open review</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Review finding</DialogTitle>
        <DialogDescription>Confirm the evidence before recording a decision.</DialogDescription>
        <DialogClose asChild>
          <Button variant="outline">Close review</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

describe('shared UI primitives', () => {
  it('button exposes disabled semantics and visible text', () => {
    render(<Button disabled>Start scan</Button>);
    expect(screen.getByRole('button', { name: 'Start scan' })).toBeDisabled();
  });

  it('dialog has a keyboard-reachable title and close control', async () => {
    const user = userEvent.setup();
    render(<DialogExample />);
    await user.click(screen.getByRole('button', { name: 'Open review' }));
    expect(screen.getByRole('dialog', { name: 'Review finding' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Close review' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
