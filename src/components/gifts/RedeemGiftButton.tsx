'use client';

import { useFormState } from 'react-dom';
import { redeemGiftAction, type RedeemGiftResult } from '@/lib/actions/gifts';
import { Button } from '@/components/ui/Button';

export function RedeemGiftButton({ code }: { code: string }) {
  const action = redeemGiftAction.bind(null, code);
  const [state, formAction] = useFormState<RedeemGiftResult, FormData>(async () => action(), {});

  if (typeof state.storyCreditsAdded === 'number') {
    return (
      <p className="text-lagoon-700">
        Redeemed! {state.storyCreditsAdded} story credit{state.storyCreditsAdded === 1 ? '' : 's'} added to
        your account.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <Button type="submit" size="lg">
        Redeem this gift
      </Button>
      {state?.error && <p className="mt-2 text-sm text-coral-600">{state.error}</p>}
    </form>
  );
}
