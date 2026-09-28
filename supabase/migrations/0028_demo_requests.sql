-- demo_requests: "Book a demo" submissions from the public landing page
-- and the dashboard home tab. Inserted via the plain anon-key server
-- client (submitDemoRequestAction, src/lib/actions/demo-request.ts) --
-- not the service role, which is reserved for the job worker, Stripe
-- webhooks, and seed scripts only (see createSupabaseServiceRoleClient's
-- own doc comment). An insert-only RLS policy open to anon/authenticated
-- is the correct tool for a genuinely public write like this one; the
-- action's own IP rate limit is the spam defence on top of it. Nobody
-- but the platform owner can ever read a row back.
create table demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  organisation_name text,
  message text,
  locale text not null,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table demo_requests enable row level security;
alter table demo_requests force row level security;

create policy "anyone can submit a demo request" on demo_requests
  for insert to anon, authenticated
  with check (true);

create policy "platform owner can read demo requests" on demo_requests
  for select using (is_platform_owner());

comment on table demo_requests is
  'Book-a-demo form submissions from the landing page / dashboard home. Anyone can INSERT (a public contact form); only the platform owner can read rows back.';
