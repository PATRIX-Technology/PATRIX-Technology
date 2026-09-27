-- ============================================================================
-- 0025_staff_invites.sql
-- inviteStaffAction previously only wrote an audit_logs row ("recorded for
-- later") because actually creating the invited user's login needs Supabase
-- Auth's admin invite-by-email API, which needs SMTP configured on the
-- project -- a founder-side setup step. This migration avoids that
-- dependency entirely by using the same shareable-link pattern already
-- used for consent requests and referrals: the owner gets a link (built
-- from a random token, only its hash stored), shares it however they like
-- (WhatsApp, email, in person), and the invited person sets their own
-- password on a public accept page. No transactional email required.
--
-- Accepting an invite must NOT create a new tenant or a new subscription
-- -- the whole point is joining the INVITING tenant's existing one (see
-- docs/DECISIONS.md "Tie every new tenant to a subscription row at
-- signup", which this deliberately does not duplicate for staff).
-- ============================================================================

create table staff_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  email text not null,
  role tenant_role not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  accepted_by uuid references auth.users (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create index staff_invites_tenant_id_idx on staff_invites (tenant_id);

comment on column staff_invites.token_hash is
  'sha256 of the token embedded in the invite link. The raw token is never stored -- same trust model as consent_requests.token_hash.';
comment on column staff_invites.role is
  'Restricted to nursery_admin/nursery_staff in application code -- an invite can never grant nursery_owner.';

alter table staff_invites enable row level security;

create policy "staff_invites_owner_select" on staff_invites
  for select using (has_tenant_role(tenant_id, array['nursery_owner']::tenant_role[]) or is_platform_owner());

create policy "staff_invites_owner_insert" on staff_invites
  for insert with check (has_tenant_role(tenant_id, array['nursery_owner']::tenant_role[]));

-- No update/delete policy: status transitions only happen inside
-- accept_staff_invite (SECURITY DEFINER below), never via a direct write,
-- so a compromised owner session can't forge acceptance.

-- ---------------------------------------------------------------------------
-- get_staff_invite_info: lets the public (anon) accept page show who's
-- inviting and to what role before the invited person has an account.
-- Same trust model as get_consent_request_info -- the token itself is the
-- authorization, so this deliberately does not require auth.
-- ---------------------------------------------------------------------------
create type staff_invite_lookup_result as (
  found boolean,
  tenant_name text,
  role tenant_role,
  email text,
  status text
);

create or replace function get_staff_invite_info(raw_token text)
returns staff_invite_lookup_result
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  inv staff_invites%rowtype;
  result staff_invite_lookup_result;
begin
  select * into inv from staff_invites
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex');

  if inv.id is null or inv.expires_at < now() then
    result.found := false;
    return result;
  end if;

  select t.name, inv.role, inv.email, inv.status, true
  into result.tenant_name, result.role, result.email, result.status, result.found
  from tenants t where t.id = inv.tenant_id;

  return result;
end;
$$;

grant execute on function get_staff_invite_info(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- accept_staff_invite: called right after the invited person signs up
-- (auth.signUp) for their own new Supabase Auth account. Adds them to the
-- INVITING tenant's tenant_members with the invited role -- deliberately
-- never calls create_tenant/create_family_tenant, so no new tenant or
-- subscription is created; they join the existing one.
-- ---------------------------------------------------------------------------
create or replace function accept_staff_invite(raw_token text, full_name text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  inv staff_invites%rowtype;
  invite_email text;
  account_email text;
begin
  if auth.uid() is null then
    raise exception 'Must be authenticated to accept an invite';
  end if;

  select * into inv from staff_invites
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex')
  for update;

  if inv.id is null then
    raise exception 'This invite link is invalid.';
  end if;

  if inv.status <> 'pending' then
    raise exception 'This invite has already been used.';
  end if;

  if inv.expires_at < now() then
    raise exception 'This invite link has expired.';
  end if;

  invite_email := lower(inv.email);
  select lower(email) into account_email from auth.users where id = auth.uid();
  if account_email is distinct from invite_email then
    raise exception 'This invite was issued to a different email address.';
  end if;

  insert into profiles (id, full_name)
  values (auth.uid(), full_name)
  on conflict (id) do nothing;

  insert into tenant_members (tenant_id, user_id, role)
  values (inv.tenant_id, auth.uid(), inv.role)
  on conflict (tenant_id, user_id) do nothing;

  update staff_invites
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where id = inv.id;

  return inv.tenant_id;
end;
$$;

grant execute on function accept_staff_invite(text, text) to authenticated;
