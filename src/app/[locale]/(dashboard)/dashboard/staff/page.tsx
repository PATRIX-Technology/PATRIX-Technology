import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { InviteStaffForm } from '@/components/dashboard/InviteStaffForm';

export default async function StaffPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  const t = await getTranslations('staffPage');
  if (!context) return null;

  const { data: members } = await supabase
    .from('tenant_members')
    .select('user_id, role, profiles(full_name)')
    .eq('tenant_id', context.tenantId);

  // Both open invites (status still 'pending') and ones that ran out the
  // clock (status 'expired') are shown here, each with its own status
  // color -- an 'accepted' invite is never listed: that person already
  // has their own tenant_members row above, which is the single source
  // of truth for "has an active login" once they've joined.
  const { data: pendingInvites } =
    context.role === 'nursery_owner'
      ? await supabase
          .from('staff_invites')
          .select('id, email, role, status')
          .eq('tenant_id', context.tenantId)
          .in('status', ['pending', 'expired'])
          .order('created_at', { ascending: false })
      : { data: null };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink-900">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-500">{t('body')}</p>
      </div>

      <Card>
        <ul className="space-y-1.5 text-sm text-ink-600">
          <li>
            <span className="font-medium text-ink-800">{t('roleOwnerLabel')}</span> — {t('roleOwnerDesc')}
          </li>
          <li>
            <span className="font-medium text-ink-800">{t('roleAdminLabel')}</span> — {t('roleAdminDesc')}
          </li>
          <li>
            <span className="font-medium text-ink-800">{t('roleStaffLabel')}</span> — {t('roleStaffDesc')}
          </li>
        </ul>
      </Card>

      {context.role === 'nursery_owner' && (
        <Card>
          <CardTitle>{t('inviteTitle')}</CardTitle>
          <div className="mt-4">
            <InviteStaffForm locale={params.locale} />
          </div>
        </Card>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--color-border))] text-left text-ink-500">
              <th className="p-4">{t('table.name')}</th>
              <th className="p-4">{t('table.role')}</th>
              <th className="p-4">{t('table.status')}</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((member) => (
              <tr key={member.user_id} className="border-b border-[rgb(var(--color-border))] last:border-0">
                <td className="p-4">{(member.profiles as unknown as { full_name: string } | null)?.full_name}</td>
                <td className="p-4">
                  <Badge tone="info">{member.role.replace('nursery_', '')}</Badge>
                </td>
                <td className="p-4">
                  <Badge tone="success">{t('statusActive')}</Badge>
                </td>
              </tr>
            ))}
            {(pendingInvites ?? []).map((invite) => (
              <tr key={invite.id} className="border-b border-[rgb(var(--color-border))] last:border-0">
                <td className="p-4 text-ink-500">{invite.email}</td>
                <td className="p-4">
                  <Badge tone="info">{invite.role.replace('nursery_', '')}</Badge>
                </td>
                <td className="p-4">
                  <Badge tone={invite.status === 'expired' ? 'danger' : 'warning'}>
                    {invite.status === 'expired' ? t('statusExpired') : t('statusPending')}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
