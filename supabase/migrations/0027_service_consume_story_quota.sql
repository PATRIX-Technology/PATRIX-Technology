-- service_consume_story_quota: same atomic quota check/increment as
-- consume_story_quota, minus the is_tenant_member(auth.uid()) check --
-- for internal/admin scripts that call createStory() with the service
-- role key and no real tenant-member session (e.g. generating the
-- platform sample stories for the landing/home page carousel). Never
-- exposed to authenticated tenants; service_role only, same pattern as
-- sync_quota_to_plan and reward_referral.
create or replace function service_consume_story_quota(target_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  q quotas%rowtype;
begin
  select * into q from quotas where tenant_id = target_tenant_id for update;

  if q.tenant_id is null then
    insert into quotas (tenant_id) values (target_tenant_id) returning * into q;
  end if;

  if now() > q.period_end then
    update quotas
    set stories_used_this_period = 0,
        period_start = now(),
        period_end = now() + interval '30 days'
    where tenant_id = target_tenant_id
    returning * into q;
  end if;

  if q.hard_cap and q.stories_used_this_period >= q.stories_included_this_period then
    return false;
  end if;

  update quotas
  set stories_used_this_period = stories_used_this_period + 1, updated_at = now()
  where tenant_id = target_tenant_id;

  return true;
end;
$$;

comment on function service_consume_story_quota is
  'Same as consume_story_quota but without the tenant-membership auth check -- for internal/admin scripts using the service role key. Never exposed to authenticated tenants.';

revoke all on function service_consume_story_quota(uuid) from public, authenticated, anon;
grant execute on function service_consume_story_quota(uuid) to service_role;
