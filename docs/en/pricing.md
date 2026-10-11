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

Every story renders 6 illustrated interior pages
(`supabase/seed/templates.json`, extended from 4 to 6 — see
`docs/DECISIONS.md` "8-page structure: extending every template") through
Gemini at 2K resolution, at **$0.101/image** — the constant the app's own
spend tracking already uses (`GEMINI_COST_PER_IMAGE_USD` in `.env.local`).
The cover and back page added around those interior pages are templated
(reuse the child's existing avatar and story data) and cost nothing extra
in Gemini calls — see `docs/DECISIONS.md` "6-page structure: cover + back
page". A clean 6-image story prices at **$0.606 (≈ AED 2.22)** in raw AI
cost — the theoretical floor at this page count. Real observed *total*
spend runs higher — **$1.50/story (≈ AED 5.51)** is the updated planning
figure, scaled up from the founder's original $1.00/story figure in the
same proportion as the page-count increase (4 → 6 images is a 1.5×
multiplier), preserving the same retry/safety-margin headroom it was
built with. All planning below uses $1.50/story.

Manual "regenerate this page" clicks (each one a real, separate Gemini
call on top of the $1.50 planning figure) are now capped at **1 per
story total, across every page, for every subscription tier** — tightened
from the previous 3-per-page cap (which allowed up to 18 extra calls on
one 6-page story in the worst case). See `docs/DECISIONS.md`
"Regeneration limit: once per story, not per page" — a deliberate cost
control, enforced at the database layer (the `regenerate_story_page`
RPC), not just the UI.

**Why there's a gap at all, concretely** (found and fixed the same day,
back when the story was still 4 pages): one testing session spent $23 in
real Google billing but only produced 3 finished stories — roughly
$7.67/story, far above the then-$0.404 floor. The cause wasn't the AI
cost itself; it was two infrastructure bugs that made a single requested
story cost several retried Gemini calls before finishing (a generation
job that could get silently stuck forever, and a retry mechanism that
burned through a job's attempts on bad timing rather than a real failure
— see `docs/DECISIONS.md`). Both are fixed now. The $1.50/story planning
figure keeps headroom built in above the $0.606 floor for legitimate
retries (safety-check rejections, a rare bad generation) — keep using
it, but re-run the query below periodically to confirm the gap stays
small, rather than assuming it's permanently settled.

```sql
select avg(story_total) as avg_cost_per_story, count(*)
from (
  select story_id, sum(cost_usd) as story_total
  from story_pages
  where image_status = 'GENERATED'
  group by story_id
) t;
```

The 8-page extension raised per-story AI cost by 50% (4→6 images),
which would have compressed every tier's margin at its original
price: Starter from ~82% to ~72%, Growth from ~72% to ~58%, and
Network from ~48% to ~21% — the last one hit hardest because AI cost
scales with volume while a flat monthly fee doesn't.

**Resolved: every subscription price raised by the same 1.5× the AI
cost rose, across every tier** (nursery and family alike, not only
Network — a founder decision, not something decided here). Scaling
price by the exact same factor the cost rose restores each tier's
*original* margin percentage exactly, by construction:
`(1.5P − 1.5C) / 1.5P = (P − C) / P`. The new prices are in the table
below; see `docs/DECISIONS.md` "Subscription prices raised 1.5x to
restore pre-8-page margins" for the full numbers and the live
`plans` table update.

## B2B — nurseries & schools

| Plan | Monthly | Annual (≈2 months free) | Stories / month | Seats included | Story suggestions / month | COGS/mo | Gross margin | Best for |
|---|---|---|---|---|---|---|---|---|
| **Starter** | AED 749 | AED 7,185 | 25 | 3 | 10 | AED 138 | ~82% | A single nursery branch piloting the product |
| **Growth** | AED 1,949 | AED 18,735 | 100 | 10 | 20 | AED 551 | ~72% | A multi-branch nursery or a school |
| **Network** | AED 5,249 | AED 50,235 | 500 | 50 | 30 | AED 2,753 | ~48% | A nursery group, hospital, or bank running a campaign across many locations |

