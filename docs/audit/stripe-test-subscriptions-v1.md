# Stripe TEST Subscriptions v1 — audit + canonical architecture

> Branch `feat/stripe-test-subscriptions-v1` (base `main@664b9ab9`). Scope:
> (A) audit + safe cleanup of OLD payment leftovers, (B) canonical Stripe
> subscriptions in **TEST mode only** — personal paid plan, company/agency
> plans, Checkout, Customer Portal, signed webhooks, idempotent state sync.
> **No LMC purchase/top-up/cash-out/payout. No live payments. No live keys.**

## 1. Old payment data — audited state (production DB, 2026-07-21)

Verified via Supabase MCP read queries against production
(`gorgitwvdzxbnaxhrsrw`), non-personal aggregates only:

| Table | Rows | Oldest | Newest | Verdict |
|---|---|---|---|---|
| `billing_customers` | **0** | — | — | KEEP (canonical, empty) |
| `billing_subscriptions` | **0** | — | — | KEEP (canonical, empty) |
| `payment_webhook_events` | **0** | — | — | KEEP (canonical, empty) |
| `subscriptions` (legacy 0001) | **0** | — | — | QUARANTINE (superseded, untouched) |
| `lmc_transactions` | **0** | — | — | KEEP (separate domain, empty) |
| `lmc_accounts` | **0** | — | — | KEEP (separate domain, empty) |

**Deleted test rows: 0 — there was nothing to delete.** Every payment-shaped
table in production is empty; no Stripe test records, no real customer
financial data, no cards, no secrets, no ambiguous rows exist. Real financial
history preserved: trivially — none exists yet (`finance_records` is a
separate, payment-free domain and was not touched). No dry-run deletion was
needed; no `BLOCKED_AMBIGUOUS_PAYMENT_DATA` condition arose.

### `billing_test_mode_records` (migration 20260613200000) — actual state

- **APPLIED to production** as ledger version `20260613202244` (the repo doc
  `docs/audits/stripe-test-mode-final-report.md` §3 still describes it as a
  pending RED draft — that is now historical; this doc records the applied
  reality).
- RLS verified live in prod: `billing_customers` / `billing_subscriptions`
  SELECT `owner_id = auth.uid() OR is_admin()`; `payment_webhook_events`
  SELECT `is_admin()` only; **no authenticated write policy on any of the
  three** — writes are service-role only. Rows: 0 / 0 / 0.
- No Stripe secrets, card data, or payment-method data can be stored in the
  schema (status/period/flags only; **no money amount column**).
- Readers/writers in code: `lib/billing/subscription-store.ts` (webhook,
  service-role), `lib/billing/customer-store.ts` (NEW, service-role),
  `lib/admin/billing-actions.ts` (manual pilot override, superadmin),
  `lib/admin/billing-overview.ts` + `lib/billing/effective-entitlements.ts`
  (reads). `payment_webhook_events` **is already the canonical webhook event
  registry** (`unique(provider, event_id)`) — no replacement table is needed.
- LMC ledger (`20260720190000`) also applied (`20260721133338`); all six
  `lmc_settings` flags verified **false** in prod.

### Stripe env configuration (names only, values never read)

- Local `.env.local` files: **no `STRIPE_*` variables present.**
- Vercel (`vercel env ls`, names only): **no `STRIPE_*` variables in any
  environment.** No live keys anywhere (nothing to leak; the config would
  hard-block them anyway).
- Conclusion: **Stripe TEST credentials do not exist yet** → terminal state
  `BLOCKED_EXTERNAL_STRIPE_TEST_CREDENTIALS` (see §10).

## 2. Old payment CODE — KEEP / MIGRATE / REMOVE / QUARANTINE matrix

Full-repo sweep (stripe/checkout/webhook/billing/subscription/invoice/price/
payment_intent/checkout_session/topup/wallet/credit/live_payments/STRIPE_*):

