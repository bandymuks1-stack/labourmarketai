# Commercial catalogue reconciliation (PLAN / ENTITLEMENT / PRICE / PAYMENT RAIL / LMC)

Date 2026-10-03. Docs only. No migration, no price or config change, no production write, no LMC enablement. Companion to `LMC_CANONICALIZATION.md`. This file supersedes its section 4 row "PLAN + ENTITLEMENT catalogue", which assumed `PRE_PAYMENT_PLANS` as canonical; that is NOT yet owner-approved.

Owner rule kept: 1 LMC = EUR 1. LMC, PLAN, ENTITLEMENT and PAYMENT RAIL are four separate concepts. No price is invented here: every figure below is already recorded by an owner decision (payments-price-table-gate.md, 2026-09-05) or is marked OPEN.

Sources read: `lib/billing/{plans,entitlements,entitlements-v1,prices,provider,reconcile-core,lmc-flags}.ts`, `providers/stripe-test.ts`, `lib/marketing/plans.ts`, `0002_reference_data.sql` (plans seed) plus the applied-ledger data update (free 0 / business 99 / agency and enterprise inactive), `docs/human-gates/payments-price-table-gate.md`, `docs/billing/*`, `docs/commercial/*`, PR #895 diff (`lib/commercial/catalogue.ts`, `commercial-system-v1.md`, guard), `LMC_BILLING_MODEL.md`.

## 1. Three-catalogue reconciliation

Legend: PPP = code `PRE_PAYMENT_PLANS`; DB = `public.plans`; STR = Stripe adapter/config (`prices.ts`, env slots, `providers/stripe-test.ts`); OWNER = owner-approved intended model (launch pricing 2026-09-05 and later decisions). "n/a" = the catalogue cannot express it.

