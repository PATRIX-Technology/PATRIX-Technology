'use client';

import { useFormState } from 'react-dom';
import { updateTenantBrandingAction } from '@/lib/actions/tenant';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import type { Tenant } from '@/types/database';

export function SettingsForm({ locale, tenant }: { locale: string; tenant: Tenant }) {
  const action = updateTenantBrandingAction.bind(null, locale);
  const [state, formAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    return action(formData);
  }, {});

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField name="name" label="Organisation name" defaultValue={tenant.name} required />
      <div>
        <label htmlFor="brandColor" className="mb-1.5 block text-sm font-medium text-ink-700">
          Brand colour
        </label>
        <input
          id="brandColor"
          name="brandColor"
          type="color"
          defaultValue={tenant.brand_primary_color ?? '#20949c'}
          className="h-10 w-20 rounded"
        />
      </div>
      <TextField
        name="retentionDays"
        type="number"
        min={30}
        max={3650}
        label="Data retention (days)"
        hint="How long child and story data is kept before scheduled deletion."
        defaultValue={tenant.data_retention_days}
      />
      {state.error && <p className="text-sm text-coral-600">{state.error}</p>}
      <Button type="submit" className="self-start">
        Save
      </Button>
    </form>
  );
}
