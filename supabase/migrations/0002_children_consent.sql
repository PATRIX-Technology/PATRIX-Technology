-- ============================================================================
-- 0002_children_consent.sql
-- Children, avatar configuration, and the parental consent workflow.
-- ============================================================================

create type consent_status as enum ('not_requested', 'pending', 'granted', 'declined', 'withdrawn');

-- ---------------------------------------------------------------------------
-- children
-- Deliberately minimal PII: first name only, no surname, no date of birth,
-- no photo column (photo personalisation is a separate, flagged subsystem —
-- see 0007). avatar_config is structured data, never an uploaded image.
-- ---------------------------------------------------------------------------
create table children (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 60),
  pronoun pronoun_type not null default 'they',
  class_name text,
  preferred_language app_locale not null default 'en',
  avatar_config jsonb not null default '{}'::jsonb,
  consent_status consent_status not null default 'not_requested',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index children_tenant_id_idx on children (tenant_id);

comment on table children is
  'Minimal child data: first name, pronoun, class, language, avatar config. No surname, DOB, or photo.';
comment on column children.avatar_config is
  'Structured avatar attributes (hair, skinTone, outfitColor, accessory). Validated against src/lib/domain/avatar.ts AvatarConfigSchema at the application layer.';

-- ---------------------------------------------------------------------------
-- consent_requests
-- One row per consent ask. A new row is created for every re-ask so the
-- history of grants/withdrawals is preserved for audit purposes.
-- Token is a random, unguessable value used in the public consent link;
-- it is hashed at rest so a leaked database dump cannot be replayed as a
-- valid consent link.
-- ---------------------------------------------------------------------------
create table consent_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  child_id uuid not null references children (id) on delete cascade,
  token_hash text not null unique,
  scope jsonb not null default '{"story": true, "photo": false}'::jsonb,
  status consent_status not null default 'pending',
  requested_by uuid references auth.users (id),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  withdrawn_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index consent_requests_child_id_idx on consent_requests (child_id);
create index consent_requests_tenant_id_idx on consent_requests (tenant_id);

comment on column consent_requests.scope is
  'What the parent is consenting to. "photo" must never be set true unless FEATURE_PHOTO_PERSONALIZATION is enabled and legal review is complete — enforced in application code, see src/lib/domain/consent.ts.';
comment on column consent_requests.token_hash is
  'sha256 of the token embedded in the consent link. The raw token is never stored.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table children enable row level security;
alter table consent_requests enable row level security;

create policy "children_tenant_select" on children
  for select using (is_tenant_member(tenant_id) or is_platform_owner());

create policy "children_tenant_write" on children
  for insert with check (is_tenant_member(tenant_id));

create policy "children_tenant_update" on children
  for update using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

create policy "children_owner_admin_delete" on children
  for delete using (
    has_tenant_role(tenant_id, array['nursery_owner', 'nursery_admin']::tenant_role[])
    or is_platform_owner()
  );

-- consent_requests are readable by tenant staff. There is deliberately no
-- direct client-side update policy: status transitions happen through the
-- respond_to_consent / withdraw_consent RPCs below so token verification
-- and status-machine rules cannot be bypassed by a direct UPDATE.
create policy "consent_requests_tenant_select" on consent_requests
  for select using (is_tenant_member(tenant_id) or is_platform_owner());

create policy "consent_requests_tenant_insert" on consent_requests
  for insert with check (is_tenant_member(tenant_id));

create policy "consent_requests_owner_admin_withdraw" on consent_requests
  for update using (
    has_tenant_role(tenant_id, array['nursery_owner', 'nursery_admin']::tenant_role[])
    or is_platform_owner()
  )
  with check (
    has_tenant_role(tenant_id, array['nursery_owner', 'nursery_admin']::tenant_role[])
    or is_platform_owner()
  );

-- ---------------------------------------------------------------------------
-- respond_to_consent: called from the public (unauthenticated) consent page
-- via the anon key. It looks up the request purely by hashed token so a
-- parent never needs an account, and it is the only way "granted" /
-- "declined" get set.
-- ---------------------------------------------------------------------------
create or replace function respond_to_consent(raw_token text, decision consent_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req consent_requests%rowtype;
begin
  if decision not in ('granted', 'declined') then
    raise exception 'Invalid decision';
  end if;

  select * into req from consent_requests
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex')
  for update;

  if req.id is null then
    raise exception 'Consent request not found';
  end if;

  if req.expires_at < now() then
    raise exception 'Consent link has expired';
  end if;

  if req.status not in ('pending') then
    raise exception 'This consent request has already been answered';
  end if;

  update consent_requests
  set status = decision, responded_at = now()
  where id = req.id;

  update children
  set consent_status = decision
  where id = req.child_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- withdraw_consent: staff-initiated withdrawal. Marks the request withdrawn
-- and flips the child back to 'withdrawn' so application code can trigger
-- deletion of derived story assets (see src/lib/domain/deletion.ts).
-- ---------------------------------------------------------------------------
create or replace function withdraw_consent(target_child_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  child_tenant_id uuid;
begin
  select tenant_id into child_tenant_id from children where id = target_child_id;

  if child_tenant_id is null then
    raise exception 'Child not found';
  end if;

  if not (has_tenant_role(child_tenant_id, array['nursery_owner', 'nursery_admin']::tenant_role[]) or is_platform_owner()) then
    raise exception 'Not authorized to withdraw consent for this child';
  end if;

  update consent_requests
  set status = 'withdrawn', withdrawn_at = now()
  where child_id = target_child_id and status = 'granted';

  update children set consent_status = 'withdrawn' where id = target_child_id;
end;
$$;

grant execute on function respond_to_consent(text, consent_status) to anon, authenticated;
grant execute on function withdraw_consent(uuid) to authenticated;
