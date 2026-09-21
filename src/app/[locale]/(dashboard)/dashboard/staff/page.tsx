import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/domain/session';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { InviteStaffForm } from '@/components/dashboard/InviteStaffForm';

export default async function StaffPage({ params }: { params: { locale: string } }) {
  const supabase = await createSupabaseServerClient();
  const context = await getCurrentTenantContext(supabase);
  if (!context) return null;

  const { data: members } = await supabase
    .from('tenant_members')
    .select('user_id, role, profiles(full_name)')
    .eq('tenant_id', context.tenantId);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-ink-900">Staff</h1>
      {context.role === 'nursery_owner' && (
        <Card>
          <CardTitle>Invite staff</CardTitle>
          <div className="mt-4">
            <InviteStaffForm locale={params.locale} />
          </div>
        </Card>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--color-border))] text-left text-ink-500">
              <th className="p-4">Name</th>
              <th className="p-4">Role</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((member) => (
              <tr key={member.user_id} className="border-b border-[rgb(var(--color-border))] last:border-0">
                <td className="p-4">{(member.profiles as unknown as { full_name: string } | null)?.full_name}</td>
                <td className="p-4">
                  <Badge tone="info">{member.role.replace('nursery_', '')}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
