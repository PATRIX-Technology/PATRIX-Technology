-- ---------------------------------------------------------------------------
-- Tie every new tenant to a subscription row at registration, not just once
-- they complete a Stripe checkout. create_tenant() and create_family_tenant()
-- already created the tenant, its owner membership, and (for families) a
-- quota row -- but never a subscriptions row, so a brand-new signup had no
-- subscription record at all until (and unless) they paid. That left a real
-- gap: no "trialing" record to see who signed up before converting, and the
-- trial_story_used column (referenced in docs/comments) had nothing to read
-- or write it for. The billing webhook already upserts on tenant_id
-- (checkout/route.ts, webhook/route.ts), so a pre-existing trialing row here
-- is simply updated in place once a real plan is purchased -- this is
-- additive, not a behaviour change to the paid path.
-- ---------------------------------------------------------------------------

create or replace function create_tenant(tenant_name text, tenant_slug text, owner_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a tenant';
  end if;

  insert into profiles (id, full_name)
  values (auth.uid(), owner_full_name)
  on conflict (id) do nothing;

  insert into tenants (name, slug)
  values (tenant_name, tenant_slug)
  returning id into new_tenant_id;

  insert into tenant_members (tenant_id, user_id, role)
  values (new_tenant_id, auth.uid(), 'nursery_owner');

  -- Ties the tenant to a subscription record immediately, status
  -- 'trialing' (the column default) with no plan yet -- the Stripe webhook
  -- upserts this same row once a real plan is purchased.
  insert into subscriptions (tenant_id) values (new_tenant_id);

  return new_tenant_id;
end;
$$;

create or replace function create_family_tenant(family_display_name text, owner_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_tenant_id uuid;
  tenant_slug text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to create a family account';
  end if;

  insert into profiles (id, full_name)
  values (auth.uid(), owner_full_name)
  on conflict (id) do nothing;

  tenant_slug := 'family-' || replace(auth.uid()::text, '-', '');

  insert into tenants (name, slug, tenant_type)
  values (family_display_name, tenant_slug, 'family')
  returning id into new_tenant_id;

  insert into tenant_members (tenant_id, user_id, role)
  values (new_tenant_id, auth.uid(), 'nursery_owner');

  -- Every family gets one free trial story, same as a nursery.
  insert into quotas (tenant_id, stories_included_this_period, stories_used_this_period)
  values (new_tenant_id, 1, 0);

  -- Same as create_tenant() above -- ties the family tenant to a
  -- subscription record immediately instead of leaving it unset until a
  -- gift/plan purchase touches the subscriptions table.
  insert into subscriptions (tenant_id) values (new_tenant_id);

  return new_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: any tenant created before this migration (including demo/seed
-- data and anyone signed up during earlier testing) still has no
-- subscriptions row. Give every existing tenant a trialing row too, so the
-- invariant "every tenant has exactly one subscriptions row" holds for data
-- that predates this migration, not just new signups.
-- ---------------------------------------------------------------------------
insert into subscriptions (tenant_id)
select t.id from tenants t
left join subscriptions s on s.tenant_id = t.id
where s.tenant_id is null;
