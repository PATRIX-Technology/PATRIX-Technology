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

**Owner MFA is mandatory, not optional.** `getMfaStatus()`
(`src/lib/domain/mfa.ts`, renamed from the owner-specific
`checkOwnerMfaGate` once a second, optional caller for regular users
was added — see "Optional-but-recommended MFA for regular users") uses
Supabase Auth's built-in TOTP factor + Authenticator Assurance Level
(AAL) rather than a bespoke 2FA scheme. `/owner` (and every future
owner-only route) must call this and treat `needs_enrollment` as a hard
block before rendering anything: no factor enrolled → redirect to
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
consent to Ownly and its AI illustration provider (Google Gemini)
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

## Fixing every already-generated Arabic story, live

Applied the above template fix and the resync logic directly against
the founder's production Supabase project (via the Supabase MCP
connector, once the founder connected it) rather than only shipping
the tooling and waiting for someone to run it. Findings from the real
data, not just the design:

- All 8 Arabic story templates were updated live to the corrected
  content. Of the founder's 13 already-generated Arabic stories (52
  pages), 37 pages had the wrong-gender text and were corrected;
  their `story_pages.text` was rewritten to the correctly-gendered
  version and each was re-queued as a `GENERATE_PAGE_IMAGE` job — see
  "Arabic captions baked into the illustration" above for why the
  image itself, not just the text, has to be redrawn.
- Some of these stories used the child's Latin name ("Hala") baked
  into Arabic prose instead of her Arabic name ("بيسان"), because
  `arabic_first_name` didn't exist on her child record yet at the
  time those specific stories were generated (see "Arabic name field
  for children"). The resync deliberately detected and preserved
  whichever name each story's own already-rendered text used (by
  checking which name string appears in its own page 1), rather than
  blindly re-rendering every story with the child's *current* name —
  fixing the reported grammar bug should not silently rename a
  character in an unrelated story as a side effect.

## Stale RUNNING job reclaim (the real cause of partial generation)

While pulling the live data above to compute what needed fixing, found
21 `story_jobs` rows stuck in `RUNNING` status for hours — orphaned by
the exact Vercel-function-timeout scenario described in "Defending
against a mid-generation function timeout" above: a worker claims a
job (moves it to RUNNING), the function gets killed mid-Gemini-call,
and nothing ever moves that row anywhere else, because
`claim_next_story_job()` only ever looks at `QUEUED` rows — a `RUNNING`
row is invisible to it forever. This is almost certainly the real
mechanism behind "it takes a lot of time... sometimes generates 2 or 3
only": a story's remaining pages were queued behind a page whose job
got permanently stuck, with nothing to ever un-stick it.

**Fix**: `reclaim_stale_story_jobs()` (migration
`0020_reclaim_stale_story_jobs.sql`), called at the top of
`runWorkerOnce()` on every invocation. A `RUNNING` job whose
`claimed_at` is older than 5 minutes gets put back to `QUEUED` for an
immediate retry (if it has attempts left) or marked `FAILED` with the
same cascade to its page/story that `handleJobFailure()` already does
(if attempts are exhausted). Applied directly to the live database and
run once immediately, which reclaimed the 21 stuck jobs.

## Arabic name is required, not a silent fallback

**Decision: `createStoryAction` now refuses to create an Arabic story
for a child with no `arabic_first_name` on file**, instead of silently
falling back to their Latin name (`src/lib/actions/stories.ts`). The
founder asked explicitly: Arabic stories MUST use the Arabic name,
English stories MUST use the Latin name, no exceptions. The fallback
was the exact mechanism that put "Hala" (a child's old Latin name)
into several already-generated Arabic stories, mid-sentence in Arabic
prose, before her Arabic name was ever added to her profile — a real
instance found while investigating the Arabic gender-agreement bug.
English story creation was never affected (it only ever reads
`first_name`), so this only tightens the Arabic path. The error
message names the child and says exactly what to do (e.g. "Hala needs
an Arabic name on file before an Arabic story can be created").

`regeneratePageAction`'s own best-effort text-refresh (added for the
gender-agreement fix above) deliberately keeps its softer fallback
rather than adopting this hard block — it's re-rendering an *existing*
page, not creating a new story, and failing a regeneration outright
over a still-missing Arabic name would be a worse outcome than
leaving that one page's text unchanged. In practice this fallback
should no longer trigger for real, since story creation itself now
guarantees the Arabic name exists before any Arabic story — including
this one child's own already-existing "Hala" stories, fixed
retroactively the same way as the gender-agreement bug (see
`docs/NEEDS_FROM_ME.md` if any founder action was needed).

## Reclaim must not burn a job's retry attempts

**Found live, while actually draining the backlog rather than just
building the reclaim mechanism**: `reclaim_stale_story_jobs()`
(migration 0020) incremented `attempts` on every reclaim, on the
reasoning that eventually a truly broken job should stop retrying
forever. In practice, under a real backlog, a job can get claimed
right before one 60-second batch's Vercel limit, get orphaned,
reclaimed, claimed again right before the *next* batch's limit, and
so on — burning through all 4 attempts purely from unlucky timing,
with `max_attempts` reached before the job ever got a real chance to
actually run to completion. Confirmed live: exactly this happened to
one page, permanently `FAILED` with no real generation error behind
it at all.

**Fix** (migration `0021_reclaim_should_not_burn_attempts.sql`):
reclaim now only resets `status`/`claimed_at`/`next_retry_at` and
leaves `attempts` untouched. Being orphaned by an infrastructure
timeout is not the job's fault, so it no longer costs a retry — only
a real failure inside `generatePageImage()` itself (handled by
`handleJobFailure()`, unrelated to reclaim) can now exhaust a job's
attempts and mark it permanently `FAILED`. A job keeps getting
reclaimed and retried until it actually runs, for real, at least
once. Applied live and manually re-queued the one page this had
already wrongly failed.

## Story titles must use the template's real title, not the raw theme_key

**Bug**: every place a story's title was shown to a real user — the
story detail page, the stories list, a child's own story list, and
the printed/downloaded PDF itself — displayed `story.theme_key.replace
(/_/g, ' ')` (e.g. `"national_day_gratitude"` → `"national day
gratitude"`) instead of the template's actual title
(`story_theme_templates.title`, e.g. `"Colours of Gratitude"` /
`"ألوان الشكر"`). Two problems at once: the raw key is always English
regardless of the story's own locale (so an Arabic story showed an
English title), and even when read as English it's lowercase snake
case, not a real title. The founder caught this from a live
screenshot showing "Bisan — national day gratitude" on an Arabic
story.

**Fix**: every one of those four places now fetches the template row
for `(theme_key, locale)` and shows `template.title` — which is
already properly cased/localized content, no formatting needed on top
of it (see `supabase/seed/templates.json`: English titles are already
real title case like "The Rainbow Plate", Arabic titles are already
real Arabic like "ألوان الشكر"). Falls back to the old
snake-case-to-spaces behaviour only if a template row is somehow
missing, so nothing renders blank. Same pass also fixed the story
detail page's header to show the child's Arabic name for an Arabic
story (it was reading only `first_name`, same class of bug as
"Arabic name is required, not a silent fallback" above) — the PDF
export path already had this right, so it was the pattern to copy.
The theme-picker's redundant snake_case caption (the real title was
already shown right above it) was removed rather than fixed, since it
added no information and was never correctly localized either.
Left the owner-only admin page's raw theme_key alone (
`src/app/[locale]/owner/page.tsx`) — that's an internal template
management list showing which specific template needs native review,
not a title a nursery or family ever sees.

## No diacritics and no stray text in the Gemini-baked Arabic caption

Founder feedback: Gemini was adding tashkeel/harakat (fatha, damma,
kasra, shadda, tanwin — Arabic vowel marks) to the caption it bakes
into Arabic illustrations, and was liable to add other stray text on
objects in the scene (the reported example: a "test"-like word showing
up somewhere in the image) that has nothing to do with the child, the
words, or the story. Neither behaviour was explicitly forbidden in
`buildIllustrationPrompt()` (`src/lib/providers/image/prompts.ts`) —
the prompt asked for "real printed book typography" (which, for a
children's book, plausibly reads to the model as "add the vowel marks
early readers use") and only forbade extra text for English pages, not
Arabic ones. Fixed by explicitly telling Gemini, for every locale: (1)
reproduce the caption in plain undiacritized script exactly as given,
with tashkeel/harakat explicitly named and forbidden; (2) render no
other text, letters, numbers, logos, or writing anywhere else in the
image — no signs, labels, book covers, clothing text, or watermarks —
for both Arabic (beyond the one caption band) and English (which
already forbade a caption, but not incidental object text). This is a
prompt-only change — Gemini can still ignore instructions on any given
generation, so it reduces rather than guarantees against both failure
modes; there's no code-side way to verify or strip diacritics or stray
text from an already-generated raster image.

## PDF download crashing for every Arabic-named child

Reported live: "not able to download pdf" on an otherwise fully
GENERATED, APPROVED Arabic story. The generic error toast made this
impossible to diagnose from the outside, so the first fix was making
`DownloadButton` surface the server's real error message instead of a
one-size-fits-all string (that first attempt itself shipped with a
bug — it built the real message but the `catch` block still displayed
the hardcoded generic text; fixed in the very next commit). With the
real message visible, the actual cause was immediate: "Cannot convert
argument to a ByteString because the character at index 22 has a
value of 1576 which is greater than 255" — 1576 is U+0628, the Arabic
letter beh. `Content-Disposition: attachment; filename="بيسان-....pdf"`
was being set directly; HTTP header values must be Latin1, so
constructing the response threw *after* rendering, preflight, and the
storage upload had all already succeeded — this had nothing to do
with images, fonts, or PDF geometry, all of which the earlier
investigation had (correctly) ruled out. Added
`src/lib/http/content-disposition.ts` (`contentDispositionHeader()`):
an ASCII-safe `filename="..."` fallback alongside the real Unicode
name via RFC 5987's `filename*=UTF-8''...`, used by both the
single-story PDF route and the whole-tenant ZIP export (which
previously avoided the crash only by silently stripping non-ASCII
names to underscores via `sanitizeFileNamePart` — same bug class,
just non-fatal). `DownloadButton` now reads `filename*` first so the
saved file keeps its real name. Regression-tested in
`tests/unit/content-disposition.test.ts`, since any future
`Content-Disposition` header built by hand from an unescaped
user-facing string will hit the exact same class of bug the moment
that string contains anything outside Latin1 — not just Arabic.

## Referral program replaces gifting

Founder decision: replace the gift-purchase/redemption feature (buy a
story-credit pack for someone else, they redeem a code) with a
referral program — any existing tenant can invite people to subscribe,
and is rewarded with free stories once the invitee's subscription
first goes active. Chosen over gifting because it drives new paying
signups directly rather than moving story credits between two people
who may already both be customers.

Not to be confused with `docs/en/pricing.md`'s "Nursery Partner
Program (referral commission)" — an already-documented but genuinely
**not built** idea for a nursery-specific cash commission (paid via
Stripe Connect or manual tracking) when a family subscribes through
that nursery's link. This feature is a different, simpler mechanic
that IS built: any tenant (nursery or family) invites any other, and
the reward is free stories credited to the referrer's own quota, never
cash. The two could coexist later; this session only built the
stories-based one.

Reward size **matches the invitee's plan allowance** (their
`plans.stories_per_month`) rather than a flat number — inviting someone
into Network naturally earns more than inviting them into Starter,
with no separate table of reward tiers to keep in sync as plans
change. The reward is **one-time, on first successful checkout only**:
`reward_referral()`'s `where status = 'pending'` guard means a later
upgrade or renewal checkout for the same invitee is a no-op, since
their referral row already flipped to `'rewarded'`. This mirrors the
same additive-credit pattern gifts used (`quotas.stories_included_this_period
+= reward_stories`) and inherits the same known limitation: a tenant's
next real plan checkout calls `sync_quota_to_plan()`, which *overwrites*
`stories_included_this_period` rather than adding to it, so an earned
referral bonus can get wiped out by the referrer's own next
subscription cycle. Pre-existing behaviour (gifts had the exact same
issue), not something this feature introduces — flagging it here
rather than silently carrying it forward.

Implementation, deliberately decoupled from tenant creation itself:
- `tenants.referral_code` — a short, unique, shareable code generated
  by a new `before insert` trigger (`generate_tenant_referral_code`),
  not threaded through `create_tenant()`/`create_family_tenant()`'s own
  signatures. Lower risk than changing either function, since referral
  bookkeeping now has zero coupling to how a tenant gets created.
- `record_referral(referral_code_used, new_tenant_id)` — called right
  after tenant creation from all four sign-up action functions (email
  × phone, nursery × family). A silent no-op for an empty/unknown code
  or a self-referral; `invitee_tenant_id unique` on the `referrals`
  table means a tenant can only ever be referred once.
- `reward_referral(target_tenant_id, target_plan_id)` — called from
  the Stripe webhook's `checkout.session.completed` handler, right
  after `sync_quota_to_plan`. `service_role`-only, mirroring
  `sync_quota_to_plan` (0016) exactly.
- `get_referral_summary(target_tenant_id)` — backs the invite page
  (see below). Points the shareable link at whichever sign-up flow
  (`/sign-up` or `/family/sign-up`) matches the referring tenant's own
  type, since that's realistically who they're inviting.

The `?ref=CODE` query param is read server-side on both sign-up pages
and threaded into each sign-up form as a hidden field — for the
phone-OTP flows specifically, only into the second (verify/create)
step's form, since that's the only step that actually creates a
tenant.

**Follow-up (same session): promoted from a settings card to a
persistent, highlighted nav destination.** Founder feedback: this is a
growth lever, so it should be visible everywhere, not buried in
Settings behind a click. Moved the whole thing to its own page
(`src/app/[locale]/(dashboard)/dashboard/invite/page.tsx` — the link
box, a 3-step "how it works" explainer, and stats) and added a 🎁
gift-icon nav item in `DashboardNav`, styled apart from the plain nav
list (gold/saffron background, not the lagoon-tinted active state the
other links use) and placed right under the tenant name header so
it's the first thing visible on every dashboard page regardless of
which one is active. Deleted `InviteFriendsCard.tsx` and
`src/lib/actions/referrals.ts` (the settings-card version and its
client-side fetch action) in favour of the page fetching
`get_referral_summary` directly, server-side, and handing the
referral code + a server-known `NEXT_PUBLIC_APP_URL` down to a leaner
client component (`InviteLinkBox`) that only handles the copy button.
That `appUrl`-as-prop choice isn't cosmetic: building the invite URL
from `window.location.origin` at render time would read `undefined`
during SSR and the real origin during client hydration — a hydration
mismatch — so the app URL has to come from the server, not `window`.

