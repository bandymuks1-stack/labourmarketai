# COMMERCIAL SYSTEM V1 — SINGLE SOURCE OF TRUTH

| Field | Value |
|---|---|
| Status | **CANONICAL.** No price, LMC rule, Stripe product or entitlement may exist outside this document and its machine-readable half |
| Machine-readable half | `apps/web/lib/commercial/catalogue.ts` |
| Enforced by | `apps/web/lib/guards/commercial-single-source.test.ts` (CI) |
| Created | 2026-07-28 · branch `feat/canonical-commercial-system-v1` |
| Supersedes as SOURCE | every other pricing/LMC/plan artefact in the repository — all listed in **Part VIII** and demoted to *reference only* |

## The one rule

> **A value appears here only if an artefact in this repository records the
> decision.** Everything else is `MISSING OWNER DECISION` with a stable id
> (`MOD-nn`). Nothing is inferred, rounded, averaged or "reasonably assumed" —
> including numbers sketched in a task prompt.

That rule is why most price cells below are empty. The reconstruction audit
(`docs/product/lmc-canonical-commercial-catalogue-v1.md`, PR #894) proved that
**no final subscription price, no top-up denomination and no LMC price for any
feature exists anywhere** — not on `main`, not in any branch, not in any
document, not in the database.

**Closing a decision = writing its value into `catalogue.ts`, deleting its
entry from the register, and updating this document in the same PR.** The
guard fails if the two halves disagree.

---

## PART I — SUBSCRIPTION PLANS

Canonical plan keys are the **live runtime contract** (`PRE_PAYMENT_PLANS`),
because that is what every entitlement check and every Stripe price env var
already uses. Whether these keys/names survive is itself open (**MOD-02**).

### I.1 Plan header

| plan_key | Name | Audience | Monthly | Annual | Stripe Product | Stripe Price env |
|---|---|---|---|---|---|---|
| `free_worker` | **MOD-02** | worker | **0 €** *(binding: free tier)* | **0 €** | none needed | — |
| `worker_plus` | **MOD-02** | worker | **MOD-01** | **MOD-03** | `STRIPE_PRODUCT_WORKER_PLUS` | `STRIPE_PRICE_WORKER_PLUS` |
| `company_pilot` | **MOD-02** | company | **MOD-01** | **MOD-03** | `STRIPE_PRODUCT_COMPANY_PILOT` | `STRIPE_PRICE_COMPANY_PILOT` |
| `agency_pilot` | **MOD-02** | agency | **MOD-01** | **MOD-03** | `STRIPE_PRODUCT_AGENCY_PILOT` | `STRIPE_PRICE_AGENCY_PILOT` |
| `admin_internal` | internal | admin | **0 €** *(never sold)* | **0 €** | none | — |

**Recovered pricing inputs (NOT decisions — do not re-derive them):**

- PR #754 (`dc051b45`, **CLOSED**) held the only owner-confirmed table that has
  ever existed: `free_person 0` · `ai_plus 9.99` · `vip_media 24.99` ·
  `free_company 0` · `launch_offer_99 99.00` · `agency_start 99.99` ·
  `agency_growth 249.99` · `agency_scale 499.99` €/mo.
- The LMC train (§6, **binding**) marked that table *"REPLACE — input only"* and
  set the repricing direction: **personal ≈ ×2, company/agency ≈ ×3**.
- Exact results: `19.98` · `49.98` · `297.00` · `299.97` · `749.97` ·
  `1 499.97` €. The rounded proposals in that matrix are labelled
  **NOT FINAL** and are not adopted here.
- `49.98 €` belongs to **`vip_media`**, never to `worker_plus`.

### I.2 Entitlement axes per plan

`—` = no artefact ever set this axis for this plan. Values marked *(#754)* are
recovered prior art from the closed PR, kept so they are not re-derived; values
marked *(live)* are the binding runtime contract.

| Axis | `free_worker` | `worker_plus` | `company_pilot` | `agency_pilot` |
|---|---|---|---|---|
| LMC included / period | **MOD-07** | **MOD-07** | **MOD-07** | **MOD-07** |
| LMC top-up discount | **MOD-08** | **MOD-08** | **MOD-08** | **MOD-08** |
| AI runs / month | 10 *(#754)* | 200 *(#754)* | 300 *(#754)* | 300 *(#754)* |
| CV exports / month | **MOD-04** | **MOD-04** | **MOD-04** | **MOD-04** |
| Expanded CV | no *(live)* | **yes** *(live)* | **MOD-04** | **MOD-04** |
| Active job ads | 0 *(#754)* | 0 *(#754)* | **MOD-06** | 10 *(#754)* |
| Open demands / needs | **MOD-04** | **MOD-04** | **5** *(live)* | **25** *(live)* |
| Counterparty search | **MOD-04** | **MOD-04** | **MOD-04** | **MOD-04** |
| Worker pool | **MOD-04** | **MOD-04** | **MOD-04** | **yes** *(live)* |
| API calls / month | **MOD-05** | **MOD-05** | **MOD-05** | **MOD-05** |
| Workspace projects | **MOD-04** | **MOD-04** | **MOD-04** | **MOD-04** |
| Team seats | **MOD-04** | **MOD-04** | **MOD-04** | **MOD-04** |
| Managed companies | 0 *(#754)* | 0 *(#754)* | 0 *(#754)* | 3 *(#754)* |
| Chat | **MOD-04** | **MOD-04** | **yes** *(live)* | **yes** *(live)* |
| Analytics | **MOD-04** | **MOD-04** | **MOD-04** | **MOD-04** |
| Data export | **MOD-04** | **MOD-04** | **MOD-04** | **MOD-04** |
| Internal promotion | no *(#754)* | no *(#754)* | yes *(#754)* | no *(#754)* |
| Visibility boost | no *(#754)* | **no** *(live: declared false, never claimed)* | yes *(#754)* | no *(#754)* |
| Media gallery items | 10 *(#754)* | 50 *(#754)* | 200 *(#754)* | 100 *(#754)* |
| Readiness countries | **1** *(live)* | **10** *(live)* | **MOD-04** | **MOD-04** |
| Support tier | **MOD-04** | **MOD-04** | **MOD-04** | **MOD-04** |

> **`company_pilot` job ads is deliberately open (MOD-06).** #754 gave its
> aliased plan *unlimited* ads, but that came with the PROJECT LAUNCH OFFER,
> which the train doc **REJECTED as stale**. The binding owner rule is: normal
> company plans do **not** include unlimited ads. Carrying "unlimited" over
> would have re-adopted a rejected offer.

---

## PART II — LMC

### II.1 What LMC is — BINDING

| Property | Value |
|---|---|
| Unit | **1 LMC = 1 EUR** of internal platform credit |
| Storage | `bigint` LMC-cents, `100 cents = 1 LMC`; no floating point |
| Account | one per identity: person (`profiles.id`) or company (`companies.id`) |
| Balance | **derived** from ledger entries; a mutable balance column is forbidden |
| Positioning | internal platform credit only. **Not** a cryptocurrency, **not** an investment, **not** an electronic-money claim, **not** a withdrawable balance, **not** a promise of future cash redemption |
| MLM | never multi-level; only **one direct, attributable** referral relationship may ever exist |

### II.2 How LMC is obtained

| Source kind | Amount | Condition | Expiry | Limit |
|---|---|---|---|---|
| `promotional_signup` | **50 LMC** | verified signup (`email_confirmed_at`) | **60 days** | once ever per account |
| `promotional_activity` | **50 LMC** | **7 meaningful active days within the first 30** — the *definition* of an active day does not exist → **MOD-12** | 60 days | once ever per account |
| `admin_grant` | ≤ **1 000 LMC** per grant | admin action, verified recipient email, reason + campaign required | mandatory, **≤ 365 days** | idempotency-keyed |
| `purchased` | see Part III | Stripe top-up | **never expires** by promotional rules | — |
| `referral_reward` | rate **`r` = MOD-13** | single-level, settled purchase, no refund/fraud | **MOD-14** (currently exempt from the expiry CHECK → perpetual liability possible) | DB-disabled |

Per-user promotional ceiling: **100 LMC (= 100 € of internal credit)**.
A recurring/daily reward is **structurally impossible** (once-per-account
partial unique indexes).

### II.3 How LMC is bought · gifted · spent · ends · returned · cancelled

| Lifecycle | Rule |
|---|---|
| **Bought** | Stripe top-up → `purchased` lot. Part III |
| **Gifted** | `admin_grant` only, through `lmc_admin_grant_v1`, admin-gated, capped, expiring, audited. There is no user-to-user gifting concept |
| **Spent** | promotional/expiring lots first (earliest `expires_at`, tie by lot id) → then purchased lots (oldest first). Expired remainders are never spendable. Frozen entirely while `lmc_spending_enabled` is false |
| **Ends** | promotional lots expire after 60 days; `lmc_expire_lots_v1` records an append-only `expiry` transaction. Runner: `pnpm -C apps/web lmc:expire-lots` |
| **Returned** | `refund_reversal` / `chargeback_reversal` for `purchased` originals; plain `reversal` for promotional/admin/referral. Exactly one reversal per original. Only the **remaining unspent** value is reversible — recovery of already-spent value is **MOD-15** |
| **Cancelled** | flipping a kill-switch freezes the relevant path immediately; committed entries are never deleted (append-only, production ledger is never dropped) |

### II.4 Kill-switches

| Flag | Authority | Effect |
|---|---|---|
| `lmc_purchases_enabled` | admin | records purchased top-ups |
| `lmc_promotional_grants_enabled` | admin | all promotional + admin grants |
| `lmc_referrals_enabled` | admin | referral rewards (DB trigger, fail-closed) |
| `lmc_spending_enabled` | admin | spending — while false, issued LMC is frozen |
| `stripe_lmc_topups_enabled` | **owner only** | Stripe-side top-up selling |
| `live_payments_enabled` | **owner only** | live payments |
| *(any other key)* | **system_locked** | fail-closed default |

All six are `false` in production (verified 2026-07-28). The two `owner_only`
flags currently have **no activation path at all** — the shared setter refuses
every caller including `service_role`. Reclassifying referrals + promotional
grants to `owner_only` is **MOD-15**.

---

## PART III — LMC TOP-UP PACKAGES

**Nothing about denominations, prices or bonuses exists.** "top-up" occurs 54
times across docs, code and migrations and **not one occurrence carries an
amount** (verified 2026-07-28).

The structure is defined so it is ready to generate; the values are one owner
decision (**MOD-09**).

| Slot | LMC | Price | Bonus | Stripe Product | Stripe Price env |
|---|---|---|---|---|---|
| `topup_t1` | **MOD-09** | **MOD-09** | **MOD-09** | `STRIPE_PRODUCT_LMC_TOPUP_T1` | **MOD-09** |
| `topup_t2` | **MOD-09** | **MOD-09** | **MOD-09** | `STRIPE_PRODUCT_LMC_TOPUP_T2` | **MOD-09** |
| `topup_t3` | **MOD-09** | **MOD-09** | **MOD-09** | `STRIPE_PRODUCT_LMC_TOPUP_T3` | **MOD-09** |
| `topup_t4` | **MOD-09** | **MOD-09** | **MOD-09** | `STRIPE_PRODUCT_LMC_TOPUP_T4` | **MOD-09** |
| `topup_t5` | **MOD-09** | **MOD-09** | **MOD-09** | `STRIPE_PRODUCT_LMC_TOPUP_T5` | **MOD-09** |
| `topup_t6` | **MOD-09** | **MOD-09** | **MOD-09** | `STRIPE_PRODUCT_LMC_TOPUP_T6` | **MOD-09** |
| `topup_t7` | **MOD-09** | **MOD-09** | **MOD-09** | `STRIPE_PRODUCT_LMC_TOPUP_T7` | **MOD-09** |

> Seven slots exist because the owner sketched seven denominations
> (50 / 100 / 250 / 500 / 1000 / 2500 / 5000 LMC) in the 2026-07-28 task
> prompt. A sketch in a prompt is **not a recorded decision**, so the amounts
> are not written into the catalogue — the structure is reserved, the numbers
> wait for MOD-09.

**Binding top-up rules:**

- Stripe may sell **only** subscriptions and LMC top-ups — never a tool.
- A top-up may be bought **without any subscription** (a free person or small
  company can buy one internal tool this way).
- Purchased LMC **never expires** by promotional rules.
- Minimum / maximum per transaction: **MOD-10**.
- VAT treatment, revenue recognition for LMC-settled months, refund policy for
  unspent purchased LMC: **MOD-11**.
- Any bonus LMC is promotional-class value and inherits expiry consequences —
  it is a liability decision, not a marketing one (part of MOD-09).

---

## PART IV — MICRO-FEATURES

Binding rule: **internal tools are bought inside the platform with LMC.**
A subscription is not required.

The only candidate list any artefact records is the 8 job-ad products from
PR #754 (`price_cents` NULL, `active` false, never applied). The train doc
replaced the *registry* while keeping the *concept*, so this is a candidate
set, not a decided catalogue (**MOD-17**).

| Code | Name | Description | LMC price | Audience | In a plan? | Standalone? | Entitlement granted | Validity |
|---|---|---|---|---|---|---|---|---|
| `single_ad` | Single job ad | One job advertisement | **MOD-18** | company | no | yes | `adCredits +1` | **MOD-18** |
| `ai_promoted_ad` | AI-promoted job ad | One ad with AI promotion | **MOD-18** | company | no | yes | `adCredits +1`, `promotion: ai` | **MOD-18** |
| `premium_promoted_ad` | Premium-promoted job ad | One ad with premium promotion | **MOD-18** | company | no | yes | `adCredits +1`, `promotion: premium` | **MOD-18** |
| `international_ad` | International job ad | One ad with cross-market reach | **MOD-18** | company | no | yes | `adCredits +1`, `international: true` | **MOD-18** |
| `package_5` | 5-ad package | Five job advertisements | **MOD-18** | company | no | yes | `adCredits +5` | **MOD-18** |
| `package_20` | 20-ad package | Twenty job advertisements | **MOD-18** | company | no | yes | `adCredits +20` | **MOD-18** |
| `agency_package` | Agency package | Twenty ads with standard promotion | **MOD-18** | agency | no | yes | `adCredits +20`, `promotion: standard` | **MOD-18** |
| `extra_promotion` | Extra promotion | Additional promotion boost, no ad credit | **MOD-18** | any | no | yes | `promotion: boost` | **MOD-18** |

**Not one LMC price for any feature exists anywhere in the repository.**
Filling this column is the single largest gap in the commercial system.

Open beyond price: whether AI runs, CV exports, API calls, workspace projects
or team seats are also purchasable as micro-features (**MOD-19**), and how a
spend actually becomes an entitlement (**MOD-20** — `lmc_spend_v1` records a
free-text reason, has no product code, no registry and no caller).

---

## PART V — PLAN + LMC LOGIC

The only combination model any artefact describes:

```
effective allowance  =  plan allowance  +  LMC-purchased add-on
                        │
                        └── an "unlimited" plan allowance short-circuits;
                            an add-on can never exceed it
```

Implemented as `resolveEffectiveAllowance(planAllowance, purchasedUnits)` in
`lib/commercial/catalogue.ts` — recovered from PR #754's
`resolveActiveAdAllowance`, with the purchase currency changed from EUR
ad-credits to LMC per the train doc.

Worked example (**shape only — every number in it is still MOD-01/MOD-18**):

```
company_pilot subscription        → open demands 5, ads MOD-06, AI runs 300
+ LMC top-up (MOD-09)             → purchased LMC balance
+ package_5 (MOD-18 LMC)          → adCredits +5
+ extra_promotion (MOD-18 LMC)    → promotion: boost
= effective: ads (MOD-06 + 5), everything else unchanged
```

Binding:
- tools are bought with LMC, never directly with Stripe;
- a standalone purchase needs no subscription;
- Stripe never mints, tops up, spends or cashes out LMC (PR #844 separation
  rule — sound, but the guard is still unmerged).

Open: whether plan allowances are LMC-extendable at all and at what unit rate
(**MOD-19**); where the Stripe top-up route lives, since the separation guard
forbids a top-up surface under `/api/billing` (**MOD-21**).

---

## PART VI — ENTITLEMENTS

**A right may come from exactly three sources: `plan`, `lmc`, or `admin`.**
Nothing else grants access. There is no "manual right" outside the admin path,
and the admin path is an auditable override, not a fourth source.

| Entitlement key | Sources | Enforced today | Site |
|---|---|---|---|
| `worker_profile` | plan | no | free surface |
| `worker_journal` | plan | no | free surface |
| `worker_basic_skills` | plan | no | free surface |
| `readiness_checklist_countries` | plan · lmc | no | `entitlements-v1.ts` |
| `document_expiry_reminders` | plan | no | `entitlements-v1.ts` |
| `expanded_cv` | plan · lmc | no | `entitlements-v1.ts` |
| `priority_visibility` | plan · lmc | no | not built |
| `company_create_needs` | plan · lmc | no | `entitlements-v1.ts` |
| `candidate_readiness_summaries` | plan | no | `entitlements-v1.ts` |
| `booking_requests` | plan | **yes** | `lib/booking/booking-actions.ts` |
| `communication` | plan | no | `entitlements-v1.ts` |
| `team_matching` | plan | no | `entitlements-v1.ts` |
| `agency_multi_company` | plan | no | `entitlements-v1.ts` |
| `worker_pool` | plan | no | `entitlements-v1.ts` |
| `doc_readiness_tracking` | plan | no | `entitlements-v1.ts` |
| `booking_pipeline` | plan | no | `entitlements-v1.ts` |
| `verify_documents` | admin | **yes** | `lib/auth/superadmin.ts` |
| `manage_country_rules` | admin | **yes** | `lib/auth/superadmin.ts` |
| `manage_pilots` | admin | **yes** | `lib/auth/superadmin.ts` |

**19 entitlements · 4 enforced today · 0 obtainable from LMC today.**
The `lmc` source is declared where the entitlement is a countable allowance
that a micro-feature could extend; it becomes real only when MOD-18 and MOD-20
are closed.

---

## PART VII — GENERATION

Everything below is generated from `lib/commercial/catalogue.ts`, never
hand-written:

| Target | Generator | Ready today |
|---|---|---|
| Stripe Products | `stripeProductPlan()` | **0 of 10** — every plan is blocked by MOD-01/02/03; every top-up by MOD-09 |
| Stripe Prices | `stripeProductPlan()` (monthly + annual) | **0 of 13** |
| `public.plans` rows | `plansTableRows()` | shape ready; all prices `null` |
| UI prices | `uiMonthlyPriceCents(planKey)` | returns `null` → the surface must render the honest "not set" state, never a placeholder that looks like a price |
| Checkout | existing `/api/billing/test-checkout` + `prices.ts` env map | wiring exists; needs MOD-01 + owner Stripe objects |
| Billing Portal | existing `/api/billing/portal` | ready (needs a Stripe portal configuration) |
| LMC catalogue | `MICRO_FEATURES`, `TOPUP_PACKAGE_SLOTS` | structure ready; every price MOD-18 / MOD-09 |
| Admin panel | `catalogueSummary()`, `OWNER_DECISIONS` | ready |

**The generator refuses to emit a product for a price nobody has set.**
`stripeProductPlan()` returns `ready: false` with `blockedBy: [MOD-…]` rather
than a default, a zero or a guess.

---

## PART VIII — MIGRATION: everything else becomes REFERENCE ONLY

Every place a price, plan catalogue or commercial rule currently lives, and its
new status. Files marked *(banner added)* now carry a header pointing here.

| Location | What it holds | New status |
|---|---|---|
| `apps/web/lib/billing/plans.ts` | `PRE_PAYMENT_PLANS`, `PAYMENTS_ENABLED` | **runtime mirror** — entitlement shape stays executable; the commercial meaning is canonical here *(banner added)* |
| `apps/web/lib/billing/prices.ts` | plan → Stripe price **env var** map | **reference only** — names the env slot, never an amount *(banner added)* |
| `apps/web/lib/billing/readiness.ts` | `PRICING_READINESS_STATE`, enforcement registry | **reference only** *(banner added)* |
| `apps/web/lib/billing/lmc-flags.ts` | six kill-switch constants + policy map | **runtime mirror** of Part II.4 *(banner added)* |
| `apps/web/lib/marketing/plans.ts` | reads `public.plans` names | **reference only** *(banner added)* |
| `apps/web/content/placeholders.ts` | `pricing.plan.*` "pricing TBD" placeholders | **reference only** — its declared source (`plans.price_eur_monthly`) is empty; the real source is Part I. **No banner added: the file is byte-frozen by `lib/guards/landing-freeze.test.ts`**, and regenerating that baseline requires an owner-approved landing plan. Recorded here instead |
| `public.plans` (DB, 4 rows) | `free/business/enterprise/agency`, all prices NULL | **orphaned** — shares no slug with the runtime contract; its fate is MOD-02. Not edited (live table) |
| `public.subscriptions` (DB) | legacy, 0 rows, 0 code references | **dead** — fate decided with MOD-02 |
| `supabase/migrations/20260720190000_*` | the LMC ledger | **binding implementation** of Part II; applied and frozen |
| `docs/product/lmc-commercial-system-train-v1.md` | the binding LMC contract | **reference only** — still the provenance for Part II *(banner added)* |
| `docs/product/lmc-canonical-commercial-catalogue-v1.md` | the reconstruction audit | **reference only** — provenance for Parts I–VI *(banner added)* |
| `docs/audits/stripe-test-activation-runbook.md` | owner activation steps | **reference only** — operational runbook, no catalogue authority *(banner added)* |
| PR #754 (`dc051b45`, closed) | `PLAN_CATALOGUE_V2`, ad registry, offers, usage/credit engine | **prior art** — recoverable input, never a source. Not revived |
| PR #844 (unmerged) | Stripe⟂LMC separation, org binding | **pending** — the separation rule is adopted in Part V |
| `apps/web/messages/*.json` → `services.offers[].priceFrom` | 600 / 900 / 1 200 / 1 500 / 1 900 € | **NOT this catalogue** — AI-automation consultancy packages, a separate business line. Whether they belong to the platform at all is MOD-23 |
| `docs/launch/concierge-worker-sourcing-pricing-addendum-v1.md` | 300–700 € / worker, 1 000–2 000 € / brigade, 250–500 € coordination | **NOT this catalogue** — explicitly "draft launch-partner ranges (owner sets per deal)", never a catalogue price. MOD-23 |
| `lib/demand/*`, `lib/opportunities/*`, `lib/finance/*` → `price_cents` | user-entered marketplace amounts (accommodation, offers, invoices) | **out of scope** — customer data, not our commercial catalogue |

After this PR the invariant is: **a commercial price exists in exactly one
place.** The guard fails the build if a EUR/LMC amount appears in a billing or
marketing module outside the canonical catalogue.

---

## PART IX — OPEN OWNER DECISIONS

**23 open.** Each has a stable id, the exact question, what it blocks, and
every input already recovered so the owner never re-researches it. Full
`inputs` lists live in `OWNER_DECISIONS` in `catalogue.ts`.

| id | Question | Blocks |
|---|---|---|
| **MOD-01** | Final monthly price of every paid plan | Stripe products, `/pricing`, checkout, the whole paid chain |
| **MOD-02** | Which catalogue and which names survive | everything keyed on a plan slug |
| **MOD-03** | Are annual terms sold, and at what price | annual Stripe prices |
| **MOD-04** | Per-plan allowances nobody ever set: CV exports, open demands (worker), counterparty search, workspace projects, team seats, analytics, export, support | the comparison table; enforcement |
| **MOD-05** | Is there an API product, and what are the per-plan call limits | API productisation |
| **MOD-06** | Company job-ad allowance now that the unlimited Launch Offer is rejected | company tier definition |
| **MOD-07** | How much LMC each plan includes per period | plan↔LMC privileges; liability |
| **MOD-08** | Do plans grant an LMC top-up discount | top-up pricing per plan |
| **MOD-09** | Top-up denominations, prices and bonus structure | selling any credit |
| **MOD-10** | Minimum / maximum top-up per transaction | abuse bounds |
| **MOD-11** | VAT treatment, revenue recognition for LMC-settled months, refunds of unspent LMC | legal + finance sign-off |
| **MOD-12** | Definition of a "meaningful active day" | the second 50-LMC grant |
| **MOD-13** | Referral reward rate `r` | the referral network |
| **MOD-14** | Referral-lot expiry policy | liability model |
| **MOD-15** | Clawback of already-spent value + flag policy classes for referrals/grants | fraud tooling; governance |
| **MOD-16** | Schema shape that structurally enforces single-level referrals | the no-MLM guarantee |
| **MOD-17** | The definitive list of LMC-purchasable micro-features | the LMC economy |
| **MOD-18** | The LMC price and validity of every micro-feature | the LMC economy |
| **MOD-19** | Are plan allowances LMC-extendable, at what unit rate | plan+LMC combination |
| **MOD-20** | How an LMC spend becomes an entitlement | every LMC purchase |
| **MOD-21** | Where the Stripe top-up route lives | Wagon 4 |
| **MOD-22** | Wallet / top-up / referral UI and the consumer copy for a non-withdrawable credit | Wagon 7 |
| **MOD-23** | Do the concierge fees and the AI-automation packages belong to this catalogue | positioning; the Terms; what `/pricing` may show |

**13 of the 23** block a concrete catalogue field today (MOD-01…09, 12, 13, 14,
18); the rest block activation, governance or legal readiness.

### Recommended order

1. **MOD-02 → MOD-01** — pick the surviving catalogue, then price it.
   Everything else waits on these two.
2. **MOD-17 → MOD-18 → MOD-20** — the LMC economy is not a catalogue until a
   named list of tools has LMC prices and a spend→entitlement mapping.
   Until then, crediting LMC creates a euro liability with nothing to spend on.
3. **MOD-09 → MOD-10 → MOD-11** — top-up commercials and their finance/legal
   treatment, before any credit is sold.
4. **MOD-12** — before promotional grants are switched on.
5. **MOD-13 → MOD-14 → MOD-15 → MOD-16** — the referral cluster; referrals stay
   disabled until all four are answered.
6. **MOD-03 … MOD-08, MOD-19, MOD-21, MOD-22, MOD-23** — remaining commercial shape and surfaces.

---

## PART X — FINAL REPORT

| Metric | Count |
|---|---|
| Subscription plans | **5** (3 paid, 1 free, 1 internal) |
| LMC top-up product slots | **7** — **0 decided** |
| Micro-features | **8 candidates** — **0 priced** |
| Stripe Products required | **10** (3 plans + 7 top-ups) — **0 generatable** |
| Stripe Prices required | **13** (3 monthly + 3 annual + 7 top-ups) — **0 generatable** |
| Entitlements | **19** — 4 enforced today, 0 obtainable from LMC |
| Entitlement sources | **3** (`plan`, `lmc`, `admin`) — no fourth path exists |
| LMC kill-switches | **6** — all `false` in production |
| **Open owner decisions** | **23** (13 block a concrete catalogue field) |
| Prices invented by this work | **0** |

### What changed structurally

Before: pricing, LMC and Stripe logic lived in **three plan catalogues, one
closed PR, one unmerged PR, two product documents, a placeholder registry, a
DB table and five locale files** — and the only owner-confirmed price table was
in a closed PR nobody would have found again.

After: **one document, one typed catalogue, one guard.** A price that is not in
Part I / III / IV does not exist, and CI fails if one appears elsewhere.

### What this does NOT do

It does not decide anything. Every number the owner has not set is still
missing — deliberately, and now visibly, with an id and a recommended order.

---

*Canonical. Amend by editing this document and `lib/commercial/catalogue.ts`
in the same PR; the guard fails if they disagree.*
