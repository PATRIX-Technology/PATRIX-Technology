'use client';

import { useFormState } from 'react-dom';
import { updateTenantBrandingAction } from '@/lib/actions/tenant';
import type { ActionResult } from '@/lib/actions/auth';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Input';
import type { Tenant, TenantType } from '@/types/database';

export function SettingsForm({
  locale,
  tenant,
  tenantType,
}: {
  locale: string;
  tenant: Tenant;
  tenantType: TenantType;
}) {
  const action = updateTenantBrandingAction.bind(null, locale);
  const [state, formAction] = useFormState<ActionResult, FormData>(async (_prev, formData) => {
    return action(formData);
  }, {});
  const isNursery = tenantType === 'nursery';

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <TextField
        name="name"
        label={isNursery ? 'Organisation name' : 'Family name'}
        defaultValue={tenant.name}
        required
      />
      {/* Brand colour and data-retention policy are nursery/school
          concerns (an org's visual identity, a compliance policy for
          data on enrolled children who aren't the account holder) - a
          family is the child's own guardian and has no use for either,
          so the fields don't render for them. The retention DB column
          keeps its long default for family tenants either way. */}
      {isNursery && (
        <>
          <div>
            <label htmlFor="brandColor" className="mb-1.5 block text-sm font-medium text-ink-700">
              Brand colour
            </label>
            <input
              id="brandColor"
              name="brandColor"
              type="color"
              defaultValue={tenant.brand_primary_color ?? '#2FBFA6'}
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
        </>
      )}
      {state.error && <p className="text-sm text-coral-600">{state.error}</p>}
      <Button type="submit" className="self-start">
        Save
      </Button>
    </form>
  );
}