Prices raised from the original AED 499/1,299/3,499 — see "Cost basis"
above for why. "Story suggestions / month" is a fixed number per
billing period (`plans.suggestion_requests_per_month`, enforced by
`consume_suggestion_quota` — migration 0038), the same quota mechanism
as the story allowance itself, **not** a per-hour rate limit like an
earlier build of this feature used — see `docs/DECISIONS.md` "Story
suggestions: fixed count per period, not per hour".

### Self-serve vs. managed

Every tier above is **self-serve** (nursery staff use the dashboard
themselves) by default. A **managed-service** add-on — Ownly's team
creates and submits stories against a class roster and theme calendar
for the nursery to approve — is priced as a flat **+40% uplift** on the
base plan (e.g. Growth becomes AED 2,729/mo). Margin stays above 60%
even with the added labour.

### Launch offers

- **Founding partner** — 50% off for 3 months, locked to a 12-month
  term, for the first 10 nurseries who sign. Add **5 free printed
  copies** (at AED 81 standalone value each, AED 225 total print cost
  to us — a small, concrete trust-builder for a first customer who has
  never seen a physical book yet) to any founding-partner nursery that
  also commits to an annual plan.

  **Network-tier exception — quota halved during the 3 discounted
  months only.** A straight 50% price cut only stays profitable on a
  tier whose normal margin is above 50%: Starter (~82%) and Growth
  (~72%) both clear that easily even at half price (AED 374.50/mo and
  AED 974.50/mo respectively, both comfortably above their AED 138 and
  AED 551 AI cost). **Network sits at ~48%**, just under the line, so
  a flat 50% discount at the full 500-story quota prices below cost:
  AED 2,624.50/mo revenue against AED 2,753/mo AI cost — a real loss
  of ≈AED 129/mo (≈AED 386 over the 3 months), before Stripe fees. Fix:
  halve the quota alongside the price for a Network founding partner
  specifically — **250 stories/mo for the 3 discounted months**, full
  500/mo once full price starts in month 4 — which holds the margin at
  the same ~48% (price and cost scale by the same factor, so the ratio
  is unchanged) at zero added cost. The "50% off" pitch stays identical
  for every tier; only Network's pilot-phase allowance is sized to
  match. This is a manual step today (set `quotas.stories_included_this_period`
  to 250 for that tenant alongside the Stripe coupon, both set up by
  hand for the first 10 nurseries anyway — see "Operating playbook"
  below), not something `sync_quota_to_plan` does automatically.
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
- **Family** (built — `plans.key = 'family'`, AED twin `family_aed`,
  `audience = 'family'`): $14 / AED 50 per month for 1 story/month —
  cheaper per-story than a one-off purchase would be, for recurring
  use. 3 story-template suggestions/month. Raised from $9, same 1.5×
  reasoning as the nursery tiers above — family's per-story AI cost
  rose the same way.
- **Family Plus** (built — `plans.key = 'family_plus'`, AED twin
  `family_plus_aed`): $29 / AED 105 per month (raised from $19) for 3
  stories/month. 5 story-template suggestions/month.

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

