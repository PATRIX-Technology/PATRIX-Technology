'use client';

import { useState } from 'react';
import { updateSuggestionStatusAction } from '@/lib/actions/story-suggestions';
import type { StorySuggestionStatus } from '@/types/database';

const STATUS_OPTIONS: StorySuggestionStatus[] = ['new', 'reviewed', 'added', 'declined'];

export function SuggestionStatusControl({
  suggestionId,
  status,
}: {
  suggestionId: string;
  status: StorySuggestionStatus;
}) {
  const [current, setCurrent] = useState(status);
  const [pending, setPending] = useState(false);

  async function handleChange(next: StorySuggestionStatus) {
    setPending(true);
    const result = await updateSuggestionStatusAction(suggestionId, next);
    if (!result.error) setCurrent(next);
    setPending(false);
  }

  return (
    <select
      value={current}
      disabled={pending}
      onChange={(event) => handleChange(event.target.value as StorySuggestionStatus)}
      className="focus-ring rounded-lg border border-[rgb(var(--color-border))] bg-transparent px-2 py-1 text-xs text-ink-700"
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
