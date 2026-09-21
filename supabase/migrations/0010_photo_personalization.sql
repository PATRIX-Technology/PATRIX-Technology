-- ============================================================================
-- 0010_photo_personalization.sql
-- Adds the storage column for an uploaded child reference photo. Still
-- fully gated: this column is only ever written by
-- uploadChildPhotoAction (src/lib/actions/children.ts), which refuses to
-- run unless FEATURE_PHOTO_PERSONALIZATION is on AND a consent_requests
-- row for this child is 'granted' with scope->>'photo' = 'true'. See
-- docs/DECISIONS.md "Photo personalisation wiring".
-- ============================================================================

alter table children add column photo_asset_path text;

comment on column children.photo_asset_path is
  'Path to an uploaded reference photo in the private story-assets bucket. NULL unless photo personalisation was explicitly enabled, consented to (scope.photo = true), and a photo was uploaded. Deleted (and this column cleared) the moment consent is withdrawn or the child is deleted — see src/lib/domain/deletion.ts.';

-- Same tenant-scoped RLS pattern as every other children column: no new
-- policy needed since children already has tenant-scoped select/update
-- policies covering all columns.

-- Condition 1 of 5 from the product brief ("tenant explicitly opts in").
-- Settable only by the nursery/family owner via the settings page.
alter table tenants add column photo_personalization_opt_in boolean not null default false;

comment on column tenants.photo_personalization_opt_in is
  'Per-tenant opt-in for photo-based personalisation. One of five independent conditions (see src/lib/domain/consent.ts isPhotoPersonalizationAllowed) that must ALL be true before a photo can ever be uploaded or used — this alone does nothing without the feature flag, legal-review flag, and an actual granted photo-scope consent.';

-- ---------------------------------------------------------------------------
-- has_granted_photo_consent: checks conditions 2+3 (a granted consent
-- request whose scope actually covers photo use) for one child. Used by
-- both the app layer (uploadChildPhotoAction) and can be called directly
-- for auditing.
-- ---------------------------------------------------------------------------
create or replace function has_granted_photo_consent(target_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from consent_requests
    where child_id = target_child_id
      and status = 'granted'
      and (scope->>'photo')::boolean is true
  );
$$;

grant execute on function has_granted_photo_consent(uuid) to authenticated;
