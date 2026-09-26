'use client';

import { useFormState } from 'react-dom';
import { inviteStaffAction } from '@/lib/actions/tenant';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';

export function InviteStaffForm({ locale }: { locale: string }) {
  const action = inviteStaffAction.bind(null, locale);
  const [state, formAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    return action(formData);
  }, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <TextField name="email" type="email" label="Email" required className="min-w-[220px]" />
      <div>
        <label htmlFor="role" className="mb-1.5 block text-sm font-medium text-ink-700">
          Role
        </label>
        <select
          id="role"
          name="role"
          defaultValue="nursery_staff"
          className="focus-ring rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2"
        >
          <option value="nursery_admin">Admin</option>
          <option value="nursery_staff">Staff</option>
        </select>
      </div>
      <Button type="submit">Invite</Button>
      {state?.error && <p className="w-full text-sm text-coral-600">{state.error}</p>}
      {state?.message && <p className="w-full text-sm text-ink-600">{state.message}</p>}
    </form>
  );
}
