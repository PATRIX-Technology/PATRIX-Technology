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
uses (`GEMINI_COST_PER_IMAGE_USD` in `.env.local`). A clean 4-image
story prices at $0.404 (≈ AED 1.48) in raw AI cost — confirmed again
directly against the founder's live Supabase project: every story that
finished cleanly (no retries) landed at exactly $0.404. Real observed
*total* spend runs higher — **$1.00/story (≈ AED 3.67)** is the
founder's own conservative planning figure from actual AI Studio
billing, and it's what all planning below uses.

**Why the gap, concretely** (found and fixed the same day): one
testing session spent $23 in real Google billing but only produced 3
finished stories — roughly $7.67/story, not $0.404. The cause wasn't
the AI cost itself; it was two infrastructure bugs that made a single
requested story cost several retried Gemini calls before finishing (a
generation job that could get silently stuck forever, and a retry
mechanism that burned through a job's attempts on bad timing rather
than a real failure — see `docs/DECISIONS.md`). Both are fixed now.
The $1.00/story planning figure already has headroom built in above
the $0.404 floor for legitimate retries (safety-check rejections, a
rare bad generation) — keep using it, but re-run the query below
periodically to confirm the gap stays small now that the two bugs
above are gone, rather than assuming it's permanently settled.

```sql
select avg(story_total) as avg_cost_per_story, count(*)
from (
  select story_id, sum(cost_usd) as story_total
  from story_pages
  where image_status = 'GENERATED'
  group by story_id
) t;
```

Starter and Growth still clear 70%+ gross margin at their original
prices. Network compresses to ~48% because AI cost scales with volume
while the platform fee doesn't — still healthy, but the tier to watch
if real usage keeps tracking the $1/story rate rather than the
theoretical $0.404 minimum.

## B2B — nurseries & schools

| Plan | Monthly | Annual (≈2 months free) | Stories / month | Seats included | COGS/mo | Gross margin | Best for |
|---|---|---|---|---|---|---|---|
| **Starter** | AED 499 | AED 4,790 | 25 | 3 | AED 92 | ~82% | A single nursery branch piloting the product |
| **Growth** | AED 1,299 | AED 12,490 | 100 | 10 | AED 367 | ~72% | A multi-branch nursery or a school |
| **Network** | AED 3,499 | AED 33,490 | 500 | 50 | AED 1,836 | ~48% | A nursery group, hospital, or bank running a campaign across many locations |

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
- **Referral credit** — a manual sales concession: a nursery that
  refers another paying nursery gets 1 month free, applied by hand.
  Distinct from the automated "Invite & earn free stories" mechanic
  under "Individuals & families" below (that one runs itself, in
  stories, for any tenant) and from the not-yet-built "Nursery Partner
  Program" cash commission further down this doc.
- **Pilot branch** — a nursery group can trial Starter on one branch
  for 30 days before committing group-wide.

## Individuals & families

- **No free trial** — a new signup starts at 0 stories
  (`quotas.stories_included_this_period` defaults to 0, checked by
  `consume_story_quota` before every generation). A family account's
  dashboard shows two fixed sample stories instead (see
  `docs/DECISIONS.md` "Removing the free trial story"), with the plans
  below them. Removed because a free trial story per signup was being
  farmed by creating new accounts repeatedly. The
  `subscriptions.trial_story_used` column still exists in the schema
  but nothing reads or writes it — harmless, just not the mechanism.
