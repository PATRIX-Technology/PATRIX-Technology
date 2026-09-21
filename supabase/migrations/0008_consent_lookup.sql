-- ============================================================================
-- 0008_consent_lookup.sql
-- Lets the public (anon, unauthenticated) consent page show the parent
-- what they're being asked to consent to, without granting anon any
-- direct SELECT access to consent_requests/children (which stay
-- RLS-protected to tenant members only). The token itself IS the
-- authorization — same trust model as respond_to_consent in 0002.
-- ============================================================================

create type consent_lookup_result as (
  child_first_name text,
  organisation_name text,
  status consent_status,
  expires_at timestamptz,
  found boolean
);

create or replace function get_consent_request_info(raw_token text)
returns consent_lookup_result
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  req consent_requests%rowtype;
  result consent_lookup_result;
begin
  select * into req from consent_requests
  where token_hash = encode(digest(raw_token, 'sha256'), 'hex');

  if req.id is null then
    result.found := false;
    return result;
  end if;

  select c.first_name, t.name, req.status, req.expires_at, true
  into result.child_first_name, result.organisation_name, result.status, result.expires_at, result.found
  from children c
  join tenants t on t.id = c.tenant_id
  where c.id = req.child_id;

  return result;
end;
$$;

grant execute on function get_consent_request_info(text) to anon, authenticated;