No real gift was ever purchased (Stripe has never gone live), so
removing the `gifts` table, `redeem_gift()`, and `get_gift_status()` in
the same migration (`0022_referrals_replace_gifts.sql`) was a clean
drop, not a data migration. Deleted alongside it: `/gift`,
`/gift/redeem/[code]`, `/gift/success`, `GiftPurchaseForm`,
`RedeemGiftButton`, `RedeemGiftCodeForm`, `GiftSuccessStatus`,
`src/lib/domain/gifts.ts`, `src/lib/domain/gift-tokens.ts`,
`src/lib/actions/gifts.ts`, `src/app/api/gifts/checkout/route.ts`, and
`tests/integration/gift-redemption.test.ts` (replaced by
`tests/integration/referrals.test.ts`). `docs/HANDOFF.md` and
`docs/ar/HANDOFF.md`'s Phase 4 sections are left as the historical
record of what a prior session built, marked superseded rather than
rewritten.

## Story template suggestions

Founder-requested feature: a "💡 Suggest a story idea" button on the
Stories page, for any nursery or family to propose a new habit/topic
for a future story theme. Two deliberately separate halves:

1. **Durable record** — always saved to a new
   `story_template_suggestions` table (migration 0024) via plain RLS
   policies, no SECURITY DEFINER RPC needed: a tenant member can
   insert only for their own tenant and as themselves
   (`submitted_by = auth.uid()`), can select their own tenant's rows,
   and the platform owner can select and update every tenant's rows
   (to move a suggestion from `'new'` through `'reviewed'` /
   `'added'` / `'declined'` — set manually via SQL for now, same
   "founder does it by hand, no admin UI" call as
   `stories.is_platform_sample` in migration 0019). This is the
   record that can never be lost, whatever happens to the WhatsApp
   step below.
2. **Optional WhatsApp fast-path** — after a successful save, the
   dialog (`src/components/stories/SuggestTemplateDialog.tsx`) shows a
   "Send on WhatsApp" button built from `whatsappLink()`
   (`src/lib/config/contact.ts`, the same +971 55 599 0694 number
   already used by the Contact page), pre-filled with the topic,
   description, and the submitter's tenant/name. **This is a `wa.me`
   link the submitter taps themselves — not a message this app sends
   on its own.** There is no WhatsApp Business API integration here
   (Meta Cloud API or Twilio, needing a verified business account, API
   keys, and per-message cost — a founder-side setup step, not
   something to wire up without those credentials), so a one-tap
   pre-filled link is the only zero-setup way to land a message on the
   founder's *personal* WhatsApp. Told to the founder plainly rather
   than silently building something less automatic than what was
   asked for.

Intentionally *not* built: the suggestion never becomes a template on
its own. The founder reviews suggestions (via Telegram, the Owner
dashboard, and/or a direct `select * from story_template_suggestions
order by created_at desc` in Supabase) and, for any he wants to run
with, brings it to a session for the actual template-building work —
writing the page-by-page story content, choosing art direction,
Arabic native review, etc. — the same way every existing theme was
built.

## Telegram notifications for story suggestions

Follow-up (same session), founder feedback: "other than whatsapp
please do the best... if there's any better than having another
whatsapp api costs." The `wa.me` tap-to-send link built above has a
real gap — it only reaches the founder if the submitter actually taps
through, so it's not a substitute for an automatic notification. A
real WhatsApp *Business* API integration (Meta Cloud API or Twilio)
would close that gap, but needs a verified business account and costs
per message — not something to set up on spec.

**Telegram's Bot API was the better answer**: free forever (no
per-message cost, no business verification, no approval process),
and setup is a five-minute chat with `@BotFather` rather than a vendor
onboarding — see `docs/NEEDS_FROM_ME.md` "Before the story-idea
Telegram notification works" for the exact steps given to the
founder. `src/lib/notifications/telegram.ts`'s `sendTelegramMessage()`
posts to `https://api.telegram.org/bot<token>/sendMessage`, is a
silent no-op when `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` aren't set
yet, and swallows any send failure — same "never let a notification
failure break the feature it's attached to" rule as the WhatsApp link
and every other best-effort side effect in this codebase (referral
recording, etc.). Called from `suggestStoryTemplateAction` right after
the database insert succeeds, alongside (not instead of) the existing
WhatsApp button — a submitter who prefers WhatsApp can still use it;
the Telegram message is what actually guarantees the founder hears
about it without depending on that tap.

Also added, same feedback: a "Story idea suggestions" card on the
Owner dashboard (`src/app/[locale]/owner/page.tsx`) listing every
suggestion across every tenant (topic, description, who submitted it,
when), with a status dropdown (`SuggestionStatusControl`, calling the
new `updateSuggestionStatusAction`) so the founder can mark one
reviewed/added/declined from the app instead of writing SQL by hand.
This is a durable, zero-cost fallback that works even if the Telegram
bot is never configured or a notification is missed — the database
row this whole feature is built on was always the source of truth;
this just makes it visible without SQL.

**Follow-up (same session): parked, not pursued further.** The
founder created the bot (`@TooniX_Bot`) and its token is set in
Vercel, but getting `TELEGRAM_CHAT_ID` stalled — Telegram wasn't
responding to any bot on his account, `getUpdates` kept returning no
results even after sending messages, and a separate well-known bot
(`@userinfobot`) got no response either, which points at something
account/client-side on his end rather than anything this app could
fix. Once he understood the WhatsApp links here were never the paid
Business API (see above — plain `wa.me` click-to-chat, free forever),
the automatic-notification gap Telegram was meant to close stopped
mattering enough to keep troubleshooting: "let's stay whatsapp then."
`TELEGRAM_BOT_TOKEN` stays in Vercel, unused and harmless
(`sendTelegramMessage` no-ops without `TELEGRAM_CHAT_ID`, which was
never set) — a five-minute finish if he ever wants to revisit it, not
something to bring back up unprompted.

## Invite link shares to WhatsApp/Telegram/Email in one tap

Founder feedback, after noticing the invite link on the new page was
just a plain copy-box: "I believe the much better that to click
directly on it then will open for them the communications apps like
whatsapp, email, messanger, telegram." `InviteLinkBox` now has a
primary "Share invite" button that calls the Web Share API
(`navigator.share({ title, text, url })`) — the browser hands off to
the device's own native share sheet, showing whatever the person
actually has installed (WhatsApp, Messenger, Telegram, Mail, SMS,
AirDrop, etc.) with zero per-app integration code. This is exactly
the "one tap, pick an app" flow asked for, and it's the only way to
cover an arbitrary, per-device set of apps (including Messenger,
which has no public web-share link that works without a registered
Facebook App ID — not worth building given Web Share already covers
it on any phone with Messenger installed).

Web Share needs a real user gesture and HTTPS (both true for a button
click on the deployed app) and isn't supported on every desktop
browser (notably Firefox) — there, `handleShare()` falls back to
copying the link instead of doing nothing. Alongside the Share button,
three explicit direct links (WhatsApp, Telegram, Email — the tools the
founder named) are always shown too via plain `wa.me` / `t.me/share` /
`mailto:` URLs, so the option is visible immediately rather than
hidden behind a share sheet that may not appear on every device. The
plain "Copy link" button from the first version stays as the
lowest-common-denominator fallback.

## Sign-in and sign-up now cross-link both account types

Founder feedback: "Inside sign in & sign up / Have both options /
Organization & also family account." Before this, the org sign-up
page never mentioned the family path at all (asymmetric with the
family sign-up page, which already linked back to org sign-up), and
the sign-in page only ever linked to org sign-up — there was no way
to reach family sign-up from sign-in, and the sign-in page's title
("Sign in to your organisation") wrongly implied it was org-only even
though the same page/form handles family accounts too.

Fixed by: (1) neutralising `auth.signIn.title` to just "Sign in"; (2)
replacing the sign-in page's single "Create one" link with two
explicit links — "Create an organisation account" and "Create a
family account"; (3) adding a "Create a family account instead" link
(with the referral code preserved in the URL) to the org sign-up
page; (4) translating the family sign-up page's previously hardcoded
English-only strings into a new `auth.familySignUp` i18n namespace
(en + ar), reusing `auth.signUp.haveAccount`/`signInInstead` for its
"already have an account" line instead of duplicating that text.

## Organisation/family switch became actual tabs, not stacked links

Follow-up founder feedback on the cross-linking above: "I need them
like tabs inside the sign in & sign up pages." Added a new shared
`AccountTypeTabs` component, styled to match the existing Email/Phone
`AuthMethodTabs` segmented control (same pill shape, same active-state
colour), and used it on all three auth pages:

- Org sign-up: "Organisation" tab active, "Family account" tab links
  to `/family/sign-up` (referral code preserved).
- Family sign-up: same control with "Family account" active.
- Sign-in: same control but with neither tab visually "active" —
  `signInAction` is identical regardless of account type, so there's
  nothing to switch; the tabs here are purely a styled way to jump to
  the right sign-up flow, replacing the two stacked plain-text links.

These are real `<Link>`s under the hood (not client-side state) —
org and family sign-up are separate routes with separate server
actions and forms, so a true single-page tab switch would mean
merging both forms' server actions into one page. Next.js client-side
routing between two adjacent routes is visually indistinguishable
from an in-page tab switch, so this gets the "like tabs" look asked
for without that merge. Removed the now-redundant
`auth.signUp.familyPrompt`/`familyLink`, `auth.familySignUp.orgLink`,
and `auth.signIn.createOrgAccount`/`createFamilyAccount` translation
keys the tabs replaced; added `auth.accountType.organisation`/`family`
(en + ar) as the tab labels.

## UAE National Day template: renamed, mascot swapped for a human character

Founder feedback: "Love story template of national day but name it as
UAE National Day & remove animals as not good to be like this!!!
(just people story please)." Two changes, scoped to the
`national_day_gratitude` theme only (not the platform-wide "Marya the
Fox" mascot used elsewhere — see "Mascot" in `docs/en/brand.md` — which
the founder didn't ask to change):

- Title renamed from "Colours of Gratitude"/"ألوان الشكر" to "UAE
  National Day"/"اليوم الوطني لدولة الإمارات" (the official Arabic
  term for the day, not a literal word-for-word translation).
- Mascot swapped from "Marya the Fox"/"ماريا الثعلبة" to "Grandma
  Amal"/"الجدة أمل" — a human grandmother figure fits a story about
  family/community gratitude better than an animal anyway. The two
  page `image_prompt`s that hardcoded "cartoon fox mascot" /
  "الثعلب الكرتوني" as literal text (rather than the `{mascot}` token)
  were rewritten to describe the new human character instead.

Updated `supabase/seed/templates.json` (the source of truth for future
seeds) and the live `story_theme_templates` rows for both locales
directly via the Supabase MCP connector, same pattern as "Fixing every
already-generated Arabic story, live" above. Also found one
already-generated, already-approved Arabic story on this theme (child
"بيسان", tenant "test") whose page 2 and page 4 text/image_prompt still
said "ماريا الثعلبة"/"الثعلب الكرتوني" with the fox already baked into
the generated illustrations — this is almost certainly the story that
prompted the complaint. Rewrote both pages' text/image_prompt to the
new grandmother wording, reset their `image_status` to `QUEUED`, and
queued fresh `GENERATE_PAGE_IMAGE` jobs so the existing GitHub Actions
cron (`.github/workflows/story-worker-cron.yml`, every 5 minutes)
regenerates the actual illustrations without the fox. Pages 1 and 3
never mentioned the mascot, so left untouched to avoid burning
generation cost on images that don't need to change.

The template stayed `native_review_status = 'reviewed'` rather than
resetting to `draft` — this was a small, mechanical edit (an official
proper noun and an animal-to-human swap), not new free-form prose, but
per "Arabic content gating" above it's still not a substitute for an
actual native speaker reading it.

## Staff invites: real accounts via a shareable link, not email

Founder feedback: "Let when someone registered to be tied with their
subscription as well" — clarified via a follow-up question to mean
staff invites specifically, since every *tenant* sign-up (nursery or
family, email or phone) was already confirmed to create a
`subscriptions` row atomically (see "Tie every new tenant to a
subscription row at signup"). Staff invites were the real gap:
`inviteStaffAction` only ever wrote an `audit_logs` row saying "recorded
for later" — no real login was ever created, because Supabase Auth's
`auth.admin.inviteUserByEmail` needs SMTP configured on the project (a
founder setup step), and that was never wired past the stub.

Rather than add that SMTP dependency, this reuses the shareable-link
pattern already established for consent requests and referral invites:
a new `staff_invites` table stores a `token_hash` (sha256 of a random
24-byte token — same trust model as `consent_requests.token_hash`,
raw token never persisted); the owner gets a link built from the raw
token and shares it themselves (WhatsApp, email, in person — their
choice, `InviteStaffForm` shows a copy button + a `wa.me` link);
the invited person visits `/staff/accept/[token]` (public,
unauthenticated — `get_staff_invite_info` is a SECURITY DEFINER RPC
granted to `anon`, same shape as `get_consent_request_info`), sets
their own password, and `accept_staff_invite` (SECURITY DEFINER,
`authenticated` only) adds them to `tenant_members` on the **inviting
tenant** with the invited role. This deliberately never calls
`create_tenant`/`create_family_tenant`, so no new tenant and no new
subscription get created — the whole point is joining the existing
one. `accept_staff_invite` checks the authenticated account's email
against the invite's email (case-insensitively) before accepting, so
someone else can't grab a forwarded link and join under their own
account; it also enforces the invite's 14-day expiry and refuses a
second acceptance once a token has already been used.

An invite that requires email confirmation (a Supabase Auth project
setting) is handled the same way `signUpAction` already tolerates it:
`auth.signUp()` without an immediate session just tells the person to
confirm their email and revisit the same link — the invite stays
`pending` until `accept_staff_invite` actually runs, so nothing is
lost either way.

The staff page now also lists pending (not yet accepted) invites in
the members table with a "pending" badge, so the owner isn't left
wondering whether anything happened after inviting someone.

Verified against the live Supabase project directly (via the
connector): inserted a real `staff_invites` row for the founder's
"test" tenant, confirmed `get_staff_invite_info` correctly returns the
tenant name/role/email/status for the right token and `found: false`
for a garbage one, then deleted the row. Full acceptance wasn't
smoke-tested live (that would mean creating a real `auth.users` row on
production) — covered instead by `tests/integration/staff-invites.test.ts`
(join-the-existing-tenant-not-a-new-one, email-mismatch rejection,
expiry, double-acceptance, RLS isolation), which exercises real
Postgres RLS the same way `tests/integration/referrals.test.ts` does,
though it can't run in this sandbox (no local Postgres — same
pre-existing limitation as every other integration test here).

## Suggest-a-story-idea now also reachable from a child's own page