| Object | On main | Used in prod | Verdict |
|---|---|---|---|
| `lib/billing/` seam (config, provider, plans, prices, checkout-core, webhook-core, subscription-store, entitlements, entitlements-v1, effective-entitlements, readiness, lmc-flags) | yes | yes (honest disabled state) | **KEEP** — single canonical implementation, no competitor exists |
| `app/api/billing/test-checkout` + `webhook` routes | yes | registered, inert without env | **KEEP** (extended) |
| `providers/stripe-test.ts` (only SDK importer) + `noop.ts` | yes | lazy/inert | **KEEP** (extended) |
| Admin billing center + pilot override (`admin/billing`, billing-actions/overview) | yes | yes | **KEEP** |
| `components/marketing/billing-status-banner.tsx` | yes | **dead — zero importers** (superseded by concierge components; `pricing-public-surface` guard forbids it on the pricing page) | **REMOVED** (+ its now-orphaned `billingStatus` i18n namespace in en/lt/ru/nl/de) |
| Legacy `subscriptions` + `plans` tables (0001) | yes | 0 rows, unused, superseded | **QUARANTINE** — applied-migration objects are never edited; dropping is a separate owner decision |
| Migration `20260613200000` + rollback | yes | **applied** | **KEEP** (frozen — applied ledger) |
| LMC ledger migration + guard + flags | yes | applied, flags all false | **KEEP** (separate domain) |
| Guard tests (no-live-payments, billing-readiness, payment-readiness-honesty, pricing-no-live-claim, pricing-public-surface, lmc-ledger-foundation, marketplace/service-offerings no-payment) | yes | CI | **KEEP** (all strengthened-only) |
| Stripe test fixtures / mock seed rows | — | — | none exist (guards forbid fake billing data) |
| Duplicate adapters / second price catalogue / secret placeholders in code | — | — | none found (verified by sweep + guards) |

**Canonical result: exactly ONE Stripe implementation remains** (the provider
seam). No dead env vars: every declared `STRIPE_*` name is read by
`lib/env.ts` → `prices.ts`/`config.ts`. No client-side payment activation
paths (guard-verified).

## 3. Canonical Stripe TEST architecture (after this PR)

```
authenticated user
  → POST /api/billing/test-checkout {planKey, organizationId?}   (strict zod)
      → pure gate: evaluateCheckoutRequest (state, auth, paid plan,
        audience/admin eligibility, ORG MEMBERSHIP for company/agency,
        server-side price)
      → ensureBillingCustomer (billing_customers find-or-create, race-safe,
        canonical metadata, per-profile idempotency key)
      → provider.createCheckoutSession (mode=subscription, server price id,
        canonical metadata on session AND subscription_data, deterministic
        idempotency key co1_<owner>_<plan>_<org|self>)
  → Stripe TEST checkout (test cards only)
  → success redirect NEVER activates anything
  → POST /api/billing/webhook (raw body → signature verify → live events
      rejected → unique(provider,event_id) idempotency → state upsert)
  → billing_subscriptions (status matrix §5) → entitlements-v1 projection
  → POST /api/billing/portal → caller's OWN stored customer only
```

- Customer mapping: `billing_customers` (one TEST customer per profile;
  concurrent create resolves via the unique constraint, never two customers).
  Checkout FAILS CLOSED when the mapping cannot be persisted (Codex P2):
  `evaluateCustomerReadiness` returns 503/502 instead of starting a session
  with a bare email — no unmanageable orphan customers can be minted.
- Metadata standard (`lib/billing/metadata-core.ts`) on every created Stripe
  object: `project=labourmarket.ai`, `environment=test`,
  `canonical_plan_key`, `schema_version=1`, `owner_id`, `organization_id?`.
- Company/agency plans bind to the CANONICAL org model (`organizations` +
  `engagement_contexts`); purchase-grade membership = org owner or ACTIVE
  owner/manager engagement, verified server-side (`lib/billing/org-membership.ts`).
  Explicit `organizationId` is verified; omitted → defaults ONLY to an
  unambiguous single owned org, else honest `organization_required`.
- No secret in DB/logs/bundle/Git: config seam exposes presence flags only;
  adapter error reasons are truncated strings; webhook stores `{id, type}`
  payload only (no PII, no full payload).

## 4. Plans and prices

- Canonical plan source: `lib/billing/plans.ts` (`PRE_PAYMENT_PLANS`) —
  UNCHANGED, no second catalogue created. Paid keys: `worker_plus`
  (the personal paid tier — "VIP" in owner vocabulary), `company_pilot`,
  `agency_pilot`.
- Stripe TEST price ids are **server-side env config only**
  (`STRIPE_PRICE_WORKER_PLUS` / `STRIPE_PRICE_COMPANY_PILOT` /
  `STRIPE_PRICE_AGENCY_PILOT` → `lib/billing/prices.ts`). No amounts,
  currencies, or price ids exist in code; no new prices were invented
  (pricing itself stays an owner gate — LMC train Wagon 3).
