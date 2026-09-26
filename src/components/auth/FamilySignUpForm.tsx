'use client';

import { useEffect } from 'react';
import { useFormState } from 'react-dom';
import { useRouter } from 'next/navigation';
import { familySignUpAction } from '@/lib/actions/family';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';

export function FamilySignUpForm({ locale }: { locale: string }) {
  const router = useRouter();
  const action = familySignUpAction.bind(null, locale);
  const [state, formAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    return action(formData);
  }, {});

  useEffect(() => {
    if (state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField name="fullName" label="Your full name" required />
      <TextField name="email" type="email" label="Email address" required />
      <TextField name="password" type="password" label="Password" required minLength={8} />
      {state.error && (
        <p role="alert" className="text-sm text-coral-600">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg">
        Create my family account
      </Button>
    </form>
  );
}
