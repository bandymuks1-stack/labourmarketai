# Commercial model & Stripe audit v1 — labourmarket.ai

| Field | Value |
|---|---|
| Date | 2026-07-22 |
| Audit loop | 5 of the full product audit (Commercial model & Stripe) |
| Repo | `C:\Users\Mano\Documents\labourmarketai` |
| Branch / HEAD | `main` @ `664b9ab9` (`feat(billing): add canonical immutable LMC ledger foundation v1 (#843)`), clean tree |
| Production | https://labourmarket.ai |
| Supabase prod ref | `gorgitwvdzxbnaxhrsrw` |

## Read-only statement

This audit changed **nothing**. No Stripe API was called, no Stripe account was
authenticated, no product/price/key was created or modified. No feature flag was
flipped, no migration applied, no source file edited, no commit/push/PR made.
Database access was limited to `SELECT`-only introspection via Supabase MCP
(`information_schema`, `pg_catalog`, `supabase_migrations.schema_migrations`, and
row counts / full reads of the 4-row `plans` and 6-row `lmc_settings` tables).
Production HTTP access was a single unauthenticated `GET` of the public
`/en/pricing` page. The only artefact written is this file.

---

## 1. Current commercial state — one honest paragraph

labourmarket.ai has **no working payment path of any kind, and cannot currently
charge anyone**. Stripe is a fully-built, signature-verifying, idempotent
test-mode chain that has never been switched on: no `STRIPE_*`, `PAYMENTS_ENABLED`
or `BILLING_PROVIDER` value exists in any env file in the repo, so
`resolveBillingConfig` returns `state: "disabled"`, `getBillingProvider()` returns
the noop provider, and every checkout attempt returns `payments_disabled`
(`apps/web/lib/billing/config-core.ts:88-98`, `providers/noop.ts:17-19`). The
three billing tables are applied in production and are **completely empty**
(`billing_customers` 0, `billing_subscriptions` 0, `payment_webhook_events` 0,
legacy `subscriptions` 0) — the chain has never run once. Against that, the
product presents **four mutually inconsistent commercial stories on one public
page**: a DB-driven tier table (`free`/`business`/`agency`/`enterprise`, all with
`price_eur_monthly = NULL`), a second, disjoint code catalogue
(`free_worker`/`worker_plus`/`company_pilot`/`agency_pilot`/`admin_internal`), a
concierge success-fee/coordination-fee offer with no amounts, and five
AI-automation service packages carrying the **only real prices anywhere in the
product** (€600–€1,900, live in all 5 active locales). Entitlement enforcement is
effectively zero — exactly one feature (`booking_requests`) is server-gated, and
`entitlementAllows` short-circuits to `true` whenever billing is not enforced,
which is always. The LMC credit ledger (18 `SECURITY DEFINER` RPCs, 10 tables,
1 LMC = 1 EUR) is **live in the production database with all balances at zero and
zero application code calling it** — a complete financial engine with no product
attached, all six flags `false`. Worker Plus has **no price configured anywhere**;
`49.98` appears exactly once in the entire repo, in a doc, attached to a different
plan (`vip_media`). The public copy is honest about not being able to sell
subscriptions; the Terms of Service, however, declare that UAB "Nonstop Group"
sells services and issues invoices while containing **no payment, refund,
cancellation or consumer-withdrawal clause at all**.

---

## 2. Plans & prices — copy vs DB vs code vs Stripe

### 2a. Catalogue A — DB `plans` table (rendered by `PricingTable`)

Source: `SELECT * FROM public.plans` (4 rows, all `active=true`, `updated_at` 2026-05-19).
Rendered via `apps/web/lib/marketing/plans.ts:10,25` → `components/marketing/pricing-table.tsx`.

| Public copy (prod `/en/pricing`) | DB row | DB price | Code constant | Stripe price id |
|---|---|---|---|---|
| "Free" / "Get on the market." | `plans.slug='free'` | `price_eur_monthly = NULL` | none (`PLAN_SLUGS` name-only) | none |
| "Business" / "For active employers." | `plans.slug='business'` | `NULL` | none | none |
| "Agency" / "For staffing partners." | `plans.slug='agency'` | `NULL` | none | none |
| "Enterprise" / "For scale and control." | `plans.slug='enterprise'` | `NULL` | none | none |

Displayed price is the governed placeholder `pricing.plan.<slug>` →
`"<Name>: pricing TBD"` (`apps/web/content/placeholders.ts:601-625`), whose
declared `replacementSource` is *"Founder-set monthly price in
`plans.price_eur_monthly`"* — a column that is `NULL` for all 4 rows. There is no
price in copy, in the DB, in code, or in Stripe for any of these four tiers.

### 2b. Catalogue B — code `PRE_PAYMENT_PLANS` (rendered by `PrePaymentPlanBoundary`)

Source: `apps/web/lib/billing/plans.ts:69-142`. Rendered on the same `/pricing`
page (`app/[locale]/(marketing)/pricing/page.tsx:53`).

| Public copy | Code slug | `accessState` | DB row | Code price | Stripe price env var | Env value present? |
|---|---|---|---|---|---|---|
| "Free Worker" | `free_worker` | `free` | **no matching row** | none | — | — |
| "Worker Plus" | `worker_plus` | `payment_not_enabled` | **no matching row** | **none anywhere** | `STRIPE_PRICE_WORKER_PLUS` | **no** |
| "Company Pilot" | `company_pilot` | `payment_not_enabled` | **no matching row** | none | `STRIPE_PRICE_COMPANY_PILOT` | **no** |
| "Agency Pilot" | `agency_pilot` | `payment_not_enabled` | **no matching row** | none | `STRIPE_PRICE_AGENCY_PILOT` | **no** |
| "Admin / Internal" | `admin_internal` | `internal` | **no matching row** | — | — | — |

The two catalogues share **zero slugs**. `plans.ts` has no price field at all —
it carries only entitlements. `prices.ts:10-21` maps 3 plan keys to env vars that
are unset (`.env.local` and `apps/web/.env.local` contain 0 `STRIPE_*` /
`PAYMENTS_ENABLED` / `BILLING_PROVIDER` entries; `.env.example:12-20` holds only
placeholder text).

### 2c. Catalogue C — `services` (the ONLY real public prices)

Source: `apps/web/messages/en.json:6583+` etc.; component
`components/marketing/service-offers.tsx`; rendered at `pricing/page.tsx:54`.
Verified live on production `/en/pricing`.

| Offer | EN | LT | DE | NL | RU | DB row | Code | Stripe |
|---|---|---|---|---|---|---|---|---|
| AI workflow automation | `From €900` | `Nuo 900 €` | `Ab 900 €` | `Vanaf € 900` | `От 900 €` | none | none | none |
| Integrations · n8n · API workflows | `From €600` | `Nuo 600 €` | `Ab 600 €` | `Vanaf € 600` | `От 600 €` | none | none | none |
| Business process automation | `From €1,200` | `Nuo 1 200 €` | `Ab 1.200 €` | `Vanaf € 1.200` | `От 1 200 €` | none | none | none |
| Custom AI assistant | `From €1,500` | `Nuo 1 500 €` | `Ab 1.500 €` | `Vanaf €1.500` | `От 1 500 €` | none | none | none |
| Website + marketing automation | `From €1,900` | `Nuo 1 900 €` | `Ab 1.900 €` | `Vanaf €1.900` | `От 1 900 €` | none | none | none |

All 5 active locales (`en, lt, ru, nl, de` — `lib/i18n/config.ts` + owner active
subset) carry these prices consistently. The 6 inactive catalogue locales
(`lv, et, da, no, sv, pl`) have **no `services` namespace at all** — not a live
defect today, but a hard blocker for activating any of those markets.

### 2d. Catalogue D — concierge fees (no amounts)

`messages/en.json:7614,7633` — quoted in §5.

### 2e. Worker Plus @ 49.98 EUR — actual configured state

`49.98` occurs **exactly once in the entire repository**:

> `docs/product/lmc-commercial-system-train-v1.md:249` —
> `| Personal VIP MEDIA (`vip_media`) | 24.99 €/mo | ×2 = **49.98 €** | 49.99 €/mo | …`

It is an *intermediate multiplication result* (24.99 × 2) inside a
decision matrix, attached to a plan key **`vip_media`**, not `worker_plus`. The
same table's own recommended rounding is **49.99**, and the doc labels the whole
column "**Proposed rounded (NOT FINAL)**" (line 240-243). `vip_media` does not
exist in any code catalogue, DB row, or Stripe config. Worker Plus itself has
**no price in copy, DB, code, or Stripe**.

**Conclusion:** 49.98 EUR is an owner intention, not configured LIVE state
anywhere, and is currently attached to the wrong plan name in the only document
that mentions it.

---

## 3. Stripe integration status

Legend: **VERIFIED** = code exists, wired, configured, and proven to have run.
**CODE_ONLY** = code exists and is wired, but no config and never executed.
**MISSING** = not implemented on `main`.

| # | Capability | Status | Evidence |
|---|---|---|---|
| 1 | Provider seam / SDK isolation | CODE_ONLY | `lib/billing/provider.ts:52-61`; SDK imported only in `providers/stripe-test.ts:3` (pinned by `guards/no-live-payments.test.ts:53`) |
| 2 | Config resolver + live hard-block | CODE_ONLY (correct by design) | `config-core.ts:74-85` forces `stripe_live_blocked` on `STRIPE_MODE=live` or any `sk_live_`/`pk_live_`/`rk_live_` |
| 3 | Env configured in prod | **MISSING** | 0 `STRIPE_*`/`PAYMENTS_ENABLED`/`BILLING_PROVIDER` entries in `.env.local`, `apps/web/.env.local`; `.env.example:12-20` placeholders only. Vercel env **not verified** (see §8) |
| 4 | Checkout session creation | CODE_ONLY | `app/api/billing/test-checkout/route.ts:76-88`; gate `checkout-core.ts:39-65`. Returns `payments_disabled` (400) in current config |
| 5 | Checkout — organisation binding | **MISSING** on main | `route.ts:79` sends `clientReferenceId: user.id` only; org binding exists only in unmerged Draft PR #844 |
| 6 | Customer record (`billing_customers`) | **MISSING** on main | No `customer-store.ts` on `main` (added only in PR #844); table applied but never written |
| 7 | Customer portal (cancel/update card) | **MISSING** on main | No `app/api/billing/portal/` directory on `main`; added only in PR #844 |
| 8 | Webhook endpoint | CODE_ONLY | `app/api/billing/webhook/route.ts:28-103`, `runtime = "nodejs"`, raw body read at line 30 |
| 9 | Webhook signature verification | CODE_ONLY (correct) | `providers/stripe-test.ts` `constructWebhookEvent` uses `webhooks.constructEvent`; route rejects with `invalid_signature` 400 before any business logic (`route.ts:36-40`) |
| 10 | Live-event rejection | CODE_ONLY (correct) | `route.ts:43-45` `assertTestEvent` → `live_event_rejected` |
| 11 | Webhook idempotency | CODE_ONLY (correct) | `subscription-store.ts:31-43` insert-first; prod unique index `payment_webhook_events_provider_event_id_key ON (provider, event_id)` verified present |
| 12 | Checkout idempotency key | **MISSING** on main | No `idempotencyKey` passed to `checkout.sessions.create` (`providers/stripe-test.ts:39-49`); deterministic key exists only in PR #844 |
| 13 | Subscription create / update / cancel | CODE_ONLY | `route.ts:68-95`; `mapStripeStatus` `webhook-core.ts:34-45` |
| 14 | past_due / failed payment | CODE_ONLY, **with defect** | `subscription-store.ts:105` failed → `past_due`; `webhook-core.ts:43` maps Stripe `paused` → `past_due`, which `entitlements-v1.ts:81,83-92` treats as entitled grace |
| 15 | Invoice records / receipts | **MISSING** | No `invoices` table in prod (`information_schema` scan); invoice events only patch `billing_subscriptions.last_payment_status` (`subscription-store.ts:100-110`). `invoice.paid` is not in `HANDLED` (`webhook-core.ts:20-27`) |
| 16 | Refunds / chargebacks | **MISSING** | No `charge.refunded` / `charge.dispute.*` handling anywhere |
| 17 | Access grant on payment | CODE_ONLY | `entitlements-v1.ts:83-92` (subscription-derived) |
| 18 | Access revocation | CODE_ONLY, partial | `route.ts:86-88` `customer.subscription.deleted` → `status: "cancelled"`; admin manual revoke `lib/admin/billing-actions.ts`. No user-initiated cancellation surface exists |
| 19 | Admin billing console | VERIFIED (renders) | `app/[locale]/dashboard/admin/billing/page.tsx`, `requireSuperadmin`; shows `disabled` state, 0 subscriptions, 0 events |
| 20 | Manual pilot grant (the only real access mechanism) | CODE_ONLY | `components/app/admin-pilot-grant-form.tsx` → `manual_…` row in `billing_subscriptions`; table has **0 rows**, so it has never been used |
| 21 | Has the chain ever run? | **NO** | `billing_customers` 0, `billing_subscriptions` 0, `payment_webhook_events` 0, `subscriptions` 0 rows |

### Applied-migration reality check

Prod ledger (`supabase_migrations.schema_migrations`) confirms
`20260613202244 billing_test_mode_records` **applied** and
`20260721133338 20260720190000_lmc_ledger_foundation_v1` **applied**.
`20260721150000_stripe_subscriptions_v1.sql` is **not in `supabase/migrations/`
on main** and **not in the prod ledger** — it lives only on the
`feat/stripe-test-subscriptions-v1` branch (Draft PR #844). `billing_subscriptions`
in prod has **no `organization_id` column**, confirming it is unapplied.

---

## 4. Entitlement enforcement

Registry: `lib/billing/readiness.ts:66-116`. Runtime: `entitlements-v1.ts`,
`effective-entitlements.ts`.

| Feature key | Declared plans | Declared enforcement | Real server-side check on `main`? | Effective today |
|---|---|---|---|---|
| `worker_profile` | free_worker, worker_plus | `free_surface` | n/a (free) | open |
| `worker_journal` | free_worker, worker_plus | `free_surface` | n/a (free) | open |
| `worker_basic_skills` | free_worker, worker_plus | `free_surface` | n/a (free) | open |
| `booking_requests` | company_pilot, agency_pilot | `server_gate` | **YES** — `lib/booking/booking-actions.ts:100` `if (!(await hasFeature("booking_requests"))) return { kind: "not-entitled" }` | open (permissive branch) |
| `readiness_checklist_countries` | free_worker(1), worker_plus(10) | `declared_boundary_only` | no | open, unlimited |
| `document_expiry_reminders` | worker_plus | `declared_boundary_only` | no | open |
| `expanded_cv` | worker_plus | `declared_boundary_only` | no | open |
| `priority_visibility` | worker_plus (`false`) | `declared_boundary_only` | no | not built |
| `company_create_needs` | company_pilot(5), agency_pilot(25) | `declared_boundary_only` | no | open, unlimited |
| `candidate_readiness_summaries` | company_pilot, agency_pilot | `declared_boundary_only` | no | open |
| `communication` | company_pilot, agency_pilot | `declared_boundary_only` | no | open |
| `team_matching` | company_pilot | `declared_boundary_only` | no | open |
| `agency_multi_company` | agency_pilot | `declared_boundary_only` | no | open |
| `worker_pool` | agency_pilot | `declared_boundary_only` | no | open |
| `doc_readiness_tracking` | agency_pilot | `declared_boundary_only` | no | open |
| `booking_pipeline` | agency_pilot | `declared_boundary_only` | no | open |
| `verify_documents` | admin_internal | `admin_rbac` | yes (`requireSuperadmin`) | admin-only |
| `manage_country_rules` | admin_internal | `admin_rbac` | yes | admin-only |
| `manage_pilots` | admin_internal | `admin_rbac` | yes | admin-only |

**Totals: 19 keys — 1 billing-gated, 3 RBAC-gated, 3 free surfaces, 12
declared-only.** And even the one billing gate is inert:
`entitlements-v1.ts:124` — `if (!ctx.enforced) return true;` — and `enforced`
is `config.state === "stripe_test"` (`effective-entitlements.ts:43`), which is
`false` in every environment today. **Net: zero features are actually
entitlement-restricted in production.**

There are also **two parallel entitlement engines**: `entitlements.ts`
(`gateFeature`/`gateFeatureBySlug`, Stage-8 pre-payment semantics returning
`payment_not_enabled`) and `entitlements-v1.ts` (`resolveEntitlements` /
`entitlementAllows`, subscription semantics). Neither `gateFeature` nor
`gateFeatureBySlug` has a single non-test caller.

---

## 5. Could a real user be charged today? Can any UI offer an uncompletable paid action?

**Charge risk: NO, on four independent layers.**

1. `PAYMENTS_ENABLED` is `false as const` (`plans.ts:18`) and env default is
   `"false"` (`lib/env.ts:27`).
2. `resolveBillingConfig` returns `disabled` without `PAYMENTS_ENABLED=true` +
   `BILLING_PROVIDER=stripe` + `sk_test_` + `whsec_` (`config-core.ts:88-98`).
3. Any live mode or live key shape forces `stripe_live_blocked` **before** any
   other check (`config-core.ts:74-85`), and `requireStripeTestSecret`
   additionally refuses a non-`sk_test_` secret (`config.ts:42`).
4. `getBillingProvider()` returns the noop provider, whose
   `createCheckoutSession` returns `{ ok:false, reason:"payments_disabled" }`
   (`providers/noop.ts:17-19`). Even a valid config would only produce
   `mode:"subscription"` test sessions.

The only checkout UI (`BillingTestCheckout`) renders **nothing** unless the
config is `stripe_test`, and it lives behind `requireSuperadmin` on
`/dashboard/admin/billing`. The public `/pricing` page has no payment widget.

**Uncompletable paid action: NO hard blocker, but two soft ones.**

- No public button initiates a payment. Every public CTA is a lead capture
  (`WaitlistModal` → `leads` row) or a link to `/company-need`.
- **Soft risk 1:** the public page advertises five priced services (€600–€1,900)
  with CTA "Get a proposal". A user who accepts a proposal cannot pay in-product
  — collection is off-platform. This is disclosed
  (`services.note`: *"billing is never started for you here"*) but the sale route
  is manual and undocumented in the Terms.
- **Soft risk 2:** the concierge offer commits to a fee structure with no
  amounts. Verbatim (`messages/en.json:7633` / `lt.json`):

  > EN: "A fixed success fee applies per hired worker, crew or company placement.
  > A separate coordination fee applies only when document or onboarding
  > coordination is actually delivered. The final price is confirmed before paid
  > work starts."
  >
  > LT: "Fiksuotas sėkmės mokestis taikomas už įdarbintą darbuotoją, brigadą ar
  > įmonę. Atskiras koordinavimo mokestis taikomas tik tada, kai realiai
  > atliekamas dokumentų ar įvedimo koordinavimas. Galutinė kaina patvirtinama
  > prieš pradedant mokamą darbą."

  Neither fee has a number anywhere in the repo or DB.

Honest public disclaimers verified live on production:
`"Public payments are not enabled yet"` (`en.json:7614`), `"Payments are not
enabled yet — no payment page and no card."` (`planBoundary.subcopy`),
`"Prices are being prepared — nothing can be bought yet."`
(`pricing.priceState.draft_pricing`), and marketplace rules:
`"Payments are not active yet; no payments run through the platform at this
stage."` (`legal.marketplaceRules.rules[6]`).

---

## 6. LMC unit, 1 LMC = 1 EUR, and the future Partner Referral Network

### 6.1 What actually exists

**Production DB (verified):** 10 LMC tables (`lmc_accounts`, `lmc_transactions`,
`lmc_lots`, `lmc_lot_balances`, `lmc_lot_consumptions`, `lmc_account_balances`,
`lmc_settings`, …) and **18 `SECURITY DEFINER` functions** including
`lmc_grant_promotional_v1`, `lmc_record_purchase_v1`, `lmc_admin_grant_v1`,
`lmc_spend_v1`, `lmc_reverse_v1`, `lmc_expire_lots_v1`, `lmc_set_flag_v1`.
All balance tables have **0 rows**.

**Flags (`SELECT * FROM lmc_settings`, all `false`, `updated_by = NULL`):**
`live_payments_enabled`, `lmc_promotional_grants_enabled`,
`lmc_purchases_enabled`, `lmc_referrals_enabled`, `lmc_spending_enabled`,
`stripe_lmc_topups_enabled`.

**EXECUTE grants (verified):** every LMC RPC is `service_role`-only **except**
`lmc_admin_grant_v1`, which is granted to `authenticated` — it self-gates with
`auth.uid()` + `public.is_admin()` + the flag check + a 1000-LMC per-grant cap
(migration lines 1032-1088). `lmc_set_flag_v1` is `service_role`-only.

**Application code:** the ONLY LMC file outside guards is
`apps/web/lib/billing/lmc-flags.ts` (six `false as const` constants + the policy
map). **No route, no server action, no component, no page references any `lmc_*`
table or RPC.** The financial engine is live in the database with no product on
top of it.

### 6.2 (a) MLM-interpretation risk — **currently LOW, structurally UNGUARDED**

- The written doctrine is strong and explicit
  (`docs/product/lmc-commercial-system-train-v1.md:34-37`):
  > "**No MLM (BINDING):** the system must never contain multiple referral
  > levels, … or pyramid mechanics. Only one direct, attributable referral
  > relationship may ever exist."
- The DB enforces *that no referral reward can be issued*: a `BEFORE INSERT`
  trigger raises `lmc_referrals_disabled` for any `kind = 'referral_reward'`
  while the flag is false (migration lines 455-482), fail-closed on a missing
  settings row.
- **But** there is **no referral-relationship table, no `referred_by` column, no
  depth constraint anywhere in the applied schema** (grep for
  `referrer|referred_by|invited_by|referral_relationship` in the migration:
  zero hits). The single-level guarantee is therefore a **document promise, not a
  database invariant**. When Wagon 5 ("Direct Referral Network v1", train doc
  §16 row 5) adds attribution, nothing structural prevents a multi-level shape
  from being introduced.
- No referral rate exists (`r` is undefined in every cell of the §6 matrix, doc
  lines 248-253), so no earning can be computed even if the flag flipped.
- **Governance gap:** `lmc_referrals_enabled` is classified **`admin`**, not
  `owner_only` (`lmc-flags.ts:41-48`; mirrored in `lmc_flag_policy_v1`), while
  train doc §14 gate 3 requires an **owner-approved** referral rate before
  referrals may exist. The two owner-only flags are `stripe_lmc_topups_enabled`
  and `live_payments_enabled`. Referral activation is one admin action below the
  governance the doc claims.

### 6.3 (b) User-facing payout/withdrawal copy — **NONE EXISTS. This is clean.**

Exhaustive search of all 11 `apps/web/messages/*.json` for `lmc` /
`LMC` (case-insensitive): **zero matches**. Search of `app/`, `components/`,
`lib/` for LMC references outside `lib/billing/lmc-flags.ts` and guard tests:
**zero matches**. There is no wallet UI, no balance display, no invite link, no
earning claim, no withdrawal or cash-out control anywhere in the product.

The strongest non-cash statements are internal-only, in code comments and docs —
quoted here so the wording can be reused verbatim when copy is eventually
written:

> `apps/web/lib/billing/lmc-flags.ts:6-9`:
> "LMC is usable only for LabourMarket.ai plans, tools and eligible internal
> services. It is not a cryptocurrency, not an investment, not an
> electronic-money claim, not a withdrawable balance and not a promise of future
> cash redemption."

> `supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql:17-18`:
> "not an electronic-money claim, not a withdrawable balance, not a promise of
> future cash redemption."

> `docs/product/lmc-commercial-system-train-v1.md:319-320`:
> "can never silently become withdrawable (no withdrawal concept exists
> anywhere)."

**Assessment:** requirement (b) — that payouts/withdrawal must NOT be
communicated as a working capability — is currently **fully satisfied**, because
nothing at all is communicated. The risk is entirely forward-looking: train doc
§12 plans a "Direct-referral surface (invite link, attribution status)" in Wagon
5/7, and §14 gate 5 requires "Legal copy review of all public wallet/credit
wording" before activation. That gate must not be skipped.

### 6.4 (c) Financial sustainability of 1 LMC = 1 EUR

The peg is **accounting-internal**: `1 LMC = 1 EUR of internal platform credit`,
stored as `bigint` LMC-cents (migration lines 14-15). Every LMC issued for free
is a **euro of deferred revenue liability** — a customer spends it instead of
paying cash.

Exposure that is **already bounded in the applied schema**:

- Promotional grants: hard cap **100 LMC (= €100) per verified new user**
  (50 signup + 50 activity, each once-ever), **60-day expiry**
  (`v_expires := now() + interval '60 days'`, migration line 718); expiry policy
  is a CHECK constraint (`lmc_lots_expiry_policy`, lines 395-399).
- Purchased lots never expire; FIFO-by-expiry consumption is deterministic.
- Admin grants: cap 1000 LMC (€1,000) per grant, mandatory expiry ≤ 365 days.
- Spend is frozen entirely while `lmc_spending_enabled = false`.

Exposure that is **NOT bounded**:

- **Referral rewards have no cap, no rate, and no expiry rule.** The lot expiry
  CHECK explicitly exempts them: `or (source_kind = 'referral_reward')` (line
  399) — a referral lot may be created with `expires_at = NULL`, i.e. a
  perpetual euro-denominated liability. The train doc acknowledges the policy is
  undecided: *"referral expiry policy is decided at owner gate"* (line 394).
- **The doc's own worst case, unresolved:** *"At 19.99 € one referred month
  granting 100 promo LMC costs up to 5 months of revenue in internal-credit
  exposure if fully spent on paid tools"* (line 248). Against the owner's target
  ~€49.98/mo tier the ratio improves to ~2 months of revenue per fully-spent
  100-LMC grant — still a 200 % single-user acquisition cost paid in product.
- **No liability accounting surface exists.** There is no report, no admin view,
  no reconciliation of outstanding LMC against cash, and no revenue-recognition
  treatment. The intercompany IP-licence schedule computes the monthly fee from
  "Gross invoiced/recognised revenue … minus refunds"
  (`docs/legal/intercompany-ip-licence-accounting-schedule-v1.md:26,29`) and is
  **silent on credit-settled transactions** — an LMC-paid subscription month has
  no defined revenue value, so the licence fee to the Polish IP owner is
  undefined for it.
- **`lmc_expire_lots_v1` has no caller.** It is `service_role`-granted and
  invoked by nothing — no cron, no scheduled job, no server action. Expiry, the
  main liability-shedding mechanism, is currently a function nobody runs.

**Verdict:** the ledger is unusually well-built for a Wagon-1 foundation
(immutable, idempotent, FIFO, fail-closed, dual-signal admin, DB-enforced
owner-only flags). The **model** is not yet sustainable, because the three things
that determine whether 1 LMC = 1 EUR is affordable — the referral rate, the
referral expiry policy, and the revenue-recognition treatment of credit-settled
months — are all still undefined, and 4 of the 6 kill-switches can be flipped by
an admin rather than the owner.

---

## 7. Findings

Risk labels: **PAYMENT BLOCKER** (must be fixed before money can move safely),
**LEGAL BLOCKER** (must be fixed before money is taken), **LAUNCH BLOCKER**
(must be fixed before paid launch is announced), or plain severity.

---

### F1 — Two disjoint plan catalogues are rendered on the same public page

- **Problem.** `/pricing` shows seven plan names from two catalogues that share
  no slugs, no prices, and no feature vocabulary. A visitor sees
  Free/Business/Agency/Enterprise **and** Free Worker/Worker Plus/Company
  Pilot/Agency Pilot in one scroll, with no relationship stated.
- **Evidence.** `lib/marketing/plans.ts:10` `PLAN_SLUGS = ["free","business","agency","enterprise"]`
  vs `lib/billing/plans.ts:69-142` (`free_worker`, `worker_plus`,
  `company_pilot`, `agency_pilot`, `admin_internal`). Both rendered:
  `app/[locale]/(marketing)/pricing/page.tsx:52` and `:53`. Production `/en/pricing`
  returns all 7 names.
- **Affected user.** Every prospective buyer (worker, company, agency).
- **Affected paths.** `apps/web/app/[locale]/(marketing)/pricing/page.tsx`,
  `apps/web/lib/marketing/plans.ts`, `apps/web/lib/billing/plans.ts`,
  `apps/web/components/marketing/pricing-table.tsx`,
  `apps/web/components/marketing/pre-payment-plan-boundary.tsx`, `public.plans`.
- **Business impact.** The pricing page cannot convert: there is no single
  answer to "what do I buy and what does it cost". Any Stripe activation would
  have to pick one catalogue and orphan the other, including the DB rows the
  page currently reads.
- **Risk.** **LAUNCH BLOCKER** — high.
- **Recommended fix.** Choose ONE canonical catalogue (recommend the code
  catalogue in `lib/billing/plans.ts`, since it is the one Stripe price env vars
  and entitlements are keyed to), migrate/retire the `plans` table rows to match
  its slugs, and render a single tier grid.
- **Acceptance criteria.** Exactly one plan catalogue is reachable from any
  public surface; `plans.slug` values equal `PRE_PAYMENT_PLANS[].slug`; a guard
  test asserts set equality between DB slugs and code slugs; `/pricing` renders
  exactly N tier cards for N plans.
- **Dependencies.** Owner decision on the final tier names (§8 OG-1).
- **Effort.** M (1–2 days incl. a DB migration and guard).
- **Loop.** Commercial model consolidation loop (before any Stripe loop).

---

### F2 — The only real prices on the public site are for a different business

- **Problem.** The five priced offers (€600–€1,900) are AI-automation /
  n8n / website-build consultancy packages. They are the only concrete prices a
  visitor sees on a labour-market platform, they map to no plan, no entitlement,
  no DB row, and no Stripe price, and they are not covered by the Terms.
- **Evidence.** `apps/web/messages/en.json:6583-6627` (`services.offers[].priceFrom`);
  `components/marketing/service-offers.tsx` rendered at `pricing/page.tsx:54`;
  verified live on production `/en/pricing`. Same amounts in `lt/de/nl/ru`.
- **Affected user.** Every visitor to `/pricing`; especially employers
  evaluating whether this is a staffing platform or an agency.
- **Affected paths.** `apps/web/components/marketing/service-offers.tsx`,
  `apps/web/messages/{en,lt,ru,nl,de}.json` (`services` namespace).
- **Business impact.** Positioning damage (platform vs consultancy confusion)
  and an advertised commercial commitment with no contract terms behind it.
- **Risk.** **LAUNCH BLOCKER**, borderline **LEGAL** — high.
- **Recommended fix.** Owner decision: either (a) move the automation packages to
  a separate `/services` page with their own terms, or (b) remove them from the
  labour-market pricing page. Do not leave them adjacent to "pricing TBD" tiers.
- **Acceptance criteria.** `/pricing` shows prices only for the canonical
  labour-market catalogue; any retained service offer links to terms covering it;
  a guard forbids price figures on `/pricing` that do not resolve to a catalogue
  plan.
- **Dependencies.** Owner decision (§8 OG-2); F1.
- **Effort.** S (hours) once the decision is made.
- **Loop.** Same as F1.

---

### F3 — The declared price source of truth is empty

- **Problem.** The governed price placeholder declares its replacement source as
  `plans.price_eur_monthly`, which is `NULL` for all four rows. No price exists
  in copy, DB, code, or Stripe for any subscription tier.
- **Evidence.** `SELECT * FROM public.plans` → 4 rows, `price_eur_monthly` NULL
  in all; `apps/web/content/placeholders.ts:615-618`;
  `lib/billing/readiness.ts:38` `PRICING_READINESS_STATE = "draft_pricing"`.
- **Affected user.** Owner (cannot activate Stripe without a price), buyers.
- **Affected paths.** `public.plans`, `apps/web/content/placeholders.ts`,
  `apps/web/lib/billing/readiness.ts`, `apps/web/lib/billing/prices.ts`.
- **Business impact.** Stripe cannot be configured — a Stripe price object needs
  an amount, and there is no source to copy it from.
- **Risk.** **PAYMENT BLOCKER** — high.
- **Recommended fix.** Owner sets the final price table; record it once in the
  canonical catalogue chosen in F1 (recommend a `priceCents` + `currency` field
  on `PRE_PAYMENT_PLANS`, mirrored into `plans`), then create matching Stripe
  TEST prices.
- **Acceptance criteria.** Every paid plan has a non-null amount + currency in
  exactly one place; `/pricing` renders it; the Stripe price id env var for that
  plan resolves; `PRICING_READINESS_STATE` flipped to `owner_confirmed` only
  after owner sign-off.
- **Dependencies.** §8 OG-3; F1.
- **Effort.** S in code, blocked on owner decision.
- **Loop.** Stripe TEST activation loop.

---

### F4 — 49.98 EUR is not configured, and is documented against the wrong plan

- **Problem.** The owner's target monthly price for **Worker Plus** appears
  nowhere in the product. Its single repo occurrence is an intermediate
  calculation attached to a plan key `vip_media` that does not exist in code, DB,
  or Stripe, in a table explicitly labelled "NOT FINAL", whose own recommended
  rounding is 49.99.
- **Evidence.** Repo-wide `49[.,]98` search → exactly one hit:
  `docs/product/lmc-commercial-system-train-v1.md:249`; matrix header line 243
  "Proposed rounded (**NOT FINAL**)". `worker_plus` in
  `lib/billing/plans.ts:84-98` has no price field; `plans` table has no
  `worker_plus` row; `STRIPE_PRICE_WORKER_PLUS` unset.
- **Affected user.** Owner (risk of believing a price is live when it is not).
- **Affected paths.** `docs/product/lmc-commercial-system-train-v1.md`,
  `apps/web/lib/billing/plans.ts`, `public.plans`.
- **Business impact.** A pricing decision believed to be made is in fact
  unrecorded; the one document that mentions the number attaches it to a
  different product.
- **Risk.** **PAYMENT BLOCKER** (as an input to F3) — medium-high.
- **Recommended fix.** Owner confirms whether 49.98 (or 49.99) is the Worker Plus
  monthly price and whether `vip_media` is the same product under a different
  name; record the answer in the canonical catalogue, not in a doc table.
- **Acceptance criteria.** A single canonical record states Worker Plus =
  `<amount> EUR / month`; the doc matrix is annotated as superseded; no
  price figure exists in more than one place.
- **Dependencies.** §8 OG-3.
- **Effort.** XS in code; owner decision is the work.
- **Loop.** Stripe TEST activation loop.

---

### F5 — Entitlement enforcement is effectively zero

- **Problem.** 12 of 19 feature keys are `declared_boundary_only` (no check at
  all), and the single billing gate is bypassed unconditionally because
  enforcement is only "on" in `stripe_test` config, which never occurs. Paid-tier
  limits (10 country checklists, 5 open needs, 25 needs) are not enforced for
  anyone.
- **Evidence.** `lib/billing/entitlements-v1.ts:124` `if (!ctx.enforced) return true;`;
  `lib/billing/effective-entitlements.ts:43`
  `const billingActive = config.state === "stripe_test";`; only non-test caller of
  `hasFeature` is `lib/booking/booking-actions.ts:100`;
  `lib/billing/readiness.ts:66-116` classification table.
- **Affected user.** All users (nothing is limited); the owner (no revenue lever
  exists even after Stripe is on).
- **Affected paths.** `apps/web/lib/billing/entitlements-v1.ts`,
  `effective-entitlements.ts`, `readiness.ts`, plus the 12 unenforced feature
  surfaces.
- **Business impact.** Turning Stripe on would not by itself create a paid
  product — a paying user and a free user would get the identical experience for
  16 of 19 features. This is the single largest gap between "billing works" and
  "we have a business".
- **Risk.** **PAYMENT BLOCKER** — high.
- **Recommended fix.** For each paid entitlement, add a real server-side check at
  the write path (needs creation, checklist country count, expanded CV,
  reminders, agency multi-company). Keep the permissive fallback for existing
  pilot users via an explicit grandfather list, not via a global `return true`.
- **Acceptance criteria.** `summarizeEntitlementCoverage().declaredOnly` for
  paid-tier keys is 0; a test proves a `free_worker` context is refused
  `expanded_cv` and an 11th country while `billingActive = true`; existing pilot
  users are unaffected by an explicit, auditable grandfather rule.
- **Dependencies.** F1 (which catalogue), F3 (what each tier costs).
- **Effort.** L (a week; touches ~10 write paths).
- **Loop.** Entitlement enforcement loop (must precede live Stripe).

---

### F6 — Two parallel entitlement engines, one of them dead

- **Problem.** `entitlements.ts` (`gateFeature`, `gateFeatureBySlug`,
  `GateReason: payment_not_enabled`) and `entitlements-v1.ts`
  (`resolveEntitlements`, `entitlementAllows`) implement different semantics for
  the same catalogue. `gateFeature`/`gateFeatureBySlug` have **zero non-test
  callers**.
- **Evidence.** `lib/billing/entitlements.ts:65,89`; grep for callers returns
  only `entitlements.ts` itself and `entitlements-v1.ts:21` (which imports only
  `planIncludes`).
- **Affected user.** Developers; indirectly users, via divergent future behaviour.
- **Affected paths.** `apps/web/lib/billing/entitlements.ts`,
  `apps/web/lib/billing/entitlements-v1.ts`.
- **Business impact.** Any future gating work can be wired to the wrong engine.
- **Risk.** Medium.
- **Recommended fix.** Keep `planIncludes`/`limitFor`; delete `gateFeature`,
  `gateFeatureBySlug`, `GateResult`, `isPaymentEnabled` or fold them into v1.
- **Acceptance criteria.** One exported gating function; guard test asserts no
  second gating entry point exists.
- **Dependencies.** F5.
- **Effort.** S.
- **Loop.** Entitlement enforcement loop.

---

### F7 — No customer portal, no cancellation, no invoices, no refunds on `main`

- **Problem.** The merged chain can start a subscription and react to Stripe
  cancellations, but a paying customer would have **no way to cancel, no way to
  update a card, no invoice record, and no refund path** from inside the product.
- **Evidence.** No `app/api/billing/portal/` on `main` (exists only in Draft PR
  #844). No `invoices` table in prod. `webhook-core.ts:20-27` `HANDLED` set
  contains no `invoice.paid`, no `charge.refunded`, no `charge.dispute.*`.
  `subscription-store.ts:95-114` stores only `last_payment_status` on the
  subscription row.
- **Affected user.** Any future paying customer; the owner (support burden).
- **Affected paths.** `apps/web/app/api/billing/*`,
  `apps/web/lib/billing/webhook-core.ts`, `subscription-store.ts`.
- **Business impact.** Under EU consumer rules a subscriber must be able to end
  the contract easily and receive invoices. Shipping paid subscriptions without
  this creates refund disputes and chargebacks.
- **Risk.** **PAYMENT BLOCKER + LEGAL BLOCKER** — high.
- **Recommended fix.** Merge (after review) the portal route from PR #844, add an
  `invoices` (or `billing_invoices`) table populated from `invoice.*` events, and
  handle `invoice.paid`, `charge.refunded`, `charge.dispute.created`.
- **Acceptance criteria.** A test subscriber can open the portal from the app and
  cancel; an invoice row exists per paid period with the hosted invoice URL; a
  refund event downgrades entitlement.
- **Dependencies.** PR #844 review; F3.
- **Effort.** M–L.
- **Loop.** Stripe TEST activation loop.

---

### F8 — A paused subscription inherits paid entitlement

- **Problem.** Stripe `paused` is mapped to `past_due`, and `past_due` is treated
  as an entitled grace state. A subscription that is deliberately paused (no
  payment being collected) keeps full paid access indefinitely.
- **Evidence.** `apps/web/lib/billing/webhook-core.ts:43`
  `case "paused": return "past_due";` combined with
  `apps/web/lib/billing/entitlements-v1.ts:81` `const subGrace = s === "past_due";`
  and `:83-92` returning `active: true` for grace. PR #844 describes remapping
  `paused` → `unpaid` — that fix is **not on `main`**.
- **Affected user.** Any future subscriber who pauses; the owner (revenue leak).
- **Affected paths.** `apps/web/lib/billing/webhook-core.ts`,
  `apps/web/lib/billing/entitlements-v1.ts`.
- **Business impact.** Free indefinite access via a legitimate Stripe control.
- **Risk.** **PAYMENT BLOCKER** — medium (zero impact today: 0 subscriptions).
- **Recommended fix.** Map `paused` → `unpaid` (non-entitling) and add a bounded
  grace window for genuine `past_due` (e.g. 7 days) rather than an open-ended one.
- **Acceptance criteria.** Test: `paused` yields `active: false`; `past_due`
  older than the grace window yields `active: false`.
- **Dependencies.** none.
- **Effort.** XS.
- **Loop.** Stripe TEST activation loop.

---

### F9 — Company/agency checkout binds a subscription to a person, not an organisation

- **Problem.** The merged checkout passes only `client_reference_id = user.id`.
  A `company_pilot` or `agency_pilot` subscription therefore belongs to whichever
  individual paid. If that person leaves, the organisation loses access; there is
  no org-level billing identity.
- **Evidence.** `app/api/billing/test-checkout/route.ts:79-83`;
  `providers/stripe-test.ts:39-49` (`metadata: { plan_key, test_mode }` only);
  prod `billing_subscriptions` has **no `organization_id` column**. Draft PR #844
  adds org binding plus migration `20260721150000` — **unapplied and unmerged**.
- **Affected user.** Every company and agency buyer.
- **Affected paths.** `apps/web/app/api/billing/test-checkout/route.ts`,
  `apps/web/lib/billing/effective-entitlements.ts`,
  `supabase/migrations/` (missing migration).
- **Business impact.** B2B tiers — the ones with meaningful price points — are
  not sellable in a way a company would accept.
- **Risk.** **PAYMENT BLOCKER** — high for B2B.
- **Recommended fix.** Review and land PR #844's org binding + apply migration
  `20260721150000` at an owner gate.
- **Acceptance criteria.** A company-plan checkout requires verified ACTIVE
  owner/manager membership and writes `organization_id`; entitlement resolves for
  every member of that org.
- **Dependencies.** §8 OG-5 (apply migration); F1.
- **Effort.** M (largely written already in #844).
- **Loop.** Stripe TEST activation loop.

---

### F10 — Re-subscription after cancellation will silently fail to record

- **Problem.** `billing_subscriptions` carries a UNIQUE constraint on
  `(owner_id, plan_key, provider)`, but the webhook upserts on
  `(provider, provider_subscription_id)`. A user who cancels and later
  re-subscribes gets a NEW Stripe subscription id for the SAME owner+plan → the
  upsert violates the first unique index → `subscription-store.ts` returns
  `"error"` → the route records the error and answers HTTP 200 to Stripe. The
  customer pays and gets no entitlement, and Stripe sees a success.
- **Evidence.** Prod index `billing_subscriptions_owner_id_plan_key_provider_key
  ON (owner_id, plan_key, provider)` (verified via `pg_indexes`) vs
  `subscription-store.ts:86-91` `upsert(row, { onConflict: "provider,provider_subscription_id" })`;
  `app/api/billing/webhook/route.ts:96-99` swallows the failure into a 200.
- **Affected user.** Any returning subscriber.
- **Affected paths.** `apps/web/lib/billing/subscription-store.ts`,
  `apps/web/app/api/billing/webhook/route.ts`, `public.billing_subscriptions`.
- **Business impact.** Paid-but-not-entitled customers, invisible to monitoring
  because Stripe receives 200 OK.
- **Risk.** **PAYMENT BLOCKER** — high (latent; zero impact at 0 rows).
- **Recommended fix.** Either drop/relax the `(owner_id, plan_key, provider)`
  unique constraint (allowing historical rows) or upsert on it as well after
  archiving the prior row; and make a non-`ok` store result return a non-2xx so
  Stripe retries and the failure is visible.
- **Acceptance criteria.** Test: cancel → re-subscribe with a new subscription id
  results in an entitled context; a store `"error"` produces a 5xx and an alert.
- **Dependencies.** none.
- **Effort.** S–M (includes a migration).
- **Loop.** Stripe TEST activation loop.

---

### F11 — Terms of Service contain no payment, refund, cancellation or withdrawal clause

- **Problem.** The Terms state that services are sold commercially by UAB
  "Nonstop Group", that contracts are concluded with it and that it issues
  invoices and receives payments — while containing **no price terms, no payment
  terms, no refund policy, no cancellation policy, no consumer right of
  withdrawal, and no delivery/service-level terms**. The public site
  simultaneously advertises €600–€1,900 packages and a success-fee model.
- **Evidence.** `messages/en.json` `legal.terms` has exactly 3 sections —
  (1) selling entity + IP owner, (2) governing law = Lithuania + "If you are a
  consumer, you always keep the mandatory rights of the country where you live",
  (3) platform description. Verbatim: *"Your contract for any platform service is
  concluded with UAB "Nonstop Group". Invoices are issued by and payments are
  received by UAB "Nonstop Group"."* No occurrence of `refund`, `cancel`,
  `withdrawal right`, `price`, `subscription` in the `legal.terms` subtree.
  Rendered at `app/[locale]/(marketing)/legal/terms/page.tsx`.
- **Affected user.** Every buyer, especially any consumer (workers) — EU consumer
  law mandates pre-contractual price/withdrawal disclosure.
- **Affected paths.** `apps/web/app/[locale]/(marketing)/legal/terms/page.tsx`,
  `apps/web/messages/{en,lt,ru,nl,de}.json` (`legal.terms`), `docs/legal/`.
- **Business impact.** Taking any money — subscription, success fee, or service
  package — under these Terms is legally exposed. This blocks paid launch
  independently of any code.
- **Risk.** **LEGAL BLOCKER** — high.
- **Recommended fix.** Owner-commissioned terms addendum covering: price and VAT
  presentation, payment method and timing, subscription renewal/cancellation,
  consumer 14-day withdrawal right and its exceptions for digital services,
  refund policy, success-fee/coordination-fee definition and trigger, and
  complaint handling. Owner-worded, not agent-worded.
- **Acceptance criteria.** `/legal/terms` contains those sections in all 5 active
  locales; the concierge fee copy links to the clause that defines it; a guard
  forbids a public price figure without a terms link.
- **Dependencies.** §8 OG-6 (owner/lawyer wording); F2; F3.
- **Effort.** M (drafting is owner/legal work; wiring is S).
- **Loop.** Legal & consumer-terms loop.

---

### F12 — LMC referral activation is one admin flip below its documented owner gate

- **Problem.** `lmc_referrals_enabled`, `lmc_promotional_grants_enabled`,
  `lmc_purchases_enabled` and `lmc_spending_enabled` are class `admin`, so a
  dual-signal administrator can enable them. Train doc §14 requires
  **owner-approved** referral rate and legal copy review before any of that
  exists. Combined, an admin could enable promotional grants **and** spending —
  creating real euro-denominated liability without an owner decision.
- **Evidence.** `apps/web/lib/billing/lmc-flags.ts:41-48`; mirrored
  `lmc_flag_policy_v1` (migration lines 108-127); prod `lmc_settings` shows all
  six `false`. Doc gate: `docs/product/lmc-commercial-system-train-v1.md:432`
  ("Owner-approved referral rate … else referrals stay disabled") and
  §14 gate 5 (legal copy review).
  Mitigation in place: `lmc_set_flag_v1` EXECUTE is granted to `service_role`
  only (verified via `pg_proc.proacl`), and no application code calls it — so
  today the flip requires the service key, not a dashboard action.
- **Affected user.** Owner (governance), future credit holders.
- **Affected paths.** `apps/web/lib/billing/lmc-flags.ts`,
  `supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql`,
  `public.lmc_settings`.
- **Business impact.** The strongest commercial safety property of the LMC design
  (nothing activates without the owner) is weaker than the documentation claims
  for 4 of 6 switches.
- **Risk.** Medium-high (mitigated to medium by the service_role-only grant).
- **Recommended fix.** Reclassify `lmc_referrals_enabled` and
  `lmc_promotional_grants_enabled` as `owner_only`; keep `lmc_purchases_enabled`
  and `lmc_spending_enabled` admin only if the owner explicitly accepts that an
  admin may freeze/unfreeze spend of already-issued credit.
- **Acceptance criteria.** `lmc_flag_policy_v1` and `LMC_FLAG_POLICY` agree and
  classify referral + promotional grants as `owner_only`; a DB proof shows an
  admin, superadmin and service_role are all refused with `lmc_owner_only_flag`.
- **Dependencies.** §8 OG-7 (owner decides the classification); requires a new
  migration.
- **Effort.** S.
- **Loop.** LMC governance loop.

---

### F13 — The "no MLM" guarantee is documentary, not structural

- **Problem.** The binding no-MLM rule ("only one direct, attributable referral
  relationship may ever exist") has **no schema representation**: there is no
  referral-relationship table, no `referred_by` column, no depth constraint. The
  DB currently prevents referral *rewards* while the flag is false, but nothing
  prevents a multi-level *structure* from being introduced in Wagon 5.
- **Evidence.** `docs/product/lmc-commercial-system-train-v1.md:34-37`;
  migration search for `referrer|referred_by|invited_by|referral_relationship` →
  0 hits; referral protection is only the insert trigger at migration lines
  455-482. `lmc_lots` CHECK exempts `referral_reward` from the expiry policy
  (line 399), i.e. referral credit may be perpetual.
- **Affected user.** Regulators/consumers if a referral programme ever ships;
  the owner (reputational and legal exposure of an MLM interpretation).
- **Affected paths.** `supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql`,
  future Wagon 5 schema.
- **Business impact.** A pyramid-shaped incentive is the single highest-severity
  reputational risk in this design; the guarantee needs to be enforced where it
  cannot be edited by a future sprint.
- **Risk.** **LEGAL BLOCKER for Wagon 5** — high (zero exposure today).
- **Recommended fix.** When the referral schema lands, enforce single-level in
  the database: a `referred_by uuid` on the account with a CHECK/trigger that
  forbids chains (`referred_by`'s own `referred_by` must be NULL is not enough —
  forbid any reward whose subject is not the direct referrer), plus a decided
  referral-lot expiry policy so referral credit is not a perpetual liability.
- **Acceptance criteria.** A DB proof demonstrates that a two-level reward insert
  is rejected; the referral lot expiry CHECK no longer exempts
  `source_kind = 'referral_reward'`.
- **Dependencies.** §8 OG-8 (referral rate + expiry policy); Wagon 5.
- **Effort.** M, at Wagon 5 time.
- **Loop.** LMC referral design loop (not yet scheduled).

---

### F14 — LMC liability has no accounting, no reporting and no expiry runner

- **Problem.** 1 LMC = 1 EUR creates deferred-revenue liability, but there is no
  liability report, no reconciliation surface, no revenue-recognition treatment
  of credit-settled months, and the expiry function that sheds liability has no
  caller.
- **Evidence.** `lmc_expire_lots_v1` exists and is `service_role`-granted
  (verified via `pg_proc.proacl`) but is referenced by **no** application code,
  cron, or script (repo-wide grep for `lmc_expire_lots_v1` outside the migration
  and guard: 0 hits). No LMC admin/report page exists. The intercompany schedule
  defines revenue as "Gross invoiced/recognised revenue … minus refunds"
  (`docs/legal/intercompany-ip-licence-accounting-schedule-v1.md:26,29`) with no
  clause for credit-settled transactions. The train doc's own worst case:
  "one referred month granting 100 promo LMC costs up to 5 months of revenue"
  (line 248).
- **Affected user.** Owner (finance); the Polish IP-licensor entity (licence fee
  base becomes undefined for credit-settled months).
- **Affected paths.** `supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql`,
  `docs/legal/intercompany-ip-licence-accounting-schedule-v1.md`,
  missing: an LMC liability report and an expiry job.
- **Business impact.** Activating promotional grants without these means an
  unmeasured, unshed euro liability and an under- or over-stated intercompany
  licence fee.
- **Risk.** **LAUNCH BLOCKER for any LMC activation** — high.
- **Recommended fix.** Before flipping any LMC flag: (1) schedule
  `lmc_expire_lots_v1`; (2) build an admin liability report (issued / spent /
  expired / outstanding, by source kind); (3) add a revenue-recognition clause
  for credit-settled transactions to the intercompany schedule.
- **Acceptance criteria.** A dated liability report exists and reconciles against
  `lmc_account_balances`; the expiry job runs on a schedule with a proof; the
  accounting schedule states the euro value attributed to an LMC-settled month.
- **Dependencies.** §8 OG-9; accountant input.
- **Effort.** M.
- **Loop.** LMC governance loop.

---

### F15 — Billing documentation contradicts the code and points at a retired host

- **Problem.** Several merged docs describe a state that does not exist.
- **Evidence.**
  - `docs/audits/stripe-test-activation-runbook.md:27` instructs the owner to
    register the Stripe webhook at `https://labourmarketai.vercel.app/api/billing/webhook`
    — a legacy host (`docs/launch/legacy-vercel-project-retirement-v1.md`), not
    `labourmarket.ai`.
  - `docs/audits/stripe-test-mode-final-report.md:13` describes the chain as
    "… → entitlement update → **gateFeature unlocks** → admin visibility";
    `gateFeature` has zero callers (F6) and the real path is `hasFeature`, used
    once.
  - `docs/launch/payment-logic-before-stripe.md:23` claims the entitlement matrix
    is applied via `lib/work-market/visibility.ts`; that file only exposes
    `wouldBeFakePaidUnlock` (`visibility.ts:70`) and applies no widening.
  - `docs/audits/stripe-test-mode-final-report.md:31` calls PR2 "RED draft —
    owner applies"; the migration is in fact **applied** in prod
    (`20260613202244`), as PR #844's audit already noted.
- **Affected user.** The owner and any future session following these runbooks.
- **Affected paths.** `docs/audits/stripe-test-activation-runbook.md`,
  `docs/audits/stripe-test-mode-final-report.md`,
  `docs/launch/payment-logic-before-stripe.md`.
- **Business impact.** Following the runbook would register the webhook on a
  retired host, and the test chain would appear silently broken.
- **Risk.** Medium (operational).
- **Recommended fix.** Correct the webhook URL to
  `https://labourmarket.ai/api/billing/webhook`, correct the `gateFeature` /
  `visibility.ts` claims, and mark the "RED draft" line as applied.
- **Acceptance criteria.** Every URL and symbol named in the billing docs
  resolves; a guard asserts no billing doc references `labourmarketai.vercel.app`.
- **Dependencies.** none.
- **Effort.** XS.
- **Loop.** Doc-truth loop (can run immediately, no owner gate).

---

### F16 — Dead commercial schema: legacy `subscriptions` and the name-only `plans` read

- **Problem.** `public.subscriptions` (profile_id → plan_id → `plans`) has **0
  rows and 0 code references**. `public.plans` is read for names only
  (`lib/marketing/plans.ts:25`), never for its `price_eur_monthly` or `features`
  JSON, which therefore silently disagree with the code catalogue's entitlements.
- **Evidence.** Row counts 0/4; repo grep for `from("subscriptions")` → 0 hits;
  `plans.features` JSON (e.g. `business`: `{projects:10, job_demands:25,
  worker_search:true}`) has no counterpart in `PRE_PAYMENT_PLANS`.
- **Affected user.** Developers; indirectly buyers via F1.
- **Affected paths.** `public.subscriptions`, `public.plans`,
  `apps/web/lib/marketing/plans.ts`.
- **Business impact.** Two schema objects imply a commercial model that the app
  does not implement — a trap for any future billing work.
- **Risk.** Medium.
- **Recommended fix.** Resolve with F1: either retire `subscriptions` and repoint
  `plans` at the canonical catalogue, or delete both and drive the pricing table
  from code.
- **Acceptance criteria.** No table exists that a reader could mistake for the
  live billing model; `plans.features` either matches `PRE_PAYMENT_PLANS`
  entitlements or the table is gone.
- **Dependencies.** F1; a migration → §8 OG-5.
- **Effort.** S.
- **Loop.** Commercial model consolidation loop.

---

### F17 — Inactive-locale pricing surfaces would render empty

- **Problem.** The `services` namespace (the only priced content) exists in
  `en/lt/ru/nl/de` only. `lv/et/da/no/sv/pl` message files have no `services` key.
- **Evidence.** Per-file scan of `apps/web/messages/*.json`: 5 files with 5
  offers each, 6 files with none. `lib/i18n/config.ts:11-23` declares 11 canonical
  locales; only 5 are active for routing.
- **Affected user.** None today (those routes do not prerender); every user in
  those markets on the day a locale is activated.
- **Affected paths.** `apps/web/messages/{lv,et,da,no,sv,pl}.json`.
- **Business impact.** Latent launch defect for the 6 planned markets.
- **Risk.** Low today, **LAUNCH BLOCKER** for those markets.
- **Recommended fix.** Fill or explicitly scope-exclude the `services` namespace
  before activating any additional locale; extend the existing
  `localization-launch-scope` guard to cover commercial namespaces.
- **Acceptance criteria.** Activating a locale is blocked by CI unless every
  commercial namespace resolves in it.
- **Dependencies.** F2 (whether the offers survive at all).
- **Effort.** S.
- **Loop.** Locale activation loop.

---

## 8. OWNER GATE list

Everything below requires an explicit owner decision. No agent session may
perform any of these.

| # | Gate | Why it is owner-only | Blocks |
|---|---|---|---|
| OG-1 | Choose the ONE canonical plan catalogue and final tier names | Product/brand identity decision | F1, F16 |
| OG-2 | Decide whether the €600–€1,900 AI-automation packages stay on `/pricing`, move to their own page, or are removed | Positioning + commercial commitment | F2 |
| OG-3 | Set the final price table (incl. confirming Worker Plus = 49.98 or 49.99 EUR, and whether `vip_media` is the same product) | Pricing is an owner decision; nothing may be invented | F3, F4 |
| OG-4 | Provide Stripe **TEST** credentials and create TEST products/prices/webhook: `PAYMENTS_ENABLED`, `BILLING_PROVIDER`, `STRIPE_MODE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_WORKER_PLUS`, `STRIPE_PRICE_COMPANY_PILOT`, `STRIPE_PRICE_AGENCY_PILOT` | New credentials — hard stop per CLAUDE.md §4 | the whole Stripe chain |
| OG-5 | Apply production migrations: `20260721150000_stripe_subscriptions_v1` (org binding) and any new billing/plan migration from F1/F10/F16 | Production DB change | F9, F10, F16 |
| OG-6 | Commission and word the Terms addendum: price/VAT, payment, renewal, cancellation, consumer withdrawal, refunds, success/coordination fee definition | Legal/business text requiring owner wording | F11 |
| OG-7 | Decide the LMC flag authorization classes (recommend referral + promotional grants → `owner_only`) | Governance of a financial system | F12 |
| OG-8 | Decide the referral reward rate, eligibility formula, and referral-lot expiry policy — or keep referrals permanently disabled | Direct financial exposure; MLM risk | F13 |
| OG-9 | Approve the LMC liability accounting treatment (revenue recognition for credit-settled months, expiry job schedule, liability report) with the accountant | Financial reporting + intercompany licence fee base | F14 |
| OG-10 | LIVE Stripe activation: live keys and flipping `live_payments_enabled` | Hard stop; DB-enforced `owner_only` | everything |
| OG-11 | Decide the fate of Draft PR #844 (merge with the org binding + portal, or supersede it) | It is the only implementation of portal/org binding/idempotency keys | F7, F9 |

---

## 9. Suggested loop sequencing

1. **Doc-truth loop** (F15) — no gates, can run immediately.
2. **Commercial model consolidation loop** (F1, F2, F16, F17) — needs OG-1, OG-2.
3. **Legal & consumer-terms loop** (F11) — needs OG-6; runs in parallel with 2.
4. **Entitlement enforcement loop** (F5, F6) — needs the output of 2.
5. **Stripe TEST activation loop** (F3, F4, F7, F8, F9, F10) — needs OG-3, OG-4,
   OG-5, OG-11.
6. **LMC governance loop** (F12, F14) — needs OG-7, OG-9. Independent of 2–5.
7. **LMC referral design loop** (F13) — needs OG-8. Do not start before 6.

Live Stripe (OG-10) must not be considered until loops 3, 4 and 5 are complete.

---

## 10. What could not be verified

| Item | Why | How to close it |
|---|---|---|
| **Vercel production environment variables** | No Vercel CLI authentication available in this session; the audit only inspected repo `.env*` files. PR #844's body states the names were checked in Vercel and none exist, but that is a second-hand claim from 2026-07-21 | Owner runs `vercel env ls` for the production project and confirms no `STRIPE_*` / `PAYMENTS_ENABLED` / `BILLING_PROVIDER` names exist (names only — never print values) |
| **Runtime reachability of `/api/billing/webhook`, `/api/billing/test-checkout`** | A production HTTP probe was declined by the sandbox; only static route registration was verified | `curl -s -o /dev/null -w '%{http_code}' https://labourmarket.ai/api/billing/webhook` (expect 405 for GET) |
| **Whether a Stripe account exists at all, and whether any product/price/webhook is configured in it** | Out of scope by instruction — Stripe was never authenticated | Owner confirms from the Stripe dashboard |
| **Whether `/dashboard/account` handles the `?billing=test_success` return** | The success URL `${origin}/dashboard/account?billing=test_success` (`test-checkout/route.ts:82`) is not read by any code (grep: 0 handlers). The page exists but does not acknowledge the parameter | Read `app/[locale]/dashboard/account/page.tsx` in the Stripe activation loop and add a state, or drop the parameter |
| **Whether any historical payment ever occurred outside the platform** | The audit can only see platform tables, all empty. Off-platform invoicing by UAB "Nonstop Group" is invisible here | Owner reconciles against the accounting system |
| **Guard suite pass/fail at this HEAD** | The audit did not run tests (read-only, no build) | `pnpm test` in `apps/web` during the next implementation loop |
| **Live production rendering in `lt/ru/nl/de`** | Only `/en/pricing` was fetched | Fetch the other four active locales |

---

*End of audit. No source, schema, flag, Stripe object, or configuration was
modified by this loop.*
