-- ============================================================================
-- 0032_scope_photo_consent_check_to_tenant.sql
-- Security audit finding: has_granted_photo_consent(target_child_id) never
-- checked that the CALLER actually belongs to that child's tenant -- it
-- just answered "does any child with this id have a granted photo-scope
-- consent row", full stop. uploadChildPhotoAction (src/lib/actions/
-- children.ts) takes childId as raw form input and passes it straight
-- into this RPC before doing any ownership check of its own.
--
-- A tenant member could therefore submit ANY child id -- including one
-- belonging to a completely different tenant -- and, if that other
-- child happened to have photo consent granted (e.g. any family-tenant
-- child, which auto-grants), the check would return true. The actual
-- storage write and children.photo_asset_path update stay correctly
-- scoped to the caller's OWN tenant (storage RLS and children's
-- tenant-scoped update policy both key off the caller's real tenant,
-- not the borrowed child id), so this was never a cross-tenant data
-- leak or write -- but it let a tenant skip its OWN consent gate
-- entirely by borrowing someone else's already-granted consent record,
-- which is exactly the check this function exists to enforce.
--
-- Fixed by requiring the caller to actually be a member of that child's
-- tenant (or the platform owner, for auditing), matching every other
-- is_tenant_member()-gated function in this schema.
-- ============================================================================

create or replace function has_granted_photo_consent(target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from consent_requests cr
    where cr.child_id = target_child_id
      and cr.status = 'granted'
      and (cr.scope->>'photo')::boolean is true
      and (is_tenant_member(cr.tenant_id) or is_platform_owner())
  );
$$;
