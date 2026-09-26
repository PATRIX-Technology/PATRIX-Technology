import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card, CardTitle } from '@/components/ui/Card';
import { SettingsForm } from '@/components/dashboard/SettingsForm';
import { BillingSection } from '@/components/dashboard/BillingSection';
import { RedeemGiftCodeForm } from '@/components/dashboard/RedeemGiftCodeForm';
import { flags } from '@/lib/flags';

export default async function SettingsPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return null;

  const { data: tenant } = await supabase.from('tenants').select('*').eq('id', context.tenantId).single();

  const [{ data: plans }, { data: subscription }] = await Promise.all([
    supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .eq('audience', context.tenantType)
      .order('price_monthly_cents'),
    supabase.from('subscriptions').select('*').eq('tenant_id', context.tenantId).maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-ink-900">Settings</h1>
      <Card>
        <CardTitle>{context.tenantType === 'nursery' ? 'Organisation & branding' : 'Family settings'}</CardTitle>
        <div className="mt-4">
          <SettingsForm locale={params.locale} tenant={tenant} tenantType={context.tenantType} />
        </div>
      </Card>
      {context.role === 'nursery_owner' && (
        <Card>
          <CardTitle>Plan &amp; billing</CardTitle>
          {flags.billing ? (
            <div className="mt-4">
              <BillingSection plans={plans ?? []} subscription={subscription ?? null} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-500">Billing isn&apos;t available yet — check back soon.</p>
          )}
        </Card>
      )}
      <Card>
        <CardTitle>Redeem a gift code</CardTitle>
        <p className="mt-2 text-sm text-ink-600">
          Received a gift code for personalised story credits? Redeem it here.
        </p>
        <div className="mt-4">
          <RedeemGiftCodeForm />
        </div>
      </Card>
      <Card>
        <CardTitle>Privacy</CardTitle>
        <p className="mt-2 max-w-xl text-sm text-ink-600">
          Every child&apos;s data is kept private to your own account, stored securely, and never shared
          with other families or organisations. Photos and images are only ever accessible through
          short-lived, private links.
        </p>
      </Card>
    </div>
  );
}
