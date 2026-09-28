import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { getMfaStatus } from '@/lib/domain/mfa';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SettingsForm } from '@/components/dashboard/SettingsForm';
import { ChangePasswordForm } from '@/components/dashboard/ChangePasswordForm';

export default async function SettingsPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return null;

  const { data: tenant } = await supabase.from('tenants').select('*').eq('id', context.tenantId).single();

  const [{ data: userData }, mfaStatus] = await Promise.all([supabase.auth.getUser(), getMfaStatus(supabase)]);
  // A phone-only account (see docs/DECISIONS.md "Phone sign-in") has no
  // password at all, so there's nothing for ChangePasswordForm to change.
  const hasPasswordIdentity = Boolean(userData.user?.identities?.some((identity) => identity.provider === 'email'));
  // By the time a page under (dashboard) renders at all, a 'needs_challenge'
  // status has already been redirected to /mfa/challenge by the layout — see
  // docs/DECISIONS.md "Optional-but-recommended MFA for regular users" — so
  // the only two statuses reachable here are 'ok' (enrolled) and
  // 'needs_enrollment' (never enrolled, which is fine, it's optional).
  const mfaEnabled = mfaStatus.status === 'ok';

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-ink-900">Settings</h1>
      <Card>
        <CardTitle>{context.tenantType === 'nursery' ? 'Organisation & branding' : 'Family settings'}</CardTitle>
        <div className="mt-4">
          <SettingsForm locale={params.locale} tenant={tenant} tenantType={context.tenantType} />
        </div>
      </Card>
      <Card>
        <CardTitle>Security</CardTitle>
        <div className="mt-4 flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-ink-700">Two-factor authentication</p>
              <Badge tone={mfaEnabled ? 'success' : 'warning'}>{mfaEnabled ? 'On' : 'Recommended'}</Badge>
            </div>
            <p className="mt-1 max-w-xl text-sm text-ink-600">
              {mfaEnabled
                ? "You'll be asked for a 6-digit code from your authenticator app each time you sign in on a new device."
                : "Not required, but strongly recommended — add a code from an authenticator app (Google Authenticator, 1Password, Authy, etc.) as a second step when signing in."}
            </p>
            {!mfaEnabled && (
              <Link
                href={`/${params.locale}/mfa/enroll`}
                className="focus-ring mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-lagoon-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-lagoon-700 active:bg-lagoon-800"
              >
                Enable two-factor authentication
              </Link>
            )}
          </div>
          {hasPasswordIdentity && (
            <div>
              <p className="mb-1 text-sm font-medium text-ink-700">Change password</p>
              <div className="mt-3">
                <ChangePasswordForm />
              </div>
            </div>
          )}
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
