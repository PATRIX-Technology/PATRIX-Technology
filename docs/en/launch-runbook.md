# Launch runbook

A practical, step-by-step guide for taking this product from "built and
tested locally" to "a real nursery is using it." Written for whoever
does the deploy — could be the founder, could be a developer they bring
in later. Nothing here requires re-reading the whole codebase first.

## 0. Before you start

Confirm every item in `docs/NEEDS_FROM_ME.md` that's relevant to what
you're launching is either done or consciously deferred:

- [ ] Supabase project created (item 1)
- [ ] Brand name confirmed / trademark-screened if going public (item 2)
- [ ] Domain + hosting account exists (item 3)
- [ ] Legal review of the PDPL posture at least started (item 7) —
      **do not skip this for a launch involving real children's data**
- [ ] If launching with real AI images: vendor chosen, safety checker
      wired, spend caps set (items 4, 4a, 5)
- [ ] If launching with billing on: Stripe account + webhook configured
      (item 6)
- [ ] Native Arabic review complete for any template you'll actually use
      with a real family (item 9)

If any of the above is "no" and you're launching anyway, that's a
decision — just make it consciously, not by accident. The mock image
provider (free, instant, placeholder illustrations) is a legitimate way
to run a pilot before committing to a real AI vendor; see
`docs/en/pilot-plan.md`.

## 1. Apply the database schema

Against your Supabase project (SQL editor, or `psql` with the project's
connection string), run every file in `supabase/migrations/` **in
filename order** (0001 → 0008). Each is idempotent-safe to re-run except
where it inserts seed rows with fixed IDs (those use `on conflict do
nothing`, so re-running is also safe).

Then seed platform data:

```bash
cp .env.example .env.local   # fill in your real Supabase URL + service role key
npm run db:seed              # 8 story themes + 3 plans
```

Do **not** run `npm run db:reset` against a real project — it creates
and destroys a fake "demo-nursery" tenant and is for local/demo use only
(see the warning in `scripts/reset-demo-data.mjs`).

## 2. Configure Supabase Auth

- In the Supabase dashboard, under Authentication → Providers, confirm
  Email is enabled.
- Decide whether email confirmation is required before first sign-in
  (`signUpAction` in `src/lib/actions/auth.ts` handles both cases).
- Set the Site URL and Redirect URLs to your real domain once you have
  one, not `localhost`.
- Enable TOTP MFA (it's on by default in Supabase Auth — the app's
  `/owner` routes require it; see `src/lib/domain/mfa.ts`).

## 3. Create the Storage bucket policies

`supabase/migrations/0007_storage.sql` creates the `story-assets` bucket
and its RLS policies as part of the schema apply in step 1 — nothing
extra to do here, just confirm in the Supabase dashboard under Storage
that the bucket exists and is marked private (not public).

## 4. Set environment variables on your host

Copy every variable from `.env.example` into your hosting provider's
environment variable settings (Vercel, or wherever you deploy). At
minimum for a mock-provider launch:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=https://your-real-domain.com
CONSENT_LINK_BASE_URL=https://your-real-domain.com/consent
CRON_SECRET=<generate a random 32+ character value>
```

Leave `FEATURE_REAL_IMAGE_PROVIDER`, `FEATURE_BILLING`, and
`FEATURE_PHOTO_PERSONALIZATION` as `off` unless you've completed the
corresponding checklist items above.

## 5. Deploy

```bash
npm run build   # confirm it succeeds locally first
```

Deploy via your host's normal flow (e.g. `vercel deploy --prod` if using
Vercel, or push to the branch your host auto-deploys from).

## 6. Set up the cron worker

The story-generation job queue needs something to periodically hit
`/api/cron/worker` (every 1-2 minutes is reasonable). Options:
- Vercel Cron (a `vercel.json` cron entry) if hosting on Vercel
- A GitHub Actions scheduled workflow hitting the URL with `curl`
- Any external cron service (cron-job.org, etc.)

Whichever you use, send the header
`Authorization: Bearer <your CRON_SECRET>`.

## 7. Post-deploy smoke test

Run through `docs/TEST_CHECKLIST.md` items 1-8 against the real deployed
URL, not localhost. All 8 should pass exactly as they do locally.

## 8. Monitoring (not yet built — set this up yourself)

This build does not include application monitoring/alerting. At
minimum before a real launch:
- Enable your host's built-in error/log dashboard (e.g. Vercel's).
- Enable Supabase's built-in database + API logs and set up an alert for
  error-rate spikes if your Supabase plan supports it.
- Watch the `audit_logs` table for unexpected `child_deleted` or
  `consent_withdrawn_assets_deleted` volume as an early signal of misuse.

## 9. Backup / restore

Supabase's paid plans include automated daily backups and point-in-time
recovery; confirm your plan tier includes what you need for the amount
of data loss you're willing to tolerate, and test a restore at least
once in a non-production project before you need it for real.

## 10. Rollback plan

If a deploy causes a regression:
- Re-deploy the previous known-good build (your host's rollback feature,
  or re-deploy the previous git commit).
- Database migrations in this project are additive (no migration drops
  a column or table) so rolling back the app code does not require
  rolling back the schema.
- If a migration itself is the problem, fix forward with a new
  migration rather than trying to reverse-apply the old one.

## 11. Incident response basics

- If child data may have been exposed: this is a PDPL-relevant event —
  loop in your legal reviewer (`docs/NEEDS_FROM_ME.md` item 7)
  immediately, not after investigating.
- If the AI spend kill switch needs to be triggered manually: update
  `global_spend_cap.kill_switch = true` directly in the database — this
  takes effect on the very next generation attempt (see
  `docs/DECISIONS.md` "Hard AI spend caps are enforced in the database").
- If a tenant reports seeing another tenant's data: treat as a P0. This
  should be structurally impossible per the RLS tests in
  `tests/integration/`, so a real report means either a bug, a
  misconfiguration (e.g. RLS accidentally disabled on a table), or
  social engineering (e.g. an owner sharing credentials) — investigate
  which before communicating anything to either customer.
