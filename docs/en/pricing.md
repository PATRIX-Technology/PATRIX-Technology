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

Every nursery runs through two pricing phases: a 100%-free pilot class
(no price — see "Launch offers" below), then the discounted
**Founding Partner launch rate** for the first 10 nurseries who decide
before real launch (**1 January 2027**), then the **standard rate**.
Shown as two separate tables so a rep never conflates launch-phase
pricing with the standard rate a nursery eventually settles into.

Founder decision, 16 Oct 2026: this offer is **not publicly
advertised** — the standard rate is what every pricing surface (app,
decks, docs) shows by default. `FOUNDING10` stays a real, working
Stripe coupon (self-limiting to its first 10 redemptions regardless),
but it's handed personally to the specific nurseries the founder signs
during the current free-pilot months, not printed as a public CTA.

### Founding Partner launch pricing (first 10 nurseries, decided before 1 January 2027)

| Plan | Founding Partner price (mo) | Founding Partner price (yr) | Digital stories / month | Story suggestions / month | Seats included |
|---|---|---|---|---|---|
| **Starter** | AED 374.50/mo | AED 3,592.50/yr | 25 | 10 | 3 |
| **Growth** | AED 974.50/mo | AED 9,367.50/yr | 100 | 20 | 10 |
| **Network** | AED 2,624.50/mo | AED 25,117.50/yr | 250 | 30 | 50 |

**The real mechanic, not just a marketing line — simplified 16 Oct
2026 to a flat, same-for-everyone rule:**

- **Decide (sign up) before 1 January 2027**: the discount is a flat
  **12 months, 1 January 2027 → 1 January 2028**, for every nursery
  alike — monthly or annual, no matter which month during the
  free-pilot they actually convert. A nursery converting in November
  2026 doesn't start being charged in November — Stripe is told (via
  `trial_end` on the subscription) to hold the *first* invoice until 1
  January 2027. They keep using the app through that waiting period;
  only the first *charge* is delayed, not product access. Annual uses
  `duration: 'once'` on that first (now-anchored) invoice; monthly uses
  `duration: 'repeating', duration_in_months: 12` — both land on
  exactly the same Jan 2027 → Jan 2028 window because both are
  anchored to the same `trial_end`. Then both revert to standard
  pricing from 1 January 2028.
- **Decide on or after 1 January 2027**: no discount at all, not even
  a reduced one — standard pricing applies immediately, billed from
  checkout as normal, same as any other subscription. `FOUNDING10`'s
  own `expires_at` is set to 1 January 2027, so `validateCoupon`
  rejects any attempt to redeem it after that date.
- Built as `computeFoundingPartnerCouponParams` +
  `computeFoundingPartnerTrialEnd` in `src/lib/domain/coupons.ts`
  (unit-tested) — see `docs/DECISIONS.md` "Founding Partner discount
  simplified to a flat 12 months" for the full mechanism and why an
  earlier, more complicated "months remaining until cutoff" version of
  this was replaced.
- Live coupon code: `FOUNDING10` (50% off, `max_redemptions: 10`,
  expires 1 January 2027) — seeded directly in the `coupons` table.
  Redemption-ready as soon as every plan's
  `stripe_price_id_monthly`/`_annual` is populated — see
  `scripts/setup-stripe-plans.mjs`.

**Confirmed no tier sells at a loss at this rate, monthly or annual.**
Starter nets ~63% margin monthly / ~54% annually even at 50% off,
Growth ~43.5% / ~29.4%, Network ~48% / ~34% (price and cost scale by
the same factor). **Network's included quota is 250 stories/mo
permanently — not a temporary launch-phase halving that reverts to
500.** This was originally built as a 3-month founding-partner-only
cut with a manual reset in month 4; raised to a permanent change for
two reasons: it keeps Network's margin at a healthy ~48%/~34% (a flat
50% cut at the old full 500-story quota would price below cost), and
it meaningfully reduces how much headroom a single Network customer
needs against Google's own ~$250/month Tier 1 cap (see "AI Studio
spend cap" below) — halving the quota roughly halves the risk, even
though on the conservative planning basis one Network customer alone
can still approach that cap; real production spend per image has run
well under the conservative figure, which is the realistic case. Because
this is now the plan's actual `stories_per_month` value
(`plans` table), it applies automatically at checkout like every other
tier — no manual `quotas.stories_included_this_period` override or
month-4 reset needed any more.

