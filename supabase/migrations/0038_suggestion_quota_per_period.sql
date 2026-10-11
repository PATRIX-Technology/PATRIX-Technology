-- ============================================================================
-- 0038_suggestion_quota_per_period.sql
-- Story-template suggestions were capped by a per-hour sliding-window rate
-- limit (SUGGESTION_RATE_LIMIT_BY_PLAN_KEY in story-suggestions.ts), the
-- same mechanism used for login attempts etc. The founder wants this to be
-- a fixed number per subscription billing period instead, matching how
-- every other quota in this app works (stories_included_this_period) —
-- "10 suggestions this month" rather than "10 per hour, forever". This
-- moves the limit into the same quotas/plans machinery as story quota:
-- synced from plans.suggestion_requests_per_month at checkout
-- (sync_quota_to_plan, 0016) and enforced by a new consume_suggestion_quota
-- RPC mirroring consume_story_quota (both in 0004).
-- ============================================================================

alter table plans add column suggestion_requests_per_month integer not null default 3;

alter table quotas add column suggestions_included_this_period integer not null default 3;
alter table quotas add column suggestions_used_this_period integer not null default 0;

-- ---------------------------------------------------------------------------
-- consume_story_quota: now also resets the suggestion counter on the same
-- period rollover, so both counters always share one period boundary.
-- ---------------------------------------------------------------------------
create or replace function consume_story_quota(target_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  q quotas%rowtype;
begin
  if not is_tenant_member(target_tenant_id) then
    raise exception 'Not authorized for this tenant';
  end if;

  select * into q from quotas where tenant_id = target_tenant_id for update;

  if q.tenant_id is null then
    insert into quotas (tenant_id) values (target_tenant_id) returning * into q;
  end if;

  if now() > q.period_end then
    update quotas
    set stories_used_this_period = 0,
        suggestions_used_this_period = 0,
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

-- ---------------------------------------------------------------------------
-- consume_suggestion_quota: same shape as consume_story_quota, for the
-- suggestions counter. Always hard-capped (no hard_cap toggle needed --
-- this is a feedback form, not billed usage).
-- ---------------------------------------------------------------------------
create or replace function consume_suggestion_quota(target_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  q quotas%rowtype;
begin
  if not is_tenant_member(target_tenant_id) then
    raise exception 'Not authorized for this tenant';
  end if;

  select * into q from quotas where tenant_id = target_tenant_id for update;

  if q.tenant_id is null then
    insert into quotas (tenant_id) values (target_tenant_id) returning * into q;
  end if;

  if now() > q.period_end then
    update quotas
    set stories_used_this_period = 0,
        suggestions_used_this_period = 0,
        period_start = now(),
        period_end = now() + interval '30 days'
    where tenant_id = target_tenant_id
    returning * into q;
  end if;

  if q.suggestions_used_this_period >= q.suggestions_included_this_period then
    return false;
  end if;

  update quotas
  set suggestions_used_this_period = suggestions_used_this_period + 1, updated_at = now()
  where tenant_id = target_tenant_id;

  return true;
end;
$$;

grant execute on function consume_suggestion_quota(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- sync_quota_to_plan: also sync the suggestion allowance from the plan being
-- checked out, reset to 0 used for the fresh period -- same as it already
-- does for stories.
-- ---------------------------------------------------------------------------
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
  plan_suggestions integer;
begin
  select stories_per_month, suggestion_requests_per_month
    into plan_stories, plan_suggestions
    from plans where id = target_plan_id;
  if plan_stories is null then
    raise exception 'Unknown plan %', target_plan_id;
  end if;

  insert into quotas (
    tenant_id, stories_included_this_period, stories_used_this_period,
    suggestions_included_this_period, suggestions_used_this_period,
    period_start, period_end
  )
  values (target_tenant_id, plan_stories, 0, coalesce(plan_suggestions, 3), 0, new_period_start, new_period_end)
  on conflict (tenant_id) do update
  set stories_included_this_period = excluded.stories_included_this_period,
      stories_used_this_period = 0,
      suggestions_included_this_period = excluded.suggestions_included_this_period,
      suggestions_used_this_period = 0,
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      updated_at = now();
end;
$$;