- Stripe TEST Product/Price objects were **NOT created**: no Stripe TEST
  account credentials exist (§1). Nothing fake was substituted.

## 5. Webhook state matrix

Handled (signature-verified, test-mode-only, idempotent):
`checkout.session.completed` (link, status `incomplete` until confirmed),
`customer.subscription.created/updated/deleted` (deleted → `cancelled`),
`invoice.paid` + `invoice.payment_succeeded` (→ `last_payment_status=succeeded`),
`invoice.payment_failed` (→ `failed` + status `past_due`).
Unknown types: recorded + acknowledged (`ignored:true`), never an error.
Invoice → subscription resolution reads BOTH Stripe shapes (Codex P1): legacy
top-level `invoice.subscription` AND the current v22 API shape
`invoice.parent.subscription_details.subscription` (string or expanded
object) — `invoiceSubscriptionId()` in `webhook-core.ts`, regression-tested.

Stripe → canonical status (`billing_subscriptions.status` CHECK enum):

| Stripe | Ours | Entitles? |
|---|---|---|
| `trialing` | `trialing` | yes |
| `active` | `active` | yes |
| `past_due` | `past_due` | grace (flagged honestly) |
| `unpaid` | `unpaid` | no |
| `canceled` | `cancelled` | no |
| `incomplete` | `incomplete` | no |
| `incomplete_expired` | `expired` | no |
| `paused` | `unpaid` | **no** (changed from `past_due` — paused must never inherit grace) |

Recomputation is idempotent (pure `resolveEntitlements`); history is never
deleted (webhook events + subscription rows persist; append-only audit);
no fake debts, no LMC rows.

## 6. Authorization matrix

| Action | Requirement |
|---|---|
| Checkout — personal plan | authenticated + worker audience role (or admin) + configured server price |
| Checkout — company/agency plan | + verified ACTIVE owner/manager membership in the target organization (admin does NOT bypass membership) |
| Price/currency/price-id from client | structurally impossible — strict schema rejects unknown fields; price resolved only from env |
| Portal | authenticated; opens caller's OWN stored customer only; request body ignored (guard-pinned) |
| Webhook writes | service-role only; signature verified; live events rejected |
| Manual pilot override | superadmin only (pre-existing) |
| Rate limiting | existing project mechanism is per-actor row budgets (booking/contact domains); checkout/portal get Stripe-side idempotency keys (deterministic per owner/plan/org — retries replay, never fan out); no new IP throttle layer exists in the repo to reuse |

## 7. LMC separation proof

- New guard `lib/guards/stripe-lmc-separation.test.ts`: no billing module or
  billing route references any `lmc_*` table/RPC; no top-up/cash-out/payout
  surface under `/api/billing`; the only `billing_subscriptions` writers are
  the webhook store + admin actions; all six LMC flags pinned `false`.
- Prod check: all six `lmc_settings` flags false; `lmc_transactions` 0 rows.
- Existing `lmc-ledger-foundation` guard continues to forbid any write path
  even for service_role (SECURITY DEFINER RPCs only, all flag-gated OFF).

## 8. Migration (DRAFT — NOT applied)

`supabase/migrations/20260721150000_stripe_subscriptions_v1.sql` — idempotent,
human-gated; **not applied to production**. Two changes:

1. Nullable `billing_subscriptions.organization_id` (FK → `organizations`
   ON DELETE SET NULL, partial index, comment).
2. **Uniqueness remodel (Codex review P1):** the applied
   `unique (owner_id, plan_key, provider)` would reject the same owner buying
   the same company/agency plan for a SECOND organization (the webhook upsert
   would hit the constraint and leave the real Stripe subscription
   untracked). It is dropped (exact prod-verified constraint name
   `billing_subscriptions_owner_id_plan_key_provider_key`) and replaced by
   two partial unique indexes: personal scope
   `(owner_id, plan_key, provider) WHERE organization_id IS NULL` and org
   scope `(organization_id, plan_key, provider) WHERE organization_id IS NOT
   NULL`. Regression-pinned in `lib/guards/stripe-lmc-separation.test.ts`.

Rollback (`supabase/rollbacks/…down.sql`): refuses while org-linked rows
exist; on a clean table drops the column/indexes AND restores the original
constraint (true down-migration). Until applied, the store degrades honestly
(42703 → retry without the column).

