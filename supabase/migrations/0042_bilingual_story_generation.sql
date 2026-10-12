-- ============================================================================
-- 0042_bilingual_story_generation.sql
-- Bilingual-in-one-book generation: a story can now be generated with
-- BOTH English and Arabic captions on every interior page, in one
-- illustration (same one Gemini call per page as a single-language
-- story -- no COGS change), rather than one language only. `locale`
-- stays the story's PRIMARY language (which name/title shows first
-- elsewhere in the app, which template row's image_prompt scene
-- description is used); `bilingual` layers on top of it.
--
-- story_pages.text stays the English caption always, for a bilingual
-- story (drawn via the proven embedded-font PDF text path); the new
-- text_ar column holds the Arabic caption (drawn via the proven
-- HarfBuzz vector-glyph path already used for the cover/back pages --
-- see src/lib/providers/pdf/arabic-text-vector.ts). Both are null/false
-- by default so every existing single-language story is unaffected.
-- See docs/DECISIONS.md "Bilingual-in-one-book generation".
-- ============================================================================

alter table stories add column bilingual boolean not null default false;
alter table story_pages add column text_ar text;

comment on column stories.bilingual is
  'Whether this story''s interior pages show both English and Arabic captions in one illustration. locale stays the primary language; this layers on top.';
comment on column story_pages.text_ar is
  'The Arabic caption for this page, only set when the parent story is bilingual. Drawn as real vector glyph outlines (HarfBuzz-shaped), not baked into the image.';

create or replace function create_story(
  target_tenant_id uuid,
  target_child_id uuid,
  target_theme_key text,
  target_locale app_locale,
  target_avatar_config jsonb,
  target_pronoun pronoun_type,
  pages jsonb,
  target_bilingual boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  child_row children%rowtype;
  new_story_id uuid;
  quota_ok boolean;
  page_rec jsonb;
  new_page_id uuid;
begin
  if not is_tenant_member(target_tenant_id) then
    raise exception 'Not authorized for this tenant';
  end if;

  select * into child_row from children
  where id = target_child_id and tenant_id = target_tenant_id;
  if child_row.id is null then
    raise exception 'Child not found for this tenant';
  end if;

  if child_row.consent_status <> 'granted' then
    raise exception 'A story cannot be created until this child''s parent has granted consent.';
  end if;

  select consume_story_quota(target_tenant_id) into quota_ok;
  if not quota_ok then
    raise exception 'This organisation has used all the stories included in its current plan period.';
  end if;

  insert into stories (
    tenant_id, child_id, theme_key, locale, status,
    avatar_config_snapshot, pronoun_snapshot, created_by, bilingual
  )
  values (
    target_tenant_id, target_child_id, target_theme_key, target_locale, 'QUEUED',
    target_avatar_config, target_pronoun, auth.uid(), target_bilingual
  )
  returning id into new_story_id;

  for page_rec in select * from jsonb_array_elements(pages)
  loop
    insert into story_pages (story_id, page_number, text, text_ar, image_prompt)
    values (
      new_story_id,
      (page_rec ->> 'page_number')::int,
      page_rec ->> 'text',
      page_rec ->> 'text_ar',
      page_rec ->> 'image_prompt'
    )
    returning id into new_page_id;

    insert into story_jobs (story_id, page_id, job_type)
    values (new_story_id, new_page_id, 'GENERATE_PAGE_IMAGE');
  end loop;

  update stories set status = 'GENERATING' where id = new_story_id;

  return new_story_id;
end;
$$;

grant execute on function create_story(uuid, uuid, text, app_locale, jsonb, pronoun_type, jsonb, boolean) to authenticated;
