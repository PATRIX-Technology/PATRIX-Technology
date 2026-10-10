-- ============================================================================
-- 0036_consent_photo_phone_verification.sql
-- Closes a real gap flagged in Ownly's DPIA (UAE PDPL): the nursery's
-- public consent link has no check that the person clicking it is actually
-- the child's parent/guardian -- "possession of the 192-bit token" was the
-- entire trust model (see docs/DECISIONS.md "Family photo consent" and the
-- comment in consent-public.ts). For base story consent (name + avatar, no
-- photo) that is a proportionate risk for a link a nursery shares directly
-- with a known parent. For PHOTO consent specifically -- an identifiable
-- image of a child, sent to a third-party AI processor outside the UAE --
-- it is not: a forwarded link or screenshot could let the wrong person
-- consent to a child's photo being used.
--
-- This migration adds a phone-OTP step, required only when a consent
-- request's scope includes photo, and enforces it at the one place that
-- actually matters: respond_to_consent can no longer record a photo-scoped
-- decision until the phone on file for that request has been verified via
-- a real SMS code. The UI gate on the public page is a convenience; this
-- is the actual security boundary, unbypassable by a direct RPC call.
--
-- Deliberately out of scope here: base (non-photo) consent requests are
-- untouched -- no phone field, no OTP step -- matching the "necessity and
-- proportionality" framing already used in the DPIA itself.
-- ============================================================================

alter table consent_requests
  add column parent_phone text,
  add column otp_verified_at timestamptz;

-- ---------------------------------------------------------------------------
-- get_consent_request_info: tell the public page whether phone
-- verification is required and already done, plus a masked phone for
-- display. The raw number is never returned here -- only through the
-- token-gated, server-only RPC below that actually needs it to send the
-- SMS.
-- ---------------------------------------------------------------------------
alter type consent_lookup_result add attribute otp_required boolean;
alter type consent_lookup_result add attribute otp_verified boolean;
alter type consent_lookup_result add attribute parent_phone_masked text;

create or replace function get_consent_request_info(raw_token text)
returns consent_lookup_result
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  req consent_requests%rowtype;
  result consent_lookup_result;
  requires_photo boolean;
begin
  select * into req from consent_requests
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex');

  if req.id is null then
    result.found := false;
    return result;
  end if;

  requires_photo := coalesce((req.scope->>'photo')::boolean, false);

  select c.first_name, t.name, req.status, req.expires_at,
         requires_photo, true,
         (requires_photo and req.parent_phone is not null),
         (req.otp_verified_at is not null),
         case when req.parent_phone is not null
           then repeat('*', greatest(length(req.parent_phone) - 2, 0)) || right(req.parent_phone, 2)
           else null end
  into result.child_first_name, result.organisation_name, result.status,
       result.expires_at, result.requests_photo, result.found,
       result.otp_required, result.otp_verified, result.parent_phone_masked
  from children c
  join tenants t on t.id = c.tenant_id
  where c.id = req.child_id;

  return result;
end;
$$;

grant execute on function get_consent_request_info(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- send_consent_otp_target: returns the RAW phone number for a pending,
-- photo-scoped request, so the server action can hand it straight to
-- supabase.auth.signInWithOtp without the browser ever seeing it. Same
-- token-hash trust model as every other function here -- the token is the
-- authorization to even learn the phone number exists.
-- ---------------------------------------------------------------------------
create or replace function send_consent_otp_target(raw_token text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  req consent_requests%rowtype;
begin
  select * into req from consent_requests
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex');

  if req.id is null or req.status <> 'pending' or req.expires_at < now() then
    return null;
  end if;
  if coalesce((req.scope->>'photo')::boolean, false) is not true then
    return null;
  end if;

  return req.parent_phone;
end;
$$;

grant execute on function send_consent_otp_target(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- mark_consent_otp_verified: called only after a real
-- supabase.auth.verifyOtp() success, server-side. Records that this
-- specific consent request's phone has been proven -- respond_to_consent
-- below now requires this before a photo-scoped decision can be recorded.
-- ---------------------------------------------------------------------------
create or replace function mark_consent_otp_verified(raw_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  req consent_requests%rowtype;
begin
  select * into req from consent_requests
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex')
  for update;

  if req.id is null then
    raise exception 'Consent request not found';
  end if;
  if req.status <> 'pending' then
    raise exception 'This consent request has already been answered';
  end if;

  update consent_requests set otp_verified_at = now() where id = req.id;
end;
$$;

grant execute on function mark_consent_otp_verified(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- respond_to_consent: a photo-scoped request can no longer be granted or
-- declined until otp_verified_at is set. Non-photo requests are unaffected.
-- ---------------------------------------------------------------------------
create or replace function respond_to_consent(raw_token text, decision consent_status)
returns void
language plpgsql
security definer
set search_path = public, extensions
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

  if coalesce((req.scope->>'photo')::boolean, false) and req.otp_verified_at is null then
    raise exception 'Phone verification is required before responding to a photo consent request';
  end if;

  update consent_requests
  set status = decision, responded_at = now()
  where id = req.id;

  -- Local to this transaction only (the `true` third argument) -- never
  -- leaks into any other session or a later statement on this same
  -- connection, so it can't be used to prop the door open for a
  -- follow-up direct write.
  perform set_config('app.allow_consent_decision', 'true', true);
  update children
  set consent_status = decision
  where id = req.child_id;
end;
$$;
