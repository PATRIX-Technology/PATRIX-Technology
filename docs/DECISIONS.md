# Decisions

This log records technical, product, and brand decisions made autonomously
during the build, per the operating instructions in the original brief
("choose the strongest practical option, implement it, document it, keep
going"). Nothing here is a legal or commercial conclusion — see
`docs/NEEDS_FROM_ME.md` for anything that needs the founder or a
professional advisor.

## Brand

**Decision: renamed from "Hikayti" to "Khayali" (خيالي — "my
imagination").** The original working name "Hikayti" (حكايتي — "my
story") turned out to be a near-identical transliteration of an
existing Dubai personalised-storybook company, "Hikayati" — same
product, same city, same category, not a coincidental near-miss.
"Khayali" was checked against the same product category (and against
"Qissati", a closer literal translation that turned out to already be
used by multiple competing AI-storybook apps) before adopting it. This
is still a **working name**, not a cleared one: no formal UAE/GCC
trademark search or domain-availability check has been done — see
`docs/NEEDS_FROM_ME.md`. Never state or imply trademark uniqueness
before that clearance happens.

**Decision: dark-first design system** — see "Dark-first design
system" below for the full palette and rationale.

**Decision: typography — Fraunces (display), Manrope (web UI body),
Noto Kufi Arabic (Arabic UI).** All are OFL-licensed and loaded via
`next/font/google`. The *printed PDF* uses a separate, deliberately
unrelated set of vendored/embedded fonts — Inter (Latin body) and Noto
Naskh Arabic (Arabic print body), self-hosted from `assets/fonts/` so
generation never depends on a CDN at runtime — chosen independently for
print legibility, not to match the web UI's chrome. See
`docs/LICENSES.md`.

## Product / architecture

**Single active tenant per session (MVP).** `getCurrentTenantContext`
(`src/lib/domain/session.ts`) loads a user's *first* tenant membership. A
user who genuinely belongs to multiple nurseries (rare in the target
market) will only see the first one until an organisation switcher is
built. Flagged as a known limitation, not a blocker for launch.

**Job queue implementation: a Postgres-backed table (`story_jobs`), not an
external broker.** `claim_next_story_job()` uses `FOR UPDATE SKIP LOCKED`
for safe concurrent claiming. A scheduled HTTP hit to `/api/cron/worker`
(any host cron — Vercel Cron, GitHub Actions schedule, etc.) drains the
queue; server actions also call `runWorkerOnce` synchronously right after
creating a story so the demo/dev experience feels instant. This keeps
Phase 2B free of a new infra dependency; if generation volume grows
enough that polling latency matters, swap in Supabase's `pgmq` extension
or an external queue without changing the `ImageProvider` contract.

**Two-wave job execution in `runWorkerOnce`.** A batch of claimed jobs
used to run through one flat `Promise.all` - fast (bounded to roughly
the slowest single Gemini call instead of the sum of all of them), but
this raced against "Character consistency across a story's pages"
(above): `generatePageImage()` looks up the *earliest already-generated*
page of the same story to send Gemini as a reference, and under full
parallelism every page of a freshly-created story starts generating
before any of them finishes, so that lookup reliably found nothing for
every page - silently defeating the one consistency mechanism a story
has when no reference photo exists (the common case). Found via manual
trace-through while investigating generation speed, not via a test or
bug report - no test previously exercised more than one page job in a
single `runWorkerOnce` call. `splitIntoWaves()` now runs each story's
lowest-page-number job alone in a first wave, then every other claimed
job (later pages of that story, any other story's jobs, `RENDER_PDF`
jobs) in a second wave - full parallelism is preserved *across* stories
and job types, so this adds only one extra Gemini call's worth of
latency to multi-page story creation, not a return to the fully
sequential original this was built to replace.

**Arabic content gating.** Every Arabic `story_theme_templates` row is
seeded with `native_review_status = 'draft'`. `assertTemplateUsable()`
(`src/lib/domain/templates.ts`) throws `TemplateNotReviewedError` for any
draft Arabic template, and this is enforced again in
`CreateStoryForm.tsx` (the UI simply doesn't offer draft templates as a
choice). English templates are authored directly by us, not translated,
so they ship as `reviewed` — the founder/team is the "native reviewer" for
English copy. Ideally no Arabic template is flipped to `reviewed` until a
native Arabic speaker has actually read it; as an interim step for the
first pilot, the 8 seeded Arabic templates were instead run through
Gemini with an explicit instruction to preserve every `{token}` verbatim
(script: a one-off pass, not part of the app) and flipped to `reviewed`
on that basis — this is a real quality improvement over raw machine
translation but is **not** a substitute for native review, and a native
speaker should still read them before wider rollout. `src/messages/ar.json`
UI strings are untouched by that pass; they used to carry a visible
`[NEEDS NATIVE REVIEW]` suffix inline, until the dark-first redesign
(below) turned up that this was rendering on the live Arabic page for
real users. That suffix has been stripped from every string value; the
same list now lives, unrendered, in `docs/ar/NATIVE_REVIEW_CHECKLIST.md`.

**Arabic pronoun/gender handling.** Rather than a single pronoun token,
Arabic templates use a small fixed vocabulary of narrative verb-phrase
slots (`{v:felt_happy}`, `{v:said}`, etc. — see
`src/lib/domain/pronouns.ts`) each with `she`/`he`/`they` conjugations.
`they` defaults to masculine-plural agreement (the conventional MSA
default for a mixed/unspecified-gender group). This default, like all
Arabic copy, needs native review before it ships to a real family.

**Arabic captions baked into the illustration.** `pdf-lib`/`fontkit` do
not perform Arabic contextual shaping, and every attempt to work around
that in our own code eventually broke: pre-shaping into Arabic
Presentation Forms (`arabic-reshaper`) + bidi-reordering (`bidi-js`)
before `drawText` went through several rounds of real bugs (a paragraph
reordered once instead of per-line; `pdf-lib`'s own `font.layout()`
re-reversing an already-reordered embedded Latin name; a guessed
"advance width fudge factor" that never reliably matched the real
rendered width). Replacing that with real shaping — the `harfbuzzjs`
WASM package, drawing raw glyph IDs at HarfBuzz-computed coordinates
via `pdf-lib`'s low-level content-stream operators, bypassing
`page.drawText` entirely — fixed the actual rendering (verified by
rendering to an actual PDF, rasterising it with `pdftoppm`, and
comparing pixel-for-pixel against a real shaping engine from the
identical font file: connected, correctly-joined Arabic, confirmed with
colored marker rectangles at each run boundary so the check didn't
depend on the reviewer being able to read Arabic). But it introduced a
NEW failure mode that only showed up in the real deployment, not in any
local build: `harfbuzzjs` resolves its own WASM file via
`import.meta.url` internally, and Next.js's webpack bundling baked in
the BUILD machine's absolute filesystem path, which doesn't exist on
Vercel's serverless runtime — surfacing as a minified `"t is not a
function"` in production. Excluding the package from webpack bundling
(`experimental.serverComponentsExternalPackages`) fixed that specific
crash (verified by building the app, running the actual production
server, and hitting the exact code path) — but a live deployment after
that fix STILL rendered visibly broken Arabic, root cause never fully
pinned down (a difference between the local build/run environment and
Vercel's actual serverless runtime that this project's tooling has no
way to inspect from outside Vercel's own dashboard).

At that point — three substantially different rendering approaches,
each fixing the specific bug found in the last one, each eventually
failing a real end-to-end check — the right move was to stop trying to
make `pdf-lib` shape Arabic at all. A direct side-by-side test settled
it: asking Gemini's own image model (the same one already generating
every illustration) to render the exact same caption text directly
in the image came back as correctly joined, fully legible Arabic
typography — as good as real printed book text, with correct diacritics,
on the first try, with none of the shaping/positioning machinery above.

**The fix**: for Arabic pages only, `buildIllustrationPrompt`
(`src/lib/providers/image/prompts.ts`) hands Gemini the page's exact
caption text and asks it to render that text itself, verbatim, as a
soft pastel banner across the bottom of the illustration — see
`GenerateImageRequest.captionText`/`.locale` (`ImageProvider.ts`) and
`src/lib/jobs/worker.ts`'s `generatePageImage`, which now passes the
page's own `text` and its story's `locale` into every image generation
call. `render.ts` no longer draws Arabic PDF text or a caption band for
Arabic pages at all — it just places the full-bleed image (which
already has its caption). English pages are unaffected: Latin text
never had a shaping bug, so `render.ts` still draws English captions
itself with the embedded Latin font, exactly as before. `preflight.ts`
no longer checks Arabic caption text against the embedded font's glyph
coverage, since that font no longer draws Arabic captions at all.

This also means: Arabic images generated BEFORE this change do not
have a caption baked in (they were generated when the illustration
prompt explicitly said no text) — their PDFs will show the illustration
with no caption until those pages' images are regenerated. For a
pre-launch pilot with a handful of test stories, regenerating is the
right move over adding migration complexity for data that isn't real
customer data yet.

Trade-offs worth knowing about, in case this ever needs revisiting: the
caption text becomes part of the image pixels for Arabic pages, so it's
no longer selectable/screen-reader-accessible in the PDF, can't be
corrected without regenerating the (paid, non-deterministic) image, and
depends on Gemini continuing to render this specific font/style of
Arabic text as reliably as it did in testing — there is no automated
check for THAT (the "arabic text is legible in the generated image"
property can't be verified by a unit test), so a native Arabic speaker
should keep spot-checking real output.

Still verify against a physical print proof, not just a PDF viewer,
before any real print run.

**Bilingual name fields for children.** Baking captions into the
illustration (above) surfaced a related issue: a child's name is often
entered in Latin script (`children.first_name`, e.g. "Hala") even for a
child whose stories are generated in Arabic, so it sat oddly mid-sentence
in otherwise-Arabic prose. Migration `0014_child_bilingual_names.sql`
adds three optional columns: `last_name` and `arabic_last_name` (family
name in each language, record-keeping only — never used in story
generation), and `arabic_first_name` (the Arabic spelling of the child's
first name). `createStoryAction` (`src/lib/actions/stories.ts`) and the
PDF filename/subject logic (`src/lib/domain/story-pdf.ts`) use
`arabic_first_name` instead of `first_name` when the chosen template's
locale is `ar`, falling back to `first_name` when it's unset — so this
is purely additive, no existing child needs updating. The name is baked
into a story's text/captions once at creation time (via
`renderTemplate`'s `child_name` token), not looked up dynamically
afterwards, so it only affects stories created after a child's Arabic
first name is set. All four fields (`first_name`, `last_name`,
`arabic_first_name`, `arabic_last_name`) are editable after creation via
the new `updateChildAction` (`src/lib/actions/children.ts`) — the add
and edit dialogs (`AddChildDialog`, `EditChildDialog`) both wrap a shared
`ChildForm` component so the two flows can't drift apart. The children
list page shows all four as separate columns. `docs/NEEDS_FROM_ME.md`-
style note: this migration hasn't been run against the live database
from this session (no network path to Supabase from this sandbox) — run
`supabase/migrations/0014_child_bilingual_names.sql` before relying on
any of these fields in production. (This migration was renamed/rewritten
in place from an earlier, narrower `0014_child_arabic_name.sql` that
added a single `arabic_name` column — since that version was never
actually applied anywhere, it was safe to widen in place rather than
layer a second migration on top.)

**PDF font weights.** `src/lib/providers/pdf/fonts.ts` now embeds a
single static instance per font — `Inter-Regular-Static.ttf` (wght=400),
`Fraunces-Display-Static.ttf` (wght=600), `NotoNaskhArabic-Regular-
Static.ttf` (wght=400) — pre-generated from the vendored variable fonts
with `fonttools varLib.instancer` (see docs/LICENSES.md for the exact
commands; this was forced by a real rendering bug, not a style choice —
see "Bug fix: Arabic (and Latin) PDF text was silently not rendering"
below). There is currently no separate bold instance embedded, so "bold"
still renders as the same weight as regular text; if bold text is ever
needed, generate one more static instance at a higher `wght` value the
same way and embed it as a fourth `EmbeddedFonts` entry.

**Private storage + signed URLs.** All story/child assets live in the
private `story-assets` Supabase Storage bucket (never public). Every URL
the browser sees is a short-lived (10 minute) signed URL generated
server-side per request — see `src/lib/domain/storage.ts` and the RLS
policies in `supabase/migrations/0007_storage.sql`, which additionally
restrict every object by the tenant-id path prefix so tenant isolation
holds for Storage exactly as it does for the database.

**Retention default: 730 days (24 months), configurable per tenant.**
`tenants.data_retention_days`. This is a reasonable operational default
inspired by common data-minimisation practice, not a PDPL compliance
claim — see `docs/NEEDS_FROM_ME.md` for the pending legal review.

**Photo personalisation is implemented but stays off by default.**
`FEATURE_PHOTO_PERSONALIZATION` and
`PHOTO_PERSONALIZATION_LEGAL_REVIEW_COMPLETE` both default to `off`. The
avatar system (`src/lib/domain/avatar.ts`) remains fully photo-free
(hair/skin-tone/outfit colour/accessory as a deterministic SVG) and is
always available regardless of these flags — photo upload is an
additional, separately-gated path on top of it, not a replacement. See
"Photo personalisation wiring" below for the actual upload/consent/
reference-image flow now built on top of this gate.

**Hard AI spend caps are enforced in the database, not just in
application code.** `can_spend()` / `record_ai_spend()`
(`supabase/migrations/0005_spend_caps_audit.sql`) flip a `kill_switch`
boolean the instant cumulative spend would exceed the configured cap, in
the same transaction as the spend record — there's no window where a
crash between "spent" and "recorded" could be exploited. The global kill
switch **defaults to `true` (blocked)**; the platform owner must
explicitly configure `monthly_cap_usd` and disable it. `RealImageProvider`
checks `can_spend()` before every paid call.

**Quota enforcement is in the database, not the UI.**
`consume_story_quota()` uses a row lock to atomically check-and-increment,
so two staff members generating stories at the same moment can't both
slip through when only one story's worth of quota remains.

**Billing prices shown as VAT-inclusive by default.**
`plans.vat_inclusive` defaults to `true`. Whether this is legally correct
depends on the buyer's Emirate/registration status — flagged for
`docs/NEEDS_FROM_ME.md`, never silently assumed on an invoice.

**Test database strategy.** Integration tests spin up a real, throwaway
PostgreSQL database (via the OS-installed `postgres` service, not Docker)
per test file, apply a minimal stand-in for Supabase's `auth` and
`storage` schemas (`supabase/testing/`), then run the actual migrations
and test against real RLS enforcement — not a mock. This is materially
stronger evidence of tenant isolation than testing against application
code alone. It does not exercise Supabase Auth's own token issuance,
Storage's actual file serving, or PostgREST's HTTP layer — those need a
real (or `supabase start` Docker-based) Supabase project before a
production launch; see `docs/TEST_CHECKLIST.md`.

## Phase 3 additions

**8 story themes, not 6.** The brief's explicit list (healthy eating,
saving money, brushing teeth, welcoming a new sibling, first day at
school, honesty, hand-washing, National Day gratitude, financial
literacy) is now fully covered by adding "The Piggy Bank Promise"
(saving money / financial literacy, folded into one theme since they're
the same underlying value) and "Colours of Gratitude" (National Day).
Same en/ar + native-review-gating pattern as the original 6. A new
`tests/unit/seed-templates.test.ts` validates every theme/locale/pronoun
combination in `supabase/seed/templates.json` against the schema and
asserts no template ever leaves an unsubstituted `{token}` in rendered
output — this is what caught the need for several new Arabic verb-phrase
conjugations (`saved`, `counted`, `shared`, `sang`, `waved`, `celebrated`,
`felt_grateful` — see `src/lib/domain/pronouns.ts`).

**Billing stays in Stripe test mode by default, with a real, working
webhook pipeline.** `src/lib/billing/stripe.ts` refuses to initialise
with a live (`sk_live_`) secret key unless `STRIPE_MODE` is explicitly
set to something other than `"test"` — a deliberate extra gate beyond
just "don't set live keys," since a copy-pasted live key into a
misconfigured `.env` should not silently start charging real cards. The
checkout/portal/webhook routes (`src/app/api/billing/*`) are fully
implemented against the `stripe` SDK, not stubbed — they simply have no
effect until `FEATURE_BILLING=on` and real Stripe keys + price IDs exist.
Webhook idempotency (a Stripe requirement, since deliveries can be
retried) is enforced at the database level: every event id is inserted
into `stripe_webhook_events` (primary key) before any other write, so a
duplicate delivery hits a unique-violation and is treated as a no-op —
proven against a real Postgres unique-constraint in
`tests/integration/stripe-webhook-idempotency.test.ts`, including that
no RLS policy lets a client (not just the service role) write to that
table at all. Coupons are validated against our own `coupons` table
*before* Stripe is ever contacted, so an expired/exhausted/inactive code
never reaches Stripe.

**Stripe's newer API versions moved subscription billing-period fields
off the Subscription object onto each SubscriptionItem.** (Confirmed by
inspecting the installed `stripe` npm package's own type definitions,
since API version `2026-08-26.dahlia` is what that SDK version ships
pinned to.) `subscriptionFromStripe()` reads
`subscription.items.data[0].current_period_start/end` accordingly. We
only ever create single-item subscriptions (one plan per tenant), so the
first item's period is the subscription's period.

**Owner MFA is mandatory, not optional.** `checkOwnerMfaGate()`
(`src/lib/domain/mfa.ts`) uses Supabase Auth's built-in TOTP
factor + Authenticator Assurance Level (AAL) rather than a bespoke 2FA
scheme. `/owner` (and every future owner-only route) must call this gate
before rendering anything: no factor enrolled → redirect to
`/owner/mfa-enroll`; factor enrolled but not verified this session →
redirect to `/owner/mfa-challenge`; verified → proceed. This piggybacks
on Supabase's own well-tested TOTP implementation rather than us storing
or verifying secrets ourselves.

**Image safety checks fail CLOSED.** `UnconfiguredSafetyChecker`
(`src/lib/providers/image/safety.ts`) is the default safety checker for
`RealImageProvider` and marks every image unsafe until a real moderation
vendor is wired up via `IMAGE_SAFETY_PROVIDER=vendor`. This means real
(paid) image generation is blocked twice over right now: once by
`FEATURE_REAL_IMAGE_PROVIDER` being off, and independently by no safety
checker being configured — so turning on the feature flag alone can
never accidentally skip moderation. Spend is still recorded even when an
image is rejected by the safety check, since the vendor charged for the
generation attempt regardless of the outcome; the rejection is surfaced
as a normal (non-retryable) generation failure on that page, visible to
staff via `story_pages.last_error`.

## Dependency audit (Phase 5 hardening, partial)

Ran `npm audit` and applied everything fixable without a breaking change:
**`next-intl` was bumped 3.19 → 4.14.5** (compatible with the installed
Next.js 14.x / React 18.x per its own peer-dependency range), which
resolved its open-redirect and prototype-pollution advisories. Verified
with a full rebuild, the full test suite, and a runtime smoke test of
both `/en` and `/ar` against the production build (`next start`) —
correct `dir="ltr"`/`dir="rtl"`, correct brand strings, HTTP 200 on both.

**Not fixed, and why:** `npm audit fix --force` would upgrade `next`
14.2.15 → 16.3.5 to close the remaining Next.js advisories (several
high/critical: cache poisoning, SSRF via Middleware/rewrites, DoS in
Server Actions/Server Components, and others — see `npm audit` for the
full list with advisory links). This is a major-version jump spanning
Next 15 and 16, which changes fundamental, widely-used APIs in this
codebase — most concretely, `params`/`searchParams` in every page and
route handler become `Promise`-wrapped instead of plain objects, which
every one of the ~20 page components and route handlers in this repo
reads synchronously today (`params.locale`, `params.storyId`, etc.).
Applying that migration correctly across every affected file, plus
whatever else changed in two major versions, is real, substantial work
that needs to be done deliberately and regression-tested against a live
Supabase project (which did not exist during this build session) — not
forced through blind in the same session as unrelated feature work.
**This is tracked as a required Phase 5 task before a production
launch, not silently dropped** — see `docs/NEEDS_FROM_ME.md` and
`docs/en/launch-runbook.md`'s pre-launch checklist.

A handful of the remaining advisories (`esbuild`, `@vitest/mocker`, via
`vitest`) are **dev/test-tooling only** — `vitest` and its transitive
`esbuild`/`vite` dependencies never ship to production, so their risk is
scoped to a developer's local machine while running tests, not to any
deployed environment. Upgrading to `vitest@5` would close these but
requires Node ^22.12 (already satisfied here) and a `@types/node` major
bump; left for the same dedicated hardening pass as the Next.js upgrade
rather than mixed into this session's feature work.

## Rate limiting

**Decision: a real, working in-memory limiter by default, with a
distributed Upstash-Redis-backed limiter that activates automatically
once `RATE_LIMIT_REDIS_URL`/`RATE_LIMIT_REDIS_TOKEN` are configured.**
`src/lib/rate-limit.ts`. The in-memory limiter is correct for a single
server process (local dev, a demo, or a single-instance deployment) but
under-counts across multiple instances (each has its own counters) —
that's fine for now and clearly commented, with the Upstash path built
(using Upstash's plain HTTPS REST API, no extra SDK dependency) as the
real answer once a multi-instance deployment exists. Applied to sign-up,
sign-in (keyed by IP+email so a shared NAT can't lock out every
account), and the public consent lookup/response endpoints (keyed by IP;
generous limits since a 192-bit random consent token is already
computationally infeasible to brute force — this is defence-in-depth,
not the primary protection there).

## E2E test scope

**Decision: the first Playwright E2E suite covers only pages that render
without a live Supabase project** (marketing home, sign-in/sign-up form
rendering, locale/RTL/LTR switching, PWA manifest, skip-link) —
`tests/e2e/*.spec.ts`, run in CI against a real headless Chromium. Every
flow that needs actual auth/data (sign up → create tenant → add a child →
consent → generate → approve → PDF) requires a real or `supabase start`
-based Supabase project to exercise honestly; building it against nothing
would mean either mocking Supabase at the network layer (testing the
mock, not the app) or leaving it permanently red in CI. Tracked as
follow-up work for once a Supabase project exists (`docs/NEEDS_FROM_ME.md`
item 1) rather than faked now.

## Security review finding (fixed)

A manual security review of this branch caught a real correctness bug
before it ever reached a live project: `story_jobs` had only a SELECT
RLS policy, but both `createStory()` and `regeneratePageAction` insert
into it using the regular authenticated (RLS-scoped) client, not the
service role. Against real RLS enforcement, **every story creation and
every page regeneration would have failed outright** with a row-level
security violation. Confirmed with a failing integration test against a
real Postgres instance (proving the bug), then fixed by adding a
correctly-scoped `story_jobs_insert_via_story` policy — a tenant member
may enqueue a job for their own story, but (as intended) still cannot
update a job directly; only the service-role worker claims/processes
them. The regression test is now permanent:
`tests/integration/story-jobs-rls.test.ts`. This is exactly the class of
bug the "test against real RLS, not mocks" strategy
(`docs/DECISIONS.md` "Test database strategy") exists to catch — and did.

## Phase 4: families are tenants

**Decision: an individual/family account is a `tenants` row with
`tenant_type = 'family'`, not a separate consumer data model.** A family
reuses the exact same tenant_members/RLS/children/story/quota machinery
a nursery uses — `create_family_tenant()` mirrors `create_tenant()`
(`supabase/migrations/0009_family_and_gifts.sql`), and the sole member
holds the existing `nursery_owner` role (a naming artifact of Phase 2;
in this context it just means "account owner"). This was the strongest
practical option because: every isolation guarantee already proven for
nurseries (RLS, storage scoping, deletion cascade, quota enforcement)
applies to families for free, with zero new attack surface to test from
scratch; and it avoids a second, parallel authorization model that would
need its own RLS policies, its own tests, and its own bugs.

**Decision: a family tenant's own consent workflow is auto-granted, not
skipped.** A `BEFORE INSERT` trigger on `children`
(`auto_grant_family_consent`) sets `consent_status = 'granted'`
immediately when the owning tenant is `tenant_type = 'family'` — the
person adding the child under their own family account IS the guardian,
so the nursery's multi-party "ask a parent, wait for a click" flow does
not apply. This keeps the *rule* ("no story without consent") fully
intact — `createStory()` still checks `consent_status = 'granted'`
identically for both tenant types — while removing a workflow step that
would be actively confusing for a parent creating a story for their own
child. Nursery-tenant children are completely unaffected (the trigger is
a no-op for `tenant_type = 'nursery'`) — proven in
`tests/integration/family-tenants.test.ts`.

**Decision: nav/UI adapts per tenant type rather than shipping a second
dashboard.** `DashboardNav` hides the Staff link for family tenants
(`nurseryOnly` link flag) and the child detail page shows a short
explanatory note instead of the consent-request panel — small,
targeted conditionals rather than forking the whole dashboard, since
~95% of the UI (children, avatars, stories, reader, PDF, settings) is
identical for both audiences.

## Phase 4: gifting

**Decision: a gift is a purchased pack of story credits, redeemed via a
code, fulfilled through the existing `quotas` table.** Modelled
deliberately like a physical gift card: the purchaser does not need the
recipient to have an account yet, and the recipient does not need to be
pre-invited anywhere — they just need the code. `redeem_gift()` credits
`quotas.stories_included_this_period` for whichever tenant the redeemer
is a member of, atomically and idempotently (a gift can only ever be
consumed once — proven with a double-redeem test in
`tests/integration/gift-redemption.test.ts`).

**Decision: gift codes follow the exact same trust model as consent
tokens** (`docs/DECISIONS.md` "Private storage + signed URLs" territory,
extended here): a random code is generated once, only its SHA-256 hash
is ever persisted (`gifts.code_hash`), and the raw code is delivered to
the purchaser by embedding it directly in the Stripe `success_url` —
never stored in plaintext anywhere, never emailed (no email-sending
infrastructure exists in this build — see `docs/NEEDS_FROM_ME.md`). The
purchaser is shown the code/link on the success page and is responsible
for sharing it themselves for now.

**Decision: gift purchases use Stripe Checkout in one-time `payment`
mode with ad-hoc `price_data`, not a pre-created Stripe Price.** Unlike
subscription plans (which need a real Stripe Price object per
plan/interval, configured once a Stripe account exists), a gift's price
is simple and fixed enough that generating the line item inline at
checkout-creation time (`src/app/api/gifts/checkout/route.ts`) avoids a
manual Stripe-dashboard setup step for something this simple. Reuses the
exact same webhook route, signature verification, and idempotency
guarantee already built for subscriptions
(`src/app/api/billing/webhook/route.ts` now branches on
`session.mode`/`metadata.purpose` before deciding which flow to run).

## Real image generation: Google Gemini

**Decision: Google Gemini (`gemini-2.5-flash-image`, "nano banana") is the
chosen real image vendor**, implemented as `GeminiImageProvider extends
RealImageProvider` (`src/lib/providers/image/GeminiImageProvider.ts`),
selected by `createImageProvider()`
(`src/lib/providers/image/factory.ts`) whenever
`FEATURE_REAL_IMAGE_PROVIDER` is on and `GEMINI_API_KEY` is set — it
throws loudly rather than silently falling back to the mock provider if
the flag is on but the key is missing. This slots into the existing
spend-cap / safety-checker pipeline in `RealImageProvider.generate()`
unchanged; `GeminiImageProvider` only implements `callVendorApi()`.

**Decision: Gemini generates illustration art only — it never renders
story text into the image.** `buildIllustrationPrompt()`
(`src/lib/providers/image/prompts.ts`) explicitly instructs "no text,
letters, words, or writing anywhere in the image." All story text (the
caption banners, the repeating title banner) is drawn by the platform's
own already-tested Arabic-shaping PDF pipeline
(`src/lib/providers/pdf/arabic-shaping.ts` +
`src/lib/providers/pdf/render.ts`), not by the model. This was a
deliberate trade-off against the founder's original manual workflow
(which asked Gemini to bake Arabic text directly into the image via
Nano Banana): an AI image model is not a reliable typesetter — it can
mis-shape Arabic letterforms, misplace tashkeel, or misspell words, and
none of that is checkable/fixable after the fact the way our own
PDF-text rendering is. Illustration-only generation plus our own text
overlay keeps every word in the final book exactly what was typed in,
in a correctly-shaped, correctly-positioned font.

**Decision: character consistency across a story's pages uses two
reference images, not one.** `generatePageImage()`
(`src/lib/jobs/worker.ts`) passes both the child's uploaded reference
photo (if photo personalisation is active for that child — see below)
and the earliest already-generated page's image bytes to Gemini as
`inlineData` reference parts alongside the prompt. The already-generated
page matters even when a photo exists, since it lets the *illustrated*
character (not just the photo) stay visually consistent page to page;
when no photo exists, it's the only reference available and is what
keeps a child's invented storybook character looking the same
throughout.

## Photo personalisation wiring

**Decision: uploading a photo requires all of feature flag + legal-review
flag + tenant opt-in + a granted consent request whose scope explicitly
covers photo use — enforced again at upload time, not just at
consent-request time.** `uploadChildPhotoAction`
(`src/lib/actions/children.ts`) checks all four independently rather
than trusting that a UI path already gated them, since the two are
separate requests at separate times (a nursery could request "story
only" consent, then later the family/legal posture could change).
`buildConsentScope()` (`src/lib/domain/consent.ts`) computes whether a
consent request even offers the photo checkbox based on the same tenant
opt-in + legal-review conditions, so a parent is never asked to consent
to something the deployment isn't actually configured to use.

**Decision: the photo lives on `children.photo_asset_path`, in the same
private `story-assets` bucket as everything else**, not a separate
table/bucket — it's just one more tenant-scoped asset path, so it
inherits the exact same signed-URL access pattern
(`src/lib/domain/storage.ts`) and the exact same cascade-delete handling
(`deleteChildCascade` in `src/lib/domain/deletion.ts`) as story PDFs and
page images. `deleteChildPhoto()` is a separate, smaller function
(rather than folded into `deleteStoryAssetsForChild`) because photo
consent and story consent are tracked as distinct scope flags and can be
withdrawn independently in principle, even though `withdrawConsentAction`
currently withdraws both together.

## PDF banner-style layout

**Decision: story pages moved from "image on top, caption text below" to
full-bleed illustration with a scalloped caption band overlay** at the
bottom edge, implemented in `src/lib/providers/pdf/render.ts` using shape
primitives in `src/lib/providers/pdf/banners.ts`. This was done to match
a real sample PDF output the founder supplied and asked the platform to
resemble.

**Decision: no cover page, no dedication page, no repeating title
banner.** The original version of this layout also generated a cover
page (title + child name), a dedication page ("This story was created
especially for ... by ..."), and a title banner repeating the English
theme name at the top of every single illustrated page. Removed all
three per real pilot feedback ("first 2 pages is very poor & not
needed", "writing first day at school not needed... every single page")
— they read as filler rather than part of the story. `drawFreeFloating
Banner` in banners.ts is now unused by render.ts (kept for the caption
band's flat-bottom variant, `drawFlatBottomBanner`) but left in place in
case a cover treatment comes back later. `renderStoryPdf`'s page count
is now exactly `pages.length`, not `2 + pages.length` — `story-pdf.ts`
and `preflight.ts` were both updated to match.

**Decision: the scalloped/cloud edges are drawn as rows of overlapping
same-colour circles, not custom SVG bezier/arc paths.** `pdf-lib` does
support arbitrary paths via `drawSvgPath`, but adjacent same-colour
filled shapes with no border already read as one continuous wavy edge
with no visible seams, which is far simpler to get right than hand-built
arc geometry and produces the same visual result. See
`drawFreeFloatingBanner` (title banner: scalloped top *and* bottom, with
rounded end caps — a free-floating "sticker") and `drawFlatBottomBanner`
(caption band: scalloped top only, flat sides and bottom, flush to the
page edge) in `banners.ts`.

**Decision: both banners size themselves dynamically from the actual
wrapped line count of their text**, rather than using a fixed height.
Story titles include the child's name and captions come from
AI-generated content, so neither has a bounded length in practice; a
fixed-height banner would either clip text or leave awkward empty space
depending on what a given story happened to contain.

## Bulk export folder structure

**Decision: one whole-tenant export (`/api/stories/export-zip`), not one
per class.** The class-picker links this replaced required knowing which
classes existed and downloading each separately; a nursery admin wants
one click for everything. `src/app/[locale]/(dashboard)/dashboard/stories/page.tsx`
now shows a single "Download all stories (ZIP)" link whenever the tenant
has at least one approved story, instead of a row of per-class buttons.

**Decision: `{class}/{child}.pdf` when a child has exactly one approved
story, `{class}/{child}/{theme}-{shortId}.pdf` per story when they have
several.** A flat `{class}/{child}.pdf` for every child would silently
collide (ZIP entries with the same name) the moment any child has more
than one approved story — this only starts happening for real once
repeat/regenerated stories are common — so multi-story children get
their own subfolder instead, while a single-story child stays a flat
file rather than a needless one-file folder. Children with no
`class_name` land in a `No class` folder rather than being dropped.
Logic lives in `buildExportPlan` (`src/lib/providers/pdf/bulk-zip.ts`),
kept as a pure function specifically so it's unit-testable without a
database or PDF rendering — see `tests/unit/bulk-zip.test.ts`.

## Bug fix: Arabic (and Latin) PDF text was silently not rendering

**This was a real, previously undetected defect in code from before this
session, not something introduced by the banner-layout work above** —
found only because implementing the banner layout finally motivated
actually opening a generated PDF in a real viewer and looking at it,
which nothing in the test suite ever did (`runPreflight` only regex-
validates the *source* strings passed in, never anything from the
rendered PDF itself; the existing PDF integration tests only assert
`pdfBytes.length > 0` and preflight-level structural checks). Every
Arabic PDF the platform had ever generated — cover, dedication, and
story pages alike — would have opened to a nearly-blank page in a real
reader.

**Root cause: embedding the raw variable fonts (`subset: true`, at
fontkit's "default named instance") corrupted glyph rendering.**
Confirmed by rendering output PDFs through two independent engines
(MuPDF via PyMuPDF, and Chromium's PDFium) — both showed almost every
glyph missing, for both the Arabic (Noto Naskh Arabic) and Latin (Inter,
Fraunces) embedded fonts. Turning `subset` off fixed it; going further,
pre-instantiating a single static weight/width/optical-size from each
variable font with `fonttools varLib.instancer` (see docs/LICENSES.md
for the exact commands and the resulting `*-Static.ttf` files now in
`assets/fonts/`) and embedding *those*, still unsubset, is what
`src/lib/providers/pdf/fonts.ts` does today. The ~1–1.5MB added per PDF
from not subsetting is negligible next to the embedded illustration
images.

**Second, smaller bug found during the same verification: `PDFFont.
widthOfTextAtSize` measures shaped Arabic text roughly 15% narrower than
these fonts actually render**, causing wrapped lines to sit right at (and
occasionally past) the page edge with no visible margin — while the
identical measurement for Latin text matched the real render exactly.
Root cause not fully pinned down; `ARABIC_ADVANCE_WIDTH_FUDGE = 1.2` in
`src/lib/providers/pdf/render.ts` is a deliberate, documented safety
margin applied to both line-wrapping and horizontal centering for Arabic
text specifically, verified against both engines after the fix. If this
ever needs revisiting (e.g. after a pdf-lib upgrade), the reproduction
recipe is: render a known long Arabic string through `renderStoryPdf`,
open the PDF in PDFium or MuPDF, and compare the actual glyph bounding
box width to `font.widthOfTextAtSize()`'s reported value.

**Lesson for future PDF/font changes: always visually verify output in a
real PDF viewer, not just structurally.** Added as a note to
`docs/TEST_CHECKLIST.md` — none of the 146 automated tests would have
caught either bug above, and both were only found by actually opening a
rendered PDF.

**Dark-first design system.** The app shipped with a light-default theme
and an unused `data-theme='dark'` CSS override that nothing ever set —
so in practice it was always light. Per explicit founder direction, dark
is now the only theme: `src/styles/globals.css`'s bare `:root` carries
the dark palette directly (deep indigo `#14152B` background, not flat
black/grey), with `:root[data-theme='light']` kept as an unused escape
hatch for a possible future toggle or print view. The `ink`/`lagoon`/
`saffron`/`coral` Tailwind ramps (`tailwind.config.ts`) were recalibrated
against every actual call site in the codebase, not abstractly inverted:
`ink` runs light-text-at-900/subtle-bg-tint-at-50 (the opposite of a
conventional Tailwind ramp) because that's what its two real usage
patterns — heading text and hover/active background tints — need on a
dark surface; `lagoon`/`saffron`/`coral` became teal/gold/rose brand
accents, picked to still work as solid button fills *and* as inline
text-on-dark-background link colour at the same shade (600), which a
generic light-mode-oriented ramp doesn't guarantee. `Badge` tones and
`DashboardNav`'s active-link state were the only two spots still using a
literal light-mode `bg-X-100 text-X-800` pair; both were fixed to a
translucent-dark pattern (`bg-X-900/50 text-X-300`) instead.

Two genuine, pre-existing bugs were only found because this work
involved actually screenshotting the app (via Playwright + a locally
launched Chromium) rather than reading the code and assuming it was
correct — worth doing again for any future layout-level change:

1. The marketing hero's two-column grid had no `min-w-0` on its text
   column. In English this never mattered (the heading happened to be
   short enough to wrap anyway), but the longer Arabic heading hit CSS
   grid's default `min-width: auto` behaviour — a grid item won't shrink
   below its content's max-content width unless told to — and blew the
   whole page out to ~1600px+ instead of wrapping. Fixed by adding
   `min-w-0` to the flex column and a `max-w-xl` to the heading.
2. The global `.skip-link` accessibility CSS hid itself with
   `left: -9999px`, the classic technique. `left` is a *physical*
   property, not a logical one, and RTL scroll containers extend
   leftward from 0 — so under `dir="rtl"` that -9999px became ~9999px of
   real, scrollable overflow, inflating the whole document's
   `scrollWidth` to over 11,000px (confirmed by walking the DOM for the
   widest element in a headless browser). Switched to a `clip-path`-based
   hidden technique (1px box, clipped, not offset) that has zero layout
   footprint in either direction — the modern accessible-hidden pattern,
   and one that was overdue regardless of the RTL bug.

Also surfaced by that same screenshot pass: `src/messages/ar.json`
strings marked `[NEEDS NATIVE REVIEW]` were carrying that suffix
*inside the rendered string value*, so it was literally visible on the
live Arabic marketing page to real users — worse than the problem the
marker was meant to flag. Stripped the suffix from all 28 affected
strings; the same tracking now lives, unrendered, in
`docs/ar/NATIVE_REVIEW_CHECKLIST.md`.

**Toast notifications replace inline red error text.** `ToastProvider`
(`src/components/ui/Toast.tsx`), mounted once in the root layout inside
`NextIntlClientProvider`, replaces two patterns: a raw `<a href
download>` to an API route (which gives zero feedback on failure — the
browser either does nothing or navigates the tab to a raw error
response) and ad-hoc `{state.error && <p className="text-coral-600">}`
banners for action results. `DownloadButton`
(`src/components/stories/DownloadButton.tsx`) fetches the file itself,
checks `response.ok`, and only then triggers a client-side blob
download — a failure surfaces as a toast instead of a broken
navigation. Per-field form validation messages next to an input are
*not* converted to toasts — that's expected, standard UX, not the
"stupid error redirect" pattern the founder flagged — only page/action-
level failures (download, regenerate, create-story) are.

**Clickable table rows.** `ClickableRow` (`src/components/ui/
ClickableRow.tsx`) wraps a `<tr>` with a click/keyboard handler and a
visible hover/active background tint, used on the Kids and Stories list
pages. Previously only the one linked cell (a child or story's name)
was interactive; the rest of the row gave no indication a click would
do anything. The underlying `<Link>` in the name cell is kept for
standard link semantics (keyboard focus, middle-click-to-open-in-new-
tab); `ClickableRow` only adds the "click anywhere in the row" and
visual-feedback behaviour on top, and explicitly ignores clicks that
land on a real `<a>`/`<button>` inside the row so it never hijacks one.

**Story-theme picker: illustrated cards, not a radio-button list.**
`CreateStoryForm` now renders each available theme as a card (a small
line-icon per `theme_key`, title, a checkmark on the selected one) built
from a visually-hidden native `<input type="radio">` plus Tailwind's
`has-[:checked]`/`peer-checked` variants — so it's still a real radio
group for keyboard/screen-reader users, just styled as cards instead of
a checklist.

**Bug fix: a new tenant had no subscription row until they paid.**
`create_tenant()` and `create_family_tenant()` (0001, 0009) inserted the
tenant, its owner membership, and (for families) a starter quota row —
but never touched `subscriptions`. The only writer of that table was
the Stripe webhook, so a brand-new signup had zero rows in
`subscriptions` for as long as they hadn't completed checkout — no
"trialing" record to see who'd signed up, and the `trial_story_used`
column had nothing reading or writing it (the actual free-trial-story
gate is the `quotas` table's `stories_included_this_period` default of
1, wired independently via `consume_story_quota`). Migration
`0015_subscription_on_signup.sql` redefines both RPCs to also
`insert into subscriptions (tenant_id) values (new_tenant_id)`
immediately at signup — every column but `tenant_id` takes its default
(`status = 'trialing'`, `plan_id`/`stripe_customer_id` null) — plus a
one-time backfill for any tenant created before this migration. The
billing webhook and checkout route already read/write this table by
`tenant_id` with `upsert(..., { onConflict: 'tenant_id' })`, so a
pre-existing trialing row is simply updated in place once a real plan
is purchased; nothing about the paid path changes. Verified against the
full integration suite (`tests/integration/family-tenants.test.ts` now
asserts the trialing row directly for both a nursery and a family
signup) plus a manual run of every integration test against a local
Postgres 16 instance — all 159 tests pass, `tsc --noEmit` is clean.

**Bug fix: paying for a plan never gave a tenant the quota to use it.**
`subscriptions.plan_id` and `quotas.stories_included_this_period` are two
separate tables, and nothing connected them — the Stripe webhook only
ever wrote to `subscriptions`. A nursery that paid for, say, Growth
(100 stories/month) would have their `subscriptions.plan_id` updated
correctly, but `quotas.stories_included_this_period` would stay at
whatever it already was (1, from the free trial via `quotas`'s default
and `consume_story_quota`) — `hard_cap` would then block them from
generating anything past their trial, despite having just paid.
Migration `0016_sync_quota_to_plan.sql` adds `sync_quota_to_plan()`, a
`security definer` function locked to `service_role` only (unlike
`consume_story_quota`, a tenant has no legitimate reason to grant
themselves quota) — it looks up the plan's `stories_per_month`, and
upserts `quotas` with that allowance, `stories_used_this_period` reset
to 0, for a period matching Stripe's own subscription period.
`src/app/api/billing/webhook/route.ts`'s `checkout.session.completed`
handler calls it right after upserting `subscriptions`. Deliberately
**not** wired into `customer.subscription.updated` — that event doesn't
reliably carry a `plan_id` (see `subscriptionFromStripe`'s "renewal
events do not know the plan" case), and this app always routes a plan
change (first subscribe or a later upgrade) through a brand-new
checkout session rather than Stripe's self-serve portal, so
`checkout.session.completed` is the one place a plan change ever
carries a trustworthy plan_id. Verified with a new integration test
(`tests/integration/quota-sync-on-checkout.test.ts`) against a local
Postgres 16 instance: the RPC grants the right allowance, resets usage,
creates a `quotas` row from scratch if none existed yet, rejects an
unknown plan id loudly rather than silently granting zero stories, and
confirms only `service_role` can call it. Full suite (163 tests) passes,
`tsc --noEmit` is clean.

**Family monthly subscription plans (Family / Family Plus).** Previously
only nursery tiers existed in `plans`; individuals had one-time gift
packs (`src/lib/domain/gifts.ts`) but no recurring subscription, despite
docs proposing $9/mo (1 story) and $19/mo (3 stories) family plans.
Migration `0017_family_plans.sql` adds `plans.audience`, reusing the
existing `tenant_type` enum (`'nursery' | 'family'`) rather than
inventing a parallel one — every plan now declares which kind of tenant
it's priced for. `scripts/seed-platform-data.mjs` seeds the two new
rows (`family`, `family_plus`) alongside the existing three, USD-priced
like the gift packs, AED-priced nursery tiers unaffected (default to
`audience = 'nursery'`, so the migration itself is non-destructive).
Enforcement is two-layered: the settings page
(`dashboard/settings/page.tsx`) filters its `plans` query by the
signed-in tenant's own `tenant_type`, so a family only ever sees Family/
Family Plus and a nursery only ever sees Starter/Growth/Network — and
`planIsAvailableForTenant` (`src/lib/domain/billing.ts`) is checked
server-side in the checkout route regardless of what the client sent,
so bypassing the UI can't buy the wrong audience's plan. Deliberately
**not** implementing the "rolls over up to 3 stories" idea from an
earlier draft of `docs/en/pricing.md` — that needs an accumulating
credit balance, a different quota mechanism than the flat per-period
allowance `quotas`/`consume_story_quota`/`sync_quota_to_plan` (0016)
already use everywhere else; simplified to a flat monthly allowance
like every other plan, and the docs are corrected to say so rather than
overclaim a mechanic that doesn't exist. Also corrected a stale doc
claim in the same section: the free trial story is enforced by
`quotas`'s default of 1, not `subscriptions.trial_story_used` — that
column exists in the schema but nothing reads or writes it (harmless as
long as no code branches on it, but worth not misciting it as the
mechanism). Verified with new tests
(`tests/integration/plan-audience.test.ts`,
`planIsAvailableForTenant` cases in `tests/unit/billing.test.ts`)
against a local Postgres 16 instance — full suite (171 tests) passes,
`tsc --noEmit` is clean.

**Monthly/annual billing toggle.** The checkout route already accepted a
`billingInterval` and looked up the matching `stripe_price_id_monthly`
or `stripe_price_id_annual`, and every plan already has an annual price
seeded — but `BillingSection.tsx` hardcoded `billingInterval: 'monthly'`
in its `subscribe()` call, so annual was never actually reachable from
the UI, for any plan (nursery or family). Added a Monthly/Annual toggle
above the plan grid; the selected interval now drives both which price
each card shows and what gets sent to checkout. `annualSavingsPercent`
(`src/lib/domain/billing.ts`) computes the "Save X% vs. monthly" badge
shown next to the annual price, from each plan's own
`price_monthly_cents`/`price_annual_cents` — no hardcoded percentage,
so it stays correct if prices change. Unit-tested in
`tests/unit/billing.test.ts` (Starter's ~20%, Family's ~17% — exactly
2 months free — a guard against a $0 monthly price, and a case where
bad seed data would show a negative "savings" rather than hide it).
Not verified in a live browser — `FEATURE_BILLING` is off and this
sandbox has no network path to a real Supabase project to sign in
against, so this dashboard page can't actually be reached end-to-end
from here; verified by typecheck, the unit tests above, and matching
the exact Button/Badge/Tailwind-token patterns already used elsewhere
in this same file.

**Phone-number sign-in and sign-up.** Added a "Phone" tab alongside the
existing email/password option on all three auth entry points (sign-in,
nursery sign-up, family sign-up), using Supabase's built-in phone-auth
(`signInWithOtp`/`verifyOtp` — an SMS OTP, not a password) rather than
building a custom SMS flow. Originally built UAE-only with a hand-rolled
E.164 converter, then widened to every country: `normalizePhoneNumber`
(`src/lib/domain/phone.ts`) now wraps `libphonenumber-js` rather than
hand-rolling per-country dialing rules for ~245 countries — that's the
kind of validation logic (trunk prefixes, number lengths, mobile vs.
landline ranges, all of it different per country) a well-maintained
library gets right and a bespoke implementation would get subtly wrong
somewhere. `CountryPhoneField` (`src/components/auth/`) pairs a country
picker — `getPhoneCountryOptions`, every country libphonenumber-js
knows, named via the runtime's own `Intl.DisplayNames` rather than a
second hand-maintained country-name dataset — with a national-number
input, and resolves the pair to E.164 client-side before the hidden
`phone` field is submitted; the server actions only ever see an
already-international number, so they don't need a `country` parameter
at all. Defaults to AE (still the primary market) but every country is
selectable. Three design decisions worth flagging:

- **Sign-up sends OTP with `shouldCreateUser: true`; sign-in ALSO does**
  — not `false`. Using `false` on sign-in would make Supabase return a
  distinguishable "no account" error at the *send* step, before the
  caller has proven they control that phone number — a classic
  enumeration side-channel (try a list of numbers, see which ones error
  differently). Instead, `verifySignInOtpAction` checks
  `getCurrentTenantContext` *after* a real code has been verified, and
  only then says "no account, sign up instead" — at that point only the
  true owner of the phone (or someone who's already compromised their
  SMS) can ever reach it. The cost is a harmless orphan `auth.users` row
  with no tenant if someone starts sign-in with an unregistered number
  and abandons the flow — the same tradeoff email auth already has for
  an unconfirmed signup that's never completed.
- **The two-step (phone → code) forms are client components using
  `useFormState` per step, not one submission** — matching how
  `SignInForm`/`SignUpForm` already use `useFormState` against server
  actions that call `redirect()` on success (this is the same, already-
  proven mechanism, not a new pattern). Org name / full name are
  collected on step 1 and carried to step 2 as hidden form fields (React
  state on the client, not a server-side session of any kind), since
  `verifyNurserySignUpOtpAction`/`verifyFamilySignUpOtpAction` need them
  to call `create_tenant`/`create_family_tenant` after the code checks
  out. Both verify actions check for an existing tenant first and skip
  tenant creation if one is found, rather than assuming a fresh signup —
  calling `create_tenant` a second time for the same user has no
  "already exists" guard of its own and would create a duplicate tenant,
  which would happen if someone abandoned sign-up after receiving a code
  once and retried, or landed on sign-up by mistake with an existing
  number.

OTP sends are rate-limited tighter than password auth
(`OTP_SEND_RATE_LIMIT`, 5 per 10 minutes per IP+phone vs. password
auth's 10 per 5 minutes) — an SMS costs real money per send via whatever
provider ends up configured, so SMS-bombing a number is a cost/abuse
vector password auth doesn't have. See `docs/NEEDS_FROM_ME.md` for the
Twilio (or similar) setup Supabase itself needs before this can send a
single real SMS. Not verified in a live browser or with a real SMS —
this sandbox has no SMS provider configured and no way to receive a
code, so this needs real end-to-end testing once Supabase's phone
provider is set up; verified so far by `normalizePhoneNumber`'s and
`getPhoneCountryOptions`'s unit tests (15 cases spanning several
countries' numbering plans, both English and Arabic display names,
alphabetical sort order), `tsc --noEmit`, and matching the exact
server-action/`useFormState` patterns already proven elsewhere in this
file.

**Bug fix / hardening: landing page nav, and raised every `maxDuration`
to the Vercel Pro ceiling.** The founder reported real application
errors on the live deployment: generating a story, creating a family
account, and the "Book a demo" button (which just navigates to
`/sign-up`). Investigated by reading code, not live logs — this
sandbox has no network path to the live Vercel deployment or the
production Supabase project. Ruled out my own recent schema changes
(`plans.audience`, `sync_quota_to_plan`) as the cause: every reference
to either is gated behind `flags.billing`, which is off, so neither can
be reached by any currently-live code path — confirmed by grepping
every usage site. The strongest remaining lead: every route that calls
real Gemini image generation (`children/[childId]/page.tsx`, the PDF
and ZIP export routes, the cron worker) declared `maxDuration = 60` —
already the Vercel **Hobby** plan's hard ceiling, not a number chosen
freely. Two sequential-page waves of real (non-mock) Gemini calls
plus Postgres round-trips can plausibly exceed 60s in practice, and a
platform-level timeout kills the function before any application-level
try/catch runs, which is indistinguishable from the crash pages
reported. Raised all four to 300 (the Vercel **Pro** ceiling) — inert
on Hobby (Vercel silently clamps back to 60) but takes effect
immediately, no redeploy needed, the moment the project upgrades to
Pro. This is a hypothesis, not a confirmed root cause — the founder
would need to check Vercel's own function/runtime logs for the actual
digest (`4195642915` was reported) to know for certain, and the
family-account-creation crash in particular has no equivalent
Gemini-timeout explanation, so it may be a separate issue not yet
diagnosed.

Also fixed, independent of the crash investigation: the landing page's
mobile header (`<640px`) showed only a "Get Started" button — no
"Sign in" link at all, unlike desktop. Restructured to show both
**Sign in** and **Sign up** at every screen width, added the missing
`nav.signUp` translation key (en/ar), and removed the now-unused
`nav.getStarted` key.

**Known limitation, not a bug: photo personalisation is unavailable
for family tenants** — superseded by "Family photo consent: a single
checkbox at upload time" below, which implements exactly the product
decision this paragraph originally called for.

## Defending against a mid-generation function timeout

**The previous entry's fix (avoiding `redirect()` inside `useFormState`) was not actually the root cause.** After shipping it, the founder reproduced the identical crash again, on the identical page, with a new stack trace pointing at a completely different line. Recording both the mistake and how it was actually found, since this took two rounds to get right:

**How the real site was found**: fetching the deployed bundle named in the crash's stack trace was blocked by this sandbox's network policy, so instead ran `next build` locally against the exact same commit and confirmed the shared framework chunk (`fd9d1056-*.js`) hashed identically to the deployed one — proof it's byte-for-byte the same compiled React/Next runtime. That let the crash's minified stack frames (`aW`, `oe`, `ol`, `or`) be matched directly against readable source in that chunk: they're React's own "flush effects after commit" traversal, meaning the thrown error came from inside a real `useEffect` callback, not React internals misbehaving on their own. The stack's *first* frame (in the page-specific chunk, at a byte offset that lined up before and after the redirect fix) pointed at one exact line: `CreateStoryForm`'s own effect, `if (state.error)` — reading `.error` off `state` from `useFormState`, which the TypeScript types (and every doc/blog post about the API) say can never be `undefined`. Empirically, on this deployed page, it was.

**Actual root cause**: `createStoryAction` calls `runWorkerOnce` — which runs real Gemini image generation for every page of the new story — synchronously, inside the same request that the client is waiting on. On Vercel's Hobby plan, `maxDuration` is capped at 60 seconds (see "maxDuration must not exceed the Hobby ceiling" above). A multi-page story's real generation calls can plausibly exceed that. When Vercel kills the function mid-request, the client's pending call to the Server Action doesn't resolve with a normal result or throw a catchable error — it apparently settles as `undefined`, which is exactly what made `state.error` crash the whole page instead of just failing that one submission.

**Fix, in two parts**:

1. **Crash-proofed every `useFormState` consumer in the app**, not just this one — `state?.error`, `state?.message`, `state?.consentUrl`, `state?.redirectTo` everywhere, plus a guard on the one send/verify OTP pattern that reads a raw awaited result before it reaches `useFormState`. Whatever *causes* a rejected/aborted action, none of these forms can turn that into a full-page crash any more; at worst the user sees nothing happen and can retry.
2. **Did NOT remove the synchronous `runWorkerOnce` call**, despite it being the actual timeout risk — an earlier version of this fix did exactly that (skip it for the real provider, rely on `/api/cron/worker` picking up the queued jobs instead), but that route had no scheduler actually configured anywhere in this repo or on Vercel. Removing the only thing that ever ran it would have replaced "an occasional crash on a slow story" with "every real-provider story stuck at `QUEUED` forever" — a strictly worse outcome. Added the missing piece instead: `.github/workflows/story-worker-cron.yml`, a GitHub Actions schedule hitting `/api/cron/worker` every 5 minutes, as a genuine safety net for whatever gets orphaned by a timeout. Vercel's own native Cron feature restricts free/Hobby projects to once a day, which is why this uses GitHub Actions rather than `vercel.json`. Needs two repository secrets to actually run — see `docs/NEEDS_FROM_ME.md`; without them it fails harmlessly every 5 minutes rather than doing nothing silently.

**Still true**: a story with enough pages, or a slow enough Gemini response, can still exceed 60 seconds even with all of the above — the synchronous call is still there and still capped by Vercel Hobby's ceiling. What changed is the failure mode: it now degrades to "this one shows GENERATING a bit longer, then the safety net finishes it within 5 minutes" instead of a full-page crash with no path to recovery.

## Client-side navigation instead of redirect() inside a useFormState action

**Root cause, finally confirmed, of the recurring "client-side exception" crashes** reported throughout this build (story generation, and very likely the earlier sign-in/sign-up/family-signup reports too, alongside the separate function-as-children bug already fixed for those pages): every one of them involved a Server Action that called `next/navigation`'s `redirect()` on success, invoked through `useFormState`. Confirmed this specific instance with real evidence, not just suspicion — added `src/app/[locale]/error.tsx` (see that entry below) so the next crash would show a real stack trace instead of Next's generic message, and the founder hit it again: `TypeError: Cannot read properties of undefined (reading 'error')`, thrown inside React-DOM's own action-queue internals, triggered from `CreateStoryForm`'s submit. A careful audit of every `.error`/`{error}` access in that page's actual compiled client bundle turned up nothing unguarded in the app's own code — pointing at the `redirect()`-inside-`useFormState` combination itself as the culprit, a known rough edge in this app's Next.js version (14.2.15; see `docs/NEEDS_FROM_ME.md` item 10 on the 14→16 upgrade).

**Fix**: every Server Action that both (a) redirects on success and (b) is driven through `useFormState` now returns `{ redirectTo: "/path" }` instead of calling `redirect()` directly; the calling form does `router.push(state.redirectTo)` in a `useEffect`. Added `redirectTo?: string` to the shared `ActionResult` interface (`src/lib/actions/auth.ts`) for this. Touched every instance of the pattern across the app, not just the one that reproduced:

- `createStoryAction` (`src/lib/actions/stories.ts`) → `CreateStoryForm.tsx`
- `signInAction`, `signUpAction`, `verifySignInOtpAction` (`src/lib/actions/auth.ts`) → `SignInForm.tsx`, `SignUpForm.tsx`, `PhoneSignInForm.tsx`
- `familySignUpAction`, `verifyFamilySignUpOtpAction` (`src/lib/actions/family.ts`) → `FamilySignUpForm.tsx`, `PhoneFamilySignUpForm.tsx`
- `verifyNurserySignUpOtpAction` (`src/lib/actions/auth.ts`) → `PhoneNurserySignUpForm.tsx`

**Deliberately left unchanged**: `signOutAction` and the (currently unused, dead-code) `redirectToReader` — both call `redirect()` but neither is driven through `useFormState` (a plain `<form action={signOutAction}>` and a would-be `onClick` caller respectively), which is the officially supported, safe pattern; only the `useFormState` combination was ever at risk.

**How this was actually diagnosed**, since it's worth recording given how long this took across the session: fetching the live deployed JS bundle named in the crash's stack trace was blocked by this sandbox's network policy (no route to the live app), so instead ran `next build` locally against the same commit, located the equivalent client chunk on disk, and grepped its compiled output for every `.error` access pattern — all of them turned out to be safe (`x.error &&` guards on values `useFormState` guarantees are never undefined), which is what shifted suspicion from "a bug in this app's own component code" to "an interaction with the framework's own action-redirect machinery," and from there to the specific fix above.

## Sample stories + plans extended to the nursery dashboard, "Overview" renamed "Home"

**Founder's request**: put the sample-stories-and-pricing block (built
for family accounts, see "Removing the free trial story" below) on the
dashboard's home tab in the left nav, and show the same thing for
nursery accounts too.

**Renamed the nav item** `overview` → `Home` (`الرئيسية` in Arabic) in
both message files — it was already the first item in the left sidebar
and already pointed at this exact route; nothing about the URL or nav
structure needed to change, just the label, now that this tab does
more than show stats.

**Extended to nursery accounts**: renamed `FamilySampleStories` to the
tenant-neutral `SampleStoriesPreview` and extracted the
samples-fetching + `BillingSection` block into a shared
`SamplesAndPlans` component parameterised by `audience: TenantType`, so
the plans query still correctly filters to nursery-priced plans
(Starter/Growth/Network) rather than family ones. A nursery's Home tab
now shows the same two platform sample stories and its own plan cards
*above* its existing operational stats (children count, pending
approval, consent pending) — kept those, rather than replacing them
outright like the family dashboard does, since a working nursery admin
still needs that count for daily use; the family dashboard never had
an equivalent stat worth keeping. Both tenant types show the identical
pair of sample stories (still exactly one English + one Arabic,
`is_platform_sample`) — no separate nursery-specific samples, per the
founder's "same idea" framing; that can be split later if a difference
in what a nursery vs. a family should be shown turns out to matter.

## Internal doc references leaking into customer-facing copy

**Founder feedback**: the family consent card literally read "...see
docs/DECISIONS.md 'Phase 4: families are tenants'" — an internal file
path and section title, shown to a real customer. Not an isolated
typo: a repo-wide check found the same pattern in eight more places —
the gift page, the (just-added) family dashboard and its sample-story
empty state, the billing settings card, the privacy blurb (which also
named `docs/en/privacy.md` and "this project's repository" directly),
the gift purchase form's Stripe-test-mode note, and two spots on the
owner page. Root cause: this whole build narrates its own reasoning
inline via comments referencing `docs/DECISIONS.md`/`docs/NEEDS_FROM_ME.md`
next to the code they explain — the right habit for a comment, wrong
the moment matching wording gets typed into an actual JSX text node
instead of staying above it in a `//` or `/* */`. Rewrote every one as
plain customer-facing copy (e.g. "Billing isn't available yet — check
back soon" instead of naming the internal doc and why) and removed
the stale "with their own free family account" line on the gift page
(no longer true — see "Removing the free trial story" below). Verified
with a repo-wide grep for these doc paths and the phrase "this
deployment" outside of comments — zero remaining hits in `src/app` or
`src/components`.

## Removing the free trial story

**Founder's request**: remove the free trial entirely — every new
signup got one free story (`quotas.stories_included_this_period`
defaulted to 1), and nothing stopped someone from farming free
generations by creating new family accounts repeatedly. Replace it
with two fixed sample stories (one English, one Arabic) shown on a new
family account's dashboard, with the subscription plans right below.

**Removing the trial**: changed `quotas.stories_included_this_period`'s
column default from 1 to 0, and `create_family_tenant`'s explicit
insert to match (migration `0019_remove_trial_and_platform_samples.sql`).
A nursery tenant was already getting the same "1 free story" indirectly
through this same column default (its quota row is created lazily, on
first `consume_story_quota` call, rather than explicitly at signup like
a family's) — fixing the default closes that path too, not just
`create_family_tenant`'s.

**Platform sample stories**: added `stories.is_platform_sample`
(boolean, at most one `true` per locale, enforced by a partial unique
index) and `get_platform_sample_stories()`, a `security definer` RPC
that returns the flagged story/stories joined to their template's
title/synopsis and first page. Deliberately a narrow RPC rather than a
relaxed RLS policy on `stories`: every other query in this project is
strictly tenant-isolated, and a sample explicitly meant for every
signed-in user to see (regardless of their own tenant) is the one
legitimate exception — scoping the exception to one function that
returns only the founder-flagged rows keeps it from becoming a general
cross-tenant read hole. The family dashboard
(`(dashboard)/dashboard/page.tsx`) signs the sample's image with the
service-role client, not the viewer's own RLS-scoped client, since the
image belongs to whichever tenant the founder actually generated it
under.

**Which two stories serve as the samples is a taste call, not a
technical one** — deliberately not hardcoded. The founder picks two of
his own already-approved stories (one per locale) and flags them
himself via SQL; see the migration handoff message for the exact
commands. Until at least one is flagged, the family dashboard shows a
plain "not set up yet" card instead of a broken/empty one.

**Also changed**: the family dashboard overview
(`(dashboard)/dashboard/page.tsx`) no longer shows the generic stats
grid (children count, pending-approval count) that a nursery sees —
replaced entirely with the sample stories + a "Choose a plan" card
reusing the existing `BillingSection` component, gated behind
`flags.billing` exactly like the settings page already does (shows a
friendly "not enabled yet" message when billing isn't configured,
rather than dead Subscribe buttons). The nursery dashboard is
unchanged.

## Custom error boundary for the locale segment

**Problem this fixes, not tied to any one crash**: every crash report
investigated during this build hit the same wall — Next.js's generic
production fallback ("Application error: a server-side/client-side
exception has occurred") shows nothing but a bare digest, so diagnosing
each one meant either the founder's own Vercel dashboard access (for a
server-side exception, which at least logs a real stack there) or
static code review and guesswork (for a client-side exception, which
Vercel's function logs never see at all, since it never touches the
server). Added `src/app/[locale]/error.tsx`, Next.js's own error
boundary convention for a route segment: it renders the real
`error.message` and, for a genuine client-side exception, the full
`error.stack` too, directly on the page — screenshot-able, no devtools
needed. A server-side exception still only ever exposes `digest` here
(Next.js deliberately never sends that error's real message or stack
to the client), so the founder's own Vercel logs remain the only way to
read those; this only closes the client-side half of the gap, which
until now had no path to a real stack trace at all.

**Investigating the specific report that prompted this** ("client-side
exception" screenshot, still on `/dashboard/children/[childId]`, while
trying to generate a story on a family account): ruled out the avatar
picker redesign as the cause — built a real (not simulated) SSR +
browser-hydration reproduction of `AvatarPicker` with `esbuild` +
Playwright/Chromium, since that component's live mini-avatar-preview
grid is the one new thing this exact page always mounts (inside
`EditChildDialog`'s `<dialog>`, regardless of whether the dialog is
open — `Modal.tsx` renders `children` unconditionally and only toggles
`showModal()`/`close()`). Hydration came back completely clean. Without
a real stack trace, couldn't take the investigation further with
confidence — hence this error boundary, so the next occurrence gives a
concrete answer instead of another screenshot of the generic message.

## Family photo consent: a single checkbox at upload time

**The founder's request**: "for family if in UAE law needed the
consent then please add it, if not needed then don't have any text
related to it in GUI and have the upload of photos available directly."

**I can't answer the legal half of that.** Whether UAE's Personal Data
Protection Law (Federal Decree-Law No. 45 of 2021) specifically requires
documented consent for a parent's own upload of their own child's photo
to a third-party AI processor (Google Gemini) is a real legal question
with real liability consequences — not something to infer from general
knowledge and ship as if settled. This is exactly the gap
`docs/NEEDS_FROM_ME.md` item 5a already flags: a qualified legal review
of photo personalisation, UAE/GCC-specific, has never been done, and
`PHOTO_PERSONALIZATION_LEGAL_REVIEW_COMPLETE` must stay off until it is.

**What I implemented instead of guessing**: the previous state was a
flat, unconditional block — `context.tenantType !== 'family'` in
`photoOptionAvailable`, meaning no family tenant could ever use photo
personalisation regardless of the flags. That flat block wasn't a
stand-in for a legal answer, it was a missing mechanism: unlike a
nursery, a family tenant's consent is auto-granted by a database
trigger (`auto_grant_family_consent`) that only ever sets
`children.consent_status`, never a photo-scoped `consent_requests` row,
so `has_granted_photo_consent` could never return true for a family
child no matter what. Fixing that mechanism doesn't require resolving
the legal question, so I built it: removed the tenant-type block and
the (family-inapplicable) per-tenant opt-in requirement from
`photoOptionAvailable` in `children/[childId]/page.tsx`; when photo
personalisation is switched on (both flags), a family tenant now sees
the upload widget directly, with one required checkbox
(`PhotoUpload.tsx`'s `requireFamilyConsentCheckbox`) shown inline the
first time only: "I am this child's parent or legal guardian, and I
consent to Khayali and its AI illustration provider (Google Gemini)
using this photo solely to personalise this child's storybook
illustrations." Checking it and uploading in the same action makes
`uploadChildPhotoAction` insert a `consent_requests` row
(`status: 'granted'`, `scope: {story: true, photo: true}`) atomically
with the upload — reusing the exact same `has_granted_photo_consent`
check the nursery flow already relies on, so nothing about the nursery
request/wait/respond path changed at all. Verified the RLS insert
policy actually permits this (a family tenant member inserting a row
with `status: 'granted'` directly, no separate grant step) with a new
integration test in `tests/integration/family-tenants.test.ts`.

**Why a checkbox rather than fully "direct, no text"**: sending an
identifiable child's photo to a third-party AI vendor is the kind of
processing that data-protection regimes modelled on GDPR — which UAE
PDPL is — routinely expect a documented, specific, affirmative consent
for, independent of who initiated the upload. Given genuine uncertainty
about whether UAE law specifically requires it here, one required
checkbox on the same screen as the upload (one click, not a separate
flow) was the smallest addition that stays defensible if consent turns
out to be required, while staying close to "upload directly" if it
isn't strictly required. This is a pragmatic default pending real legal
input, not a legal conclusion — see the updated
`docs/NEEDS_FROM_ME.md` item 5a.

## CSV bulk import: documented and given a downloadable template

Bulk CSV import for a nursery's class roster already existed
(`CsvImportDialog.tsx`, gated to `tenantType === 'nursery'` on the
children page) — the founder's ask was for it to be properly documented
and easier to use, not for the feature to be rebuilt. Added:

- A downloadable template CSV (`public/templates/children-import-template.csv`,
  linked from the import dialog) with the exact required header row and
  three example rows (mixed English/Arabic names, both pronouns, blank
  optional columns) — verified it parses through `parseChildrenCsv` with
  zero row errors before shipping it.
- A field-by-field table inside the import dialog itself (column name,
  whether the column must exist vs. whether a cell can be blank,
  accepted values), replacing the previous one-line hint.
- `docs/CHILDREN_CSV_IMPORT.md`: the full reference — every column's
  rules, what the import deliberately does NOT set (avatar, photo
  consent — both still per-child, same as before), and a placeholder
  note on future direct integration with a nursery's own system (not
  built — no vendor/system was named to design against yet).

## Avatar visual redesign

**Founder feedback**: the avatar system (already redesigned once this
session toward an "animated/cartoon style," see that entry above) still
read as flat and plain next to reference images of polished 3D-toy-style
children's-app avatars, and the picker itself showed plain text labels
and colour dots rather than an exciting, showroom-like choice.

**Fix, kept deliberately parametric** (no new illustration assets, no
schema change — `AvatarConfig`'s hair/skinTone/outfitColor/accessory
fields are untouched, so nothing about story generation, the Gemini
prompt integration, or the database changes):

- `AvatarPreview.tsx`: added a radial skin gradient (soft light-to-shadow
  falloff instead of a flat fill), a linear hair gradient, small
  skin-toned ears (drawn behind the face circle so only a sliver peeks
  out — hidden automatically under a hijab/cap since those are drawn on
  top afterwards), eyebrows, a subtle nose shadow, bigger sparkly eyes
  (two highlight dots instead of one), and an open laughing mouth (dark
  inner shape + a white tooth-line) instead of a plain smile stroke. The
  body/shirt got a diagonal sheen overlay and a soft collar highlight.
  Redesigned the `bow` accessory (was a stray triangle that read as a
  forehead mark) into an actual two-loop ribbon bow with a centre knot,
  and the `cap` accessory (previously visually identical to
  `headband` — both were just a coloured arc) into a proper dome shape
  covering the whole top of the head with a fold-line band, clearly
  distinct from the thinner mid-forehead `headband` strip.
- Every gradient's `<linearGradient>`/`<radialGradient>` id is scoped
  with React's `useId()` rather than a fixed string, because SVG
  element ids are global across the whole page: with a fixed id, every
  simultaneously-rendered avatar (a table of children, or the picker's
  many live option thumbnails, added below) would have silently
  resolved `url(#skinGrad)` to whichever instance happened to be first
  in the DOM, corrupting every other avatar's colours.
- `AvatarPicker.tsx`: replaced the plain text pills (hair/accessory) and
  bare colour dots (outfit) with a live mini `AvatarPreview` per option,
  each already merged with the child's other current choices, inside a
  selectable card with a checkmark badge on the active one — so picking
  an avatar reads as browsing real little characters rather than
  choosing from a spec sheet.
- Verified visually (not just by type/build passing) by server-rendering
  a grid of sample configs with `react-dom/server` and screenshotting it
  with Playwright — this project's normal `tsc`/test/lint pipeline
  wouldn't have caught the bow/cap shape problems, since nothing here
  changed the `AvatarConfig` data shape those tests actually check.

## maxDuration must not exceed the Hobby ceiling

**Retracting an earlier decision.** An earlier fix (see the crash
investigation entry below) raised `maxDuration` to 300 in four
route/page files, reasoning at the time that "the Hobby plan silently
clamps this to its own 60s max" — i.e. that it was harmless to ship
even without upgrading to Vercel Pro. That reasoning was never actually
verified against Vercel's real behaviour, and the founder later
reported that a code fix pushed well after that change (the
sign-in/sign-up crash fix, see below) appeared to have no effect at
all in production — the exact symptom you'd see if a deployment was
failing outright rather than a runtime bug persisting. Vercel is known
to reject a deployment at build time when a route's `maxDuration`
exceeds what the current plan allows, rather than silently clamping
it, which would explain every commit after the 300 change never
actually going live.

**Fix**: reverted `maxDuration` from 300 back to 60 (the Hobby plan's
own ceiling) in all four files it touched
(`children/[childId]/page.tsx`, `export-zip/route.ts`,
`[storyId]/pdf/route.ts`, `cron/worker/route.ts`). 60 is safe on Hobby
and was already confirmed sufficient — the founder reported stories
generating successfully without upgrading to Pro. If real Gemini
calls genuinely need more headroom than 60s later, that requires an
actual Vercel Pro upgrade, not just raising this number — see
`docs/NEEDS_FROM_ME.md`.

**Not yet confirmed**: whether this was in fact why later commits
appeared to have no effect — that depends on Vercel's actual
behaviour for an out-of-range `maxDuration` at build time, which
hasn't been directly observed in this project (this sandbox has no
Vercel deploy access). The founder should check the Deployments tab
for the commit that introduced `maxDuration = 300` and confirm whether
it (and everything after it) actually built successfully or failed.

## Server-to-client function props on auth pages

**Root cause of the reported "sign in"/"sign up"/"create family account"
server-side exceptions** (digest `4195642915`, seen on the live app for
all three): `sign-in/page.tsx`, `sign-up/page.tsx`, and
`family/sign-up/page.tsx` are Server Components, and each passed a
render-prop function as `children` to `AuthMethodTabs`, a `'use client'`
component: `<AuthMethodTabs>{(method) => method === 'email' ? <A/> :
<B/>}</AuthMethodTabs>`. Functions aren't serialisable across the
Server→Client Component boundary — Next.js throws a server-side
exception the moment it tries to send that prop to the client, which is
exactly the generic "Application error: a server-side exception has
occurred" the founder saw with no further detail. This was introduced
this session when phone-number sign-in/sign-up was added (each page
needed to add a second, phone, form alongside the existing email one).

**Fix**: `AuthMethodTabs` now takes `emailContent`/`phoneContent` as
plain `ReactNode` props instead of a function — the caller still decides
what each tab renders, but by passing two already-built elements rather
than a function that builds them on demand. Passing a Server Component's
rendered element as a prop to a Client Component is fine (that's the
standard "pass Server Components as children" pattern); only passing a
*function* is not. All three call sites updated the same way. Confirmed
with `next build`: all three pages now prerender successfully where they
previously would have failed the same way in production.

## Gender in the illustration prompt

**Bug reported by the founder**: story illustrations always rendered
the child character as male-presenting, regardless of the child's
actual pronoun on file. Story *text* was never the problem — the
caption/template system (`src/lib/domain/templates.ts`,
`src/lib/domain/pronouns.ts`) already renders every pronoun and
Arabic verb conjugation correctly from `children.pronoun`, confirmed
by a scan of `supabase/seed/templates.json` for hardcoded gendered
English words (found none). The actual bug was one level over: the
*image* prompt built in `buildIllustrationPrompt`
(`src/lib/providers/image/prompts.ts`) described the avatar's hair,
skin tone, outfit colour and accessory, but never told Gemini the
child's gender at all — so for any story generated from the avatar
config (no reference photo), Gemini had nothing to go on and
defaulted toward a boy-presenting character.

**Fix**: added `stories.pronoun_snapshot` (migration
`0018_pronoun_snapshot.sql`), a copy of the child's pronoun taken at
story-creation time — same reasoning as the existing
`avatar_config_snapshot` column: editing a child's pronoun later must
not change an in-progress or already-approved story's illustrations
mid-way through. Threaded through `createStory` → the job worker →
`GenerateImageRequest` → `GeminiImageProvider` → a new
`GENDER_DESCRIPTOR` map in `buildIllustrationPrompt` ('she' → "a
girl", 'he' → "a boy", 'they' → "a child"), which now opens the
avatar-config character description with e.g. "The child character is
a girl, with: ...".

**Deliberately left unchanged**: the reference-photo branch of the
prompt. A real uploaded photo already conveys the child's appearance
(including gender presentation) visually, so no text descriptor is
injected there — adding one would risk contradicting what Gemini can
already see in the photo itself. `MockImageProvider` needed no
changes; it never calls `buildIllustrationPrompt`.

## Arabic gender-agreement audit of the story templates

**The bug**: a founder-reported story ("Bisan", a girl, national day
theme) showed page 1 text reading "قالت بيسان **وهو ينظر** إلى
الأعلام" — "said Bisan while **he** looks at the flags" — a masculine
pronoun/verb for a female child. The existing token system
(`{v:verb_key}` in `src/lib/domain/templates.ts`, backed by
`ARABIC_CONJUGATIONS` in `src/lib/domain/pronouns.ts`) already handles
this correctly *when a template uses it* — the bug was that this one
phrase, and many others across the other five themes, were typed as
literal Arabic text instead of a token, so they silently defaulted to
whatever gender the original author typed and never varied with the
child's actual `pronoun`.

**Scope of the audit**: grepped every Arabic `text`/`synopsis` field in
`supabase/seed/templates.json` for hardcoded gendered verbs, pronouns,
and possessive suffixes referring to *the child* (not the mascot, who
is always female and correctly hardcoded feminine throughout, and not
third parties like "the teacher" or "the sugar bugs" whose own fixed
gender doesn't depend on the child). Found roughly 30 such instances
across all 6 themes — this was a systemic gap, not a one-off. Two
related latent bugs turned up during the same pass and were fixed
alongside it:
- Several lines reused the `{v:said}` token (which conjugates by the
  *child's* pronoun) for a sentence whose actual speaker was the
  mascot or the teacher — always female, so this would have rendered
  wrong ("he said") for any male child. Replaced with the literal
  "قالت" where the fixed-gender character is the one speaking.
- A couple of `{v:tried}`/`{v:said}` tokens were reused for the wrong
  *meaning* entirely (e.g. "sang softly" and "showed a toy" were both
  written as `{v:said}`) — fixed to use the correct verb.

**The fix, two parts**:
1. Extended `ARABIC_VERB_KEYS`/`ARABIC_CONJUGATIONS` in
   `src/lib/domain/pronouns.ts` with ~35 new verb/phrase keys (e.g.
   `while_looking`, `stood`, `told`, `felt_grateful` reuse, etc.),
   each with a she/he/they form.
2. Added a new `{ps}` token (`ARABIC_POSSESSIVE_SUFFIX` +
   `ARABIC_POSSESSIVE_TOKEN` in `templates.ts`/`pronouns.ts`) for the
   attached possessive/object suffix ("his"/"her"/"their", or
   "him"/"her"/"them" on a verb — the same three suffixes cover both
   in MSA). It fuses directly onto a word stem with no space, e.g.
   `"عائلت{ps}"` → `"عائلتها"` for a girl, so a template author never
   has to spell out a whole new word for something as simple as "her
   family" vs "his family".

Then rewrote every affected line in `supabase/seed/templates.json` to
use tokens instead of literal gendered text, and re-verified by
rendering all 6 Arabic themes for she/he/they and reading every line
(the existing `tests/unit/seed-templates.test.ts` only checks for
*leftover* tokens, not correct grammar, so this needed an eyes-on pass
— which itself caught two mistakes introduced while writing the fix: a
doubled "لم لم" negation, and one missed hardcoded masculine verb —
both corrected before this landed).

**Deliberately left unfixed**: `hand_washing`'s Arabic synopsis
("يصبح {child_name} و{mascot} بطلَي الفقاعات...") has a *number*
agreement mismatch (singular verb with a two-person subject) — a
separate class of error from what was reported, lower-visibility
(synopsis copy, not a page a family reads), and fixing it correctly
needs dual-form conjugation this file doesn't otherwise use. Left as a
known follow-up rather than risking a rushed fix to something nobody
reported.

**Follow-up: fixing every already-generated Arabic story, not just
new ones.** A story already generated before this change keeps its
old, wrong `story_pages.text` — and for Arabic, that wrong text is
also already baked into the illustration's pixels (Gemini is asked to
render the exact caption directly into the image itself; see "Arabic
captions baked into the illustration" above), so correcting the text
column alone would leave the picture still showing the old wrong
caption. Two changes:
- `regeneratePageAction` (`src/lib/actions/stories.ts`) now
  re-renders the page's caption from the *current* live template
  before queueing the image job, instead of reusing whatever text was
  stored at the story's original creation time — so "Regenerate this
  page" self-heals a page against future template fixes too, not just
  this one. Best-effort: any lookup failure falls through to
  regenerating with the existing text rather than blocking the action.
- Added `scripts/resync-arabic-story-text.ts`
  (`npm run resync-arabic-story-text`, dry-run by default, `--apply`
  to write) — a one-off migration that does the same recompute-and-
  compare across *every* Arabic story, not just one page at a time,
  and queues a re-generation job for each page whose text actually
  changed. Reports an estimated regeneration cost before anything is
  applied, since each queued job costs real money once a worker picks
  it up (if real, non-mock generation is on) — see
  `docs/NEEDS_FROM_ME.md` item 9a for the exact commands.

**What this is not**: a substitute for the native Arabic review this
repo has flagged as outstanding since the start (see
`docs/NEEDS_FROM_ME.md` item 9). This audit fixes an objective,
mechanical class of error — wrong grammatical gender — using ordinary
Modern Standard Arabic conjugation rules; it is not a substitute for a
native speaker's judgment on phrasing, idiom, or tone.

## Not yet built (explicitly out of scope for this build session)

- Vendor moderation integration for image safety checks
  (`VendorModerationSafetyChecker` — needs a chosen moderation vendor;
  `RealImageProvider`'s safety-check hook point exists and Gemini image
  generation itself is wired up, see "Real image generation: Google
  Gemini" above).
- Actual Stripe test-mode keys, price IDs, and coupon records — the
  checkout/portal/webhook code is fully implemented (see "Phase 3
  additions" above) but has never made a real network call to Stripe
  since no account exists yet.
- Owner impersonation tooling with mandatory audit trail.
- Email delivery (gift codes are shown on-screen/in-URL only, not
  emailed — no transactional email provider is configured; see
  "Phase 4: gifting" above and `docs/NEEDS_FROM_ME.md`).
- Native mobile apps, push notifications, print-fulfilment integration
  (still genuinely Phase 4 territory — family accounts and gifting,
  the web-buildable parts of Phase 4, are now scaffolded; these three
  need a native app project, push credentials (APNs/FCM), and a print
  vendor contract respectively, none of which exist yet).
