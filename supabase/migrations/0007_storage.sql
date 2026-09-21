-- ============================================================================
-- 0007_storage.sql
-- Private Storage bucket for story/child assets, plus RLS on
-- storage.objects so cross-tenant access is impossible even with a
-- captured anon-key session — mirrors the tenant_id-prefixed path
-- convention used in src/lib/jobs/worker.ts and src/lib/domain/deletion.ts.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('story-assets', 'story-assets', false)
on conflict (id) do nothing;

-- Every object path is "<tenant_id>/...", so (storage.foldername(name))[1]
-- gives the owning tenant id for any object in this bucket.
create policy "story_assets_tenant_select" on storage.objects
  for select using (
    bucket_id = 'story-assets'
    and is_tenant_member(((storage.foldername(name))[1])::uuid)
  );

create policy "story_assets_tenant_insert" on storage.objects
  for insert with check (
    bucket_id = 'story-assets'
    and is_tenant_member(((storage.foldername(name))[1])::uuid)
  );

create policy "story_assets_tenant_delete" on storage.objects
  for delete using (
    bucket_id = 'story-assets'
    and (
      has_tenant_role(((storage.foldername(name))[1])::uuid, array['nursery_owner', 'nursery_admin']::tenant_role[])
      or is_platform_owner()
    )
  );

-- No update policy: assets are immutable once written (a "regenerate"
-- writes a new object with upsert via the service-role worker, which
-- bypasses RLS entirely, so client-side updates are never needed).