Founding Partner nurseries that also commit to an annual plan get **5
free printed copies** (AED 81 standalone value each, AED 200 total
print cost to us at the AED 40/book single-copy rate — down from AED
225 under the old flat AED 45/book assumption) as a trust-builder for a
first customer who hasn't seen a physical book yet.

### Standard pricing (month 4 onward, and every nursery not on the Founding Partner offer)

| Plan | Monthly | Annual (≈2 months free) | Digital stories / month | Story suggestions / month | Seats included | COGS/mo | Gross margin |
|---|---|---|---|---|---|---|---|
| **Starter** | AED 749 | AED 7,185 | 25 | 10 | 3 | AED 138 | ~82% |
| **Growth** | AED 1,949 | AED 18,735 | 100 | 20 | 10 | AED 551 | ~72% |
| **Network** | AED 5,249 | AED 50,235 | 250 | 30 | 50 | AED 1,378 | ~74% |

Best for: Starter — a single nursery branch piloting the product;
Growth — a multi-branch nursery or a school; Network — a nursery
group, hospital, or bank running a campaign across many locations.
Prices raised from the original AED 499/1,299/3,499 — see "Cost basis"
above for why. "Story suggestions / month" is a fixed number per
billing period (`plans.suggestion_requests_per_month`, enforced by
`consume_suggestion_quota` — migration 0038), the same quota mechanism
as the story allowance itself, **not** a per-hour rate limit like an
earlier build of this feature used — see `docs/DECISIONS.md` "Story
suggestions: fixed count per period, not per hour".

**Both tables above are digital stories only — zero printed copies in
either one.** A nursery's subscription never requires or assumes
printing; whether to print any of those stories, and how many, is the
nursery's own choice, made per order (see the printed-copy table
immediately below — same ladder for both the launch and standard
phases). The more copies a nursery actually orders at once, the
cheaper each copy gets automatically — that bulk curve is about print
*order* size, and is completely independent of which pricing phase or
subscription tier the nursery is on.

### Printed copies — B2B (optional add-on, same ladder at every tier and every pricing phase)

| Quantity | Price / book | Delivery fee (UAE) | Markup on cost | Notes |
|---|---|---|---|---|
| 1 (standalone) | **AED 81** (≈$22) | AED 30 flat | 103% | Default checkout price |
| 10-49 | **AED 69** | AED 30 flat | 590% | Nursery class-set pricing |
| 50-99 | **AED 63** | AED 30 flat | 688% | Nursery multi-class pricing |
| 100+ | **AED 58** | **Free** | 867% | A full graduation/term-end print run for a nursery |

Full cost basis, margin math, and fulfillment status in "Printed
copies" below — this is the same ladder, repeated here so it's visible
alongside the subscription prices rather than only further down the
doc. Sell prices here are unchanged by the October 2026 per-unit cost
update; the much higher markup is because real cost now falls sharply
with order size instead of staying flat — see "Printed copies" below.

### Self-serve vs. managed

Every tier above is **self-serve** (nursery staff use the dashboard
themselves) by default. A **managed-service** add-on — Ownly's team
creates and submits stories against a class roster and theme calendar
for the nursery to approve — is priced as a flat **+40% uplift** on the
base plan (e.g. Growth becomes AED 2,729/mo). Margin stays above 60%
even with the added labour.

### Launch offers

- **Free pilot** — one trial class, up to 25 children, 100% free, 4–6
  weeks from kickoff to finished storybooks. No price, so no table row
  for it — see the Founding Partner table above for what a nursery
  pays once it converts.
- **Founding partner** — the discounted launch-phase pricing in the
  table above, for the first 10 nurseries who decide before real
  launch on 1 January 2027 (not publicly advertised — handed
  personally, see above). A flat 12 months discounted, 1 Jan 2027 → 1
  Jan 2028, monthly or annual alike, billing anchored to launch day
  regardless of which pilot month they actually convert in — deciding
  on or after 1 January 2027 gets no discount at all. See the table
  above for the mechanism.
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

Families don't have a pilot/Founding-Partner phase — no free trial
class exists on this side (see "No free trial" above) — so there's
only one pricing table, not two.

