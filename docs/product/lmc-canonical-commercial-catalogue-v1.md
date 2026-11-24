# LMC Canonical Commercial Catalogue v1 — economics reconstruction

| Field | Value |
|---|---|
| Date | 2026-07-28 |
| Type | Reconstruction audit + single canonical catalogue |
| Branch | `feat/commercial-readiness-audit-v1` |
| Method | Every LMC/pricing decision recoverable from the repository, git history (including closed and unmerged branches), migrations, docs, ADRs and prior audits |
| Rule | **Nothing is invented.** Where no artefact records a decision, it is listed as **`MDD-xx — Missing design decision`**, never filled in |

---

## 0. How to read this document

The commercial model was decided in **three separate waves** that never got
merged into one record. This document is that record. Every row carries its
provenance and one of four statuses:

| Status | Meaning |
|---|---|
| **BINDING** | Explicitly recorded as an owner decision, and never superseded by a later artefact |
| **SUPERSEDED** | Was decided, then explicitly replaced/rejected by a later binding artefact (kept here so it is never re-adopted by accident) |
| **PRIOR ART** | Exists in a closed/unmerged branch; usable as input, not as a decision |
| **MDD** | **Missing design decision** — no artefact anywhere records it |

### The three waves

| Wave | Date | Artefact | Fate |
|---|---|---|---|
| **W1 — Pricing & Payments v2** | 2026-07-14 | PR **#754** (`dc051b45`), branch `feat/cc/owner-sprint-v2-pricing-rebased` | **CLOSED, never merged.** Its commit is still reachable locally and holds the **only owner-confirmed price table that has ever existed** |
| **W2 — LMC Commercial System Train** | 2026-07-20 | `docs/product/lmc-commercial-system-train-v1.md` + PR **#843** (merged `664b9ab9`) + `docs/audit/lmc-commercial-canonicalization-rev35.md` | **MERGED + APPLIED to production.** Binding owner decisions; explicitly re-judges every W1 element |
| **W3 — Stripe TEST subscriptions** | 2026-07-21 | PR **#844** (`eb59f549`, `fbd6825e`), branch `feat/stripe-test-subscriptions-v1` | **UNMERGED.** Adds the Stripe⟂LMC separation rule and the org-binding migration |

**Precedence: W2 > W1.** The train document explicitly audits PR #754 element
by element (§3.1 reuse/replace/reject matrix), so where the two disagree, W2
wins. W3 is not merged and is marked as such throughout.

### One structural finding first

