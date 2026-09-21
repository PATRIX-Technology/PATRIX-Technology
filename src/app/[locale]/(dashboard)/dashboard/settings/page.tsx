import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card, CardTitle } from '@/components/ui/Card';
import { SettingsForm } from '@/components/dashboard/SettingsForm';

export default async function SettingsPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return null;

  const { data: tenant } = await supabase.from('tenants').select('*').eq('id', context.tenantId).single();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-ink-900">Settings</h1>
      <Card>
        <CardTitle>Organisation &amp; branding</CardTitle>
        <div className="mt-4">
          <SettingsForm locale={params.locale} tenant={tenant} />
        </div>
      </Card>
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