- **Invite & earn free stories** (built — replaces the earlier "buy a
  story pack as a gift" idea; see `docs/DECISIONS.md` "Referral program
  replaces gifting"): every tenant gets a shareable invite link. When
  someone signs up with it and subscribes, the referrer gets free
  stories added to their own quota, one-time, matching whatever plan
  the new subscriber picked — no separate price list to maintain. Not
  to be confused with the cash-commission "Nursery Partner Program"
  below — this one pays in stories, to whoever did the inviting
  (nursery or family alike), not cash to a nursery specifically.
- **Family** (built — `plans.key = 'family'`, `audience = 'family'`):
  $9/month for 1 story/month — cheaper per-story than a one-off
  purchase would be, for recurring use.
- **Family Plus** (built — `plans.key = 'family_plus'`): $19/month for
  3 stories/month.

**Why this is monthly, not a one-off pack**: every plan here — family
and nursery alike — is a story *allowance that resets each period*,
not a fixed pack of stories you buy once and run out. The pitch to a
customer should match that: a family isn't buying "a storybook," it's
subscribing to a new personalised story every month as their child
grows, and a nursery isn't buying "graduation keepsakes," it's running
an ongoing monthly values curriculum. See `docs/en/sales-kit.md` "Why
recurring, not one-time" for the framing to use with a customer who
only asks for a single one-time story.

Both family plans use the same period-based quota model as the nursery
tiers (a flat monthly allowance, reset each period) — the "rolls over
up to 3" rollover-credit idea from an earlier draft of this doc is
**not** implemented; it would need a different quota mechanism (an
accumulating balance capped at 3, rather than a flat per-period reset)
that doesn't exist yet. Simple flat allowance for now, matching every
other plan in the system.

`plans.audience` (`'nursery'` or `'family'`) keeps the two plan
families apart: the settings page only shows a tenant the plans that
match its own type, and the checkout route rejects a cross-type
purchase server-side (`planIsAvailableForTenant` in
`src/lib/domain/billing.ts`) even if the UI were bypassed.

Gift packs and family plans are priced in USD; nursery plans now have
both an AED row and a USD row per tier (`starter`/`starter_usd`,
`growth`/`growth_usd`, `network`/`network_usd`) so a nursery outside
the UAE can subscribe in USD — the dashboard billing tab shows a
currency toggle whenever more than one currency exists for that
tenant's audience, defaulting to whatever currency an existing
subscriber is already on, else AED. The USD nursery prices below are a
straightforward AED→USD conversion at the UAE's pegged rate, rounded
to a clean number — a provisional placeholder, not researched
international pricing, worth revisiting once there's real
market/competitor data for nurseries outside the UAE:

| Tier | AED/mo | USD/mo | AED/yr | USD/yr |
|---|---|---|---|---|
| Starter | 499 | 135 | 4,790 | 1,299 |
| Growth | 1,299 | 349 | 12,490 | 3,349 |
| Network | 3,499 | 949 | 33,490 | 9,109 |

Still worth resolving once a merchant-of-record setup is chosen: which
entity is actually the seller of record for a USD sale to a nursery
outside the UAE (affects VAT applicability — see the VAT-inclusive
note above, currently left `true` on the USD rows too, matching how
the existing USD family plans were already set, pending an accountant's
read on this rather than a guess made in code).

## Sizing the Gemini spend cap

The AI Studio spend cap (`aistudio.google.com/spend`) is a hard stop
for the **whole platform**, not per customer — the app's own per-tenant
`quotas` table stops one nursery from overspending its own plan, but
nothing stops the platform-wide cap from being hit while a fully-paid
customer still has quota left. That's a real outage, not graceful
degradation.

**Rule of thumb: required cap ≈ (sum of every active tenant's monthly
story quota) × $1.00 × 1.3**, capped at whichever is lower of that
number and Google's current tier ceiling. Re-check this every time a
new nursery contract closes — it changes with every signed deal, not
just once at launch. Reference points: 1 Growth nursery (100
stories/mo) needs ≈$130; 3 Growth nurseries need ≈$390; 1 Network
customer (500 stories/mo) needs ≈$650.

Two different numbers matter here, and they're not the same thing —
don't confuse a spending *plan* with a safety *ceiling*:

- **Google's own mandatory Tier 1 cap is ~$250/month**, hard, not
  adjustable without applying for a Tier 2 upgrade (needs a payment
  history with Google first). At $1/story that's ≈250 stories/month,
  platform-wide — the binding external constraint once you have even a
  single Network customer plus a couple of Growth accounts.
- **Realistic Year 1 expected spend is far lower than that** — see
  `docs/en/budget.md`'s bottoms-up calculation (free pilots plus a
  realistic ramp to 3-5 paying nurseries): roughly $1,000-1,100 for the
  whole year, averaging under $100/month. An earlier version of this
  doc used a flat AED 20,000/year (~$454/month) placeholder here; that
  was an unvalidated guess, not a calculation, and overstated real
  Year 1 usage by 4-5x.

