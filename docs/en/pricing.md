# Packages & pricing

Seeded in `scripts/seed-platform-data.mjs` / applied via `plans` table.
These are **starting proposals**, not finalized commercial decisions —
pricing is explicitly called out in the brief as something requiring a
commercial decision. Adjust freely; changing the seed script or the
`plans` table rows is all that's needed.

All prices shown are in AED and marked VAT-inclusive by default
(`plans.vat_inclusive = true`) — confirm this is correct for your
business registration before launch (see `docs/NEEDS_FROM_ME.md`). UAE
VAT is 5%.

## Cost basis (validated, not estimated)

Every story renders exactly 4 illustrated pages
(`supabase/seed/templates.json`) through Gemini at 2K resolution, at
**$0.101/image** — the constant the app's own spend tracking already
uses (`GEMINI_COST_PER_IMAGE_USD` in `.env.local`). That's **$0.404
(≈ AED 1.48) raw AI cost per story**; call it AED 2.00 all-in once
storage/hosting is included. This was previously unpriced ("real image
generation... priced per-story once a vendor and their per-image cost
are confirmed") — it now is, and all three B2B tiers below clear 70%+
gross margin at their original prices, so there's no cost-driven reason
to raise them for launch.

## B2B — nurseries & schools

| Plan | Monthly | Annual (≈2 months free) | Stories / month | Seats included | COGS/mo | Gross margin | Best for |
|---|---|---|---|---|---|---|---|
| **Starter** | AED 499 | AED 4,790 | 25 | 3 | AED 50 | ~90% | A single nursery branch piloting the product |
| **Growth** | AED 1,299 | AED 12,490 | 100 | 10 | AED 200 | ~85% | A multi-branch nursery or a school |
| **Network** | AED 3,499 | AED 33,490 | 500 | 50 | AED 1,000 | ~71% | A nursery group, hospital, or bank running a campaign across many locations |

### Self-serve vs. managed

Every tier above is **self-serve** (nursery staff use the dashboard
themselves) by default. A **managed-service** add-on — Khayali's team
creates and submits stories against a class roster and theme calendar
for the nursery to approve — is priced as a flat **+40% uplift** on the
base plan (e.g. Growth becomes AED 1,819/mo). Margin stays above 60%
even with the added labour.

### Launch offers

- **Founding partner** — 50% off for 3 months, locked to a 12-month
  term, for the first 10 nurseries who sign.
- **Referral credit** — a nursery that refers another paying nursery
  gets 1 month free.
- **Pilot branch** — a nursery group can trial Starter on one branch
  for 30 days before committing group-wide.

## Individuals & families

- **Free trial** — every new tenant gets **one free trial story** on
  signup (`subscriptions.trial_story_used`), no card required.
- **Story packs** (already built — `src/lib/domain/gifts.ts`, live in
  Stripe checkout): 1 story/$15, 3 stories/$39 ($13 each), 6
  stories/$69 ($11.50 each).
- **Family — new, not yet built**: $9/month for 1 story/month (rolls
  over up to 3) — cheaper per-story than a single pack, for recurring
  use rather than one-off gifting.
- **Family Plus — new, not yet built**: $19/month for 3 stories/month.

Gift packs are priced in USD, nursery plans in AED — worth aligning to
one currency once a merchant-of-record setup is chosen; not urgent
before launch.

## Sizing the Gemini spend cap

The AI Studio spend cap (`aistudio.google.com/spend`) is a hard stop
for the **whole platform**, not per customer — the app's own per-tenant
`quotas` table stops one nursery from overspending its own plan, but
nothing stops the platform-wide cap from being hit while a fully-paid
customer still has quota left. That's a real outage, not graceful
degradation.

**Rule of thumb: required cap ≈ (sum of every active tenant's monthly
story quota) × $0.404 × 1.3**, capped at whichever is lower of that
number and Google's current tier ceiling. Re-check this every time a
new nursery contract closes — it changes with every signed deal, not
just once at launch. Reference points: 1 Growth nursery (100
stories/mo) needs ≈$53; 3 Growth nurseries need ≈$158; 1 Network
customer (500 stories/mo) needs ≈$263.

Two separate ceilings apply, and the lower one binds first:

- **Google's own mandatory Tier 1 cap is ~$250/month**, hard, not
  adjustable without applying for a Tier 2 upgrade (needs a payment
  history with Google first). That's ≈618 stories/month, platform-wide.
- **The founder's stated yearly AI budget is AED 20,000** (≈$454/month,
  ≈1,120 stories/month) — higher than the Tier 1 ceiling, so it isn't
  the actual constraint yet.

Practically: start the AI Studio cap around **$150-200/month** (covers
several pilot nurseries, safely under the $250 Tier 1 ceiling), and
apply for Tier 2 once committed volume approaches it rather than after
exceeding it. Switch from AI Studio's experimental per-project cap to
Gemini's Prepay billing with auto-reload once revenue is real, so a cap
breach pauses new spend gracefully instead of as a mid-month surprise.

## Nursery Partner Program (referral commission)

Each subscribed nursery can get a unique referral link/QR code; a
parent who buys a family story pack or subscription through it earns
the nursery a commission, paid monthly, on top of — not instead of —
their own subscription. This turns every nursery customer into a sales
channel for the family product. At a 20% commission rate: 1 story pack
($15) → nursery earns AED 11, your margin stays ~77%; 6 story pack
($69) → nursery earns AED 51, margin ~76%; Family monthly ($9/mo) →
nursery earns AED 7/mo recurring, margin ~76%. All figures assume the
same $0.404/story COGS as above.

**Framing note**: describe this to nurseries as "your share" or
"partner commission" — never as a percentage of "our costs after AI
spend," which invites negotiation against your cost structure. The
cost breakdown is for internal planning only.

**Not yet built**: referral-code attribution, commission tracking, and
nursery payouts all need real engineering (a referral table, a payout
mechanism — Stripe Connect or manual tracking — and KYC for nurseries
as payees). This is the plan, not yet the implementation.

## Operating playbook (Dubai nursery market)

- **Payment terms**: auto-bill Starter/Growth via Stripe monthly or
  annually; don't invoice net-30 for small accounts. Network-tier
  nursery groups, hospitals, and banks often need a formal PO/invoice
  process — be ready to send manual Stripe invoices for those.
- **Onboarding**: personally walk the first ~10 nurseries through setup
  rather than a self-serve email link — this is an unfamiliar product
  category, and the first week determines retention.
- **Trial design**: a bounded trial (e.g. 5 free stories) converts
  better than an unlimited-time trial — a story cap creates urgency and
  gets real usage fast.
- **Retention signal**: track quota usage per nursery. Under 20% used
  by month 2 is a churn risk worth a proactive call; consistently over
  90% is an upsell opportunity, not a problem.
- **Sales channel**: Dubai's nursery sector is small and connected —
  KHDA and nursery-owner networks/WhatsApp groups matter more than paid
  ads early on.
- **Seasonal calendar**: align sales pushes with the academic year —
  September (First Day of School), December 2 (National Day
  Gratitude), Ramadan, June (graduation) — these map directly onto
  themes already in the catalog.
