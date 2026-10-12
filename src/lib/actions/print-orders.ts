'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { notifyCustomerOfOrderStatusChange, type PaidPrintOrderBatchItem } from '@/lib/notifications/email';
import { canAdvancePrintOrderStatus } from '@/lib/domain/print-orders';
import type { ActionResult } from './auth';

/**
 * Advances every print_orders row in one paid batch to a new status
 * (owner dashboard Orders tab) and emails the customer who placed the
 * order -- see docs/DECISIONS.md "Order tracking: owner Orders tab +
 * status notifications". Uses the service-role client for the actual
 * update because print_orders has no authenticated-role UPDATE policy
 * at all (see supabase/migrations/0037_print_orders.sql) -- status
 * transitions are deliberately writable only by server-trusted code
 * (the Stripe webhook for pending->paid, this action for paid->printing
 * ->shipped/cancelled), the same separation of concerns already used
 * for subscriptions.
 */
export async function updatePrintOrderBatchStatusAction(
  locale: string,
  batchId: string,
  nextStatus: 'printing' | 'shipped' | 'cancelled',
): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: 'Sign in first.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_owner')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile?.is_platform_owner) return { error: 'Not authorized.' };

  const serviceClient = createSupabaseServiceRoleClient();

  const { data: batchRows } = await serviceClient
    .from('print_orders')
    .select(
      'id, status, requested_by, tenant_id, tenants(name), stories!print_orders_story_id_fkey(theme_key, locale, children!stories_child_id_fkey(first_name, arabic_first_name))',
    )
    .eq('batch_id', batchId);

  if (!batchRows || batchRows.length === 0) return { error: 'Order not found.' };

  const currentStatus = batchRows[0]!.status as string;
  if (!canAdvancePrintOrderStatus(currentStatus, nextStatus)) {
    return { error: `Cannot move an order from "${currentStatus}" to "${nextStatus}".` };
  }

  const { error } = await serviceClient
    .from('print_orders')
    .update({ status: nextStatus })
    .eq('batch_id', batchId)
    .eq('status', currentStatus);
  if (error) return { error: error.message };

  revalidatePath(`/${locale}/owner/orders`);
  revalidatePath(`/${locale}/dashboard/orders`);

  // Best-effort customer notification -- never fails the status update
  // itself, same "the database row is the source of truth, email is a
  // courtesy" stance as every other notification in this app.
  try {
    const first = batchRows[0]!;
    const tenant = first.tenants as unknown as { name: string } | null;
    const { data: templateRows } = await serviceClient
      .from('story_theme_templates')
      .select('theme_key, locale, title')
      .in(
        'theme_key',
        batchRows.map((row) => (row.stories as unknown as { theme_key: string }).theme_key),
      );
    const titleByThemeLocale = new Map(
      (templateRows ?? []).map((row) => [`${row.theme_key}:${row.locale}`, row.title]),
    );
    const items: PaidPrintOrderBatchItem[] = batchRows.map((row) => {
      const story = row.stories as unknown as {
        theme_key: string;
        locale: string;
        children: { first_name: string; arabic_first_name: string | null } | null;
      };
      const childName =
        (story.locale === 'ar' && story.children?.arabic_first_name) || story.children?.first_name || '';
      const storyTitle = titleByThemeLocale.get(`${story.theme_key}:${story.locale}`) ?? story.theme_key.replace(/_/g, ' ');
      return { childName, storyTitle, locale: story.locale };
    });

    const { data: requester } = await serviceClient.auth.admin.getUserById(first.requested_by);
    const customerEmail = requester?.user?.email;
    if (customerEmail) {
      await notifyCustomerOfOrderStatusChange({
        to: customerEmail,
        tenantName: tenant?.name ?? 'Unknown organisation',
        batchId,
        status: nextStatus,
        items,
      });
    }
  } catch {
    // Best-effort — see function comment above.
  }

  return {};
}
