-- ============================================================================
-- 0011_consent_lookup_photo_scope.sql
-- The public consent page must tell a parent WHAT they're being asked to
-- consent to before they grant it — including whether a photo is part of
-- the request. get_consent_request_info previously left this out, so a
-- parent could grant a request whose scope included photo without ever
-- being told. Adds requests_photo to the lookup result.
-- ============================================================================

alter type consent_lookup_result add attribute requests_photo boolean;

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

  select c.first_name, t.name, req.status, req.expires_at,
         (req.scope->>'photo')::boolean, true
  into result.child_first_name, result.organisation_name, result.status,
       result.expires_at, result.requests_photo, result.found
  from children c
  join tenants t on t.id = c.tenant_id
  where c.id = req.child_id;

  return result;
end;
$$;

grant execute on function get_consent_request_info(text) to anon, authenticated;
