-- ============================================================================
-- 0016_sync_quota_to_plan.sql
-- Closes a second gap alongside 0015: a subscriptions row now gets created
-- at signup, but paying for a plan never touched the tenant's actual usable
-- quota either. subscriptions.plan_id and quotas.stories_included_this_period
-- are two separate tables, and nothing connected them -- a nursery that
-- paid for Growth (100 stories/month) would still be hard-capped at
-- whatever quotas already held (1, from the free trial), unable to use the
-- plan they just bought.
--
-- sync_quota_to_plan() gives the tenant the full allowance for the plan
-- they just checked out, for a fresh period matching Stripe's own
-- subscription period, and is called from checkout.session.completed in
-- the webhook handler (src/app/api/billing/webhook/route.ts) -- the one
-- event this app's checkout flow always fires with a reliable plan_id,
-- whether it's a tenant's first-ever subscription or a later upgrade
-- (this app always routes a plan change through a brand-new checkout
-- session, never Stripe's self-serve portal). Locked to service_role only
-- -- unlike consume_story_quota, a tenant has no legitimate reason to call
-- this themselves.
-- ============================================================================

create or replace function sync_quota_to_plan(
  target_tenant_id uuid,
  target_plan_id uuid,
  new_period_start timestamptz,
  new_period_end timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_stories integer;
begin
  select stories_per_month into plan_stories from plans where id = target_plan_id;
  if plan_stories is null then
    raise exception 'Unknown plan %', target_plan_id;
  end if;

  insert into quotas (tenant_id, stories_included_this_period, stories_used_this_period, period_start, period_end)
  values (target_tenant_id, plan_stories, 0, new_period_start, new_period_end)
  on conflict (tenant_id) do update
  set stories_included_this_period = excluded.stories_included_this_period,
      stories_used_this_period = 0,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      updated_at = now();
end;
$$;

comment on function sync_quota_to_plan is
  'Gives a tenant the full story allowance for a plan they just checked out, resetting usage for a fresh period. Called only from the Stripe webhook (service_role) -- never exposed to authenticated tenants.';

revoke all on function sync_quota_to_plan(uuid, uuid, timestamptz, timestamptz) from public, authenticated, anon;
grant execute on function sync_quota_to_plan(uuid, uuid, timestamptz, timestamptz) to service_role;