Founder feedback: "Create story idea/اقترح فكرة قصة to have it also in
child page under the list of the templates." `SuggestTemplateDialog`
previously only appeared once, at the top of the Stories list page.
Added the same component directly below the template picker
(`CreateStoryForm`) on a child's own detail page — a sibling of the
form, not inside its `<form>` element, since the dialog's own trigger
button defaults to `type="submit"` without an explicit override (fixed
that too, defensively, since it's now used in more places). Already
fully bilingual — the underlying `stories.suggestIdea*` translation
keys were added when this feature first shipped and needed no changes.

## "Add Child and Start The Story!" CTA on the dashboard home tab

Founder feedback, verbatim, for the button text. Added as a prominent
button right under the welcome heading on the dashboard "Home" tab,
for both nursery and family tenants, linking to `/dashboard/children`
— the fastest path from "just logged in" to actually creating
something, rather than requiring a detour through the nav.

## Landing page trust bar no longer says "Dubai"

Founder feedback: "Remove 'Dubai' word from landing page as will be
globally." The `marketing.trustBar` string was the only "Dubai"
mention in the app's UI (confirmed by grepping `src/`) — changed from
"Built for Dubai nurseries, schools, clinics and children's brands" to
"Built for nurseries, schools, clinics and children's brands
worldwide" (en) and the equivalent Arabic. Marketing/pitch documents
in `docs/` weren't touched — the founder's ask was specifically the
landing page.

## Fixed: signed-in users were losing their session and being forced to log in again

Founder feedback: "Needs to save cookies when login as well not when
close page to back login again." Cookies were never actually being
cleared — the real bug is a classic Supabase + Next.js SSR footgun.
Supabase's access token expires after an hour and is refreshed using a
refresh token that **rotates on every use**: the moment a new refresh
token is issued, the old one stops working. Server Components cannot
set cookies at all (a hard Next.js platform constraint — see the
`setAll` try/catch in `src/lib/supabase/server.ts`, which was already
silently swallowing this), and almost every dashboard page is a Server
Component calling `createSupabaseServerClient()`. So any time the SDK
refreshed the session while rendering one of those pages, the rotated
refresh token was computed in memory for that one request and then
simply discarded — never written back into the browser's cookie. The
next request replayed the now-dead old refresh token, Supabase's auth
server rejected it outright, and the whole session became
unrecoverable — not "expired", genuinely invalidated. That's why it
looked like closing the tab was the trigger: it's really "however long
it takes for one refresh to happen while browsing," which just
happens to often land around the point someone comes back after a
break.

`src/lib/supabase/server.ts`'s own comment already named the intended
fix ("middleware refreshes the session") but `src/middleware.ts` never
actually did this — it only ran next-intl's locale routing. Middleware
is the *only* place per request that can both read and rewrite cookies
before any Server Component renders, so it's the one reliable place
to keep the refresh in sync. Rewrote `src/middleware.ts` to run
next-intl's middleware first (to get the response it wants to return —
a locale redirect/rewrite or a plain pass-through), then create a
Supabase server client bound to that same request/response, call
`supabase.auth.getUser()` (which transparently refreshes if needed),
and write any resulting Set-Cookie headers directly onto next-intl's
response — so a locale redirect never drops a freshly rotated session.
This is the officially documented Supabase Next.js SSR pattern,
adapted to run alongside next-intl instead of replacing it.

