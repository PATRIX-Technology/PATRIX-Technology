import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export default async function OwnerDashboardPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);

  const { data: userData } = await supabase.auth.getUser();
  const { data: profile } = userData.user
    ? await supabase.from('profiles').select('is_platform_owner, mfa_enrolled').eq('id', userData.user.id).maybeSingle()
    : { data: null };

  if (!userData.user || !profile?.is_platform_owner) {
    redirect(`/${params.locale}/dashboard`);
  }

  const [{ data: tenants }, { data: templates }, { data: globalCap }] = await Promise.all([
    supabase.from('tenants').select('id, name, status, created_at').order('created_at', { ascending: false }),
    supabase
      .from('story_theme_templates')
      .select('theme_key, locale, native_review_status')
      .order('theme_key'),
    supabase.from('global_spend_cap').select('*').maybeSingle(),
  ]);

  const draftArabicTemplates = (templates ?? []).filter(
    (t) => t.locale === 'ar' && t.native_review_status === 'draft',
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink-900">Platform owner dashboard</h1>
        {!profile.mfa_enrolled && <Badge tone="danger">MFA not enrolled — see docs/NEEDS_FROM_ME.md</Badge>}
      </div>

      <Card>
        <CardTitle>Tenants ({(tenants ?? []).length})</CardTitle>
        <ul className="mt-4 divide-y divide-[rgb(var(--color-border))]">
          {(tenants ?? []).map((tenant) => (
            <li key={tenant.id} className="flex items-center justify-between py-3">
              <span className="font-medium text-ink-800">{tenant.name}</span>
              <Badge tone={tenant.status === 'active' ? 'success' : 'neutral'}>{tenant.status}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>Arabic templates awaiting native review ({draftArabicTemplates.length})</CardTitle>
        <p className="mt-2 text-sm text-ink-500">
          These themes cannot be used to generate a real child&apos;s story until flipped to
          &quot;reviewed&quot;. See docs/DECISIONS.md &quot;Arabic content gating&quot;.
        </p>
        <ul className="mt-4 space-y-2">
          {draftArabicTemplates.map((tpl) => (
            <li key={tpl.theme_key} className="flex items-center justify-between">
              <span className="capitalize text-ink-700">{tpl.theme_key.replace(/_/g, ' ')}</span>
              <Badge tone="warning">NEEDS NATIVE REVIEW</Badge>
            </li>
          ))}
          {draftArabicTemplates.length === 0 && (
            <p className="text-sm text-lagoon-700">All Arabic templates have been reviewed.</p>
          )}
        </ul>
      </Card>

      <Card>
        <CardTitle>AI spend (real image generation)</CardTitle>
        <div className="mt-4 flex items-center gap-4">
          <Badge tone={globalCap?.kill_switch ? 'danger' : 'success'}>
            {globalCap?.kill_switch ? 'Kill switch: ON (generation blocked)' : 'Kill switch: OFF'}
          </Badge>
          <span className="text-sm text-ink-600">
            ${Number(globalCap?.current_period_spend_usd ?? 0).toFixed(2)} / $
            {Number(globalCap?.monthly_cap_usd ?? 0).toFixed(2)} this period
          </span>
        </div>
      </Card>

      <Card>
        <CardTitle>Your session</CardTitle>
        <p className="mt-2 text-sm text-ink-600">
          Signed in as {context?.fullName ?? userData.user.email}. Impersonation tooling and full revenue
          reporting are planned for Phase 3 — see docs/HANDOFF.md.
        </p>
      </Card>
    </div>
  );
}