Practically: don't set the AI Studio spend **cap** to match your
budgeted **spend** — the cap needs headroom above expected usage so it
doesn't hard-block a good month, while the budget line is what you
actually plan to spend. Start the cap around **$150-200/month** (safely
under the $250 Tier 1 ceiling, comfortably above the ~$85-100/month
realistic Year 1 average), and apply for Tier 2 once committed volume
approaches the ceiling rather than after exceeding it. Switch from AI
Studio's experimental per-project cap to Gemini's Prepay billing with
auto-reload once revenue is real, so a cap breach pauses new spend
gracefully instead of as a mid-month surprise.

## Nursery Partner Program (referral commission)

Each subscribed nursery can get a unique referral link/QR code; a
parent who buys a family story pack or subscription through it earns
the nursery a commission, paid monthly, on top of — not instead of —
their own subscription. This turns every nursery customer into a sales
channel for the family product. At a 20% commission rate: 1 story pack
($15) → nursery earns AED 11, your margin stays ~73%; 6 story pack
($69) → nursery earns AED 51, margin ~71%; Family monthly ($9/mo) →
nursery earns AED 7/mo recurring, margin ~69%. All figures use the
$1.00/story COGS from the cost basis above, not the $0.404 theoretical
minimum.

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
  themes already in the catalog. Use each one to *open* a
  subscription conversation, not to frame the whole product: a
  nursery that signs up "for graduation" and never sees another story
  until next June is a churn risk, not a retained customer — the
  value case is the other 11 months of monthly stories tied to
  whatever's actually on the curriculum that month.

See `docs/en/budget.md` for the full annual operating budget (licence
renewal, hosting, legal, trademark, accounting) these prices need to
cover.

## The first paying nursery: what to actually do, in order

Everything above is the pricing model. This is the sequence once
someone actually says yes — day 1 through the point it's a repeatable
pattern, not a one-off.

**Week 1 — get them to real usage fast, personally.**
Don't send a self-serve signup link and wait. Sit with their staff (in
person or on a call) for the first CSV import and the first 2-3
stories, in both languages if they serve both. The goal isn't just
"it works" — it's watching a real staff member hit a real confusion
point, because that's the thing you'll fix before nursery #2. Confirm
their invoice/PO process now if they're not paying by card
immediately (Network-tier accounts often need one — see "Payment
terms" above).

**Week 2-4 — turn their usage into your safety numbers.**
Once they're actively generating, this is the first month real
non-founder usage will actually test the Gemini spend cap and the
per-tenant quota, not test data. Watch `global_spend_cap` and this
nursery's `quotas` row directly in Supabase daily for the first two
weeks — don't wait for the app to tell you something's wrong. If
their real usage pattern doesn't match the plan you sold them (e.g.
they're a Starter account burning through 25 stories in the first
week), that's a signal to have the upsell conversation early, not
wait for them to hit the wall.

**Month 1 close — recompute, don't assume.**
Re-run the cost-basis query above against *their* actual `story_pages`
rows specifically. This is the first real-world data point that isn't
founder test data — it either confirms the $1.00/story planning
figure or tells you it needs revising before nursery #2 signs at the
same price. Also recheck the AI Studio spend cap sizing math (above)
against combined real usage, not the Year 1 estimate.

**Ongoing — build the reference before you build the next sale.**
A single happy nursery is worth more as a case study than as revenue
at this stage: ask for a short testimonial or a photo of a printed
story in use (with consent — see the consent flow already built),
and ask directly whether they'd introduce you to one other nursery
owner in their network (see "Sales channel" above — this market runs
on those introductions far more than outbound). Set up their referral
link (once built — see "Nursery Partner Program" above) so any family
they bring in during this period is tracked from day one, not
retrofitted later.

**What not to do yet.** Don't hire, don't build the not-yet-built
referral/payout engineering, and don't discount future customers
based on what you gave the first one to close the deal — a single
data point is not a trend. Revisit this whole section once there are
3-5 paying nurseries, not before; the budget and margin numbers above
already tell you what that milestone should look like financially
when it arrives.