| Plan | Monthly | Annual (≈2 months free) | Digital stories / month | Story suggestions / month |
|---|---|---|---|---|
| **Family** | $14 / AED 50 | $135 / AED 495 | 1 | 3 |
| **Family Plus** | $29 / AED 105 | $285 / AED 1,045 | 3 | 5 |

- **Family** (built — `plans.key = 'family'`, AED twin `family_aed`,
  `audience = 'family'`): cheaper per-story than a one-off purchase
  would be, for recurring use. Raised from $9, same 1.5× reasoning as
  the nursery tiers above — family's per-story AI cost rose the same
  way.
- **Family Plus** (built — `plans.key = 'family_plus'`, AED twin
  `family_plus_aed`): raised from $19.

### Printed copies — family (optional add-on, same ladder as B2B)

| Quantity | Price / book | Delivery fee (UAE) | Markup on cost | Notes |
|---|---|---|---|---|
| 1 (standalone) | **AED 81** (≈$22) | AED 30 flat | 103% | Default checkout price |
| 10-49 | **AED 69** | AED 30 flat | 590% | A family ordering for a class gift or school event |
| 50-99 | **AED 63** | AED 30 flat | 688% | Larger group order |
| 100+ | **AED 58** | **Free** | 867% | Rare for a single family, but the same ladder applies |

Full cost basis, margin math, and fulfillment status in "Printed
copies" below.

As with the nursery tables above, this is a digital-story quota only —
a printed copy of any story is always a separate, optional purchase a
family chooses per order, never something the monthly price includes
or requires.

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
| Network | AED 50,235 | AED 16,530 | **~67%** | ~74% |
| Family | AED 495 | AED 66 | **~87%** | ~89% |
| Family Plus | AED 1,045 | AED 198 | **~81%** | ~85% |

All five are solidly profitable — none are a loss, and none needs a
founder decision on the annual discount any more: with Network's quota
fixed at 250 stories/mo (see above), its annual margin (~67%) sits
in line with the other tiers rather than standing out as the thin one.

### Founding-partner coupon duration depends on billing interval

Superseded an earlier version of this offer that blocked coupons on
annual billing outright, because a single Stripe coupon with a fixed
`duration_in_months` can't mean "3 invoices" on monthly and also "the
whole first annual invoice, once" on annual without a real revenue gap
on one side or the other. Rebuilt so the actual duration is computed
per checkout from billing interval + signup date + the campaign's own
cutoff (`computeFoundingPartnerCouponParams` in
`src/lib/domain/coupons.ts`) — **annual** gets `duration: 'once'`
(discounts the full first annual invoice, renewal reverts
automatically); **monthly** gets `duration: 'repeating'` for however
many calendar months remain until the cutoff. See "Founding Partner
launch pricing" above for the resulting prices and
`docs/DECISIONS.md` "Founding Partner discount duration by billing
interval" for the full mechanism. A live coupon (`FOUNDING10`) exists
in the `coupons` table now, but is inert until Stripe is actually
connected (every plan's `stripe_price_id_monthly`/`_annual` is still
null).

## Printed copies (add-on, nursery and family alike)

**Entirely optional, decided per order — never bundled into or implied
by a subscription.** A nursery's monthly story quota (see "B2B —
nurseries & schools" above) is digital only; whether to print any of
it, and how many copies, is a choice the nursery makes each time it
places a print order, not something the plan commits them to. The
price per copy drops automatically the more copies go into that one
order, down to AED 58/copy, and delivery itself is also free once an
order reaches 100+ copies — see the bulk table below.

A physical printed copy of an already-approved digital story, ordered
and paid via Stripe checkout (`print_orders` table, covered in
`docs/DECISIONS.md`) — **UAE delivery only**; there is no international
fulfillment path today. Real cost basis, updated to a firmer per-unit
vendor quote (A4, 8 pages including cover; print vendor still not
under signed contract — see `docs/NEEDS_FROM_ME.md`):

| Quantity ordered | Print cost / book |
|---|---|
| 1 | AED 40 |
| 10-49 | AED 10 |
| 50-99 | AED 8 |
| 100+ | AED 6 |

