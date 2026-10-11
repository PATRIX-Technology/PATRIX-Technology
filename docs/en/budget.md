# Annual operating budget

Not financial, legal, or tax advice. Every "confirmed" figure below was
checked against a live source in the same session this doc was
written, not recalled from training data — re-verify before relying on
it for a real decision, prices change. AED conversions use the pegged
rate of 3.6725/USD. Bookkeeping and legal-review figures are working
estimates, not quotes.

## Recurring — fixed, every year

| Item | Annual (AED) | Note |
|---|---|---|
| Business licence renewal | 7,000 | As specified by the founder |
| Vercel Pro (1 seat) | 881 | $20/mo confirmed current rate; usage beyond the included credit bills separately |
| Supabase Pro (1 project) | 1,102 | $25/mo confirmed current rate; usage beyond the included quota bills separately |
| Claude subscription (support/engineering/product team) | 960 | AED 80/mo, founder-added this round — the AI tooling behind this app's own build/support work, distinct from the Gemini line below (that's the cost of *generating customer stories*, this is the cost of *building and running the business*) |
| Domain renewal (.ae) | 150 | AED 120-180/yr across registrars; a generic `.com` runs closer to AED 55/yr |
| Business email (Google Workspace, 1 user) | 264 | Not yet set up — every proposal/contact document in this repo assumes a real @ownly address |
| Apple Developer Program | 364 | Only if the iOS app is actually submitted; renews yearly |
| Bookkeeping, VAT & corporate tax filing | 9,000 | Estimate, not a quote — UAE Corporate Tax (9% above AED 375k) and quarterly VAT filing need an accountant regardless of revenue |
| **Subtotal, fixed recurring** | **19,721** | |

## AI generation — variable, scales with usage

Unlike the line items above, this isn't a subscription with a fixed
price — it's metered per story at the real **$1.50/story** cost
validated in `docs/en/pricing.md` (updated from $1.00/story when the
story's interior page count grew from 4 to 6 — see `docs/DECISIONS.md`
"8-page structure: extending every template"). An earlier version of
this budget used a flat AED 20,000/year placeholder here; that was an
unvalidated round number, not a calculation, and overstated realistic
Year 1 usage even at the current cost basis. Built bottoms-up instead:

| Phase | Stories | AI cost |
|---|---|---|
| Free pilots (≈5 pilots, ~20-25 children each) | ≈100-150 | ≈$150-225 |
| Ramp to 3-5 paying nurseries by year end (Starter/Growth mix) | ≈900-1,000 | ≈$1,350-1,500 |
| **Realistic Year 1 total** | **≈1,000-1,100** | **≈$1,500-1,650 (AED 5,510-6,060)** |

**Budgeted line: AED 7,500** — the bottoms-up estimate plus headroom
for pilots that run longer or regenerate more pages than expected.
This is a *planning* number, separate from the *safety cap* you set in
Google AI Studio (`aistudio.google.com/spend`), which should stay
higher — around **$150-200/month** — to avoid hard-blocking real usage;
see "Sizing the Gemini spend cap" in `docs/en/pricing.md`. Re-run this
calculation every time a new nursery signs — once you're past a
handful of paying Growth/Network customers, this line will be
materially higher than AED 5,000 and needs recomputing, not reused as
a constant.

| | Annual (AED) |
|---|---|
| Fixed recurring (above) | 19,721 |
| AI generation (Year 1 estimate) | 7,500 |
| **Subtotal, recurring** | **27,221** |

## One-time — year 1 only

| Item | One-time (AED) | Note |
|---|---|---|
| UAE trademark registration, one class | 10,000 | AED 6,500 government fee alone; AED 8,500-12,000 all-in with an agent — the formal legal clearance still needed for "Ownly" (the informal searches done for "Khayali" and "TooniX" don't carry over to a third, different name — see `docs/NEEDS_FROM_ME.md` item 2) |
| Legal review | 10,000 | Contract templates (the proposal/order form in `docs/en/sales/`), PDPL/privacy-policy review — both flagged in `docs/NEEDS_FROM_ME.md` |
| Google Play Console registration | 92 | One-time, not annual |
| **Subtotal, one-time** | **20,092** | |

## Variable — not a fixed line

Stripe processing fees, confirmed live: **2.9% + AED 1 per domestic
UAE card transaction, 3.9% + AED 1 + 1% FX for international cards.**
This comes out of revenue automatically per transaction, not as a
separate budget line. At the ~48-82% gross margins validated in
`docs/en/pricing.md`, a ~3% processing fee barely moves the number — a
Growth-tier AED 1,949/mo subscription nets about AED 57 in Stripe fees.

## Totals

| | AED |
|---|---|
| Recurring (every year) | 27,221 |
| One-time (year 1 only) | 20,092 |
| 15% contingency buffer | 7,097 |
| **Year 1 total** | **54,410** |
| | |
| Recurring (every year) | 27,221 |
| 15% contingency buffer | 4,083 |
| **Year 2+ ongoing total** | **31,304** |

Year 2+'s recurring line still includes the AED 7,500 AI-generation
estimate — realistic only if growth stays roughly where Year 1 left
it. If the nursery base has grown by then (which is the goal), rerun
the AI generation calculation above against actual signed nurseries
before trusting this total.

The 15% buffer is standard practice for a first operating year, since
at least one line here (bookkeeping, the trademark agent fee) will come
back different from this estimate once a real quote exists.

## Breakeven

How many of a single tier, subscribed for a full year, would cover the
entire Year 1 budget on its own (net of that tier's own AI cost, before
Stripe fees):

- **Starter**: ~8 nurseries × 12 months
- **Growth**: ~4 nurseries × 12 months
- **Network**: ~2 nurseries × 12 months

(Recalculated against the AED 54,410 Year 1 total above, using the
$1.50/story real-world AI cost from `docs/en/pricing.md` and the
subscription prices raised 1.5x there — see `docs/DECISIONS.md`
"Subscription prices raised 1.5x to restore pre-8-page margins". Every
tier's breakeven count dropped sharply from the pre-price-increase
figures (~13/~6/~6) since the price raise restored each tier's margin
*and* raised the absolute AED amount of that margin per nursery.)

In practice the mix will vary, and pilot/founding-partner discounts
(see `docs/en/pricing.md`) mean early months contribute less than full
price. Track the real number as soon as nurseries are signed: cumulative
net contribution ÷ 54,410 gives exact progress through Year 1's budget.

See also `docs/en/pricing.md` for what's charged and the nursery
referral program these numbers assume.