`docs/decisions/` (the repository's ADR directory, 13 ADRs) contains **no ADR
for pricing, credit, LMC or the commercial model at all**. Every commercial
decision lives in PR bodies, a train document and audit files. That is the
mechanical reason the catalogue fragmented into three, and why this
reconstruction was necessary.

---

## 1. The unit — BINDING, fully recovered

Source: train doc §1, §5; migration `20260720190000_lmc_ledger_foundation_v1.sql`
(applied to production 2026-07-21 as ledger version `20260721133338`).

| Decision | Value | Status |
|---|---|---|
| Name | **LMC** — internal LabourMarket.ai platform credit | BINDING |
| Peg | **1 LMC = 1 EUR** of internal platform credit (accounting relationship) | BINDING |
| Storage | `bigint` LMC-cents, `100 LMC-cents = 1 LMC`; no floating point | BINDING |
| Account scope | One account per identity: person (`profiles.id`) or company (`companies.id`) | BINDING |
| What LMC is **not** | Not a cryptocurrency, not an investment, not an electronic-money claim, **not a withdrawable balance**, not a promise of future cash redemption | BINDING (legal positioning) |
| MLM | Never multi-level; only **one direct, attributable referral relationship** may ever exist | BINDING |
| Source kinds | `purchased`, `promotional_signup`, `promotional_activity`, `admin_grant`, `referral_reward` | BINDING (DB CHECK) |
| Spend order | Promotional/expiring first (earliest `expires_at`, tie by lot id) → then purchased (oldest first). Expired remainders never spendable | BINDING (enforced in `lmc_spend_v1`) |
| Balance | **Derived** from ledger entries (`lmc_account_balances`); a mutable balance column is forbidden | BINDING (W1's `credit_balances` explicitly **REJECTED**) |
| Currencies | ONE unit. W1's two-currency model (`ad_credits`, `ai_credits`) is **SUPERSEDED** — tool pricing happens at spend time | BINDING |

---

## 2. Subscription plans — the three catalogues, reconciled

Three plan catalogues exist simultaneously today. This is the single largest
source of confusion in the product, so all three are stated with their exact
status.

### 2.1 Catalogue A — `public.plans` (DB, LIVE, rendered on `/pricing`)

Verified in production 2026-07-28: 4 rows, `active = true`, **all
`price_eur_monthly = NULL`**.

| Slug | Name (lt/en) | Price | Features JSON (live) |
|---|---|---|---|
| `free` | Nemokamas / Free | NULL | `projects: 1, job_demands: 1, worker_search: false, support: community` |
| `business` | Verslo / Business | NULL | `projects: 10, job_demands: 25, worker_search: true, support: email` |
| `agency` | Agentūros / Agency | NULL | `managed_workers: unlimited, broker_tools: true, worker_search: true, support: priority` |
| `enterprise` | Įmonių / Enterprise | NULL | `projects: unlimited, sso: true, sla: true, support: dedicated` |

**Status: LIVE BUT ORPHANED.** No code reads its `features` or
`price_eur_monthly`; `lib/marketing/plans.ts` reads names only. It shares no
slug with any other catalogue. Seeded 2026-05-19, last touched 2026-05-19.

### 2.2 Catalogue B — `PRE_PAYMENT_PLANS` (code, LIVE, entitlement engine)

`apps/web/lib/billing/plans.ts`. **No price field exists in this catalogue at
all.** It is what every runtime entitlement check and the Stripe price env map
are keyed to today.

| Slug | Audience | Access state | Entitlements (live) |
|---|---|---|---|
| `free_worker` | worker | free | `worker_profile`, `worker_journal`, `worker_basic_skills`, `readiness_checklist_countries: 1` |
| `worker_plus` | worker | payment_not_enabled | + `expanded_cv`, `readiness_checklist_countries: 10`, `document_expiry_reminders`, `priority_visibility: false` (declared false — never claimed) |
| `company_pilot` | company | payment_not_enabled | `company_create_needs: 5`, `candidate_readiness_summaries`, `booking_requests`, `communication`, `team_matching` |
| `agency_pilot` | agency | payment_not_enabled | `agency_multi_company`, `worker_pool`, `doc_readiness_tracking`, `booking_pipeline`, `company_create_needs: 25`, `candidate_readiness_summaries`, `booking_requests`, `communication` |
| `admin_internal` | admin | internal | `verify_documents`, `manage_country_rules`, `manage_pilots` |

**Status: LIVE, PRICELESS.** Stripe env vars exist for three of them
(`STRIPE_PRICE_WORKER_PLUS`, `STRIPE_PRICE_COMPANY_PILOT`,
`STRIPE_PRICE_AGENCY_PILOT`) and are unset.

### 2.3 Catalogue C — `PLAN_CATALOGUE_V2` (PR #754, closed — the only priced one)

Source: `git show dc051b45:apps/web/lib/billing/plans.ts`. The PR body states
*"Owner pricing implemented exactly"*, and the prices were CI-pinned by
`plans-v2.test.ts`. **This is the only place an owner-confirmed price table has
ever existed.**

| Audience | Slug | Name | Price/mo | activeAdLimit | internalPromotion | aiAssistMonthlyRuns | mediaGalleryItems | visibilityBoost | managedCompanies |
|---|---|---|---|---|---|---|---|---|---|
| person | `free_person` | FREE | **0 €** | 0 | no | 10 | 10 | no | 0 |
| person | `ai_plus` | AI PLUS | **9.99 €** | 0 | no | 200 | 50 | no | 0 |
| person | `vip_media` | VIP MEDIA | **24.99 €** | 0 | yes | 500 | 500 | yes | 0 |
| company | `free_company` | FREE | **0 €** | **1** | no | 10 | 20 | no | 0 |
| company | `launch_offer_99` | PROJECT LAUNCH OFFER | **99.00 €** | **unlimited** | yes | 300 | 200 | yes | 0 |
| agency | `agency_start` | START | **99.99 €** | 10 | no | 300 | 100 | no | 3 |
| agency | `agency_growth` | GROWTH | **249.99 €** | 50 | yes | 1000 | 300 | yes | 10 |
| agency | `agency_scale` | SCALE | **499.99 €** | **unlimited** | yes | 3000 | 1000 | yes | unlimited |

Legacy alias map (also recovered): `free_worker→free_person`,
`worker_plus→ai_plus`, `company_pilot→launch_offer_99`,
`agency_pilot→agency_start`; `admin_internal` stays legacy-internal.

**Status: PRIOR ART, and explicitly re-judged by W2.** The train doc's
matrix marks:
- row 10 — the price table: **REPLACE (input only)** — "stale vs binding
  repricing direction"; used solely as the base column of the §6 matrix;
- row 11 — the Launch Offer + 15 % first-annual discount: **REJECT (stale)**;
- row 14 — the legacy alias map: **REJECT**.

### 2.4 The binding repricing direction (W2) — decided, but not finished

Train doc §6, owner decisions received 2026-07-20:

| Decision | Value | Status |
|---|---|---|
| Personal plans multiplier | **≈ ×2** of the W1 base | **BINDING** |
| Company plans multiplier | **≈ ×3** of the W1 base | **BINDING** |
| Agency treated as company class (×3) | Yes, *unless* the owner declares agencies a separate class | BINDING, with an open sub-gate |
| The resulting rounded prices | 19.99 / 49.99 / 299 / 299.99 / 749.99 / 1 499 € | **NOT FINAL — proposals only** (`MDD-01`) |

Exact arithmetic recorded in the matrix (so it is not re-derived wrongly):
9.99×2 = **19.98**, 24.99×2 = **49.98**, 99×3 = **297.00**, 99.99×3 =
**299.97**, 249.99×3 = **749.97**, 499.99×3 = **1 499.97**.

> **Note on "49.98 €".** It appears exactly once in the whole repository, as
> the intermediate `24.99 × 2` in this matrix, attached to **`vip_media`** —
> not to `worker_plus`. The same row's own proposed rounding is 49.99, and the
> column header says NOT FINAL. It is **not** a decided Worker Plus price.

### 2.5 Canonical answer for subscriptions

| Question | Canonical answer |
|---|---|
| Which catalogue is the runtime contract? | **Catalogue B** (`PRE_PAYMENT_PLANS`) — it is what entitlements and Stripe env vars are keyed to |
| Which catalogue holds the richest, owner-shaped entitlement model? | **Catalogue C** (ad limits, AI runs, media items, managed companies) |
| Which catalogue is dead weight? | **Catalogue A** (`public.plans`) — orphaned since 2026-05-19 |
| What is the price of any plan today? | **Nothing is decided.** `MDD-01` |
| Which plan names are final? | **Undecided** — B and C disagree on every name. `MDD-02` |

---

## 3. LMC top-up packages

Binding rule (train doc §8): **Stripe may sell only (a) subscriptions and
(b) LMC top-ups.** A top-up creates a `purchased` lot, which **never expires**
by promotional rules (DB CHECK).

Everything else about top-ups is missing:

| Item | Artefact found | Status |
|---|---|---|
| That top-ups exist and are sold via Stripe | train doc §8 | **BINDING** |
| Purchased lots never expire | migration CHECK constraint | **BINDING** |
| Purchases gated by `lmc_purchases_enabled` (admin class) and `stripe_lmc_topups_enabled` (**owner_only**) | `lmc-flags.ts`, `lmc_flag_policy_v1` | **BINDING** |
| Recording RPC exists (`lmc_record_purchase_v1`) | migration | **BINDING** (inert) |
| **Package denominations** (e.g. 10 / 25 / 50 / 100 LMC) | *none anywhere* | **`MDD-03`** |
| **Minimum / maximum top-up** | *none* | **`MDD-04`** |
| **Volume bonus** (e.g. "buy 100, get 110") | *none* — and note a bonus lot would be promotional-class value with expiry implications | **`MDD-05`** |
| **VAT treatment** of a credit purchase (is a top-up a supply, or a prepayment?) | *none* | **`MDD-06`** |
| **Revenue recognition** for an LMC-settled month (what euro value the intercompany IP licence fee is computed on) | *none*; `docs/legal/intercompany-ip-licence-accounting-schedule-v1.md` is silent on credit-settled transactions | **`MDD-07`** |
| **Refund policy for unspent purchased LMC** | reversal RPCs exist (`refund_reversal`, `chargeback_reversal`, purchased-only); the customer-facing *policy* does not | **`MDD-08`** |
| Whether top-ups may be sold to a person with no subscription | train doc §8: **yes, explicitly allowed** | **BINDING** |

---

## 4. Micro-features purchasable with LMC

### 4.1 The binding rule

Train doc §8 (BINDING):
- internal LabourMarket.ai tools and services are bought **inside the platform
  with LMC**, never directly with Stripe;
- **a free person or a small company may buy an individual internal tool by
  topping up LMC without first buying a subscription.**

Train doc §3.1 row 12 (BINDING): W1's ad-product registry is **REPLACED**, and
the surviving concept is *"internal tools purchasable with LMC"*; the
standalone ad-credit purchase path is superseded.

### 4.2 The only recovered candidate list — W1 ad products (8 slugs)

From `git show dc051b45:apps/web/lib/billing/ad-products.ts` and its DB seed
(`20260714191000_ad_products_registry_v1.sql`, never applied). Every row seeds
`price_cents = NULL`, `active = false`.

| Slug | Audience | Grants | Promotion | International | Price (EUR) | Price (LMC) |
|---|---|---|---|---|---|---|
| `single_ad` | company | 1 ad credit | none | no | **NULL** | **`MDD-09`** |
| `ai_promoted_ad` | company | 1 ad credit | ai | no | **NULL** | **`MDD-09`** |
| `premium_promoted_ad` | company | 1 ad credit | premium | no | **NULL** | **`MDD-09`** |
| `international_ad` | company | 1 ad credit | none | **yes** | **NULL** | **`MDD-09`** |
| `package_5` | company | 5 ad credits | none | no | **NULL** | **`MDD-09`** |
| `package_20` | company | 20 ad credits | none | no | **NULL** | **`MDD-09`** |
| `agency_package` | agency | 20 ad credits | standard | no | **NULL** | **`MDD-09`** |
| `extra_promotion` | any | 0 credits (promotion only) | boost | no | **NULL** | **`MDD-09`** |

Recovered UI labels for these 8 (5 locales, W1 `pricingV2.adProducts.items`):
Single job ad · AI-promoted job ad · Premium-promoted job ad · International
job ad · 5-ad package · 20-ad package · Agency package · Extra promotion.

Recovered allowance math (`resolveActiveAdAllowance`, still valid as design):
**plan allowance + purchased credits**, unless the plan is `unlimited`, which
short-circuits. Owner rule encoded: *normal company subscriptions do NOT
include unlimited ads; the Launch Offer is the only unlimited exception* (plus
agency SCALE by tiering).

### 4.3 What is missing to make this a real LMC catalogue

| # | Missing design decision |
|---|---|
| **`MDD-09`** | **The LMC price of every purchasable micro-feature.** No LMC price exists for any feature anywhere in the repository, in any branch, in any doc. Not one number. |
| **`MDD-10`** | **The definitive list of LMC-purchasable tools.** The 8 ad products are the only recovered candidates, and they were "REPLACED" as a *registry* while surviving as a *concept* — so it is not decided whether the LMC catalogue is these 8, a subset, or a different list entirely. |
| **`MDD-11`** | **How an LMC spend becomes an entitlement.** The ledger records a spend with a free-text `reason`; there is no product-code column, no tool registry, and no mapping from "spent N LMC" to "you now have +1 active ad / +200 AI runs". `lmc_spend_v1` has no caller. |
| **`MDD-12`** | **Whether plan-included allowances (AI runs, media items, ads) are also purchasable in LMC**, and at what unit rate — e.g. can a FREE person buy 100 extra AI runs? W1 priced *ads* only. |
| **`MDD-13`** | **Whether the concierge / manual services** (success fee, coordination fee — recorded as launch-partner *ranges* in `docs/launch/concierge-worker-sourcing-pricing-addendum-v1.md`: 300–700 € per worker, 1 000–2 000 € per brigade/company, 250–500 € coordination) **are payable in LMC or only off-platform in EUR.** Ranges are explicitly "draft launch-partner ranges (owner sets per deal)", so they are not a catalogue price either. |
| **`MDD-14`** | **Whether the 5 public AI-automation service packages** (600 / 900 / 1 200 / 1 500 / 1 900 €, the only real prices on the live site) belong to this catalogue at all, or are a separate business line. No artefact connects them to LMC or to any plan. |

---

## 5. LMC issuance — BINDING and fully recovered

| Grant | Amount | Trigger | Expiry | Cap | Status |
|---|---|---|---|---|---|
| `promotional_signup` | **50 LMC** (5 000 cents) | **Verified** signup (`email_confirmed_at` required) | **60 days** | once ever per account (partial unique index) | **BINDING** |
| `promotional_activity` | **50 LMC** | **7 meaningful active days within the first 30 days** | 60 days | once ever per account | **BINDING** — but the *definition* of a "meaningful active day" was deferred to Wagon 2 and does not exist → **`MDD-15`** |
| Per-user promotional ceiling | **100 LMC = 100 € of internal credit** | — | — | hard | **BINDING** |
| "Daily 50 LMC" | **Explicitly forbidden** — structurally impossible (once-per-account indexes) | — | — | — | **BINDING** |
| `admin_grant` | ≤ **1 000 LMC** per grant | Admin action, verified recipient email | **mandatory, ≤ 365 days** | cap is "owner-adjustable later" | **BINDING** |
| `referral_reward` | **rate `r` is undefined** — no rate exists in schema, code or doc, and none may default in | direct single-level referral, settled purchase, no refund/fraud | **exempt** from the lot-expiry CHECK → a referral lot may be perpetual | disabled by DB trigger | **BINDING that it is disabled**; the rate is **`MDD-16`**, the expiry policy is **`MDD-17`** |

Known exposure arithmetic, recorded (train doc §6): at 19.99 €/mo, one referred
month granting 100 promo LMC costs **up to 5 months of revenue** in internal
credit if fully spent; against a ~49.99 € tier, ~2 months.

---

## 6. Kill-switches, limits and governance — BINDING

| Flag | Default | Policy class | What it gates |
|---|---|---|---|
| `lmc_purchases_enabled` | false | `admin` | recording a purchased top-up |
| `lmc_promotional_grants_enabled` | false | `admin` | **all** promotional + admin grants |
| `lmc_referrals_enabled` | false | `admin` | referral rewards (DB trigger, fail-closed) |
| `lmc_spending_enabled` | false | `admin` | spending — while false, even issued LMC is frozen |
| `stripe_lmc_topups_enabled` | false | **`owner_only`** | Stripe-side top-up selling |
| `live_payments_enabled` | false | **`owner_only`** | live payments |
| *(any other key)* | — | **`system_locked`** | fail-closed default |

Verified in production 2026-07-28: **all six `false`**, `lmc_accounts` = 0,
outstanding LMC = 0.

`owner_only` flags currently have **no activation path at all** — the shared
setter refuses every caller including `service_role`, and the future owner RPC
is specified but unbuilt (train doc §14a: server-side owner registry,
`auth.uid()` match, no hardcoded identity, confirmation phrase,
compare-and-set, immutable audit).

**Open governance gap, recorded by the prior audit and still true:**
`lmc_referrals_enabled` and `lmc_promotional_grants_enabled` are class `admin`,
while train doc §14 gate 3 requires an **owner** decision before referrals may
exist. Reclassifying them is **`MDD-18`** (needs an owner decision + migration).

**No-MLM enforcement gap:** the single-level rule is documentary. There is no
referral-relationship table, no `referred_by` column and no depth constraint in
the applied schema — **`MDD-19`** (the schema shape that will enforce it).

---

## 7. Relationship to Stripe and to plan entitlements

### 7.1 The boundary (BINDING, from two artefacts)

| Rule | Source | Status |
|---|---|---|
| Stripe sells **only** subscriptions and LMC top-ups | train doc §8 | BINDING |
| Internal tools are bought **only** with LMC, inside the platform | train doc §8 | BINDING |
| A top-up may be bought **without** a subscription | train doc §8 | BINDING |
| A Stripe subscription may **never** mint, top up, spend or cash out LMC; the two domains stay separate | PR #844 guard `stripe-lmc-separation.test.ts` | **UNMERGED** (W3) — the rule is sound, the guard is not on `main` |
| Live activation requires all 7 gates (price table, owner-applied migrations, referral rate, fraud tooling, legal copy review, owner-only live keys, re-run proofs) | train doc §14 | BINDING |

> **Recorded conflict to resolve before Wagon 4.** Train doc §8 says Stripe
> *will* sell LMC top-ups; the W3 separation guard fails the build if any
> top-up surface appears under `/api/billing`. Both are correct in their own
> slice, but the eventual top-up route needs an explicitly decided home
> (inside the billing API with a narrowed guard, or a separate `/api/lmc`
> surface). — **`MDD-20`**

### 7.2 How LMC and plan entitlements are supposed to combine

Recovered, coherent, and the only model any artefact describes:

```
plan entitlement (finite allowance)  +  purchased add-on  =  effective allowance
        │                                      │
        │                                      └── W1: ad credits bought with EUR
        │                                          W2: the same concept, bought with LMC
        └── "unlimited" plans short-circuit (Launch Offer, agency SCALE)
```

What is **not** decided: the conversion itself (`MDD-11`), the LMC prices
(`MDD-09`), and whether non-ad allowances participate (`MDD-12`).

Today's runtime reality, for contrast: **one** feature is server-gated
(`booking_requests`), enforcement is permissive whenever billing is disabled,
and no entitlement anywhere consults LMC.

---

## 8. UI rendering — what exists, what was built and closed, what is planned

| Surface | State today | Provenance |
|---|---|---|
| Public `/pricing` | Concierge-first; renders Catalogue A names with "pricing TBD" placeholders **and** the Catalogue B pre-payment boundary **and** 5 AI-automation service prices. No buy affordance | live `main` |
| W1 pricing catalogue UI (3 audience columns, real prices, Launch Offer badge, "in preparation" ad-product list, waitlist CTA only) | **Built, tested, guarded — and closed with PR #754.** Component + 5-locale copy recoverable from `dc051b45` | PRIOR ART |
| Wallet balance + ledger history | **Does not exist.** Deferred to Wagon 7 | train doc §12 |
| Top-up flow | **Does not exist.** Wagons 4/7 | train doc §12 |
| Referral surface (invite link, attribution status, **no earning claims**) | **Does not exist.** Wagons 5/7 | train doc §12 |
| Admin grant console, fraud/reversal tools, reporting | Wagon 6 in the plan; an admin LMC panel (flags, liability, credit form) + a user balance line are **built but unmerged** — a seam over the existing RPCs, adding no new ledger concept | PR **#893** (draft), `docs/audits/commercial-readiness-audit-v1.md` |
| 11-locale wallet/referral copy | **Deliberately absent.** Prior audits verified **zero user-facing LMC strings in all 11 catalogues** and recorded that as the correct state | 30-60-90 plan §6, priority register OG-12 |

**Binding UI constraint:** no public wording may suggest cash-out, withdrawal,
investment, exchange trading or guaranteed conversion to money; no earning
claim and no invented "up to" percentage may be rendered before an
owner-approved referral rate exists.

**`MDD-21`** — the wallet/top-up/referral **UI specification itself** (screens,
states, empty states, and the copy that explains a non-withdrawable credit to a
consumer) has never been written; §12 lists the surfaces, not their design.

---

## 9. Missing design decisions — the register

| # | Decision missing | Blocks |
|---|---|---|
| **MDD-01** | Final subscription prices (the ×2 / ×3 direction is decided; the resulting numbers are not) | Every Stripe object; the whole paid chain |
| **MDD-02** | Final plan names / which catalogue survives (B vs C vs A) | Pricing page; Stripe products; entitlement keys |
| **MDD-03** | LMC top-up package denominations | Selling any credit |
| **MDD-04** | Minimum / maximum top-up | Same |
| **MDD-05** | Volume bonus structure (and its expiry class) | Same; liability model |
| **MDD-06** | VAT treatment of a credit purchase | Legal/finance sign-off |
| **MDD-07** | Revenue recognition for LMC-settled months (and the intercompany licence-fee base) | Accounting; the IP licence schedule |
| **MDD-08** | Refund policy for unspent purchased LMC | Consumer terms |
| **MDD-09** | **The LMC price of every micro-feature** — not one number exists | The entire LMC economy |
| **MDD-10** | The definitive list of LMC-purchasable tools | Same |
| **MDD-11** | How a spend maps to an entitlement (product code, registry, conversion) | Same |
| **MDD-12** | Whether AI runs / media items / other allowances are LMC-purchasable | Same |
| **MDD-13** | Whether concierge fees are payable in LMC | Concierge productisation |
| **MDD-14** | Whether the 5 AI-automation packages belong to this catalogue | Positioning |
| **MDD-15** | Definition of a "meaningful active day" (gates the second 50-LMC grant) | Promotional grant wiring |
| **MDD-16** | Referral reward rate `r` | Referral network |
| **MDD-17** | Referral lot expiry policy (currently exempt → perpetual liability possible) | Liability model |
| **MDD-18** | Flag policy classes for referrals + promotional grants (`admin` vs `owner_only`) | Governance |
| **MDD-19** | Schema shape that structurally enforces single-level referrals | No-MLM guarantee |
| **MDD-20** | Where the top-up route lives (billing API vs separate surface) | Wagon 4 |
| **MDD-21** | Wallet / top-up / referral UI + consumer copy specification | Wagon 7 |

**21 missing decisions.** None of them was filled in by this audit.

---

## 10. What this reconstruction did NOT find (explicit negatives)

Stated so a future session does not search for them again:

- **No LMC price for any feature, anywhere** — not in `main`, not in any
  branch, not in any closed PR, not in any doc, not in the DB.
- **No top-up package denominations** — "top-up" occurs 54 times across docs,
  code and migrations; **not one of those occurrences carries an amount**
  (verified: no `top-up` line anywhere matches a figure in LMC or EUR).
- **No referral rate** — every referral cell in the pricing matrix is the
  formula `r × price`, with `r` undefined by design.
- **No ADR** covering pricing, credit or the commercial model.
- **No user-facing LMC string** in any of the 11 locale catalogues (verified
  again in this audit) — the intended state.
- **No `plans.price_eur_monthly` value** — NULL for all 4 rows since
  2026-05-19.

---

## 11. Recommended order of decisions (no new design, just sequencing)

1. **MDD-02 then MDD-01** — pick the surviving catalogue, then price it. Every
   other commercial gate depends on these two.
2. **MDD-10 + MDD-09 + MDD-11** — the LMC economy is not a catalogue until a
   named list of tools has LMC prices and a spend→entitlement mapping. Until
   then, crediting LMC creates a euro liability with nothing to spend it on.
3. **MDD-03…MDD-08** — top-up commercials and their finance/legal treatment,
   before any credit is sold.
4. **MDD-15** — before promotional grants are switched on.
5. **MDD-18, MDD-16, MDD-17, MDD-19** — the referral cluster; keep referrals
   disabled until all four are answered.
6. **MDD-20, MDD-21** — implementation shape and UI, last.

---

*Reconstruction only. No price, package, feature, rate or limit was invented,
and no decision recorded above was changed. Sources: `main` @ `f6dc410b`,
PR #754 (`dc051b45`, closed), PR #843 (`664b9ab9`, merged + applied),
PR #844 (`eb59f549` / `fbd6825e`, unmerged), `docs/product/`,
`docs/audit/`, `docs/audits/`, `docs/launch/`, `docs/decisions/`,
`supabase/migrations/`, and production reads via Supabase MCP.*