| FIELD / SEMANTIC | PPP | DB plans | STR | OWNER INTENDED MODEL | LOSS IF PPP WINS (as it is today) |
|---|---|---|---|---|---|
| FREE (person) | `free_worker`, audience worker, accessState free, limits only | no row | none | PERSON EUR 0, whole identity loop, nothing sellable | none |
| FREE (organization) | `free_organization`, `company_create_needs: 1`, all org booleans true | `free`, price 0, active, features `{projects:1, job_demands:1, worker_search:false, support:community}` | none | ORGANIZATION FREE EUR 0, 1 concurrent active position; matching shortlist, candidate contact, bookings included | DB `worker_search:false` is the only record of a search restriction and it CONTRADICTS the owner table (free includes shortlist and contact), so PPP is right; loss is only the LT/EN display name and the `active` flag |
| Paid org tier | `company_pilot`, sellable, `company_create_needs: 10`, CTA `request_pilot_access` | `business`, EUR 99, active, named Organization / Organizacija, features `{projects:10, job_demands:25, worker_search:true, support:email}` | slot `STRIPE_PRICE_COMPANY_PILOT` | ORGANIZATION EUR 99/month, up to 10 concurrent active positions, tax-exclusive | price, currency, interval, tax basis, display names (PPP is guard-pinned to carry NO figure); DB `projects:10` / `support:email` claims (unenforced, stale vs `job_demands:25`) |
| Paid worker tier | `worker_plus`, deferred, expanded_cv, 10 countries, priority_visibility false | no row | slot `STRIPE_PRICE_WORKER_PLUS` (unset) | DEFERRED, not sold, not priced (PERSON stays free) | none now; #895 keeps prior art `ai_plus` 9.99 (replace-input-only) that PPP drops |
| Agency tier | `agency_pilot`, deferred, `company_create_needs: 25` | `agency` inactive NULL (managed_workers unlimited, broker_tools, priority support); `enterprise` inactive NULL (sso, sla, dedicated support) | slot `STRIPE_PRICE_AGENCY_PILOT` (unset) | DEFERRED; a provider subscribes to the same ORGANIZATION plan | DB capability text (managed_workers, sso, sla, dedicated support) has no PPP equivalent; owner-deferred, so a record loss only, but carry it as deferred catalogue rows, never delete |
| Above 10 positions | constant `OPEN_NEEDS_CONTACT_THRESHOLD = 10`; gate returns `individual_plan` | n/a (pricing card is i18n) | n/a | individual plan, agreed individually, no public price, never a silent charge | none (already in code); a priced enterprise row must never appear |
| Worker vs employer semantics | audience enum worker / company / agency / admin; default free plan per audience; organization is capability-based | slugs are marketing tiers, no audience | n/a | one organization plan family for employer, staffing provider, contractor, training provider; person always free | none |
| Usage limits | `company_create_needs` (count), `readiness_checklist_countries`; `vacancy_translations` false everywhere (quantities not set by owner) | `features` jsonb: projects, job_demands (wrong, unenforced) | n/a | open-needs count enforced on the ONE demand path; translation allowance model approved, quantities OPEN | AI runs per month, CV exports, media items, API calls, team seats, managed companies: PPP has no field (#895 records them as prior art with provenance) |
| Search / contact / shortlist / messaging / visibility | booleans `candidate_readiness_summaries`, `booking_requests`, `communication`, `team_matching`, `worker_pool`; `priority_visibility` false (never claimed) | `worker_search` boolean only | n/a | shortlist and contact included from FREE; visibility boosts deferred | PPP has no `search`, `shortlist` or `contact` key; today they are bounded by the open-needs count, not a feature flag. A later per-feature restriction has no slot until FeatureKey is extended |
| LMC relation | none (must stay: entitlement never reads LMC, plan never mints LMC) | none | none | plan-included monthly LMC UNDECIDED (none today); per-plan top-up discount UNDECIDED | plan-includes-LMC and top-up-discount axes have no home (#895: MOD-07, MOD-08, both open) |
| Top-up relation | none | none | none; flag `stripe_lmc_topups_enabled` owner_only, no route (MDD-20) | top-ups DEFERRED; Stripe only transports the payment, `lmc_record_purchase_v1` mints | package slots, denominations, min/max, VAT, refund policy: all OPEN, no home in PPP |
| Billing periods | none | `price_eur_monthly` only | recurring monthly price (owner-created, not readable from repo) | monthly only; annual DEFERRED | annual price slot (#895 MOD-03 open) |
| Price | none by design (guard) | 99 (and 0) | amount inside Stripe | 0 / 0 / 99 | the entire figure |
| Currency | none | none (implicit EUR) | inside Stripe price | EUR | needs an explicit field; implicit in two places today |
| Tax | none | none (implicit exclusive) | `automatic_tax` enabled, address and VAT id collected (checkout-tax-pins) | 99 is tax-exclusive; Stripe Tax adds VAT | tax basis is recorded only in a doc and a test pin |
| Legacy compatibility | historical slugs kept for rows and admin grants (`worker_plus`, `agency_pilot`) | retired rows kept inactive | unset slots | never rename or delete | must keep every slug and the explicit DB-slug map (free_organization = free, company_pilot = business) |
| App consumption | resolver `entitlements-v1`, then `open-needs-gate`, `booking-actions`, vacancy translation, billing section | `/pricing` via `public_plans_v1()` (names + figure) | checkout, webhook, reconcile | one resolver for all surfaces | n/a |
| API / MCP consumption | MCP demand confirm calls `gateOpenNeeds` with COOKIE entitlements; a bearer resolves `free_worker` (B1, fix #2010) | not read | not read | MCP must resolve the same entitlement as the web for the same subject | fixed in the resolver, not the catalogue; PPP wins nothing here until #2010 lands |

Facts needing no owner decision:
1. The only catalogue any gate reads is PPP. DB `features` and DB tier names are read by no gate.
2. EUR 99 has two copies with the same meaning (DB display, Stripe charge). `reconcile-core` flags `unexpected_price` and `unexpected_amount_or_currency`, but only for existing subscriptions (0 today), never for the Stripe Price object itself.
3. Historical W1 `launch_offer_99` (99.00 with UNLIMITED ads, until 2026-10-31) is a different, rejected concept and must not be merged into the 99 plan.

## 2. Recommendation: one catalogue, derived adapters, one resolver

```
ONE canonical commercial catalogue   (typed, in code, provenance + owner-decision ids)
   |-- derived DB/display adapter        -> public.plans rows (names LT/EN, figure, active), via a data-migration generator
   |-- derived Stripe/payment adapter    -> product + price slots, interval, currency, tax behaviour, STRIPE_PRICE_* map
   |-- derived entitlement view          -> exactly what lib/billing/plans.ts exports today (PRE_PAYMENT_PLANS, same slugs and keys)
   `-- shared entitlement resolver       -> entitlements-v1 (web, API and MCP all resolve the subject through it; B1 via #2010)
```

Catalogue entry = superset of PPP, so nothing in PPP disappears: slug, audience, accessState, launch, labelKey, entitlements (PPP fields unchanged), plus a `commercial` block: `price { amountMinor | OPEN, currency, interval, taxBasis }`, `displayNames { lt, en }`, `dbSlug`, `stripeSlot`, `lmc { includedPerPeriod | OPEN, topupDiscount | OPEN }`, `individualAbove`. Values come only from recorded owner decisions; everything else is `OPEN(<decision id>)`, never null-as-unlimited.

Rules that keep every intended capability and commercial rule:
- PPP keys, slugs, limits, `isSellablePlan`, `DEFERRED_PLAN_KEYS`, thresholds stay exported with unchanged values (derived view); all consumers keep compiling.
- The DB-slug map (free_organization = free, company_pilot = business) moves from the test into the catalogue.
- Retired DB rows `agency` / `enterprise` and deferred slots are carried as deferred catalogue rows with their historical capability text as provenance, not deleted.
- The EUR 99 figure moves into the catalogue only with the owner decision (a price-source change, RED). Until then `plans.price_eur_monthly` stays the figure home and a guard asserts DB = ledger. The `launch-pricing.test.ts` "no figure in code" pin is amended in that same RED PR, never silently.
- Entitlement never reads LMC; subscription never mints LMC; Stripe stays transport only.
- Add the missing read-only check: compare the Stripe Price object (amount, currency, interval, active, livemode) with the catalogue figure, as an operator-class script. It is the only thing that closes the EUR 99 question for good.

Sequence (separate PRs, none done here): (a) catalogue module re-exporting PPP unchanged plus its guard; (b) DB adapter generator and figure-equality guard; (c) Stripe adapter generator and read-only price check; (d) #2010 so MCP uses the same resolver; (e) only then the RED price-source move. Owner-only questions: ratify the catalogue shape, ratify the DB-slug map, decide whether plans ever include LMC.

## 3. PR #895 (`lib/commercial/catalogue.ts`) assessed as the candidate

Keep as structure: the provenance and `OwnerDecision` model (no value without a recorded decision); `Allowance` and `Amount` types with explicit OPEN; generator seams (`stripeProductPlan()`, `plansTableRows()`); top-up slots and micro-feature list with null prices (never invented); entitlement-source binding {plan, lmc, admin}; the doc-to-code cross guard; an LMC section that is correct (1 LMC = EUR 1, lots, spend order).

Defects that block merging it as the canonical catalogue as it stands:
1. `company_pilot.monthlyPrice` is OPEN (MOD-01) although the owner approved EUR 99 on 2026-09-05 (G-7 closed). It would erase an approved commercial rule.
2. `company_pilot.openDemands = 5` versus live code and owner decision 10. A catalogue that disagrees with the enforced limit is an architecture regression (review question B).
3. It imports rejected W1 `launch_offer_99` values (300 AI runs, internal promotion, visibility boost, 200 media) as prior art onto the live `company_pilot`; rejected data must not sit on a sellable plan.
4. Its guard asserts "no price may exist outside the catalogue" and pins decided prices at 0, which contradicts the live DB figure and `launch-pricing.test.ts`; the two guards cannot both hold.
5. It adds a FOURTH catalogue next to PPP, DB and Stripe instead of deriving them; PPP stays a second source unless it becomes the derived view.
6. 21 axes, most OPEN: acceptable as a ledger of open decisions, but no gate consumes any of it.

Verdict: adopt #895 as the base for the catalogue STRUCTURE after rebasing onto live PPP keys and the approved ledger (fix 1 to 4; make PPP the derived view for 5). Do not merge it as a parallel catalogue. It stays draft RED.

## 4. EUR 99 Stripe verification

STATUS: EXTERNAL_CONFIGURATION_NOT_VERIFIED.

Read-only sources tried: repo config and docs (no price id, amount or interval is stored anywhere; `STRIPE_PRICE_*` are env slots; `prices.ts` returns an id, never an amount); Vercel env (CLI present, but this checkout is not linked to a project and it was not linked); Stripe CLI live read was refused by the permission layer, so nothing was read and no workaround was tried; no Stripe or Vercel MCP tool is connected; the Supabase MCP timed out, so prod DB facts are carried from the earlier same-day SELECT in `LMC_CANONICALIZATION.md`.

What the repo proves (not the Stripe side): checkout is a subscription with `automatic_tax` enabled, billing address required, VAT id collected (`checkout-tax-pins.test.ts`, `providers/stripe-test.ts`); the intended price per the owner gate is EUR 99.00 recurring monthly, tax-exclusive, one active price, product "LabourMarket.ai - Organization" (payments-price-table-gate.md, G-8 step 1); the DB figure is 99 and active; there are 0 `billing_subscriptions`, so `reconcile-core` has never compared a charged amount.

Not claimed (unverified): live product and price id, amount, currency, interval, tax behaviour on the Price object, exactly one active price, live vs test mode of the configured slot. No price or configuration was changed.

## 5. LMC economic path, edge by edge

Classes: LAUNCH REQUIRED = needed for the free + EUR 99 subscription launch; PAID-LAUNCH REQUIRED = needed before any LMC is sold, granted or spent (LMC is owner-deferred, all 7 flags false); POST-LAUNCH = improvement once LMC is live. State: PROVEN = in migrations and guarded; BUILT = code exists, no caller; MISSING.

| # | Edge | State (evidence) | Classification of the gap |
|---|---|---|---|
| 1 | SOURCE / FUNDING (top-up payment) | MISSING: `lmc_record_purchase_v1` BUILT but no payment event calls it; no top-up route (MDD-20); flag `stripe_lmc_topups_enabled` owner_only with no activation path | PAID-LAUNCH REQUIRED |
| 1b | SOURCE: promo, referral, admin | admin grant PROVEN with admin UI; promo grant and referral BUILT, no caller, flags off, no referral rate | promo and referral wiring POST-LAUNCH; owner-class flag activation path PAID-LAUNCH REQUIRED |
| 1c | SOURCE: plan-included LMC | undecided, none today | POST-LAUNCH (decision) |
| 2 | LMC CREDIT | PROVEN in schema (RPCs, idempotency keys); 0 rows in prod, never exercised | none |
| 3 | LOT / LEDGER | PROVEN: append-only, triggers and REVOKE, lots, consumptions | none |
| 4 | BALANCE | PROVEN: derived views, read-only user balance and last 20 movements | none |
| 5 | ACTION COST | MISSING: no action-to-LMC price map (MDD-09), no top-up denominations (MDD-03); #895 holds null slots | PAID-LAUNCH REQUIRED (owner decision; no figure invented) |
| 6 | RESERVATION | MISSING: `lmc_spend_v1` is an immediate atomic debit; no hold or confirm state | PAID-LAUNCH REQUIRED for any asynchronous or failable action (compensation is only a remedy); POST-LAUNCH if every priced action is synchronous |
| 6b | DEBIT | BUILT, no caller; no single server-side spend function with a deterministic idempotency key | PAID-LAUNCH REQUIRED |
| 7 | ENTITLEMENT / ACTION | MISSING by design: LMC never gates a plan feature; no spend-to-entitlement mapping (#895 MOD-20) | PAID-LAUNCH REQUIRED |
| 8 | REVERSAL / REFUND | BUILT: `lmc_reverse_v1`, `lmc_compensate_spend_v1` (no call site); no Stripe refund or chargeback path to LMC; VAT and refund policy undecided | PAID-LAUNCH REQUIRED |
| 8b | Lot expiry | BUILT, no scheduler | PAID-LAUNCH REQUIRED once promo or admin lots exist; otherwise POST-LAUNCH |
| 9 | HISTORY / AUDIT | PARTIAL: the ledger is the audit; admin ledger, liability summary and user last-20 exist; no statement, export or per-action trace | POST-LAUNCH |

LAUNCH REQUIRED items in the commercial area that are NOT LMC edges: (1) Stripe EUR 99 price and tax verification (section 4); (2) MCP entitlement subject fix #2010 (B1); (3) a catalogue-level DB figure = Stripe figure check; (4) billing-recovery Option B and webhook refs P1 per `LMC_BILLING_MODEL.md`. None touches LMC.

Net: with LMC deferred and every flag false, no LMC edge is LAUNCH REQUIRED; eight edges or sub-edges are PAID-LAUNCH REQUIRED (1, 1b flag activation, 5, 6, 6b, 7, 8, 8b when lots exist); three are POST-LAUNCH (1b wiring, 1c, 9). Do NOT enable LMC.
