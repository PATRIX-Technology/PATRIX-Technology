import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card, CardTitle } from '@/components/ui/Card';
import { SettingsForm } from '@/components/dashboard/SettingsForm';
import { BillingSection } from '@/components/dashboard/BillingSection';
import { flags } from '@/lib/flags';

export default async function SettingsPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return null;

  const { data: tenant } = await supabase.from('tenants').select('*').eq('id', context.tenantId).single();

  const [{ data: plans }, { data: subscription }] = await Promise.all([
    supabase.from('plans').select('*').eq('is_active', true).order('price_monthly_cents'),
    supabase.from('subscriptions').select('*').eq('tenant_id', context.tenantId).maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-ink-900">Settings</h1>
      <Card>
        <CardTitle>Organisation &amp; branding</CardTitle>
        <div className="mt-4">
          <SettingsForm locale={params.locale} tenant={tenant} />
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
            <p className="mt-2 text-sm text-ink-500">
              Billing is not enabled on this deployment yet — see docs/NEEDS_FROM_ME.md. The
              architecture (plans, quotas, Stripe webhooks) is built and tested; it activates once
              a Stripe account and price IDs are configured.
            </p>
          )}
        </Card>
      )}
      <Card>
        <CardTitle>Privacy</CardTitle>
        <p className="mt-2 max-w-xl text-sm text-ink-600">
          Child data is stored with row-level tenant isolation, private storage with short-lived signed
          URLs, and configurable retention (see docs/en/privacy.md in this project&apos;s repository for
          details). This is not legal advice — see docs/DECISIONS.md.
        </p>
      </Card>
    </div>
  );
}
