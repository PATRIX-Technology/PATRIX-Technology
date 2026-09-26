# What I need from you

Everything in this file is something I genuinely cannot do myself —
either because it requires an account only you can create, a payment
method, a legal/commercial decision, or a physical action. Everything
else has already been built and is documented in `docs/HANDOFF.md`.

## To go from "runs on a laptop" to "a real nursery can use it"

1. **Create a Supabase project** (free tier is fine to start) at
   https://supabase.com. I need:
   - Project URL and anon key → `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Service role key (keep this secret — never share it in chat/email) →
     `SUPABASE_SERVICE_ROLE_KEY`
   - Once created, tell me and I will run the migrations in
     `supabase/migrations/` against it and seed the story templates.

2. **Choose and confirm the brand name.** "Khayali" is a working name only
   (see `docs/DECISIONS.md`). Before it appears on anything public, it
   needs: a basic UAE/GCC trademark screening, and confirmation the
   matching domain (e.g. `khayali.com` / `.ae`) is available. I cannot
   register a domain or file a trademark — that needs your payment method
   and identity.

3. **A domain name and hosting decision.** I'd recommend Vercel (built
   for Next.js) or a similar host — but creating that account and
   connecting billing is yours to do.

3a. **An SMS provider, for phone-number sign-in/sign-up to actually send
   codes.** The sign-in, nursery sign-up, and family sign-up pages all
   now have a "Phone" tab (alongside the existing email/password option)
   that sends a 6-digit code via SMS, with a country picker so it works
   for any country's number, not just the UAE — the code (server actions
   in `src/lib/actions/auth.ts` and `src/lib/actions/family.ts`, using
   Supabase's built-in phone-auth methods) is fully built and can't be
   tested further from my side, but it will not send a single real SMS
   until Supabase itself has an SMS provider configured. In your
   Supabase project: **Authentication → Providers → Phone**, then add a
   provider — Twilio is the one Supabase's own docs walk through, and
   needs its own Twilio account, a phone number purchased through
   Twilio, and its Account SID/Auth Token entered into Supabase. This
   costs real money per SMS sent — Twilio's rates vary by destination
   country (UAE is usually a few cents per message; some countries cost
   noticeably more) — budget for it the same way as the Gemini spend cap
   below, and expect to test this live yourself once it's configured,
   since I have no way to receive an SMS to confirm it end-to-end. Until
   this is configured, the Phone tab's "Send code" button will fail with
   a Supabase error, not send anything.

## Before enabling real (paid) AI image generation

4. **Provide a Gemini API key.** Google Gemini is now the wired-up image
   vendor (`GeminiImageProvider` — see `docs/DECISIONS.md` "Real image
   generation: Google Gemini"), so the vendor choice itself is already
   made; what's left is: get an API key from
   https://aistudio.google.com (you mentioned you already have a Pro
   subscription — that's what you'll use to generate it), give it to me
   so I can set it as `GEMINI_API_KEY`, and confirm the per-image cost
   you're seeing so I can set `GEMINI_COST_PER_IMAGE_USD` accurately
   (defaults to $0.02/image, which is an estimate, not your actual
   billed rate). I'll also need you to flip
   `FEATURE_REAL_IMAGE_PROVIDER` to `on` once you're ready to stop using
   the free mock illustrations.
4a. **Choose a content moderation approach** for generated images —
   Gemini has some built-in safety filtering, but
   `VendorModerationSafetyChecker` (`src/lib/providers/image/safety.ts`)
   is still an unconfigured stub for an independent check. Until this is
   configured, every real-generated image is blocked by default (fails
   closed) — see `docs/DECISIONS.md` "Image safety checks fail closed".

4b. **Two GitHub repository secrets, for the story-generation safety
   net** (`.github/workflows/story-worker-cron.yml`). A real (non-mock)
   multi-page story's image generation can run long enough to hit
   Vercel's own function time limit mid-request — that used to crash
   the page outright; it no longer does, but the story can still end
   up stuck "generating" until something re-runs the job queue. This
   workflow does that automatically every 5 minutes, but only once
   both secrets exist (Settings → Secrets and variables → Actions, on
   the GitHub repo):
   - `APP_URL` — your deployed site's base URL (e.g.
     `https://khayali.vercel.app`, no trailing slash)
   - `CRON_SECRET` — any random string you choose, set to the *same*
     value in Vercel's own environment variables (`CRON_SECRET`) so
     the two sides agree
   Without both, the workflow just fails harmlessly every 5 minutes —
   it won't block anything else, but stuck stories won't self-recover
   either until you add them. See `docs/DECISIONS.md` "Defending
   against a mid-generation function timeout" for why this exists
   instead of Vercel's own Cron (Hobby plan restricts that to once a
   day, which is too infrequent to matter here).

