# Packages & pricing

Seeded in `scripts/seed-platform-data.mjs` / applied via `plans` table.
These are **starting proposals**, not finalized commercial decisions —
pricing is explicitly called out in the brief as something requiring a
commercial decision. Adjust freely; changing the seed script or the
`plans` table rows is all that's needed.

All prices shown are in AED and marked VAT-inclusive by default
(`plans.vat_inclusive = true`) — confirm this is correct for your
business registration before launch (see `docs/NEEDS_FROM_ME.md`).

| Plan | Monthly | Annual (≈2 months free) | Stories / month | Seats included | Best for |
|---|---|---|---|---|---|
| **Starter** | AED 499 | AED 4,790 | 25 | 3 | A single nursery branch piloting the product |
| **Growth** | AED 1,299 | AED 12,490 | 100 | 10 | A multi-branch nursery or a school |
| **Network** | AED 3,499 | AED 33,490 | 500 | 50 | A nursery group, hospital, or bank running a
  campaign across many locations |

## Trial

Every new tenant gets **one free trial story** on signup
(`subscriptions.trial_story_used`) using the mock image provider — no
credit card required, no AI cost incurred.

## Add-ons (architected, not yet priced)

- Extra story packs beyond a plan's monthly allowance.
- Real (AI-illustrated, not placeholder) image generation — priced
  per-story once a vendor and their per-image cost are confirmed (see
  `docs/NEEDS_FROM_ME.md`).
- Print fulfilment (physical book printing/shipping) — Phase 4.

## Why usage-based on stories, not seats

Nurseries vary enormously in staff count relative to children served; a
per-story quota tied to actual usage (children reached) maps more
directly to the value delivered than a per-seat model, while still
including a reasonable number of staff seats per tier so the story
creator/approver workflow isn't itself gated.
