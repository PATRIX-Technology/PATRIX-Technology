'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { redeemGiftAction, type RedeemGiftResult } from '@/lib/actions/gifts';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';

export function RedeemGiftCodeForm() {
  const [code, setCode] = useState('');
  const [state, formAction] = useFormState<RedeemGiftResult, FormData>(
    async () => redeemGiftAction(code.replace(/-/g, '')),
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <TextField
        name="code"
        label="Gift code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="min-w-[220px]"
      />
      <Button type="submit">Redeem</Button>
      {state.error && <p className="w-full text-sm text-coral-600">{state.error}</p>}
      {typeof state.storyCreditsAdded === 'number' && (
        <p className="w-full text-sm text-lagoon-700">
          Added {state.storyCreditsAdded} story credit{state.storyCreditsAdded === 1 ? '' : 's'}.
        </p>
      )}
    </form>
  );
}