Every plan on both sides now has both an AED row and a USD row
(nursery: `starter`/`starter_usd`, `growth`/`growth_usd`,
`network`/`network_usd`; family: `family`/`family_aed`,
`family_plus`/`family_plus_aed`) — the dashboard billing tab shows a
currency toggle automatically whenever more than one currency exists
for that tenant's audience (`BillingSection.tsx`), defaulting to
whatever currency an existing subscriber is already on, else AED for
nursery / USD for family (each side's historical primary currency).
Every secondary-currency row below is a straightforward conversion at
the UAE's pegged rate (~3.6725 AED/USD), rounded to a clean number — a
provisional placeholder, not researched international/local consumer
pricing, worth revisiting once there's real market/competitor data:

| Tier | AED/mo | USD/mo | AED/yr | USD/yr |
|---|---|---|---|---|
| Starter | 749 | 199 | 7,185 | 1,949 |
| Growth | 1,949 | 525 | 18,735 | 5,025 |
| Network | 5,249 | 1,425 | 50,235 | 13,665 |
| Family | 50 | 14 | 495 | 135 |
| Family Plus | 105 | 29 | 1,045 | 285 |

Still worth resolving once a merchant-of-record setup is chosen: which
entity is actually the seller of record for a USD sale to a nursery
outside the UAE (affects VAT applicability — see the VAT-inclusive
note above, currently left `true` on the USD rows too, matching how
the existing USD family plans were already set, pending an accountant's
read on this rather than a guess made in code).

### Annual pricing — margin check

Every tier's annual price applies roughly the same ~18-20% discount off
12× the monthly price (not a strict "2 months free" — see the table
note above) — this compresses margin below the monthly figure (the
discount comes straight off the top of an already cost-covering price),
so it needs its own check rather than assuming "the monthly price is
fine, so annual is fine too." At $1.50/story COGS, full usage every
month of the year:

| Tier | Annual price | Annual COGS (12× stories/mo) | Annual margin | Monthly margin |
|---|---|---|---|---|
| Starter | AED 7,185 | AED 1,656 | **~77%** | ~82% |
| Growth | AED 18,735 | AED 6,612 | **~65%** | ~72% |
| Network | AED 50,235 | AED 33,036 | **~34%** | ~48% |
| Family | AED 495 | AED 66 | **~87%** | ~89% |
| Family Plus | AED 1,045 | AED 198 | **~81%** | ~85% |

All five are solidly profitable — none are a loss. **Network's annual
margin (~34%) is the one worth a founder decision**: it's a real,
expected compression (the annual discount applies to a tier whose
monthly margin is already the thinnest of the three), not a bug, but
it's a noticeably bigger gap from its monthly figure than the other
tiers show. If Network nurseries are expected to be the ones most
likely to commit annually (a 500-story/mo operation is the segment most
likely to want to lock in a year), consider a shallower annual discount
on Network specifically rather than the same ~20% every tier gets.

### Founding-partner coupon is monthly-only, by design

The Founding Partner "50% off for 3 months" offer is implemented as a
Stripe coupon with `duration: 'repeating', duration_in_months: 3` —
that only means "3 months" against **monthly** billing (3 invoices).
Applied to an **annual** subscription (one invoice per 12 months),
Stripe still counts the 3-month window in calendar time, not billing
cycles: the coupon would discount the entire first annual invoice by
the full 50% (the first and only invoice to land inside that 3-month
window) rather than "3 months' worth" — a founder-sized revenue gap if
it had ever been allowed to happen, not a rounding quirk. Fixed by
blocking the combination outright: `/api/billing/checkout` now rejects
a coupon code when `billingInterval === 'annual'`, and the billing UI
disables the coupon field with an explanatory hint the moment Annual is
selected, so this is caught before a submit, not after a Stripe
invoice. See `docs/DECISIONS.md` "Founding-partner coupon blocked on
annual billing". No coupon has actually been created in Stripe yet
(`coupons` table is empty, Stripe isn't connected) — this was a design
gap to close before it could ever matter, not an active bug.

## Printed copies (add-on, nursery and family alike)

A physical printed copy of an already-approved digital story — ordered
either via Stripe checkout or the WhatsApp flow (`print_orders` table,
both covered in `docs/DECISIONS.md`). Real cost basis: **AED 45/book
for an 8-page print run**, a founder-sourced vendor quote (not yet a
signed contract — see `docs/NEEDS_FROM_ME.md`), landed cost unconfirmed
(flag whether that figure already includes delivery before relying on
it for margin). Digital generation cost is already covered by the
underlying subscription — a printed copy's own price only needs to
clear the print cost itself plus payment fees, not re-absorb the
AI cost too.

Standalone price set at an **80% markup** on the AED 45 cost (founder
decision): AED 45 × 1.8 = **AED 81**. Bulk tiers below keep the same
relative discount curve the old AED 59/54/49 tiers had off the old
AED 69 standalone price, just rescaled onto the new AED 81 base.

| Quantity | Price / book | Markup on cost | Notes |
|---|---|---|---|
| 1 (standalone) | **AED 81** (≈$22) | 80% | Default checkout price — replaces the earlier AED 69/$19 price |
| 10-49 | **AED 69** | 53% | Nursery class-set pricing |
| 50-99 | **AED 63** | 40% | Nursery multi-class pricing |
| 100+ | **AED 58** + **free delivery** | 29% | A full graduation/term-end print run for a nursery |

Margin check at the standard AED 81 price: 81 − 45 (print) − ~2 (card
fees) ≈ **AED 34/book (~42% gross margin)** — healthy, and better than
the old AED 69 price's ~32%. At the AED 58 bulk-100+ tier it's ~AED
13/book before delivery cost (up from ~AED 4/book at the old AED 49
tier), which is why free delivery is viable there (a single bulk
shipment's per-unit delivery cost collapses at 100+ copies) but would
not be at smaller quantities — don't extend free delivery below the
100-book tier without re-costing delivery first.

**Now automated**: the Stripe checkout flow applies this ladder itself
based on how many copies are in the checkout (`getPrintOrderUnitPriceMinor`
in `src/lib/domain/print-orders.ts`) — a nursery selecting 30 approved
stories on the stories list and checking out together is charged the
10-49 class-set price on every copy automatically, no manual price
lookup needed. The old WhatsApp flow this replaced (where a human
applied the tier by hand) is gone — see docs/DECISIONS.md "Bulk print
ordering, paid online, replaces the WhatsApp no-payment bypass" and
"Automated bulk-tier print-order pricing".

## Sizing the Gemini spend cap

The AI Studio spend cap (`aistudio.google.com/spend`) is a hard stop
for the **whole platform**, not per customer — the app's own per-tenant
`quotas` table stops one nursery from overspending its own plan, but
nothing stops the platform-wide cap from being hit while a fully-paid
customer still has quota left. That's a real outage, not graceful
degradation.

**Rule of thumb: required cap ≈ (sum of every active tenant's monthly
story quota) × $1.50 × 1.3**, capped at whichever is lower of that
number and Google's current tier ceiling. Re-check this every time a
new nursery contract closes — it changes with every signed deal, not
just once at launch. Reference points: 1 Growth nursery (100
stories/mo) needs ≈$195; 3 Growth nurseries need ≈$585; 1 Network
customer (500 stories/mo) needs ≈$975.

Two different numbers matter here, and they're not the same thing —
don't confuse a spending *plan* with a safety *ceiling*:

- **Google's own mandatory Tier 1 cap is ~$250/month**, hard, not
  adjustable without applying for a Tier 2 upgrade (needs a payment
  history with Google first). At $1.50/story that's ≈167 stories/month,
  platform-wide — the binding external constraint once you have even a
  single Network customer plus a couple of Growth accounts.
- **Realistic Year 1 expected spend is far lower than that** — see
  `docs/en/budget.md`'s bottoms-up calculation (free pilots plus a
  realistic ramp to 3-5 paying nurseries): roughly $1,500-1,650 for the
  whole year, averaging under $140/month. An earlier version of this
  doc used a flat AED 20,000/year (~$454/month) placeholder here; that
  was an unvalidated guess, not a calculation, and overstated real
  Year 1 usage.

Practically: don't set the AI Studio spend **cap** to match your
budgeted **spend** — the cap needs headroom above expected usage so it
doesn't hard-block a good month, while the budget line is what you
actually plan to spend. Start the cap around **$175-220/month** (safely
under the $250 Tier 1 ceiling, comfortably above the ~$125-140/month
realistic Year 1 average), and apply for Tier 2 once committed volume
approaches the ceiling rather than after exceeding it. Switch from AI
Studio's experimental per-project cap to Gemini's Prepay billing with
auto-reload once revenue is real, so a cap breach pauses new spend
gracefully instead of as a mid-month surprise.

## Nursery Partner Program (referral commission)

Each subscribed nursery can get a unique referral link/QR code; a
parent who subscribes to a family plan through it earns the nursery a
commission, paid monthly, on top of — not instead of — their own
subscription. This turns every nursery customer into a sales channel
for the family product. At a 20% commission rate: Family ($14/mo, 1
story) → nursery earns AED 10/mo recurring, your margin ~69%; Family
Plus ($29/mo, 3 stories) → nursery earns AED 21/mo recurring, margin
~65%. All figures use the $1.50/story COGS from the cost basis above
(updated for the 6-image story), not the $0.606 theoretical minimum.

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
- **If a founding partner signs on Network**: set
  `quotas.stories_included_this_period` to 250 for their tenant (not
  the default 500) for the first 3 months, alongside the Stripe
  coupon for the 50% discount — both manual steps anyway at this
  volume. Reset it to 500 once full price starts in month 4. See "Cost
  basis" → "Launch offers" above for why: at Network's own ~48%
  margin, halving only the price (not the quota) prices below cost.
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
founder test data — it either confirms the $1.50/story planning
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