Replaces the earlier flat AED 45/book assumption used at every
quantity — the real vendor cost drops sharply at volume instead of
staying flat, which the sell-price table below did not previously
reflect. **The vendor's own delivery charge to us is still unconfirmed**
— don't confuse it with the AED 30 delivery *fee* we charge the
customer below, which is a separate, already-decided number; get a
real delivery-cost figure from the vendor before treating margin below
as final. **The ordering and pricing mechanism is live; fulfillment is
not** — don't accept or promise a real customer's print order until a
print vendor is actually under signed contract, not just quoted. Digital
generation cost is already covered by the underlying subscription — a
printed copy's own price only needs to clear the print cost itself plus
payment fees, not re-absorb the AI cost too.

**Sell prices below are unchanged by this cost update** — they were
set at an 80% markup on the old flat AED 45 cost and have not been
re-decided against the new per-tier costs; that is an open pricing
question for the founder, not something this update resolves on its
own.

| Quantity | Price / book | Delivery fee (UAE) | Markup on cost | Notes |
|---|---|---|---|---|
| 1 (standalone) | **AED 81** (≈$22) | AED 30 flat | 103% | Default checkout price |
| 10-49 | **AED 69** | AED 30 flat | 590% | Nursery class-set pricing |
| 50-99 | **AED 63** | AED 30 flat | 688% | Nursery multi-class pricing |
| 100+ | **AED 58** | **Free** | 867% | A full graduation/term-end print run for a nursery |

Margin check at the standard AED 81 price: 81 − 40 (print) − ~2 (card
fees) ≈ **AED 39/book (~48% gross margin)**, before the separate AED 30
delivery charge below — up from ~AED 34/~42% under the old flat-cost
assumption. The bulk tiers shift far more: at AED 69/10-49 the real
margin is now ≈ **AED 57/book (~83%)**, at AED 63/50-99 ≈ **AED 53/book
(~84%)**, and at the AED 58/100+ tier ≈ **AED 50/book (~86%)** — all
sharply higher than the old flat-cost math implied, since the vendor's
real per-unit cost falls much faster with volume than the sell-price
ladder does. This is the open pricing question flagged above: at these
margins the bulk tiers could plausibly be priced lower to be more
competitive while staying very profitable, but that's a founder call,
not made here. Free delivery above 100 copies is still justified (a
bulk shipment's per-unit delivery cost collapses at that volume); every
order under 100 copies is charged a flat **AED 30 delivery fee**
instead (built, not just documented — see
`getPrintOrderDeliveryFeeMinor` in `src/lib/domain/print-orders.ts`), a
standard Dubai local-courier express rate for a parcel this size (a few
bound storybooks, well under a typical 20kg local-parcel limit) rather
than an unrecovered cost or an unrealistic extension of the 100+
free-delivery tier to every order — though this AED 30 figure was set
against the old flat print-cost assumption too and hasn't been
re-checked against the vendor's real (still-unconfirmed) delivery cost.

**Now automated**: the Stripe checkout flow applies this ladder itself
based on how many copies are in the checkout (`getPrintOrderUnitPriceMinor`
in `src/lib/domain/print-orders.ts`) — a nursery selecting 30 approved
stories on the stories list and checking out together is charged the
10-49 class-set price on every copy automatically, no manual price
lookup needed. The delivery fee is automated the same way
(`getPrintOrderDeliveryFeeMinor`): AED 30 as its own line item in the
Stripe Checkout session for any order under 100 copies, 0 at 100+. The
old WhatsApp flow this replaced (where a human applied the tier by
hand) is gone — see docs/DECISIONS.md "Bulk print ordering, paid
online, replaces the WhatsApp no-payment bypass" and "Automated
bulk-tier print-order pricing".

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
customer (250 stories/mo, since Network's quota was fixed at 250 — see
"Founding Partner launch pricing" above) needs ≈$488 on this
conservative $1.50/story basis — still above the $250 Tier 1 ceiling on
its own, though the realistic figure is much lower: real production
spend has run at $0.101/image (6 images/story = $0.606/story), which
puts a single Network customer at ≈$152/month, comfortably under the
cap. Budget the conservative figure; don't assume the realistic one
without watching actual `ai_spend_ledger` totals once a Network
customer is live.

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
- **If a founding partner signs on Network**: nothing manual needed any
  more — 250 stories/mo is the plan's actual quota now, so it applies
  automatically at checkout the same way every other tier does. Only
  the Stripe coupon for the 50% discount needs applying. See "Cost
  basis" → "Founding Partner launch pricing" above for why the quota
  itself was fixed at 250 permanently.
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