Verified: type-checks and lints clean; a fresh dev server still
redirects `/` → `/en` correctly, still redirects an unauthenticated
`/dashboard` visit to `/sign-in`, and the middleware itself never
throws even when the Supabase auth call fails (this sandbox's network
egress allowlist blocks the dev server's *own* outbound calls to the
live Supabase project — same limitation hit earlier this session with
`get_staff_invite_info` — so a full sign-in-then-reload round trip
couldn't be exercised live here; the fix takes real effect once
deployed, where that restriction doesn't apply).

## Back button in the dashboard nav's corner

Founder feedback: "let's do back and front icons in the corners to be
easy" — clarified via a follow-up question to mean a single app-wide
back button in the top corner of every dashboard page, since the
Capacitor-wrapped mobile app (see "Mobile: Capacitor wrapper for
Android + iOS") has no browser chrome at all, so phone users otherwise
have no way to navigate backward.

Considered a `fixed`-position button floating over the whole
viewport, but `DashboardNav` already occupies that exact corner at
every breakpoint (a full-width top bar on mobile, a 256px-wide sidebar
on desktop) — a fixed overlay would either sit on top of the
logo/brand row or need breakpoint-specific offset math that breaks the
moment nav content wraps differently. Placed it inside `DashboardNav`
itself instead, as a small circular icon button directly before the
logo, so it's part of the existing layout flow rather than fighting it
for space — same visual "corner of the screen" result at every
breakpoint, with none of the collision risk. Calls `router.back()`
(plain browser/webview history, no app-specific target to maintain).
The chevron flips (`rotate-180`) for Arabic, matching the
already-established `rotate-90` precedent for the disclosure chevron
on the Stories page, so it visually points toward the "start" reading
direction rather than always pointing left regardless of locale.

## PDF download/share now hands over a real file, not a blob link

Founder feedback: "Make sure download pdf... to be able to download
as pdf format on the device" on Android/iPhone/Windows/Linux/macOS,
and "Share on whatsapp/meta/telegram etc. to be pdf file not 'blob
link'." `DownloadButton` (used for both the single-story PDF and the
bulk-ZIP export) previously always did the same thing regardless of
platform: fetch the file, wrap it in a `blob:` URL, and click a
hidden `<a download>`. That's solid on desktop Windows/macOS/Linux
browsers, but two real platform gaps prompted this:

- **iOS Safari in particular** often ignores the `download` attribute
  on a `blob:` URL and just opens the PDF inline in the browser's own
  viewer instead of saving it. If that viewer's own Share button gets
  used from there, what's on offer to hand to WhatsApp/Telegram is
  effectively that `blob:` reference — which only resolves inside the
  exact browser tab that created it, so it shows up as a dead/unopenable
  link the instant it leaves that tab. This is what "not blob link"
  was reporting.
- **Inside the Capacitor-wrapped native app** (see "Mobile: Capacitor
  wrapper for Android + iOS"), a WebView has no download manager hooked
  up the way a real browser does — the same `<a download>` trick
  mostly does nothing there at all.

`saveOrShareFile()` in `DownloadButton.tsx` now picks the mechanism
that actually works per platform, in order:

1. **`Capacitor.isNativePlatform()` (the native app, once built)** —
   write the bytes to disk with the newly added `@capacitor/filesystem`
   plugin (`Directory.Cache` — app-private, needs no storage
   permission on either OS) and hand the resulting real `file://` URI
   to `@capacitor/share`'s native OS share sheet. That sheet always
   offers "Save to Files" alongside WhatsApp/Telegram/Messenger/etc. —
   an actual file, never a link of any kind.
2. **A mobile browser with Web Share Level 2 file support** (iOS
   Safari 15+, Android Chrome) — `navigator.canShare({ files })` /
   `navigator.share({ files })` directly, bypassing `@capacitor/share`
   entirely for this tier since its own web fallback (checked in
   `node_modules/@capacitor/share`'s `ShareWeb.share()`) only forwards
   `title`/`text`/`url` to `navigator.share`, silently dropping
   `files` — using the Capacitor plugin here would have quietly
   regressed back to the exact bug being fixed. This also doubles as
   the iOS "real download": the resulting native share sheet's own
   "Save to Files" option is the standard way iOS hands a `File` to
   on-device storage; there is no blob-to-Downloads-folder equivalent
   to fall back to on that platform.
3. **Everywhere else** (desktop browsers without file-share support,
   older mobile browsers) — the original blob-URL-and-`<a download>`
   trick, unchanged, since it's well-supported there already.

Added `@capacitor/filesystem` and `@capacitor/share` (official
first-party plugins, same major version as the already-installed
`@capacitor/android`/`@capacitor/ios`/`@capacitor/core`) and ran
`npm run cap:sync`, which registered both in the Android Gradle build
and the iOS Swift Package Manager manifest — no manual native code
needed, and no new permissions: `Directory.Cache` and the native share
sheet both need none on either platform.

Verified in a real (non-mocked) Chromium instance via Playwright,
extracting the exact web-tier logic into an isolated test page: the
Web Share branch hands over a genuine `File` object (`instanceof
File` true, correct name/type/size, and — the actual point of the
fix — **no `url` field in the share payload at all**, only `files`),
cancelling the share sheet doesn't also trigger a duplicate download,
and the no-file-share-support case still falls through to the
original blob-download link. The native (tier 1) branch is
implemented against Capacitor's documented plugin API (its exact
shape confirmed by reading the installed packages' own type
definitions) but couldn't be exercised on a real device — same
sandbox limitation as the rest of the native build (no Android SDK,
no Mac/Xcode — see "What this sandbox could not do" in
`docs/en/mobile.md`); it takes effect once the native app is actually
built and installed.

## Fixed: PDF download still opened in-browser instead of saving, on a real phone

Founder feedback right after the previous fix, testing on a real
phone: "one phone when open the app on browser can view it on browser
when click it but not download it as pdf... I need it to be
downloaded as pdf for all mobiles phones & all OSs even windows etc."

That phone's browser evidently doesn't support the Web Share API's
file payload (`navigator.canShare({ files })` returns false or is
undefined there), which is exactly the tier the previous fix relied
on for mobile — so it fell through to the *original* blob-URL-and-
`<a download>` trick as tier 3, and that's precisely the mechanism
already flagged as unreliable on mobile browsers in the previous
entry. Root cause: a client-side-constructed `blob:` URL clicked via
a synthetic `<a>` is a JS *simulation* of a download, and different
mobile browsers/WebViews honour the `download` attribute on it
inconsistently — some just open the blob inline instead, which is
exactly "view it on browser... not download."

Replaced that fallback with `downloadDirectly()`: a genuine
`window.open(href, '_blank')` navigation straight to the real API
endpoint. `src/app/api/stories/[storyId]/pdf/route.ts` (and the
ZIP export route) already sets a real `Content-Disposition:
attachment` header on the actual HTTP response — with a *real*
network request hitting that header, the **browser's own native
download handling** takes over, the same way any plain download link
on any website works. That's a fundamentally different, far more
reliable path than reconstructing the bytes into a client-side blob:
it's what browsers are actually built to do for that header, not a
JS workaround approximating it — and it works identically whether
the OS is Android, iOS, Windows, macOS, or Linux, because none of
this depends on Web Share support at all.

Also restructured *when* the fetch-and-share path even runs: the
button now checks `canShare` up front, before any network request, and
skips straight to `downloadDirectly()` with no fetch at all when
sharing isn't available (most desktop browsers, and this phone) —
both because that fetch was pure waste when it was only going to be
discarded in favour of a direct download anyway, and because firing
`downloadDirectly()` synchronously, with no `await` ahead of it, means
it can never lose the browser's brief "user activation" window the
way an async fetch-then-share sequence risks (some browsers silently
refuse `navigator.share()` once that's expired — a second, subtler
way that path could have failed even where file sharing genuinely was
supported). The Web Share and Capacitor-native tiers from the
previous fix are otherwise unchanged, and now also fall back to this
same `downloadDirectly()` — rather than the old blob trick — if
`navigator.share()` itself fails for any reason other than the person
cancelling the share sheet.

Re-verified the full branch matrix in a real (non-mocked) Chromium
instance via Playwright: no-file-share-support now goes straight to
the direct-navigation download with zero fetch calls; Web Share
succeeding still hands over a real `File` with no `url` in the
payload; Web Share failing for a non-cancel reason now correctly
falls through to the direct download instead of silently doing
nothing.

## Sign-up names auto-capitalised — first letter of each word

Founder feedback: "family account once registered need first letter
to be Capital please & same for organization." Added
`capitalizeWords()` (`src/lib/domain/names.ts`) — capitalises the
first letter of each word, leaves the rest of every word untouched
(so an already-correctly-cased name like "McDonald" or "O'Brien"
never gets mangled), and is a harmless no-op on Arabic or any other
script with no case distinction, since `toUpperCase()` has nothing to
change there.

Applied it at all four places a name actually gets written into a
tenant/profile record — the point right before each RPC call, not
earlier, so what's stored is what matters, not just what's briefly
shown mid-flow:

- Org sign-up, email (`signUpAction`) and phone
  (`verifyNurserySignUpOtpAction`) — both `orgName` (the tenant's
  `tenant_name`) and `fullName` (`owner_full_name`).
- Family sign-up, email (`familySignUpAction`) and phone
  (`verifyFamilySignUpOtpAction`) — `fullName`, which also feeds the
  auto-generated `"{name}'s Family"` display name, so capitalising it
  once fixes both.

`tenantSlugFrom()` still runs on the *original* (non-capitalised)
`orgName` — it already lowercases everything itself for the URL-safe
slug, so this makes no difference there.

Checked the live database for existing lowercase tenant names to
consider backfilling them too — the three that matched (`test`,
`test22's Family`, `test nm2's Family`) are all this project's own
test/demo tenants from earlier in the build, not real customer
accounts, so left alone; the founder's ask was specifically about
sign-up going forward ("once registered").

## Fixed: the previous fix's own fallback stopped working entirely

Founder feedback right after that fix went live: "when click on
download now not even showing the pdf." A real regression — worse
than the bug it replaced.

The previous fix's fallback, `downloadDirectly()`, used
`window.open(href, '_blank', 'noopener,noreferrer')`. That's exactly
the kind of call many mobile browsers and in-app/WebView contexts
(Capacitor's included) either refuse outright as a popup or simply
have no capability to honour at all — there's no "tab" to open in a
single-WebView shell — in which case `window.open` just returns
`null` and nothing happens. Silent nothing is a worse failure mode
than the inline-viewer behaviour it was meant to fix.

Switched `downloadDirectly()` to a same-tab navigation instead —
`window.location.assign(href)`. This has no such requirement: every
browsing context that can display a page at all can navigate to a
URL, no exceptions, no popup blocker involved. And because the PDF/
ZIP routes already set `Content-Disposition: attachment`, the browser
recognises the response as a download and intercepts it *before*
actually replacing the page — the current page stays exactly as it
was in the success case, so this isn't even the tradeoff it sounds
like. The one real cost is the (rare) error path, where the response
is plain JSON with no attachment header and the tab genuinely
navigates to show it — recoverable now via the corner back button
added earlier this session, which didn't exist the first time this
exact approach was considered and set aside in favour of `window.open`.

Re-verified the branch logic (which tier gets used, in what order) in
a real Chromium instance via Playwright — unchanged from the previous
fix and still correct; `window.location.assign` itself is a standard
platform primitive, not something this app invented, so no further
verification of the navigation mechanism itself was needed.

## Dropped the Web Share files tier — iOS Safari's "Save to Files" from it just silently failed

Founder feedback on a real iPhone, tested right after the previous
fix: the PDF now opened, but choosing "Save to Files" from the share
sheet that came up didn't save anything at all — confirmed (asked
directly): nothing landed in Files > Downloads either. Not a UX
surprise this time, a genuine save failure.

That share sheet was `navigator.share({ files: [file] })` — the
browser-side tier from two fixes ago, meant to hand WhatsApp/Telegram/
"Save to Files" a real `File` object instead of a blob link. In
hindsight this was the wrong bet for reliability: iOS Safari's Web
Share Level 2 *file* support is still genuinely flaky across iOS
versions — "share sheet opens, Save to Files silently does nothing"
is a known, documented WebKit issue, not something fixable from this
app's own code. Two fixes in a row have now failed specifically
inside this "try to be clever about mobile file sharing" tier
(`window.open` for a new tab, then `navigator.share` for files),
while the plain `downloadDirectly()` fallback — a same-tab navigation
that lets the server's own `Content-Disposition: attachment` header
do the work — has held up in every real test so far.

Removed the browser-side Web Share tier entirely. Every non-native
browser, mobile included, now always uses `downloadDirectly()`
straight away, with no `fetch()` first (nothing left that needs the
file bytes client-side outside Capacitor). The Capacitor-native tier
is untouched — it writes bytes with `@capacitor/filesystem` and calls
`@capacitor/share`'s *native OS* share API directly, which is a
genuinely different, more controlled mechanism than the browser's
Web Share API and isn't implicated in this bug. Once a file is
actually saved via `downloadDirectly()`, sharing it to WhatsApp/
Telegram from Files/Downloads afterward works the same as sharing any
other real file — this app just no longer tries to shortcut that
into one JS-triggered action on the web, since that shortcut was the
thing breaking.

## A dedicated tab for tracking new story idea suggestions

Founder feedback: "I want tab to track new ideas." Story idea
suggestions (see "Story template suggestions") already had a card on
the owner dashboard, but it was buried halfway down one long
single-page dashboard alongside tenants, Arabic template review
status, and AI spend — nothing that actually let the founder jump
straight to "what's new" or see at a glance whether anything needed
attention.

Split the owner dashboard into two tabs via a new `OwnerTabs`
component (same segmented-pill styling as `AuthMethodTabs`/
`AccountTypeTabs` elsewhere in the app): "Overview" (everything else,
unchanged) and "Story Ideas" — its own page,
`src/app/[locale]/owner/suggestions/page.tsx` — with a live badge on
the tab itself showing how many suggestions are still `new`
(unreviewed), so that count is visible the moment the founder opens
either owner page, not just after clicking into the suggestions list.
The dedicated page sorts `new` suggestions to the top (then
`reviewed`/`added`/`declined` by recency within each), tags each
still-`new` row with its own badge, and reuses the existing
`SuggestionStatusControl` for changing status inline — same
mechanism as before, just given its own page instead of one card in a
long scroll.

Each of the two owner pages duplicates the same `is_platform_owner` +
MFA-gate check at its own top, rather than sharing a layout — a
shared `layout.tsx` under `src/app/[locale]/owner/` would also wrap
the sibling `/owner/mfa-enroll` and `/owner/mfa-challenge` pages,
which would then hit that same gate check and redirect to themselves.
Matches the duplication pattern the original single owner page
already used for this exact reason.

Verified against the live database: 2 suggestions currently sit at
`status = 'new'`, so the new tab's badge has something real to show
immediately rather than starting from zero.

## Story creation no longer waits on the worker before redirecting

Founder feedback: "when do generate story it doesn't automatically
refreshed the page and going to story to approve it." — confirmed as
a real, reproducible failure, not user error.

Root cause: `createStoryAction` used to `await runWorkerOnce(...)`
synchronously before returning `{ storyId }`, so the browser's
Server Action request stayed open for the full duration of real
Gemini image generation across however many pages the story has.
Live evidence from the GitHub Actions cron log
(`.github/workflows/story-worker-cron.yml`, which hits the same
worker via `/api/cron/worker` every 5 minutes as a safety net)
confirmed this actually times out under real load — a recent run
logged `Worker responded with HTTP 504` roughly 61 seconds after
starting, i.e. Vercel's Hobby-plan 60-second serverless function
ceiling. When the Server Action itself hit that ceiling, the
platform killed the request with no response at all, so the browser
never got a resolved `state.storyId` — and `CreateStoryForm`'s
`router.push()`, which only fires once `useFormState` resolves (see
"Client-side navigation instead of redirect() inside a
useFormState action" above), simply never ran. `unstable_after()`
was considered and ruled out: this app is on Next.js 14.2.15, which
doesn't have it.

Fix: `createStoryAction` and `regeneratePageAction` (in
`src/lib/actions/stories.ts`) no longer call `runWorkerOnce` at all —
they only insert the job row(s) and return/revalidate immediately, so
neither one can ever block on real provider latency again. Instead,
the story detail page itself
(`src/app/[locale]/(dashboard)/dashboard/stories/[storyId]/page.tsx`)
kicks the worker on its own Server Component render, whenever any of
its pages are still `QUEUED`/`GENERATING`, capped at 10 jobs per load
(smaller than the cron's batch of 25, so any one page load's own
share of the work stays modest) — then re-fetches the pages so the
render reflects whatever just finished. A slow run here just means a
slower page load, never a vanished response. Combined with
`AutoRefresh`'s existing 4-second polling (`router.refresh()` while
anything is still generating), this turns into a fast, incremental
worker-progress mechanism layered on top of the existing 5-minute
cron safety net, which still runs unchanged and still catches
anything nobody is actively watching.

## Rate limit on "regenerate this page"

Founder feedback, same message: "I want to limit the regenerating the
stories to don't have someone regenerating a lot" — each regeneration
is a real Gemini image call and therefore a real cost.

Added a server-side check at the top of `regeneratePageAction`, using
the existing `enforceRateLimit`/`RateLimitExceededError` infrastructure
in `src/lib/rate-limit.ts` (already used for auth/OTP/consent limits —
in-memory per-instance by default, or Upstash-Redis-backed across
instances if `RATE_LIMIT_REDIS_URL`/`RATE_LIMIT_REDIS_TOKEN` are set):
10 regenerations per signed-in user per rolling 10 minutes, keyed by
`regenerate:${userId}` — per user rather than per story/page, so
spreading clicks across different stories doesn't dodge it. Hitting
the limit surfaces as a normal action error via the existing toast,
not a crash. Also added a client-side `useFormStatus`-driven disable
on the regenerate button itself
(`src/components/stories/RegeneratePageButton.tsx`) so it can't be
double-clicked while a request is in flight — a UX nicety only; the
server-side limit above is the actual enforcement.

## Cap manual page regeneration per page and block it after approval

Follow-up founder feedback after the rate limit above: "I don't think
regenerate is a good thing right? it's costly." Regeneration itself
stays — without it a single bad AI illustration would permanently
block a story from ever being approved, since there was no other way
to fix one page before approving. But two real gaps in the existing
10-per-10-minutes rate limit remained: it only slows a burst of
clicks, not a page regenerated many times across a longer session;
and the button stayed clickable even after a story was already
`APPROVED`, where a further regenerate buys nothing (the story is
already finalized and downloadable) but still costs a real Gemini
call.

Added `story_pages.regenerate_count`
(`supabase/migrations/0026_regenerate_caps.sql`) — a dedicated,
never-reset counter, deliberately separate from the pre-existing
`story_pages.attempts` column, which the worker owns for its own
automatic retry/backoff on genuine generation failures (see
`src/lib/jobs/worker.ts`) and which `regeneratePageAction` already
resets to 0 on every manual regenerate. Reusing `attempts` for a
human-click counter would have meant an automatic worker retry
silently eating into a human's limit, or a manual regenerate silently
resetting it — so the two stay independent: `attempts` for the
worker's own retries, `regenerate_count` for what a human has
deliberately clicked.

`regeneratePageAction` (`src/lib/actions/stories.ts`) now: (1) rejects
with a clear message if the story's `status` is already `APPROVED`;
(2) rejects once a page's `regenerate_count` reaches
`MAX_MANUAL_REGENERATIONS_PER_PAGE` (3), pointing the user to contact
support for a manual fix if a page is still genuinely stuck; (3)
increments `regenerate_count` on every successful regenerate. The cap
lives in `src/lib/domain/stories.ts` (a plain module, not a `'use
server'` action file, so it can export a constant reused by both the
enforcing action and the UI) rather than duplicated as a magic number
in two places.

The story detail page
(`src/app/[locale]/(dashboard)/dashboard/stories/[storyId]/page.tsx`)
now hides the regenerate button entirely once a story is `APPROVED`,
and otherwise shows how many regenerations a page has left, so the
limit isn't a surprise the user only discovers after clicking — the
server-side checks above are still the actual enforcement, this is
just not making the user find the wall by hitting it blind.

## PDF "download" on iPhone browser: a genuine WebKit limitation, not an app bug

Founder report: PDF download works fine on a Samsung tablet but "still
not saving" on an iPhone — after the earlier fix that switched to a
plain same-tab navigation relying on the server's `Content-Disposition:
attachment` header (see the crash-investigation entries above).

Researched rather than guessed at another fix this time, given how many
rounds of mobile download/share fixes this feature has already been
through. Confirmed via WebKit's own bug tracker and Apple's developer
forums that this is real, current WebKit behaviour, not something
introduced by this app or fixable from page code: Safari on iOS (and
every other iOS browser — Apple requires them all to use WebKit)
deliberately overrides BOTH `Content-Disposition: attachment` and the
HTML `download` attribute for any file type it can render itself, PDFs
included, and always opens its own inline PDF viewer instead. See
https://bugs.webkit.org/show_bug.cgi?id=167341 and
https://developer.apple.com/forums/thread/803421 — this is a long-open,
still-unresolved WebKit limitation, and every website that serves a PDF
behaves identically on an iPhone; Ownly was never actually broken
here, it just looked broken next to Android's very different (and
correct-per-spec) behaviour.

The one thing genuinely fixable from the browser: not leaving the
person to conclude nothing happened. `DownloadButton.tsx` now detects
iOS specifically (`isIOS()`, a plain `navigator.userAgent` check) and,
only on that platform, shows an info toast before navigating: "Opening
your PDF — tap the Share icon in Safari, then 'Save to Files'." That
Share-icon path is Safari's own native feature for a PDF it's already
viewing — a different mechanism entirely from the `navigator.share({
files })` Web Share API call this app tried and removed earlier for a
separate, confirmed WebKit bug (see "Saves/shares an already-fetched
file..." in `DownloadButton.tsx`) — and it does reliably work.

The actual fix for a true one-tap save on iPhone, matching Android's
behaviour, is the native iOS app: the Capacitor-wrapped tier already in
`DownloadButton.tsx` writes the PDF straight to the filesystem via a
real OS API and hands it to the native share sheet, sidestepping
Safari's in-browser PDF handling entirely — but that only applies once
the app is actually built and installed from the App Store (Phase
"Native mobile apps" below), not to someone opening the site in Safari.

## Organisation/family name must never reach a generated image

Founder directive: "I don't want the user name of the organization or
family to be generated in the story, please tell Gemini MUST NOT DO
IT."

Found a real, live path for this: 5 of the 8 story theme templates
(`healthy_eating`, `first_day_school`, `honesty`, `hand_washing`,
`national_day_gratitude`, both `en`/`ar`) had a `{organisation}` token
in their page `text` (e.g. "At {organisation}, {child_name} looked at
..."), rendered at story-creation/regeneration time to the real
tenant name (`context.tenantName`/`tenant.name` — a nursery's actual
name, or a family's auto-generated "X's Family"). For an English page
this only ever reached the stored/displayed caption text — never the
illustration itself, since English captions are drawn separately by
this app's own code (see "Arabic captions baked into the
illustration"). For an **Arabic** page, though, that same `text` field
*is* the exact caption Gemini is instructed to bake as pixel text
directly into the generated image — so the org/family name really was
ending up rendered inside illustrations, not just displayed as text
elsewhere.

Fixed at the root: updated all 10 affected template rows directly in
the live database (`story_theme_templates.pages`, via
`mcp__Supabase__execute_sql` — this table's seed content has never
lived in a repo migration; see migration 0003, schema only) to use a
generic "nursery" / "الحضانة" instead of the token, e.g. "At nursery,
{child_name} looked at ..." Verified afterward that no template row
still contains `{organisation}` anywhere. The `{organisation}` token
mechanism itself (`SIMPLE_TOKEN` regex, `TokenContext.organisation` in
`src/lib/domain/templates.ts`) is left in place rather than deleted —
harmless while unused, and a legitimate non-image-facing use (e.g. a
PDF footer credit line) might want it later — but its docstring now
explicitly warns against ever putting it back into a page's `text` or
`image_prompt`.

Added the second, explicit layer the founder actually asked for:
`NO_ORGANISATION_NAME_INSTRUCTION` in
`src/lib/providers/image/prompts.ts`, appended to every illustration
prompt regardless of locale, unconditionally telling Gemini to never
render a nursery/organisation/family name as text, a sign, or a logo,
"even if it appears anywhere in this prompt or the caption text
below." The template fix above is the load-bearing, deterministic
guarantee; this is the belt-and-suspenders instruction that holds even
if a future template or scene description ever reintroduces a name by
mistake. Covered by a new test in `tests/unit/prompts.test.ts`.

Not done as part of this fix: the 5 edited Arabic templates were
already past native review (`native_review_status = 'reviewed'`) —
only a few words changed (a preposition phrase swapped for "في
الحضانة"), not the sentence's grammar/agreement, but a native speaker
should still glance over the 5 edited Arabic sentences listed above at
some point as a sanity check, same as any other content edit.

## Addendum: the org/family name fix above also needed the seed file

Follow-up to "Organisation/family name must never reach a generated
image" above. That fix rewrote the 10 affected rows live in
`story_theme_templates`, but a second, independent source of truth
turned up afterward: `supabase/seed/templates.json`, the version-
controlled fixture `tests/unit/seed-templates.test.ts` validates
against and that a future reseed would insert from. It had the exact
same 10 `{organisation}` occurrences (this is genuinely where that
content originated). Applied the identical replacements there too, so
a future reseed can't quietly reintroduce the bug the live-DB fix just
closed. Verified no `organisation` token remains in either place.

## Pronoun is binary only (no "they")

Founder decision: "for pronouns i believe we can remove them/their ...
as we have male or female should be only right?" — every child gets a
definite gender for story-writing purposes, so the third,
unspecified/neutral option was removed everywhere in the app:

- `Pronoun` narrowed from `'she' | 'he' | 'they'` to `'she' | 'he'` in
  both places it was independently defined (`src/types/database.ts`,
  `src/lib/domain/pronouns.ts`), plus the same narrowing in
  `IllustrationPromptInput.pronoun` (`src/lib/providers/image/
  prompts.ts`, which had its own separate inline union rather than
  importing the shared type).
- Removed the `they` entry from every lookup table keyed by pronoun:
  `EN_FORMS`, `GENDER_DESCRIPTOR`, `ARABIC_POSSESSIVE_SUFFIX`, and all
  ~65 verb-phrase entries in `ARABIC_CONJUGATIONS` (previously each had
  a masculine-plural "they" form, the conventional MSA default for a
  mixed/unspecified-gender group — no longer needed since there's no
  unspecified case left to default for).
- `ChildFormSchema.pronoun` is now `z.enum(['she', 'he'])`. The child
  add/edit form (`ChildForm.tsx`) dropped the "They / them" option and
  now opens on a disabled "Select..." placeholder for a new child
  instead of silently pre-selecting a value — an explicit choice, not a
  guess.
- CSV bulk import (`src/lib/domain/children.ts`): `normalizePronoun`
  used to default a missing/unrecognized cell to `'they'`; now returns
  `null` for that case, which the row loop turns into an explicit row
  error ("Pronoun must be 'she' or 'he'...") rather than silently
  guessing a child's gender. Updated `docs/CHILDREN_CSV_IMPORT.md` and
  the row-loop test in `tests/unit/children-csv.test.ts` to match — the
  old test literally asserted the silent-default behaviour that's now
  the thing being prevented.
- Removed the `?? 'they'` fallback on `pronoun_snapshot` reads in
  `createStoryAction`'s regenerate path, the job worker, and the
  `resync-arabic-story-text.ts` maintenance script — `pronoun_snapshot`
  is `NOT NULL` at the DB level (migration `0018_pronoun_snapshot.sql`),
  so this was always dead code; keeping a fallback would have meant
  inventing a fake default for a case that can't happen.
- Fixed the one live child with `pronoun = 'they'` directly in the
  database (a "Noah" in the `test` demo tenant — set to `'he'`) and the
  demo-data seeding script's third sample child (`scripts/
  reset-demo-data.mjs`, "Rami" — also set to `'he'`).

**Deliberately not touched**: the Postgres enum type backing this
column (`pronoun_type`, `create type pronoun_type as enum ('she', 'he',
'they')` in migration `0001_core_schema.sql`) still technically has a
`'they'` member. Postgres has no `ALTER TYPE ... DROP VALUE` — removing
an enum value requires recreating the type and repointing every column
that uses it, which is real, non-trivial risk on a live production
database for a purely cosmetic benefit: nothing in the app can ever
write `'they'` again after the changes above, so the unused enum member
is inert dead capacity, not a live bug. Not worth the risk of an enum
migration on a live database for that.

## English caption font upgraded to Fraunces

Founder feedback: "english font of the story when write on photos make
it more nicely attractive please."

English pages draw their caption directly in this app's own code (in a
Latin font, on the caption band at the bottom of each page) rather than
having Gemini bake it into the illustration — see "Arabic captions
baked into the illustration" for why Arabic pages are the opposite.
That caption was drawn in `Inter` — a clean UI sans-serif, fine for app
chrome, but with no storybook character at all.

Found that a second font was already embedded for exactly this kind of
role and sitting completely unused: `fonts.latinDisplay` (Fraunces, a
warm serif, semi-bold, with the WONK axis enabled for a slightly
playful/characterful letterform) — pre-generated as a static instance
in `assets/fonts/Fraunces-Display-Static.ttf`, properly OFL-licensed
(`docs/LICENSES.md`), left over from an earlier cover/title-page design
that was later removed per pilot feedback ("no cover, dedication, or
repeating title banner... they read as filler"). Switched the caption
band in `src/lib/providers/pdf/render.ts` to draw with `latinDisplay`
instead of `latinRegular`, and bumped the caption size from 14pt to
16pt (Fraunces reads slightly smaller than Inter at the same point
size) with matching line height — verified by actually rendering
sample pages (both a short and a long caption) and converting to
images to inspect, not just changing a font name and hoping. Page
numbers stay in Inter — a small utilitarian element, not "the story
text," and plain digits have no font-personality question anyway.

**Caught a real latent bug while doing this**: `font-coverage.ts`
(used by preflight to reject a caption containing a character the
render font can't actually draw) was checking glyph coverage against
`Inter-Regular-Static.ttf` specifically. Once captions draw in Fraunces
instead, that check was validating the wrong font — preflight could
have passed a character Inter has but Fraunces doesn't, letting a
missing-glyph box slip into an approved, "validated" PDF. Updated
`getLatinFont()` to load the Fraunces file instead. Confirmed via the
existing `font-coverage.test.ts` (which already asserts real coverage
for em/en dash, curly quotes, and ellipsis) that Fraunces has every
glyph that test expects — all green with no test changes needed.

## Password complexity requirement

Founder request: "Adding password complexity."

Every place a password gets set — org sign-up (`signUpAction`), family
sign-up (`familySignUpAction`), and accepting a staff invite
(`acceptStaffInviteAction`) — previously duplicated the exact same bare
`password.length < 8` check, no letter/number requirement at all.
Added `src/lib/domain/password.ts`: `validatePassword()` (min 10
characters, at least one letter, at least one number — deliberately
not requiring a specific case or a symbol; a "must contain !@#$" rule
mostly just pushes people toward "Password1!" and a sticky note, per
NIST 800-63B's now-standard guidance that length plus a real character
mix beats an arbitrary symbol mandate), plus `PASSWORD_MIN_LENGTH`,
`PASSWORD_PATTERN` (an HTML `pattern` string for a same-page hint, not
itself trusted — `validatePassword` is the real, server-side check on
every path above) and `PASSWORD_REQUIREMENT_HINT` for the matching UI
copy. All three actions and their form components
(`SignUpForm.tsx`/`FamilySignUpForm.tsx`/`AcceptStaffInviteForm.tsx`)
now share this one module instead of three copies of the same rule.

**Found a real gap while doing this**: there was no way for a signed-in
user to change their own password at all, which would have made the
new rule unenforceable for any existing account (nowhere for them to
go strengthen a password that predates it). Added
`changePasswordAction` (`src/lib/actions/auth.ts`) and
`ChangePasswordForm` (`src/components/dashboard/ChangePasswordForm.tsx`),
surfaced in a new "Security" card on the dashboard Settings page. It
re-verifies the current password via a fresh `signInWithPassword` call
before allowing the change (an open session shouldn't be trusted alone
to prove who's at the keyboard), and only renders for an account that
actually has an email/password identity — a phone-OTP account never
had a password to begin with, so there's nothing to change. This
does NOT cover a "forgot password" reset for a signed-out user — that
needs transactional email, which isn't configured yet (see
`docs/NEEDS_FROM_ME.md`); this is only for someone already signed in
who wants to change or strengthen their own password.

## Optional-but-recommended MFA for regular users

Founder request, same message: "also MFA as optional but
recommending etc.." — platform owner accounts already had mandatory
TOTP MFA (see "Owner MFA is mandatory, not optional"); regular
nursery/family/staff users had no MFA option at all.

Reused the exact same Supabase Auth TOTP machinery rather than
building a second scheme: `checkOwnerMfaGate` in `src/lib/domain/mfa.ts`
was already generic internally (nothing owner-specific in its logic,
just its name and docstring), so it's renamed `getMfaStatus` and now
serves both callers, each enforcing differently:

- **Owner** (`/owner` pages): `needs_enrollment` is a hard block —
  MFA is mandatory, unchanged from before.
- **Regular dashboard** (`(dashboard)/layout.tsx`, the single shared
  layout for every `/dashboard/*` page): `needs_enrollment` is ignored
  entirely — nobody is forced to enroll. `needs_challenge` still
  redirects to a challenge page, though: once someone has voluntarily
  enrolled a TOTP factor, skipping the step-up on every visit would
  make that factor purely decorative. "Optional" means optional to
  enroll, not optional to actually use once enrolled.

`MfaEnrollForm`/`MfaChallengeForm` (`src/components/auth/`) took a
`redirectTo` prop (previously hardcoded to `/${locale}/owner`) so both
flows share one QR-code-and-TOTP-verify implementation instead of two
near-identical copies; `MfaEnrollForm` also took optional `title`/
`description` overrides so the owner flow keeps its "this is
mandatory" copy while the new regular-user flow gets its own
"optional but recommended" copy.

New standalone routes `src/app/[locale]/mfa/enroll/page.tsx` and
`.../mfa/challenge/page.tsx` — deliberately NOT nested under the
`(dashboard)` route group, for the same reason the owner MFA pages
aren't nested under `/owner`'s own gate: the dashboard layout is
exactly what redirects to `/mfa/challenge` on `needs_challenge`, so
nesting that page inside the same layout would loop.

Surfaced as a new "Security" card on the dashboard Settings page
(`(dashboard)/dashboard/settings/page.tsx`): shows current status
("On" / "Recommended", via `Badge`) and, when not enrolled, a link to
`/mfa/enroll` with copy explicitly framing it as recommended, not
required. `profiles.mfa_enrolled` (already existed, migration
`0001_core_schema.sql`) needed no schema change — it's a display/
bookkeeping flag either way, not the actual enforcement (that's
Supabase's AAL, checked live via `getMfaStatus` on every request, same
as the owner gate always worked).

## Billing moved out of Settings into its own tab

Founder feedback: "subscriptions to have it as new tab not inside
settings I believe better."

The "Plan & billing" card lived inside the Settings page, one card
among several. Moved it to its own route,
`(dashboard)/dashboard/billing/page.tsx`, and added a nav entry in
`DashboardNav.tsx` between Staff and Settings. Reused the `usage`
translation key ("Usage & plan" / "الاستخدام والباقة") already sitting
in both message catalogs — it existed on `DashboardLayout`'s `labels`
object and was passed through, but the nav's `links` array never
actually used it, so a tab for exactly this content was seemingly
planned before but never wired up. Same `nursery_owner`-only gate
Settings used (covers a family account's holder too — "owner" there
is a historical role name, not a claim about tenant type, see "Phase
4: families are tenants"), now enforced with an explicit redirect
rather than just hiding the card, since the nav link being hidden from
non-owners doesn't stop someone from typing the URL directly.

## Language toggle for the whole app, not just story language

Founder question: "also easy to have arabic version of the app as
well? to have like a toggle to switch between the main languages of
the app?"

Turned out to already be almost entirely built: every route lives
under a `[locale]` segment (`en`/`ar`) with `localePrefix: 'always'`
(`src/middleware.ts`), and `src/messages/ar.json` already had a
complete, 1:1 translation for every one of the 228 keys in `en.json`
— confirmed by actually diffing the flattened key sets, not assuming.
The only missing piece was a visible way to switch locale at all: the
URL was the only way in (typing `/ar/...` by hand), with nothing in
the UI pointing a viewer at it.

Added `src/components/ui/LocaleSwitcher.tsx` — a small "EN / AR" pill
(matching the existing tab-pill visual language used elsewhere, e.g.
`AuthMethodTabs`) that reads the current path via `next/navigation`'s
`usePathname()` and swaps only the leading locale segment, so it lands
on the same page in the other language rather than resetting to the
home page. Wired into the three places someone actually needs it:
`DashboardNav.tsx` (signed-in app), `AuthShell.tsx` (sign in/sign up/
family sign up), and the marketing home page header. Verified for
real, not just by reading the code: ran the dev server, clicked
through with Playwright, and confirmed both the redirect (`/en` →
`/ar` on the same page) and the resulting RTL layout, translated copy,
and mirrored header actually render correctly for the marketing home
page and the sign-in page.

**Real gap found while checking this, not yet fixed**: a fair amount
of UI added earlier in *this same session* — the Security card,
change-password form, MFA enroll/challenge copy, the new Billing
page's heading — was written as plain hardcoded English strings, not
routed through next-intl's `useTranslations`. None of that will
actually appear in Arabic yet even with the toggle now in place; it
falls back to English regardless of locale. The older parts of the
app (nav, children forms, story templates, marketing copy) are fully
translated. Bringing the newer security/billing screens into the
translation system (adding `en.json`/`ar.json` keys and swapping the
hardcoded strings for `t(...)` calls) is a contained follow-up, not
done here since it wasn't what was asked this round.

## Dashboard settings/billing/security/MFA screens translated into Arabic

Follow-up founder request: "now please to have it ready" — closing the
gap the previous entry flagged.

Added translation keys (`auth.passwordHint`, `auth.familySignUp.*`,
`dashboard.settings.*`, `dashboard.security.*`,
`dashboard.changePassword.*`, `dashboard.billing.*`, `mfa.enroll.*`,
`mfa.challenge.*`) to both `en.json` and `ar.json` — verified key-set
parity again afterward the same way as before (280/280 keys in each,
diffed programmatically, not eyeballed) — and swapped every hardcoded
English string in the following for `useTranslations`/
`getTranslations` calls: `SettingsForm.tsx`, `BillingSection.tsx`, the
`settings` and `billing` pages, `ChangePasswordForm.tsx`,
`MfaEnrollForm.tsx`, `MfaChallengeForm.tsx`, and their owner/regular
call sites.

**Also fixed while in there, not just the new pieces**: `FamilySignUpForm.tsx`
had never called `useTranslations` at all, for any of its fields
("Your full name", "Email address", "Password", "Create my family
account" were plain English literals since it was first built) — a
pre-existing gap in the same category, not something introduced this
session, but squarely what "have it ready" means. Added
`auth.familySignUp.{fullName,email,password,submit}` and wired it in.

`PASSWORD_REQUIREMENT_HINT` (a hardcoded English constant in
`src/lib/domain/password.ts`, added earlier this session and used by
every password field across sign-up/staff-invite/change-password)
is gone — replaced by the `auth.passwordHint` key, interpolating
`PASSWORD_MIN_LENGTH` via next-intl's `{min}` placeholder syntax
(`useTranslations('auth')` alongside each form's own scoped
translator, since the key lives one level up from `auth.signUp`/
`auth.familySignUp`/`staffAccept` to avoid duplicating it three times).

`MfaEnrollForm`'s `title`/`description` string-override props (from
earlier this session) are gone too, replaced by a single boolean
`mandatory` prop that switches between two translated description
variants (`descriptionMandatory` for the owner's "this is required"
framing, `descriptionRecommended` for everyone else) — both are now
real Arabic-ready keys, including the owner one, which is a small
quality improvement over what existed before (the owner MFA pages
still don't share any layout or translated chrome with the rest of
the app, by existing convention, but this one string is no longer
hardcoded either).

**Deliberately left untranslated, matching an already-established,
app-wide convention**: dynamic strings that come back from a Server
Action or the Supabase Auth API at runtime (`validatePassword`'s
messages, `changePasswordAction`'s "Current password is incorrect.",
MFA's own `enrollError.message`/`verifyError.message`, `subscription.status`
shown as a raw DB enum value on a badge). Every other Server Action in
this app — sign-in, sign-up, story creation, all of it — has always
returned plain English error strings regardless of locale; there was
no existing pattern of translating these anywhere to be consistent
with, and building one now would be a much larger, separate effort
touching the whole action layer, not a "make it ready" fix. Static UI
chrome (labels, headings, buttons, hints) is what actually needed
fixing, and is now fully bilingual.

Verified for real again: ran the dev server, screenshotted
`FamilySignUpForm` in both `en` and `ar`, and confirmed the
`{min}`-interpolated password hint renders correctly and grammatically
in Arabic ("يجب أن تتكوّن من 10 حرفًا على الأقل..."), not just that the
key resolved. Also wrote a small script cross-checking every
`t('key')`/`getTranslations('ns')('key')` call added across all ten
touched files against the actual `en.json` structure, to catch a typo'd
key path before it could ship as a silent runtime fallback.

## USD pricing for nursery plans

Founder request: "keep in mind to have the prices also for subscriptions
in USD not only AED to be globally as well."

Nursery plans (Starter/Growth/Network) only ever existed priced in AED;
family plans were already USD-only (see "Family monthly subscription
plans"). Rather than add a currency dimension to the schema, followed
the pattern the family plans already established: a separate `plans`
row per currency, sharing the same `stories_per_month`/`seats_included`
as its AED counterpart. Added `starter_usd`/`growth_usd`/`network_usd`
(same `audience: 'nursery'`, `currency: 'USD'`) to
`scripts/seed-platform-data.mjs` and upserted the matching rows into
the live project directly — confirmed live afterward (8 total plan
rows: 3 AED + 3 USD nursery, 2 USD family). This needed no schema
migration and no change to `planIsAvailableForTenant` (audience-only
check, currency-blind already) or the checkout route
(`stripe.checkout.sessions.create` already looks a plan up by its
unique `key`, and `starter`/`starter_usd` are already different keys —
currency was never actually threaded through checkout logic at all).

USD prices are a straightforward AED→USD conversion at the UAE's
pegged rate (~3.6725), rounded to a clean number, with the same ~20%
annual-vs-monthly discount the AED tiers already use — a provisional
placeholder to unblock a global signup, not researched international
pricing; flagged in `docs/en/pricing.md` for the founder to revisit
once there's real market/competitor data. `vat_inclusive` stayed `true`
on the new USD rows, matching the existing (already-USD) family plans'
precedent rather than inventing a new "USD means no VAT" rule in code —
whether VAT actually applies to a USD sale to a non-UAE nursery is an
accountant/merchant-of-record question, not something to guess at in a
seed script (same posture as the pre-existing VAT-inclusive flag
itself, per `docs/NEEDS_FROM_ME.md`).

`BillingSection.tsx` now shows a currency toggle (same pill pattern as
the existing monthly/annual one) whenever a tenant's `plans` span more
than one currency — true for nursery now, still false for family, so a
family tenant's UI is pixel-identical to before, no toggle appears for
a single-currency audience. Defaults to whatever currency the tenant is
already subscribed in (so switching currency can never make an existing
subscriber's own plan disappear from view), else AED as this business's
home-market currency.

**Found and fixed two stale redirects while in here**: the Stripe
checkout success/cancel URLs and the billing-portal return URL both
still pointed at `/dashboard/settings`, left over from moving the
billing card to its own `/dashboard/billing` tab earlier in this
session (see "Billing moved out of Settings into its own tab") — that
change updated the in-app nav link but missed these two server-side
redirect targets. Fixed both. Low real-world impact today since Stripe
has no live keys/Price IDs configured yet (see `docs/NEEDS_FROM_ME.md`
item 6 — nothing has ever actually redirected through either path for
real), but would have sent a real subscriber back to the wrong tab the
moment Stripe goes live.

## Arabic grammar audit of the UI catalog, mascot dialogue, and number agreement

Founder request, after the language toggle shipped: act as an Arabic
grammar expert and find every grammar issue in the app, not just spot
checks. Read all 281 keys of `src/messages/ar.json` line by line, the
Arabic side of `supabase/seed/templates.json` (8 themes × 4 pages +
synopses), and re-checked `ARABIC_CONJUGATIONS`/
`ARABIC_POSSESSIVE_SUFFIX` in `src/lib/domain/pronouns.ts` (already
audited once — see "Arabic gender-agreement audit of the story
templates" — so this pass was a lighter re-check, and turned up
nothing new there).

**`src/messages/ar.json` fixes**:
- `children.consentStatus.not_requested`: "لم يُطلب" (masc) → "لم
  تُطلب" (fem) — the implied subject is "الموافقة" (consent,
  feminine), and the sibling `granted` entry already correctly used
  the feminine "تمّت الموافقة".
- `dashboard.settings.brandColorLabel`: "لون العلامة" → "لون العلامة
  التجارية" — "العلامة" alone means "the mark/sign", not "the brand";
  "العلامة التجارية" is the actual term, already used correctly
  elsewhere in the same file (`marketing.useCases.campaigns`).
- `stories.regenerateStartedBody`: "تتحدّث هذه الصفحة تلقائيًا" →
  "تُحدَّث هذه الصفحة تلقائيًا" — "تتحدّث" (Form V, from the same
  root ح-د-ث) means "talks/converses", so the sentence literally read
  "this page **talks** automatically". The intended meaning ("this
  page **updates** automatically") is the Form II passive "تُحدَّث".
- Three instances of a literal Western "6" inside otherwise-Arabic
  digit-hint text (`dashboard.security.enabledDescription`,
  `mfa.enroll.codeLabel`, `mfa.challenge.description`) → Arabic-Indic
  "٦", matching the app's own existing convention (`auth.phone.codeLabel`
  already reads "رمز مكوّن من ٦ أرقام"). Confirmed first that this
  doesn't fight how numbers render elsewhere: Node's `Intl.NumberFormat('ar')`
  (full ICU, confirmed via `process.versions.icu`/`icu_small`) formats
  1234 as `1,234`, i.e. bare `ar` defaults to Western digits — so every
  *interpolated* count in this app (including the new ICU plurals
  below) renders in Western digits regardless, and these three fixes
  only touch hand-authored static text describing a fixed "6-digit
  code", not a rendered number.
- `auth.passwordHint` and three counting keys had a real Arabic
  number-agreement bug: Arabic requires a different noun form
  depending on the count's range (1 → singular; 2 → dual; 3–10 →
  plural; 11–99 → singular accusative "tamyiz"; 100+ → singular), and
  a single fixed Arabic string can only ever be correct for one of
  those ranges. `passwordHint` used the 11–99 singular form
  ("حرفًا") for `PASSWORD_MIN_LENGTH = 10`, which actually needs the
  3–10 plural ("حروف") — wrong for the one value it's ever shown
  with. `dashboard.billing.storiesPerMonth` and `stories.storyCount`
  used a single form regardless of the interpolated plan/story count
  (right for some plan tiers, wrong for others — e.g. correct for the
  100/500-story nursery tiers, wrong for the 1-story family plan and
  wrong for the 3-story Family Plus plan). `referrals.stats` had the
  same problem across all three of its interpolated numbers, though
  it turned out to be dead code (see below).
  Fixed by introducing ICU MessageFormat plural syntax
  (`{count, plural, one {...} few {...} ...}`) — next-intl already
  supports this via `intl-messageformat`, including Arabic's full
  6-category CLDR plural system (zero/one/two/few/many/other), it had
  simply never been used anywhere in this catalog before. Verified
  every branch actually renders correct MSA by running each string
  through `intl-messageformat` directly for representative counts
  (1, 2, 3, 10, 11, 25, 100, 500) rather than trusting the ICU syntax
  compiled — e.g. `storiesPerMonth` now correctly renders "قصة واحدة
  شهريًا" for the 1-story plan, "3 قصص شهريًا" for the 3-story plan,
  and "25 قصة شهريًا"/"100 قصة شهريًا" for the 25/100-story tiers,
  where before all four rendered with the same fixed noun form.
  `en.json`'s matching keys had the identical bug in miniature ("1
  stories/month") and got the same minimal ICU treatment
  (`one`/`other` only, since English doesn't need the extra
  categories) so both locales' interpolation stays in sync.
- While tracing `referrals.stats`'s call site to confirm its variable
  names, found it isn't actually called anywhere — the invite page
  (`src/app/[locale]/(dashboard)/dashboard/invite/page.tsx`) renders
  the three numbers as separate stat tiles with their own labels
  (`pendingLabel`/`rewardedLabel`/`storiesEarnedLabel`), not as one
  combined sentence. Fixed it to the same ICU standard as the others
  anyway, since it's still shipped translation content and costs
  nothing to have correct, but it's currently unreachable dead code —
  flagging here rather than deleting it, since removing a translation
  key on a hunch it's unused risks guessing wrong.

**`supabase/seed/templates.json` + live `story_theme_templates` fixes**
(applied to both — the live DB row for each theme was byte-for-byte
identical to the pre-fix seed content, confirmed by reading both
before writing):
- `new_sibling` page 2: "أن تكون أخاً كبيراً فهذه قوة خاصة" was
  hardcoded literal text instead of using the `{v:older_sibling_copula}`/
  `{v:older_sibling_noun}` tokens the template already defines and
  already uses correctly on page 4 and in this theme's own synopsis.
  Because it was hardcoded, it was wrong for *either* pronoun: the
  copula "تكون" is only correct for a girl, and the noun "أخاً كبيراً"
  ("big **brother**") is only correct for a boy — so every rendering
  had exactly one gender-agreement error in it, just a different one
  depending on the child. Fixed to use both tokens, matching page 4's
  and the synopsis's existing pattern.
- `saving_money` synopsis: "يتعلّم {child_name}..." hardcoded the
  masculine present-tense verb instead of using the `{v:learns_present}`
  token every other theme's synopsis uses for the identical phrase
  ("تتعلّم"/"يتعلّم") — wrong for a girl. Fixed to use the token.
- `hand_washing` page 4: a stray doubled period ("الخفيفة.. {v:true_bubble_hero}!")
  — cosmetic typo, fixed to a single period.
- Checked whether any already-generated live story had baked either
  of these two wrong page texts into its stored `story_pages.text`
  (which for Arabic is also already baked into the illustration's
  pixels — see "Fixing every already-generated Arabic story, live") —
  none did, so no backfill/regeneration migration was needed this
  time, unlike the earlier gender-agreement audit.
- Re-examined the `hand_washing` synopsis number-agreement question
  the earlier audit ("Arabic gender-agreement audit of the story
  templates") had deliberately left open as a known issue: "يصبح
  {child_name} و{mascot} بطلَي الفقاعات، ويطردان الجراثيم..." — a
  singular verb ("يصبح") with a two-person subject. On closer
  grammatical analysis this is not actually an error: classical
  Arabic agreement rule is that a verb *preceding* a compound subject
  joined by "و" agrees only with the nearer/first conjunct (staying
  singular), which is exactly what "يصبح {child_name} و{mascot}" does
  — and the following verb "يطردان", now that the compound subject is
  established, correctly switches to the dual. Correcting the earlier
  note here rather than re-flagging or "fixing" already-correct
  grammar.

**Reviewed and found already correct** (worth recording so a future
pass doesn't re-litigate the same ground): non-human-plural-takes-
feminine-singular-adjective agreement throughout both files (e.g. the
UAE flag colours "الحمراء والخضراء والبيضاء والسوداء" modifying
"الأعلام"), human-plural-takes-real-plural agreement ("أبطال الفقاعات
يغسلون أيديهم", correctly *not* using the non-human rule), the
`تم`/`تمّت` + masdar subject-gender-agreement pattern used consistently
elsewhere in `ar.json`, dual construct-state case endings ("بطلَي
الفقاعات" correctly dropping the dual's tanween before an idafa), and
every `{v:...}` token substitution across all 8 Arabic themes.

## Marketing framed as recurring, not a one-time graduation gift

Founder feedback: make sure the sales materials talk about the
benefit of using this *monthly*, not just once for graduations. The
existing copy (`docs/en/sales-kit.md`'s "Who buys this" table, the
pitch deck's "One tool, many occasions" slide) led with one-off
occasions — graduation keepsakes, National Day — which undersells a
product that's actually priced and built as a monthly subscription
(every plan is a story allowance that *resets each period*, not a
fixed pack). Added an explicit "Why recurring, not one-time" section
to `docs/en/sales-kit.md` (and a shorter version to `docs/ar/sales-kit.md`),
reworded the nursery row in "Who buys this" to lead with the ongoing
monthly curriculum, added a callout to `docs/en/pricing.md` making the
same point next to the actual plan prices, and reframed the
"Seasonal calendar" note there so graduation/National Day read as
moments that *open* a subscription rather than define it. Also edited
slide 5 of `docs/en/sales/nursery-pitch-deck.pptx` ("One tool, many
occasions" → "Monthly, not one-time") — a same-length text swap inside
the existing `<a:t>` run, validated against the original with the pptx
skill's `validate.py` (all checks passed) and confirmed open cleanly
with `python-pptx`; LibreOffice headless couldn't render *any* pptx in
this sandbox, including the untouched original, so a rendered visual
check wasn't possible here — worth a quick look in real PowerPoint
before the next pitch.

## Rebrand: Khayali to TooniX, new logo, hero-image fixes, PDF watermark

Founder decision: rename from "Khayali" to "TooniX" (تونكس) everywhere,
redesign the logo, fix a diacritics issue on the Arabic landing-page
hero image, and add a copyright mark to generated PDFs. Four pieces:

**1. Full rename.** Every "Khayali"/"khayali"/"خيالي" reference across
code, `src/messages/en.json`/`ar.json`, all `docs/en/`+`docs/ar/`
files, the Android/iOS Capacitor configs, `scripts/reset-demo-data.mjs`,
tests, and both PPTX decks (`docs/en/sales/nursery-pitch-deck.pptx`,
`docs/en/training/staff-guide.pptx`, edited via the same unzip-XML-
rezip-validate approach as the earlier pitch-deck slide edit) is now
"TooniX"/"toonix"/"تونكس". Two things deliberately kept as-is:
- `docs/DECISIONS.md`'s own record of the earlier "Hikayti → Khayali"
  rename (the "Brand" section near the top) — rewriting a past
  decision entry to use the *new* name would misrepresent what was
  actually decided at the time; a fresh entry (this one) is how a
  changelog is supposed to record the next rename instead.
- Two `image_prompt` strings in `supabase/seed/templates.json`
  containing "خيالي" — a false-positive catch during the sweep: that's
  the ordinary Arabic adjective "imaginative/fantastical" inside the
  fixed phrase "أسلوب رسوم كتاب قصص خيالي" ("imaginative storybook
  illustration style"), not the brand name. Confirmed by reading the
  surrounding sentence before touching it.
Also renamed the Android package: `com.khayali.app` → `com.toonix.app`
in `capacitor.config.ts`, `android/app/build.gradle`,
`android/app/src/main/res/values/strings.xml`,
`ios/App/App.xcodeproj/project.pbxproj`, and moved
`android/app/src/main/java/com/khayali/app/MainActivity.java` to
`.../com/toonix/app/MainActivity.java` with `git mv` (the package
declaration inside the file has to match its own directory path, or
the Android build fails) — safe to do now since the mobile wrapper has
never been submitted to either app store. `docs/NEEDS_FROM_ME.md` item
2 and `docs/en/budget.md`'s trademark-registration line were both
updated to say the earlier UAE/GCC name-conflict check was done for
"Khayali", a *different* name, so it needs redoing for "TooniX" — it
does not carry over.

**2. New logo** (`src/components/brand/Logo.tsx`, mirrored as
`public/icons/icon.svg`): two overlapping four-point sparkles — a
larger lagoon-teal one with a smaller coral one tucked behind its
top-right tip, plus a small saffron accent dot. Deliberately *not* a
literal "X" cross/slash shape: tested that idea first and rejected it
because a crossing-lines glyph reads as a cancel/delete icon at small
sizes, exactly wrong for a kids' product. The two sparkles' crossed
diagonal arms evoke the "X" in "TooniX" without drawing it literally,
and doubling the mark (rather than one sparkle) reads as "every child
gets their own story." Checked it renders legibly down to a 16px
favicon by rendering the actual component's SVG at 128/64/32/16px via
Playwright before committing to it (screenshotted, not just eyeballed
in an editor). Kept the exact same component API
(`variant: 'default' | 'flat'`, `size`, `className`) so every existing
call site (dashboard nav, auth shell, marketing header/footer, contact
page) picked it up with no other code changes.

**3. Arabic landing-page hero image had heavy tashkeel; fixed without
re-generating the artwork.** The founder's actual complaint:
`public/images/marketing/hero-ar.jpg`'s caption pill read "كُلُّ
طفلٍ بطلُ قصَّتِه الخَاصَّةُ" — full diacritics stacked on every
word, which is correct classical Arabic but reads as cluttered/unusual
for ordinary UI copy (compare the plain, undiacritized "كل طفل بطل
قصته الخاصة" used everywhere else in the app, e.g. `brand.tagline`).
Regenerating the whole illustration from a text prompt was ruled out:
Gemini image generation isn't reproducible from a prompt, so a fresh
call would likely change the girl/room/animals too, not just the
caption — a bigger, uncontrolled change for what's actually a small
text fix. Instead, precisely measured the caption pill's and the old
logo badge's pixel bounding boxes (`PIL`, pixel-color scans), rendered
a replacement pill + undiacritized caption + new logo badge as one
HTML/CSS layout (Playwright, transparent background, Noto Kufi Arabic
Bold for correct Arabic shaping via Chromium's own text engine rather
than trusting a font-rendering library to shape Arabic correctly), and
composited that single overlay back onto the *original* photo at the
measured coordinates — the girl, room, lighting, and animals are
byte-for-byte the original artwork; only the pill region changed.
Did the same corner-badge swap (old book+sparkle icon → new TooniX
mark) on `hero-en.jpg`, which had no text problem, so only its badge
needed touching.

**4. Copyright watermark on every generated story PDF page**
(`src/lib/providers/pdf/render.ts`, `drawCopyrightWatermark`): a small
dark tag in the top-right corner of every page — icon plus "TooniX" in
white — drawn with `pdf-lib`'s `drawSvgPath`/`drawCircle`/
`drawRectangle` (vector, not a rasterised image, so it stays crisp at
print resolution) and kept inside the TrimBox with a safety margin so
a print vendor trimming to TrimBox can't cut it off. This project has
no separate PDF cover page (see the "no cover, dedication, or
repeating title banner" note earlier in this file), so every page a
family might screenshot, print, or forward already carries the mark —
nothing extra needed for a "cover" specifically. One real gotcha found
by testing rather than assuming: `drawSvgPath` does **not** flip a
path's y-coordinates the way an SVG renderer does (confirmed by
drawing a single-direction stick path and comparing against a red
reference dot in a rendered test PDF) — so a path copied verbatim from
`Logo.tsx` renders with any *asymmetric* positioning mirrored
vertically. The sparkle shape itself is 4-fold symmetric so it looks
identical either way, but the two sparkles' relative placement had to
be pre-flipped (`100 - ty` against the 100x100 viewBox) to land coral
above-right of teal, matching the on-screen mark. The coral sparkle's
18° tilt (present on screen) was dropped for the PDF version — not
worth the extra rotation-direction math for a mark this small.
Verified by actually rendering a sample EN and AR PDF
(`pdftoppm` to PNG) and looking at it, not just trusting the numbers —
caught nothing wrong, but this is exactly the kind of geometry code
that silently produces a subtly-wrong result without a visual check.

**Explicitly deferred, per the founder's own sequencing** ("will do
after finalize the new design & logo & name"): new marketing banners
for the landing page, presenting the two sample stories (EN/AR) as the
site's main marketing content, and a demo video on the landing/home
pages. Nothing in this pass touched the `SampleStoriesPreview`
dashboard component or built new landing-page sections beyond the hero
image fix above.

## Rebrand: TooniX to Ownly, new logo, landing/home banners, presentation logo

Founder decision, immediately following the previous rebrand: rename
"TooniX" to "Ownly" (أونلي), design a completely different logo (the
founder didn't like the sparkle mark), and build the marketing banners
that were explicitly deferred in the previous pass.

**Why the name changed again**: before applying "TooniX" everywhere,
an informal web search turned up a real prior-use conflict — "Toonix"
is an actual trademark filed by The Cartoon Network, Inc., covering
children's books and toys, and briefly used as a real Nordic kids'
streaming brand. That is exactly the kind of conflict an informal
search is supposed to catch, and this doc's own "Not yet built" note
after the previous rebrand already flagged that "TooniX" still needed
real clearance — this is that flag being acted on immediately rather
than left to chance. Ran the same kind of check against roughly a
dozen candidate names before landing on "Ownly" — several looked
promising at first glance and then turned up real conflicts on a
second, deeper search pass (a live "Storia" kids-storybook app, a
$240M UAE aluminium company called "Talex," a live "Lumo" interactive
storybook app, an existing "Kidori" kids-education app with 250k+
downloads, "Mythox" — a live AI app). "Ownly" plays on "own" (a story
that's truly this child's) while sounding like "only" (the one story
like it); no conflict found across several search passes, though — per
every caveat given alongside each of these name checks — that's still
an informal signal, not a legal clearance, and this time it's flagged
explicitly to the founder as worth actually paying a trademark lawyer
for rather than repeating a third informal-search-only cycle.

**Mechanics of the rename**: identical process to the previous
Khayali→TooniX pass — every "TooniX"/"toonix"/"تونكس" across code,
both translation catalogs, every doc, the Android/iOS app IDs
(`com.toonix.app` → `com.ownly.app`, including moving the Android Java
package directory again), the demo-data script, tests, and both PPTX
decks. Left the previous rebrand's own DECISIONS.md entry and the two
`@TooniX_Bot` Telegram-bot references untouched — the bot's actual
Telegram username hasn't changed (that needs the founder's own
Telegram/BotFather access, not something I can do), so the docs
describing it are still factually correct as written.

**New logo** (`src/components/brand/Logo.tsx`, `public/icons/icon.svg`):
three open, nested arcs — teal outer, coral middle, saffron inner —
sharing one gap, reading as a fingerprint whorl or an open "O." Chose
this deliberately over a closed-circle "activity rings" look (rendered
both side by side before deciding) since three full concentric circles
would echo an existing, recognisable "rings" mark (a fitness tracker's
activity rings) in a way three open arcs don't. Ties directly to the
new name's meaning: a story as unique as a fingerprint. Same component
API as before (`variant`, `size`, `className`), so it propagated to
every existing call site automatically. Also re-composited the new
mark into both `public/images/marketing/hero-*.jpg` corner badges
(same measure-and-composite technique as the previous pass, since the
mark itself is baked into those photos) and swapped the pitch
deck/staff-guide PPTX decks' embedded logo image (`ppt/media/image-*.png`,
replaced the raster PNG directly since it's a plain image relationship,
no XML text to edit) — both decks' title and closing slides were still
showing the *very first* Khayali-era book+sparkle icon, never updated
in either previous rebrand.

**PDF watermark mark update** (`src/lib/providers/pdf/render.ts`):
swapped the sparkle-path drawing for the same three-arc paths, using
`pdf-lib`'s elliptical-arc (`A`) support in `drawSvgPath` — confirmed
that command is supported by rendering a test PDF, not assumed. Hit a
real placement bug on the first attempt: unlike the old sparkle path
(defined relative to its own local origin), the ring paths were first
written with absolute 0–100 viewBox coordinates copied straight from
`Logo.tsx`, and `drawSvgPath`'s `x`/`y` place a path's own local origin
on the page — so the mark rendered offset outside its badge entirely.
Caught this by rendering an actual sample PDF and looking at it, not
by inspecting the numbers; fixed by re-deriving the arc paths relative
to their own centre (matching the pattern that worked for the sparkle)
before placing them. Confirmed the fix the same way, on both an English
and an Arabic sample PDF.

**Landing-page and dashboard-home banners** (the piece explicitly
deferred in the previous pass, now built): added a new section to
`src/app/[locale]/page.tsx` between the hero and the use-cases grid —
"See a story come to life" — showing both `hero-en.jpg` and
`hero-ar.jpg` side by side (stacked on mobile) as framed sample-story
cards, regardless of which locale the visitor is browsing in, so the
bilingual claim is visible proof rather than just a sentence. New
`marketing.sampleStories.*` keys in both `en.json`/`ar.json`. Also
found and fixed a real, unrelated gap while touching the dashboard-home
sample-stories component: `SampleStoriesPreview.tsx` had *never* used
`useTranslations` at all since it was first built — "Sample stories,"
"Sample stories are coming soon.," and "Preview coming soon" were
hardcoded English regardless of app locale. Added `stories.samplePreview*`
keys and wired the component to them; left the two per-sample labels
("Sample story in English" / "نموذج قصة بالعربية") as fixed strings on
purpose, since those describe which language *that specific sample*
is in, not the viewer's own locale.

**Verified**: `tsc`, `eslint`, all 148 unit tests + the 8 PDF
render/preflight integration tests, `en.json`/`ar.json` key-set parity,
both new PPTX decks re-validated against their originals with the pptx
skill's `validate.py`, and a full live-browser check of both `/en` and
`/ar` on a real `next dev` server (Playwright, screenshotted) — new
banner section, new logo, new hero-image badges, and the sample PDF
render all confirmed visually, not just by reading the code back.

**Explicitly still open**: a demo video for the landing/home pages
(needs actual footage/production, not something buildable here),
real trademark/domain clearance for "Ownly" (see `docs/NEEDS_FROM_ME.md`
item 2), and regenerating the mobile app icons/splash screens from the
new mark (still Capacitor's generic defaults, unrelated to anything
renamed here).

## Real sample stories generated for the landing/home page carousel

Founder decision, replacing the static two-photo banner from the previous
rebrand entry: "run simulation on 1 arabic story and 1 english story...
have the english story in the english view of landing page / home page
and arabic story in arab views... the view not pdf will be like carousel
view of the 4 pages with having nice frame around the carousel." The
previous static-photo treatment was explicitly rejected.

**Real generation, not a mock**: `scripts/generate-sample-stories.ts`
creates a "marketing-samples" tenant and two children (Amira/she for
English, سلطان/Sultan/he for Arabic), then calls the actual production
`createStory()` → job-queue → `runWorkerOnce()` pipeline — the same code
path a real signup goes through — so the two sample stories are real
Gemini illustrations, not placeholder art. Both stories are marked
`stories.is_platform_sample = true` (the column + `get_platform_sample_stories()`
RPC from migration 0019 — see below); the eight generated images are
downloaded from Storage and saved as static files under
`public/images/marketing/sample-stories/{en,ar}/page-N.*` plus a
`manifest.json`, so the landing and dashboard-home pages read them as
plain static assets rather than short-lived signed Storage URLs (a
10-minute signed URL baked into a cached/static marketing page would
expire and break — static files sidestep that entirely). Resized and
re-encoded the eight images with `sharp` before committing (1200px wide,
mozjpeg quality 82): the raw Gemini output was ~2.4MB per page, ~19MB
total, unreasonable for a landing page; re-encoding brought the same set
to ~1.8MB total with no visible quality loss.

**Migration 0019 had never actually been applied to production** —
discovered while checking what this feature needed, not something this
session caused. `supabase/migrations/0019_remove_trial_and_platform_samples.sql`
existed in the repo (removes the free trial story quota, adds
`is_platform_sample` + its RPC) but a live query against the production
database showed it had never run: new signups were still silently
getting a free trial story months after that removal was supposedly
shipped, and the sample-story column/RPC this feature needs didn't
exist yet. Applied it live via Supabase's migration tool before building
anything else on top of it.

**Three real bugs hit and fixed while wiring this up, in the order they
were found**:

1. **`consume_story_quota` requires a real tenant-member session.**
   The RPC's `is_tenant_member(auth.uid())` check returns false for a
   script running with the service-role key (no JWT `sub` claim), so the
   very first run failed with "Not authorized for this tenant." Rather
   than weaken the real RPC every paying tenant relies on, added
   `service_consume_story_quota` — the identical quota logic minus the
   auth check, `revoke`d from `public`/`authenticated`/`anon` and
   `grant`ed only to `service_role` (migration `0027`, same pattern this
   codebase already uses for `sync_quota_to_plan` and `reward_referral`).
   `createStory()` grew an optional `quotaRpc` parameter defaulting to
   the real RPC, so every existing production call site is untouched;
   only this script opts into the service-role variant.

2. **Module-hoisting silently defeated `FEATURE_REAL_IMAGE_PROVIDER`.**
   The first full run "succeeded" but produced eight identical Mock
   placeholder SVGs instead of real illustrations — the flag was on in
   `.env.local`, but `createImageProvider()`'s cached `flags.realImageProvider`
   evaluates at module-load time, and ES module imports are hoisted
   above any of a file's own top-level code — so the script's own
   `loadEnv()` call ran *after* `flags.ts` had already evaluated
   `process.env.FEATURE_REAL_IMAGE_PROVIDER` as `undefined`. Caught by
   actually opening the generated files rather than trusting the "25
   succeeded" worker log. Fixed by splitting the script in two:
   `generate-sample-stories.ts` is now a thin bootstrap that calls
   `loadEnv()` and only then dynamically `import()`s
   `generate-sample-stories-impl.ts`, so every transitive import (the
   job worker, the image-provider factory) evaluates after the env is
   loaded. The impl file also now refuses to run at all if
   `flags.realImageProvider` is still off, rather than silently
   producing mock output again.

3. **A function prop crossed the Server/Client Component boundary.**
   `StoryCarousel` originally took `prevLabel`/`nextLabel`/`pageLabel`
   (the last one a function) as props from its two Server Component
   callers (the landing page, the dashboard home tab), which Next.js
   can't serialize — both pages 500'd with "Functions cannot be passed
   directly to Client Components." Caught by actually loading the pages
   in a browser, not by reading the code back. Fixed by having
   `StoryCarousel` call `useTranslations('common')` itself instead of
   receiving translated strings/functions from its server parent.

**A fourth issue, caught by testing the interaction rather than reading
the component**: the RTL carousel's prev/next buttons were backwards.
An earlier pass in this same session had added explicit `isRtl`
branching to `StoryCarousel`'s index math, reasoning that "prev/next
should always mean visually-left/visually-right" — but flexbox already
reverses a `dir="rtl"` container's child order for free (the same
mechanism that already correctly mirrors the page-dot indicators with
no extra code), so that branching double-flipped it: at page 1 of 4,
the visually-left button was disabled and the visually-right one
advanced the story, backwards from how a right-to-left book actually
opens (page 1 on the right, advancing moves left). Found this with a
Playwright script that read each button's actual bounding-box position
and clicked the physically-left one to see which page it landed on,
rather than trusting a static screenshot's chevron icons. Fixed by
deleting the `isRtl` branching entirely — `goPrev`/`goNext` are now
direction-agnostic (prev always decrements, next always increments),
and the buttons' left/right position is left entirely to flexbox, the
same as the dots.

**Verified**: `tsc`, `eslint`, all 148 unit tests, `en.json`/`ar.json`
key-set parity, and a live-browser check on a real `next dev` server of
both `/en` and `/ar` — screenshotted, and the RTL button fix specifically
confirmed by simulating a real click and checking which page it
navigated to, not just by reading the chevron icons in a screenshot.

**Explicitly still open**: no equivalent live check of the dashboard-home
carousel was done against a real authenticated session (it reuses the
identical, already-fixed `StoryCarousel` component and the same
`loadSampleStoryManifest()` data source as the landing page, just behind
auth); no database/storage backup exists yet for the live Supabase
project (Free tier — zero automatic backups) — founder decided to defer
upgrading to Supabase Pro until pilots officially start rather than pay
for it now.

## Addendum: one-story-per-locale display, caption contrast fix, frame redesign, Arabic diacritics

Founder feedback on the carousel above, in three parts: (1) show only
the visitor's own current-locale story on the landing/home pages, not
both English and Arabic side by side; (2) the English caption's font
and colour were wrong; (3) the shared card frame looked unprofessional,
and Gemini's baked-in Arabic caption still had diacritics despite the
existing "latest updates" to remove them.

**One story per locale**: both `src/app/[locale]/page.tsx` and the
dashboard's `SamplesAndPlans` now pick a single `sampleLocale` from the
page's own `locale` param and render exactly one `StoryCarousel`,
instead of mapping over `['en', 'ar']` and showing two side by side
regardless of which locale the visitor is actually browsing.

**Caption contrast bug, found and root-caused, not just recoloured**:
the English caption text was drawn in `text-ink-900` — but this app is
dark-first (see "Dark-first design system"), so `ink-900` means
"near-white, for text on this app's own dark surfaces" (`#f4f1e8` —
see `tailwind.config.ts`), not "darkest ink" like a conventional
Tailwind ramp. That token is correct everywhere else in this component
(the card frame, now reusing the same dark surface as the rest of the
app), but the caption band itself is a fixed light sage colour matching
the printed PDF (`CAPTION_BANNER_COLOR` in `render.ts`) — near-white
text on a light band is exactly the low-contrast bug reported. Fixed by
drawing the caption in a literal hex (`#241c16`), matching the PDF's own
`INK_COLOR` exactly, rather than any theme-relative token — the band is
styled to match a printed page sitting inside this app, not the app's
own dark chrome around it. Also switched off the wrong assumption that
`font-display` (Fraunces) wasn't loading: it was — `text-ink-900` was
the whole bug — and added `font-semibold` to match the PDF's use of the
semi-bold `latinDisplay` static instance more closely.

**Frame redesign**: replaced the bespoke dark-navy gradient card
(invented for the first pass, never matched anything else in the app)
with a plain instance of this app's own `Card` tokens — same
`border-[rgb(var(--color-border))]`, `bg-[rgb(var(--color-surface-raised))]`,
and `shadow-card` used by every other card on both pages, so the
carousel now reads as part of this app rather than a one-off widget.
Also removed the small `Logo` badge that was floating on top of the
illustration's corner: both the landing page and the dashboard home tab
already show the Ownly logo in their own header immediately above this
section, so repeating it as an overlay on the artwork read as a sticker
slapped on the art, not a frame. Restyled the nav buttons from a
frosted dark-glass look (which only worked by coincidence against the
old gradient) to plain `ghost`-style buttons using the same
`text-ink-700`/`hover:bg-ink-100` tokens the rest of the app's ghost
buttons use.

**Arabic diacritics — two real regeneration attempts, then a different
fix, not a third blind retry**: the prompt in `prompts.ts` already
explicitly forbids tashkeel/harakat in the baked-in Arabic caption (see
"No diacritics and no stray text in the Gemini-baked Arabic caption"),
and yet both the original sample generation and a full paid retry
(`generate-sample-stories.ts --locale=ar`, added specifically to allow
retrying one language without re-spending on the other) produced fully
diacritized captions baked into the image regardless. Two-for-two
against an explicit, repeated instruction reads as a systematic model
behaviour for this scene, not bad luck — so rather than pay for a third
speculative attempt, switched approach for this carousel specifically:
`story_pages.text` (the actual stored caption) has never had
diacritics — only Gemini's baked-in rendering did — so the fix is to
stop relying on Gemini's baked caption for the Arabic sample images at
all. Cropped the bottom ~22% off both Arabic images with `sharp`
(measured the actual band boundary by sampling pixel colour down a
vertical strip rather than guessing a percentage — the flat pastel
band consistently starts around 78% of image height, matching the
prompt's own "bottom 15-20%" instruction) and now draw the same clean,
correctly-shaped, diacritic-free caption text ourselves — the same
reliable path English already used, just with `font-arabic` (Noto Kufi
Arabic, already loaded via `next/font` for exactly this purpose) instead
of `font-display`. `StoryCarousel` picks the caption font from `dir`
now, so both languages draw their own caption band the same way. This
only changes the sample-story carousel, not the real Arabic PDF
pipeline (`render.ts` still needs Gemini's baked approach there — no
`pdf-lib` text-drawing approach shapes Arabic correctly, per "Arabic
captions baked into the illustration" — that constraint doesn't apply
to a web carousel, which can render real HTML/CSS text).

**Verified**: `tsc`, `eslint`, all 148 unit tests, and a live-browser
check of both `/en` and `/ar` on a real `next dev` server — confirmed
only one story shows per locale, the English caption is now legible,
the frame matches the rest of the app, the Arabic caption has no
diacritics, and a Playwright click-through re-confirmed the RTL
prev/next buttons still behave correctly after the frame's restyle
(same direction-agnostic logic from the previous entry, untouched here
— re-checked because the buttons' classes changed, not their behaviour).

## Google sign-in, forgot/reset password, and a plainer hero CTA

Founder request, in three parts, explicitly for both account types
(organisation and family): swap the landing hero's "Book a demo"
button for a direct "Sign up for free now" (it already linked straight
to `/sign-up`, never an actual demo-booking flow — only the label was
wrong); add "Sign up with Google"; add forgot/reset password. Confirmed
mobile already had its own visible sign-up entry point in both the
header and the hero (`AuthShell`/the header's button aren't hidden on
small screens) — nothing to fix there, just to verify.

**Google sign-in/sign-up** (`src/components/auth/GoogleAuthButton.tsx`,
`src/app/api/auth/callback/route.ts`): one button, reused on the
sign-in page and both sign-up pages, differing only in a `flow` prop
("signin" / "org" / "family"). Clicking it calls Supabase's
`signInWithOAuth` client-side, which redirects to Google, then to
Supabase's own callback, then back to this app's `/api/auth/callback`
with a `?code=`. That route is the one place in this app that calls
`exchangeCodeForSession` — deliberately a Route Handler, not a Server
Component: only a Route Handler can both read the PKCE code_verifier
cookie `@supabase/ssr`'s browser client set when the flow started AND
write the resulting session cookies back, and establishing that session
is the entire point of this step. Placed under `src/app/api/` rather
than `src/app/[locale]/` specifically to sit outside next-intl's
locale-prefixing middleware (`matcher: ['/((?!api|_next|...).*)'])`) —
the locale travels through as a plain `?locale=` query param instead,
read back out once inside the handler.

Sign-in and family sign-up needed no design decision beyond "does a
tenant already exist" (mirrors `verifySignInOtpAction`'s and
`familySignUpAction`'s existing idempotency reasoning for the phone
flow — same accepted tradeoff: a mistaken sign-in click against a
brand-new Google identity leaves a harmless orphan auth user rather
than silently provisioning one). Organisation sign-up needed a real
design choice: Google's profile has no organisation name to give
`create_tenant`. Considered collecting it in a text field before the
Google button is even clickable, but that means sharing state between
whichever of the Email/Phone tabs is showing and a Google button that
sits above both, for one field, on one flow only — not worth it.
Instead, a first-time Google org identity lands on a new one-field page
(`/sign-up/complete-organisation`, `completeOrganisationSignupAction`)
pre-filled with Google's own name guess (editable) and asking only for
the organisation name, then calls the exact same `create_tenant` RPC
`signUpAction` already uses. Fewer fields shown before the OAuth
redirect is also just better funnel design, independent of the
implementation reason.

Hit one real Next.js build error while wiring this up, not just a
typo: `tenantSlugFrom` (a plain, synchronous helper already living in
`src/lib/actions/auth.ts`) was exported so the callback route could
reuse it — but every export from a `'use server'` file is treated as a
Server Action, and Next.js hard-requires every Server Action to be an
`async` function; a plain sync export fails the whole file's build,
not just a lint warning. Resolved by not exporting it at all: once the
design above moved org-tenant creation into `completeOrganisationSignupAction`
(itself already inside `auth.ts`), the callback route never needed
`tenantSlugFrom` directly.

**Forgot/reset password** (`requestPasswordResetAction` /
`resetPasswordAction` in `auth.ts`, `/forgot-password` and
`/reset-password` pages): works identically for both account types,
same as sign-in itself — this app has never differentiated a
password-based sign-in by organisation vs. family, so there was no
second code path to build. The reset link's `?code=` lands on the same
`/api/auth/callback` route as Google, tagged `flow=recovery`: exchange
the code, establish the session, redirect straight to
`/reset-password` — no client-side hash-fragment handling needed
(the older implicit-flow pattern), since `@supabase/ssr` uses PKCE by
default and the exchange happens the same way Google's does.
`requestPasswordResetAction` always returns the same generic message
regardless of whether the email has an account, same email-enumeration
reasoning `sendSignInOtpAction` already applies to phone numbers.

**Verified**: `tsc`, `eslint`, all 148 unit tests, `en.json`/`ar.json`
key-set parity, and a live-browser check of sign-in, both sign-up
pages, forgot-password, and complete-organisation in both `/en` and
`/ar` (RTL confirmed) on a real `next dev` server — including actually
submitting the forgot-password form with a nonexistent email and
confirming the generic success message renders rather than an error or
crash, and loading complete-organisation directly with a `fullName`
query param to confirm the pre-fill. Clicking "Continue with Google"
itself could not be fully round-tripped end-to-end from this
environment — that needs your own Google OAuth client (see
`docs/NEEDS_FROM_ME.md`) — but the button, the redirect URL it builds,
and the callback route's tenant-lookup/creation logic all exercise real
code, not a mock.

## Book-a-demo section

Founder request: a "Book a demo" section beside/under the sample-story
carousel on both the landing page and the dashboard home tab, for both
account types, delivering to either WhatsApp or email
(`yousefhawwari@gmail.com`).

**Why email as the automatic channel, WhatsApp as the manual one**:
true one-click, no-further-action delivery is only possible with
email. A real WhatsApp message can't be sent server-side without the
paid WhatsApp Business API and Meta verification — deliberately not
built (see the existing `whatsappLink()` helper's own comment: "no
WhatsApp Business API wired into this app... there is no way to send
an outbound WhatsApp without one"). So the form's "Book a demo" button
saves the submission and best-effort emails the founder automatically;
a second, always-visible "Or WhatsApp us directly" link next to it
opens the same `wa.me` link this app already uses on the Contact page
and staff-invite flows, for a visitor who wants to reach out right
now — one manual tap in their own WhatsApp app, the same tradeoff every
existing wa.me link here already accepts.

**Email delivery** (`src/lib/notifications/email.ts`): Resend's HTTP
API, called with a plain `fetch()` — no SDK, so no new npm dependency.
Same "best-effort, never blocks the caller" shape as the existing
`sendTelegramMessage()`: silently a no-op without `RESEND_API_KEY`,
swallows any send failure. Considered reviving the existing (already
partially wired, `TELEGRAM_BOT_TOKEN`-in-Vercel-but-never-finished)
Telegram path instead, since it's free forever with no per-message
cost — but the founder asked for email specifically, and Telegram's
own `TELEGRAM_CHAT_ID` is still unresolved from an earlier session
("Telegram wasn't responding to any bot on your account"), so building
on top of an already-stuck integration would just inherit that
problem. Resend's free tier (3,000 emails/month, no card required) is
a clean, independent path instead.

**Storage and access** (`supabase/migrations/0028_demo_requests.sql`,
`src/lib/actions/demo-request.ts`): every submission is written to a
new `demo_requests` table BEFORE the email is attempted, so nothing is
ever lost even with no `RESEND_API_KEY` configured yet, or if Resend
itself is briefly down. This is the first genuinely public
(unauthenticated) write in this app's schema, which called for a real
design choice: `createSupabaseServiceRoleClient()`'s own doc comment
explicitly restricts it to "the job worker, Stripe webhook handlers,
scripts/*.mjs" — reaching for it here to bypass RLS would have been
exactly the kind of casual violation that comment exists to prevent.
The correct tool for a genuinely public write is a scoped RLS policy,
not the service role: `demo_requests` grants `anon`/`authenticated` an
INSERT-only policy (`with check (true)`), while SELECT stays restricted
to `is_platform_owner()` — a visitor can create a row but never read
any back, including their own or anyone else's. The server action
layers its own IP rate limit (3 per 15 minutes) on top as the actual
spam defence, same pattern as every other public-facing action in
`src/lib/actions/auth.ts`.

**Verified**: `tsc`, `eslint`, all 148 unit tests, `en.json`/`ar.json`
key-set parity, and a live end-to-end test on a real `next dev`
server — submitted the form with real (test) data, confirmed the
success message renders, then confirmed the row actually landed in
`demo_requests` via a direct SQL query against the live database
(and deleted that one test row afterward). Checked both `/en` and
`/ar` visually, including RTL layout of the two-column field grid and
the WhatsApp link's position. Did not verify an actual received email,
since no `RESEND_API_KEY` is configured yet — that needs the founder's
own free Resend signup (see `docs/NEEDS_FROM_ME.md`); the no-op path
(what happens today, with the key unset) was what was actually tested.

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