5. **Confirm your monthly AI spend cap.** You told me $500/month is fine
   — that's a safety switch in the database, not a bill I can generate on
   your behalf (see `docs/DECISIONS.md` for how `global_spend_cap` works).
   Right now it defaults to **on** (blocked) specifically so nothing can
   spend money until it's set intentionally; once I have your Supabase
   project (item 1 above), I'll set `global_spend_cap.monthly_cap_usd` to
   500 for you — just confirming here in writing since it's real money.

## Before enabling photo-based personalisation (optional)

5a. **A qualified legal review of photo-based personalisation**, covering
   at minimum: UAE/GCC child-data and biometric-adjacent data handling,
   what the consent flow needs to say to parents, and how long an
   uploaded photo should be retained. The code is fully built and
   gated behind this — `FEATURE_PHOTO_PERSONALIZATION` and
   `PHOTO_PERSONALIZATION_LEGAL_REVIEW_COMPLETE` both default to `off`,
   and a nursery also has to explicitly opt in per-tenant — but nobody
   should be able to upload a child's photo until this review is done.
   See `docs/DECISIONS.md` "Photo personalisation wiring".

   You asked whether UAE law specifically requires consent for a
   *family* account's own parent uploading their own child's photo —
   I can't answer that; it's exactly this item. What I did instead:
   built the mechanism so a family tenant *can* grant photo consent
   (previously it was hard-blocked with no way to grant it at all), via
   one required checkbox shown directly on the upload screen at the
   moment of upload — not the nursery's separate multi-step request
   flow, since a family account's owner IS the child's parent/guardian,
   so there's no separate party to ask. That checkbox is a pragmatic
   default, not a legal conclusion: please have this reviewed alongside
   everything else in this item before turning
   `PHOTO_PERSONALIZATION_LEGAL_REVIEW_COMPLETE` on for real — including
   whether the checkbox's exact wording is sufficient, or needs to say
   more (e.g. naming Google Gemini as the processor, retention period,
   right to withdraw). See `docs/DECISIONS.md` "Family photo consent: a
   single checkbox at upload time".

## Before enabling billing

6. **A Stripe account** (test mode to start — nothing here should ever
   go live without your explicit say-so). I need:
   - Publishable + secret **test** keys → `STRIPE_PUBLISHABLE_KEY`,
     `STRIPE_SECRET_KEY`
   - A webhook endpoint configured in the Stripe dashboard pointing at
     `<your-app-url>/api/billing/webhook`, and its signing secret →
     `STRIPE_WEBHOOK_SECRET`
   - Price objects created in Stripe for each plan (Starter/Growth/
     Network, monthly + annual), with their IDs added to the `plans`
     table (`stripe_price_id_monthly` / `stripe_price_id_annual`)

   The checkout session creation, customer portal redirect, and webhook
   handler (with signature verification and idempotency) are fully
   implemented and unit/integration tested — see `docs/DECISIONS.md`
   "Phase 3 additions". Set `FEATURE_BILLING=on` once the above exists;
   until then the billing section on the settings page, and the gift
   purchase page (`/gift`, Phase 4), both stay hidden behind the same
   flag.

6b. **Pick the two sample stories** shown on the dashboard Home tab —
   for a family account this replaced the free trial story you asked
   me to remove (see `docs/DECISIONS.md` "Removing the free trial
   story"); a nursery account now sees the same two samples on its own
   Home tab too, above its usual stats. This is a taste call, so I
   didn't pick for you: choose one already-approved English story and
   one already-approved Arabic story you're happy to show off (they
   can be from any tenant, including your own test account), then run
   this in the Supabase SQL editor (replace the two IDs — find them
   from the Stories list, or `select id, theme_key, locale from
   stories where status = 'APPROVED' and locale = 'en'`, swapping
   `'en'` for `'ar'` too):

   ```sql
   update stories set is_platform_sample = true where id = '<your english story id>';
   update stories set is_platform_sample = true where id = '<your arabic story id>';
   ```

   Until you run this, the Home tab shows a plain "coming soon" card
   instead of a broken one — safe to leave for now, but the whole
   point of removing the free trial was to show these instead, so
   don't leave it too long. You can swap either one for a different
   story later the same way (just flip the old one back to `false`
   first, or the unique-per-locale check will refuse the new one).

## Before family accounts / gifting feel complete (Phase 4)