### 8.1 Scratch-base apply proof (2026-07-21)

Executed on a LOCAL scratch cluster only (127.0.0.1:54322, identity-guarded;
Supabase local PG 15.8 — prod is PG 17.6, all statements are ancient DDL with
no version-sensitive behavior). Base = stubs (`profiles`, `organizations`,
`auth.uid()`, `is_admin()`, roles) + **verbatim** applied
`20260613200000_billing_test_mode_records.sql`; the resulting
`billing_subscriptions` constraint set was byte-identical to the
production-verified set (7 constraints incl.
`billing_subscriptions_owner_id_plan_key_provider_key`). Results:

- APPLY CLEAN; RE-APPLY CLEAN (idempotent, `if exists/if not exists` guards).
- Structure: `organization_id` FK `ON DELETE SET NULL`; old constraint gone;
  `billing_subscriptions_personal_plan_uniq` / `_org_plan_uniq` /
  `_org_idx` exactly as designed; RLS still enabled on all three tables with
  the same three SELECT policies; grants unchanged (authenticated=SELECT,
  service_role=INSERT/SELECT/UPDATE).
- Behavior (the Codex P1 scenario): same owner + same company plan for TWO
  orgs → both rows accepted (`MULTI-ORG OK: 2`); duplicate plan for the SAME
  org → rejected by `_org_plan_uniq`; personal plan stays one-per-owner
  (`_personal_plan_uniq`); deleting an org nulls the linkage and preserves
  the subscription row.
- Rollback: REFUSES while an org-linked row exists (raise proven); after
  deliberate cleanup ROLLBACK CLEAN — column + partial indexes gone, the
  ORIGINAL constraint restored; full cycle re-apply CLEAN. Scratch DB
  dropped.

### 8.2 Supabase Preview check — fail root cause

The non-required `Supabase Preview` status on PR #844 failed because the
Supabase GitHub integration **ignored the PR after reaching the concurrent
preview-branch limit** (its own PR comment: "This pull request has been
ignored for the connected project `gorgitwvdzxbnaxhrsrw` due to reaching the
limit of concurrent preview branches."). It never attempted to run this PR's
SQL — the failure is a quota condition, not a migration defect; §8.1 proves
the SQL applies cleanly from a production-equivalent base. Required checks
(`quality`, `migration-safety`) are green; apply remains MCP-only after owner
review.

## 9. Public UI honesty

- Public `/pricing` unchanged: concierge-first, no checkout, no live claim
  (guards `pricing-public-surface`, `pricing-no-live-claim` still green).
- TEST checkout + NEW portal button render ONLY on the superadmin
  `/dashboard/admin/billing` surface, only when the config resolves
  `stripe_test`, always TEST-labelled.
- Dead `BillingStatusBanner` removed (zero importers).
- i18n (Codex P1 / doctrine §2.4): the `billingTest` namespace (incl. the new
  `orgPlaceholder` + `portal.*` keys) now exists in ALL 11 full-UI catalogs —
  real translations were added for pl/da/no/sv/lv/et (no `[EN]` debt
  markers), matching the active-locale copy exactly in meaning and honesty.

## 10. Validation + remaining owner gates

Validation results are recorded in the PR description (typecheck, lint, full
Vitest suite, production build, guard suites, secret scan, `rg` symbol audit).

Owner gates to reach a RUNNING test chain (exact env var names, TEST values,
Vercel env / `.env.local`, never committed):

1. `PAYMENTS_ENABLED=true`, `BILLING_PROVIDER=stripe`, `STRIPE_MODE=test`
2. `STRIPE_SECRET_KEY` (sk_test_…), `STRIPE_WEBHOOK_SECRET` (whsec_…),
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_test_…)
3. `STRIPE_PRICE_WORKER_PLUS`, `STRIPE_PRICE_COMPANY_PILOT`,
   `STRIPE_PRICE_AGENCY_PILOT` (test `price_…` ids created in the Stripe TEST
   account with the §3 metadata standard)
4. Stripe TEST webhook endpoint → `https://<domain>/api/billing/webhook`
   (events per §5) + its signing secret
5. Owner decision to apply migration `20260721150000` (via Supabase MCP
   `apply_migration` only)

Owner gates to LIVE (unchanged from the prior sprint, all still hard-blocked
in code): §15 of `docs/audits/stripe-test-mode-final-report.md` + LMC train
Wagon 8. **This PR neither enables nor prepares any live path.**
