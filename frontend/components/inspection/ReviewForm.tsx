'use client';

import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/lib/api-client';
import type { ReviewAction } from '@/lib/types';

type ReviewActionName = ReviewAction['action'];

interface ReviewFormProps {
  scanId: number;
  verdictId?: number;
  onSubmitted: (review: ReviewAction) => void;
}

export function ReviewForm({ scanId, verdictId, onSubmitted }: ReviewFormProps) {
  const [action, setAction] = useState<ReviewActionName>('confirmed');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedNote = note.trim();
    if ((action === 'false_positive' || action === 'needs_follow_up') && !trimmedNote) {
      setError('Add a note explaining this review decision.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const review = await apiFetch<ReviewAction>(`/api/scan/${scanId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({ action, note: trimmedNote, verdict_id: verdictId }),
      });
      setNote('');
      onSubmitted(review);
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.detail
          : 'The review could not be recorded. Check your connection and try again.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="surface-panel space-y-4 p-5" onSubmit={submit}>
      <div>
        <h2 className="text-h2">Record review</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review actions are added to the audit history and do not erase earlier decisions.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="review-action">Review action</Label>
        <select
          id="review-action"
          value={action}
          onChange={(event) => setAction(event.target.value as ReviewActionName)}
          className="h-11 w-full rounded-md border bg-background px-3"
          disabled={busy}
        >
          <option value="confirmed">Confirm finding</option>
          <option value="false_positive">Mark false positive</option>
          <option value="resolved">Mark resolved</option>
          <option value="needs_follow_up">Needs follow-up</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="review-note">Review note</Label>
        {action === 'false_positive' || action === 'needs_follow_up' ? (
          <p id="review-note-requirement" className="text-xs text-muted-foreground">
            Required for this review action.
          </p>
        ) : null}
        <textarea
          id="review-note"
          aria-describedby={
            action === 'false_positive' || action === 'needs_follow_up'
              ? 'review-note-requirement'
              : undefined
          }
          rows={4}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2"
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">{note.length}/2000 characters</p>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-fail/30 bg-fail/10 p-3 text-sm text-fail"
        >
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? 'Recording…' : 'Record review'}
      </Button>
    </form>
  );
}