6a. **A transactional email provider** (Resend, Postmark, SendGrid, or
   Supabase's own SMTP integration) if you want gift codes emailed to
   the purchaser automatically. Right now the redemption code is shown
   on-screen and in a shareable link after payment — real and working,
   just manual: the purchaser has to copy and send it themselves. This
   is a contained addition once you've picked a provider and I have an
   API key for it.

## Legal / compliance (do not treat any of this as done)

7. **A lawyer's review of the UAE PDPL posture.** I've designed for
   data-minimisation, tenant isolation, signed URLs, consent tracking,
   and configurable retention — all *engineering* best practice — but I
   am not a lawyer and none of this constitutes legal compliance advice.
   Anything marked `PENDING LEGAL REVIEW` in this repo needs a real
   review before you rely on it commercially, especially given this
   product handles children's data.
8. **Confirmation of VAT treatment** for the displayed plan prices
   (`plans.vat_inclusive`) — this depends on your business registration
   and is a decision for your accountant, not me.
9. **A native Arabic speaker to review every Arabic template and UI
   string.** I wrote reasonable Modern Standard Arabic, but none of it
   has had native review yet. Story templates are properly access-
   controlled while unreviewed — see `docs/DECISIONS.md` "Arabic content
   gating" — the system will not let a real family receive a story
   generated from an unreviewed Arabic template, and the owner dashboard
   (`/owner`) shows exactly which templates are still pending. UI chrome
   strings (`src/messages/ar.json`) have no such gate - they already
   ship - so the pending ones are tracked in
   `docs/ar/NATIVE_REVIEW_CHECKLIST.md` instead (28 strings as of this
   writing). That list used to be a `[NEEDS NATIVE REVIEW]` suffix
   rendered right on the live page; see `docs/DECISIONS.md` "Dark-first
   design system" for why that changed.

9a. **Push the Arabic story-template grammar fix to your live Supabase
   project, then fix every already-generated Arabic story, not just
   "Bisan."** You caught a real bug: several Arabic story templates
   used a hardcoded masculine verb/pronoun for the child instead of one
   that changes with the child's actual gender ("قالت بيسان وهو ينظر"
   instead of "وهي تنظر" for a girl). I found and fixed about 30
   instances of this across all 6 themes — see `docs/DECISIONS.md`
   "Arabic gender-agreement audit of the story templates". I have no
   network access to your Supabase project from here, so this needs
   three commands from you, run in order, from a terminal open in the
   project folder on a computer that has your real `.env.local` (the
   one with `SUPABASE_SERVICE_ROLE_KEY` filled in) — if that's not a
   computer you use, open a Claude Code session on one that is and
   paste it this exact list:

   1. `npm run db:seed` — pushes the corrected templates
      (`supabase/seed/templates.json`) to your live database. Only
      touches story templates, nothing else. Safe to re-run any time.
   2. `npm run resync-arabic-story-text` — a **dry run**: scans every
      Arabic story already generated, recomputes what its caption text
      *should* say now that the templates are fixed, and prints exactly
      what would change (story by story, old text vs. new text) plus
      how many images would need to be redrawn and what that would
      cost. It changes nothing yet — read the report first.
   3. `npm run resync-arabic-story-text -- --apply` — once the report
      in step 2 looks right, this actually applies it: corrects the
      stored caption text for every affected page and queues each one
      for its illustration to be redrawn with the corrected caption
      (Arabic captions are baked directly into the illustration by
      Gemini, not drawn separately — see docs/DECISIONS.md "Arabic
      captions baked into the illustration" — so the picture itself
      has to be regenerated too, which is the real cost step 2 warns
      you about; it's the same per-image rate as any other story).
      Redrawing happens gradually through the existing job queue (the
      5-minute safety-net cron from item 4b, if you've set that up, or
      the next time anyone opens the app) — not instantly when the
      command finishes.

   Going forward, hitting "Regenerate this page" on any single page
   now automatically re-checks its caption against the current
   template first, so a future template fix like this one will not
   need a repeat of step 3 for pages someone happens to regenerate by
   hand — only for everything else, the same way.

## Not a decision I need from you, but you should know about it

10. **A Next.js major-version upgrade (14 → 16) is required to close
    several high/critical dependency vulnerabilities** (cache poisoning,
    SSRF, DoS — see `docs/DECISIONS.md` "Dependency audit"). This isn't
    something I need a decision on — it's engineering work I couldn't
    safely rush through in the same session as feature work, since it
    touches how almost every page in the app reads its URL parameters
    and needs a real regression test against a live Supabase project.
    Flagging it here so it's on your radar before you commit to a launch
    date: budget a dedicated session for this, ideally right after a
    Supabase project exists (item 1) so it can be tested against the
    real thing.

## Physical / one-time actions

11. **A print proof of at least one Arabic and one English PDF** from an
    actual print vendor before promising print-ready output to a
    customer. The PDF architecture (A5, 3mm bleed, 300 DPI target,
    embedded fonts, preflight validation) is built and automatically
    tested, but a physical proof is the only way to catch anything a
    screen can't show you (see `docs/DECISIONS.md` "Arabic PDF text
    shaping" for the one known nuance to check first).

---

Nothing above blocks the rest of the product from working. Everything
that doesn't need one of these has been built and can be demoed today
with `npm run dev` using the mock image provider and a local/demo
Supabase project — see `docs/HANDOFF.md`.
