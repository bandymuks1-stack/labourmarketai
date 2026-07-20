# LMC Commercial System Train v1 — canonical train document

Status: **Wagon 0 (this document) + Wagon 1 (ledger foundation) only.**
Everything commercial ships **disabled**. No production migration, no Stripe
activation, no LMC issued to any real user, no referral rewards, no emails.

Owner decisions in this document are BINDING (received 2026-07-20). Everything
marked `OWNER GATE` requires a later explicit owner decision and is **not**
implemented as active behaviour.

---

## 1. Canonical terminology

| Term | Meaning |
|---|---|
| **LMC** | The internal accounting unit of LabourMarket.ai platform credit. **1 LMC = 1 EUR of internal platform credit** (fixed accounting relationship for clarity). |
| **LMC cents** | Storage unit: `bigint` minor units, `100 LMC cents = 1 LMC`. No floating point anywhere in accounting. |
| **Account** | One owner-scoped LMC account per eligible identity: a person (`profiles.id`) or a company (`companies.id`). |
| **Transaction** | One immutable append-only ledger entry (`lmc_transactions`). Never updated, never deleted. |
| **Lot** | The remaining-value container created by every credit transaction (`lmc_lots`). Carries source kind and expiry metadata. |
| **Consumption** | An immutable allocation line (`lmc_lot_consumptions`) recording how a debit transaction (spend / expiry / reversal) consumed value from a specific lot. |
| **Promotional LMC** | LMC from `promotional_signup`, `promotional_activity`, or `admin_grant`. Expires (60-day default), consumed before purchased LMC. |
| **Purchased LMC** | LMC from a settled top-up. Never expires by promotional rules. |

**Public and legal positioning (BINDING):** LMC is an internal platform
credit, usable only for LabourMarket.ai plans, tools and eligible internal
services. LMC is **not a cryptocurrency**, **not an investment**, **not an
electronic-money claim**, **not a withdrawable balance**, and **not a promise
of future cash redemption**. No public wording may suggest cash-out,
withdrawal, investment, exchange trading or guaranteed future conversion to
money.

**No MLM (BINDING):** the system must never contain multiple referral levels,
downlines, team commissions, recruitment-chain rewards, commissions from
people invited by another participant, or pyramid mechanics. Only one direct,
attributable referral relationship may ever exist.

---

## 2. Verified current-state map (Wagon 0 audit, 2026-07-20)

Audited tree: worktree on PR #842 head
`a1db774c74b2d6f924c05b8a07d395895027580f` (contains all of `main`).

### 2.1 What exists today

- **No real prices exist anywhere in the tree.** `public.plans`
  (`0001_initial_schema.sql:244`, slugs `free`/`business`/`agency`/`enterprise`)
  seeds `price_eur_monthly = NULL`; the public pricing page renders
  "pricing TBD" placeholders (`apps/web/content/placeholders.ts`).
  `PRICING_READINESS_STATE = "draft_pricing"` (`apps/web/lib/billing/readiness.ts`).
- **Entitlement catalogue** `apps/web/lib/billing/plans.ts`:
  `PAYMENTS_ENABLED = false as const` kill-switch; `PRE_PAYMENT_PLANS`
  (`free_worker`, `worker_plus`, `company_pilot`, `agency_pilot`,
  `admin_internal`) with entitlements but **no prices**.
- **Stripe scaffold, hard-gated OFF:** `stripe` npm dep; env schema in
  `apps/web/lib/env.ts` (`PAYMENTS_ENABLED` default `"false"`,
  `BILLING_PROVIDER` default `"none"`, `STRIPE_MODE` default `"test"`);
  live keys hard-blocked by regex in `apps/web/lib/billing/config-core.ts`
  (`stripe_live_blocked`); SDK imported by exactly one adapter
  (`lib/billing/providers/stripe-test.ts`); TEST checkout only behind
  superadmin (`dashboard/admin/billing`). **No live keys anywhere.**
- **Billing tables (DRAFT, human-gated, tracked but not necessarily applied):**
  `billing_customers`, `billing_subscriptions`, `payment_webhook_events`
  (`20260613200000_billing_test_mode_records.sql`); manual
  `finance_records` (`20260711230000_finance_records_v1.sql`, EUR cents).
- **No credit / wallet / ledger / usage-events tables exist on the tree.**
- **No referral program exists.** The only "referral" occurrence is a
  talent-provenance enum value in `20260713210000_multi_source_talent_v1.sql`.
- **Identity model:** `public.profiles` (PK = `auth.users.id`) for persons;
  `public.companies` (`profile_id` = owner) for companies. Existing billing
  tables key ownership on `profiles.id`. Admin = dual signal
  `public.is_admin()` (`profiles.active_role='admin'` OR `profile_roles`
  role `admin`).
- **Migration chain tip** (after PR #842): `20260720170000_learning_stale_lifecycle_v1.sql`.
  160 files in `supabase/migrations/`; `supabase/rollbacks/` holds paired
  `.down.sql` files; `.github/scripts/migration-safety.mjs` classifies
  RED classes; `-- @human-gate-approved` + DRAFT banner is the human-gate
  convention.

### 2.2 Known constraint accepted for this wagon

`apps/web/lib/guards/product-readiness.test.ts` holds a migration-count
ratchet `SPRINT_BASELINE = 160` with `files.length <= SPRINT_BASELINE`. That
file (and `ops-bridge-migration.test.ts`, which pins the literal) is on the
**PR #842 parallel-work denylist** and must not be edited from this train.
Adding the Wagon 1 migration makes the count 161, so **exactly one guard test
fails by design** in this stacked Draft PR. The 2-line ratchet bump
(160 → 161) is a **deferred integration surface**, applied when PR #842 merges
and this PR is rebased/retargeted to `main` (see §14).

---

## 3. Audit of PR #754 (`feat(billing): pricing & payments architecture v2`)

PR #754 (head `dc051b45`, 2026-07-14, Draft, RED-class) is **prior art only**.
It is not merged, not rebased, not revived by this train.

What it contains: `PLAN_CATALOGUE_V2` with an owner-confirmed price table,
Launch Offer window + automatic 15% first-annual discount eligibility
(`billing_offer_windows` / `billing_offer_eligibility`), ad-product registry
(prices NULL), append-only `usage_events`, `credit_types`,
**mutable `credit_balances`**, append-only `credit_ledger`
(`int` deltas, no idempotency, no lots, no expiry, no reversal linkage),
read-time AI cost rollup from `ai_runs`, and the Stripe TEST webhook chain.

### 3.1 Reuse / replace / reject matrix (exact)

| # | PR #754 element | Verdict | Reason / LMC replacement |
|---|---|---|---|
| 1 | Append-only enforcement via `REVOKE update, delete ... from service_role` on ledger tables | **REUSE (pattern)** | Wagon 1 adopts and strengthens it (revoke + `BEFORE UPDATE OR DELETE` triggers, so even table-owner paths are refused). |
| 2 | RLS pattern: SELECT-only to authenticated (`owner or is_admin()`), no write policies, server-only writes | **REUSE (pattern)** | Matches current repo canon (`team_enquiries` template). Wagon 1 uses it. |
| 3 | DRAFT / human-gate migration banner + paired rollback file | **REUSE (pattern)** | Repo-wide convention; Wagon 1 follows it. |
| 4 | Kill-switch constant pattern (`PAYMENTS_ENABLED = false as const`, test-pinned) | **REUSE (pattern)** | Wagon 1 ships `lmc-flags.ts` with five `false as const` flags, guard-pinned. |
| 5 | Stripe TEST-only boundary (`config-core.ts` live-key hard block, single adapter file) | **REUSE (already on main)** | Independently present on current main; Wagon 4 builds on the main version, not the #754 diff. |
| 6 | `payment_webhook_events` idempotency (unique provider+event_id) | **REUSE (concept, Wagon 4)** | Same idempotency doctrine the LMC ledger uses at DB level. |
| 7 | `credit_ledger` (int delta, reason, source, no idempotency key, no linkage) | **REPLACE** | LMC doctrine requires idempotency keys, original-entry reversal linkage, lots/expiry, and `bigint` LMC-cents. Replaced by `lmc_transactions` + `lmc_lots` + `lmc_lot_consumptions`. |
| 8 | `credit_balances` mutable current-balance table | **REJECT** | Violates ledger doctrine: balance must be **derived** from entries, never an overwritable row. Replaced by derived views (`lmc_account_balances`). |
| 9 | `credit_types` registry (`ad_credits`, `ai_credits`) | **REPLACE** | Two parallel credit currencies are superseded by the single LMC unit (1 LMC = 1 EUR). Tool-specific pricing happens at spend time, not via separate credit kinds. |
| 10 | `PLAN_CATALOGUE_V2` prices (9.99 / 24.99 / 99 / 99.99 / 249.99 / 499.99 €) | **REPLACE (input only)** | Stale vs binding repricing direction (personal ≈ ×2, company ≈ ×3). Used ONLY as the base column of the §6 pricing decision matrix; final prices are OWNER GATE. |
| 11 | Launch Offer `99 €/mo until 2026-10-31` + auto 15% first-annual discount | **REJECT (stale)** | Time-bound commercial offer whose price and window predate the LMC decisions; any future offer must be re-decided by the owner against the new price table. |
| 12 | Ad-product registry (8 slugs, `price_cents NULL`, `active=false`) | **REPLACE** | Concept survives as "internal tools purchasable with LMC" (Stripe boundary §8); the standalone ad-credit purchase path is superseded. |
| 13 | `usage_events` + `usage_categories` + cost engine (read-time `ai_runs` rollup) | **REUSE (concept, Wagon 3)** | Usage limits per plan need a usage seam; the honest "never fabricate cost, NULL when unknown" doctrine carries over. Not part of Wagon 1. |
| 14 | Legacy plan aliases (`worker_plus→ai_plus`, `company_pilot→launch_offer_99`, …) | **REJECT** | Aliasing to a rejected catalogue; Wagon 3 defines the canonical plan set against the new prices. |
| 15 | `docs/APPLIED_LEDGER.md` applied-state tracking | **REUSE (concept)** | The applied-vs-draft distinction is already repo practice; Wagon 8 records activation state. |
| 16 | Webhook/subscription store degradation (`42P01` → `needs-migration`, never fake success) | **REUSE (already on main)** | Honest-degradation doctrine; LMC server wrappers in Wagon 2 follow it. |

**Schema/code from #754 already independently on current main:** the entire
Stripe TEST scaffold (env, config-core, provider adapter, checkout/webhook
routes, subscription-store), `PRE_PAYMENT_PLANS`, entitlement gates, and the
`billing_*` DRAFT migrations. The #754-only additions (offer windows, ad
registry, usage/credit tables, catalogue V2) are **not** on main.

---

## 4. LMC lifecycle

```
                      ┌──────────────┐
  purchased ────────► │              │        spend ────────► consumed
  promotional_signup ►│  lot created │──────► expiry ───────► expired (promo only)
  promotional_activity►│ (available) │        reversal ─────► reversed
  admin_grant ───────►│              │        refund_/chargeback_reversal (purchased)
  referral_reward ───►└──────────────┘
  (IMPOSSIBLE while lmc_referrals_enabled = false — DB trigger)
```

Lifecycle states are **derived, never stored as a mutable column**:

- **available** — lot remainder > 0 and (`expires_at` is NULL or in the future).
- **pending** — reserved for Wagon 4 (Stripe settlement); no pending state is
  fabricated in Wagon 1 because every Wagon 1 credit is created settled.
- **expired** — promotional lot past `expires_at`; remainder is unspendable
  immediately by timestamp (deterministic), and an explicit `expiry`
  transaction records it append-only.
- **reversed** — remainder consumed by a `reversal` / `refund_reversal` /
  `chargeback_reversal` transaction referencing the original entry.

Ordering rules (BINDING, enforced in `lmc_spend_v1`):
1. Promotional/expiring lots first, earliest `expires_at` first (tie: lot id).
2. Then non-expiring (purchased) lots, oldest first (tie: lot id).
3. Expired remainders are never spendable, even before the expiry transaction
   is recorded.
4. Purchased LMC is never expired by promotional rules (`expires_at` is NULL
   by CHECK constraint for purchased lots).

---

## 5. Accounting invariants (Wagon 1, DB-enforced)

1. Balance is derived from ledger entries (views); no balance column exists.
2. No update/delete of committed entries: no RLS write policies, write
   privileges revoked from `anon`/`authenticated`/`service_role`, and
   `BEFORE UPDATE OR DELETE` triggers raise unconditionally.
3. Sources distinguishable: `kind` on every transaction, `source_kind` on
   every lot (`purchased`, `promotional_signup`, `promotional_activity`,
   `admin_grant`, `referral_reward`).
4. Idempotency at DB level: `unique (account_id, idempotency_key)`, and a
   replay must be an **exact** replay — the RPCs fingerprint the
   operation-defining fields (kind, amount, reversal linkage, campaign,
   purchase reference, admin-grant lot expiry) and raise
   `lmc_idempotency_conflict` when a key is reused with a different payload
   instead of silently returning the old result. The system-derived
   `lmc-expiry:` key namespace is reserved: externally keyed RPCs refuse it,
   so a foreign transaction can never masquerade as an expiry record.
   Admin-grant keys are globally unique and replay-resolved **before**
   recipient email resolution against the stored `recipient_email_at_grant`,
   so a retried grant can never be re-issued to a different profile that
   later acquired the recipient's email address.
5. Every reversal references its original entry (`original_transaction_id`
   NOT NULL for reversal kinds, CHECK-enforced) and at most one reversal per
   original (partial unique index).
6. No duplicate signup/activity rewards: partial unique indexes
   (one `promotional_signup` and one `promotional_activity` per account —
   this also makes any daily-repeat grant structurally impossible).
7. No negative spendable balance: spends allocate under an account row lock
   (`SELECT ... FOR UPDATE`) and fail atomically on insufficiency.
8. Deterministic expiry ordering (§4).
9. 1 LMC stored exactly: `bigint` LMC-cents; no numeric/float ambiguity.
10. Server-only monetary writes: writes possible only through SECURITY
    DEFINER RPCs (search_path pinned, server-side authorization, bounded
    positive amounts).
11. Owner/admin scoped reads: RLS SELECT policies only (owner, company owner,
    `public.is_admin()`).
12. Complete audit provenance: every state-changing RPC appends a
    `public.audit_logs` row; admin grants additionally store actor, resolved
    recipient, verified email at grant time, campaign, reason, expiry.
13. Referral entries impossible while disabled: `BEFORE INSERT` trigger
    rejects `referral_reward` unless `lmc_referrals_enabled` is true
    (default false; fail-closed when the settings row is absent).

---

## 6. Pricing decision matrix — `OWNER GATE`, nothing final

**Audit result:** current `main` has **no canonical prices** (all
"pricing TBD" / NULL — §2.1). The only owner-confirmed price table that has
ever existed is the PR #754 draft catalogue. It is therefore used as the
"current canonical base price" column below, with that caveat stated.

Binding direction: personal VIP plans ≈ **2×** base; company plans ≈ **3×**
base. Rounded prices below are **proposals only** — no rounded final price is
invented or activated by this train; activation requires an explicit owner
decision (Wagon 3 gate).

| Plan (base: PR #754 catalogue) | Current canonical price | Exact multiplier result | Proposed rounded (NOT FINAL) | Included value (from #754 entitlement shape) | Estimated max reward exposure | Margin-risk warning |
|---|---|---|---|---|---|---|
| Personal AI PLUS (`ai_plus`) | 9.99 €/mo | ×2 = **19.98 €** | 19.99 €/mo | AI assist runs, expanded profile/CV surfaces | Promo: ≤ 100 LMC/user (§9). Referral: `r × 19.99 €` per referred settled month; `r` undefined (disabled) | At 19.99 € one referred month granting 100 promo LMC costs up to 5 months of revenue in internal-credit exposure if fully spent on paid tools |
| Personal VIP MEDIA (`vip_media`) | 24.99 €/mo | ×2 = **49.98 €** | 49.99 €/mo | Media gallery, visibility surfaces | Promo: ≤ 100 LMC/user. Referral: `r × 49.99 €`; `r` undefined | Media/storage have real unit costs; usage limits (Wagon 3) must precede activation |
| Company Launch Offer successor (`launch_offer_99`) | 99.00 €/mo | ×3 = **297.00 €** | 299 €/mo | Unlimited-ads exception in #754 — must be re-decided; unlimited at 3× price still caps revenue per heavy user | Referral: `r × 297 €`; `r` undefined | "Unlimited" entitlements at any price are the largest margin risk; recommend finite allowances before activation |
| Agency START (`agency_start`) | 99.99 €/mo | ×3 = **299.97 €** | 299.99 €/mo | Multi-company management (small) | `r × 299.97 €`; `r` undefined | Agency tiering must be re-validated against real pilot demand |
| Agency GROWTH (`agency_growth`) | 249.99 €/mo | ×3 = **749.97 €** | 749.99 €/mo | Multi-company management (mid) | `r × 749.97 €`; `r` undefined | ×3 on the mid tier may exceed willingness-to-pay; owner should see pilot data first |
| Agency SCALE (`agency_scale`) | 499.99 €/mo | ×3 = **1 499.97 €** | 1 499 €/mo | Multi-company management (large) | `r × 1 499.97 €`; `r` undefined | Highest sticker; a single chargeback + referred promo exposure is material — fraud tooling (Wagon 6) must precede activation |

Notes: agency plans are treated as company-class (×3); if the owner considers
agencies a separate class, the multiplier is an OWNER GATE. Promotional
exposure is bounded and concrete: **max 100 LMC (= 100 € internal credit) per
verified new user** (50 signup + 50 activity, each once-ever), expiring in 60
days. Referral exposure cannot be estimated further because **no referral rate
exists and none may be invented** — every referral cell above is a formula,
not a number.

---

## 7. Referral eligibility lifecycle — disabled by default

Schema-supported (Wagon 5), reward-disabled until an owner-approved rate and
eligibility formula exist:

```
directly invited person/company
  → valid attributable referral (single direct relationship, no chains)
  → real eligible purchase by the invitee
  → successfully settled transaction
  → no refund / chargeback / duplicate-account / fraud condition
  → [OWNER GATE: active rate configuration exists]
  → automatic referral_reward transaction (Wagon 5)
```

Hard rules already enforced in Wagon 1:
- `referral_reward` transactions are **impossible** while
  `lmc_referrals_enabled = false` (DB trigger, default false, fail-closed).
- Zero reward is issued without an explicit active configuration; **no reward
  rate exists anywhere in schema or code** — none may default in.
- No public earning claim may be rendered; no invented percentage or
  "up to" value may be added (guard-tested wording rules).
- One direct referral relationship only; no multi-level structure will ever
  be added (§1 No MLM).

---

## 8. Stripe boundary

- Stripe may eventually sell **only**: (a) subscriptions, (b) LMC top-ups.
- Internal LabourMarket.ai tools and services are bought **inside the
  platform with LMC**.
- A free person or small company may purchase an individual internal tool by
  topping up LMC **without first buying a subscription**.
- Live Stripe activation is **forbidden in this train until Wagon 8** and
  remains an owner-only production gate; Wagon 4 is TEST-mode only.
- The existing live-key hard block (`config-core.ts`) stays in force.

---

## 9. Promotional-grant lifecycle

Registration promotion (BINDING):
- **50 LMC once** after **verified** signup (`auth.users.email_confirmed_at`
  required for resolution).
- **Additional 50 LMC** after **7 meaningful active days within the first 30
  days** (activity definition instrumented in Wagon 2; the grant kind and
  once-ever constraint exist from Wagon 1).
- **Never** an automatic daily 50 LMC reward — structurally impossible:
  both promotional kinds are once-per-account by partial unique index.

Promotional LMC properties (Wagon 1): expires after 60 days; consumed before
purchased LMC; must carry a campaign/source; must carry an idempotency key;
amounts fixed at 50 LMC (5 000 LMC-cents) per grant kind (cap); supports
reversal (original-entry linkage); can never silently become withdrawable
(no withdrawal concept exists anywhere).

Admin grants (Wagon 1 RPC, disabled until `lmc_promotional_grants_enabled`):
require recipient identity resolution via **verified email**, amount
(positive, bounded ≤ 1 000 LMC per grant — cap constant, owner-adjustable
later), reason, campaign, expiry, idempotency key, actor, timestamp, and an
immutable audit record (`audit_logs` + transaction provenance columns).

---

## 10. Fraud and reversal rules

- Every reversal references the original entry; exactly one reversal per
  original entry (DB unique index).
- `refund_reversal` and `chargeback_reversal` apply only to `purchased`
  originals; plain `reversal` applies to promotional/admin/referral credits.
- Reversals are idempotent: replaying the same idempotency key returns the
  original result; a second reversal attempt with a different key is refused.
- Wagon 1 reverses the **remaining unspent value** of the original lot
  (never drives spendable balance negative). Recovery of already-spent value
  (clawback, account freeze, negative-balance handling) is Wagon 6 fraud
  tooling and an OWNER GATE.
- Duplicate accounts / fraud conditions void referral eligibility (§7);
  enforcement tooling lands in Wagon 6.

---

## 11. Feature flags (all OFF at ship time)

Canonical mechanism: the repo's kill-switch-constant pattern
(`PAYMENTS_ENABLED = false as const` in `lib/billing/plans.ts`), extended in
`apps/web/lib/billing/lmc-flags.ts`, plus a DB `lmc_settings` table for the
invariants that must hold **inside the database** (referral trigger). Both
default false and are guard-pinned:

| Flag | Default | Layer |
|---|---|---|
| `LMC_PURCHASES_ENABLED` | `false` | TS constant + `lmc_settings.lmc_purchases_enabled` |
| `LMC_PROMOTIONAL_GRANTS_ENABLED` | `false` | TS constant + `lmc_settings.lmc_promotional_grants_enabled` |
| `LMC_REFERRALS_ENABLED` | `false` | TS constant + `lmc_settings.lmc_referrals_enabled` (trigger-enforced) |
| `STRIPE_LMC_TOPUPS_ENABLED` | `false` | TS constant + `lmc_settings.stripe_lmc_topups_enabled` |
| `LIVE_PAYMENTS_ENABLED` | `false` | TS constant + `lmc_settings.live_payments_enabled` (in addition to the existing live-key hard block) |
| `LMC_SPENDING_ENABLED` | `false` | TS constant + `lmc_settings.lmc_spending_enabled` — spend kill-switch enforced inside `lmc_spend_v1`; while false even already-issued LMC is frozen (added after Codex P1 review so the §14 behavioural-rollback claim is DB-true) |

A missing settings row reads as **false** (fail-closed helper).
`feature-availability.ts` entries for wallet UI are **deferred to Wagon 7**
because they require i18n label keys in `messages/*.json` — files on the
PR #842 denylist (§13).

---

## 12. UI surfaces planned for later wagons (none in Wagon 1)

- Wallet balance + ledger history (worker + company dashboards) — Wagon 7.
- Top-up flow (Stripe TEST → live only at Wagon 8 gate) — Wagons 4/7.
- Plan pricing pages with final owner-approved prices — Wagons 3/7.
- Direct-referral surface (invite link, attribution status; **no earning
  claims** until an owner-approved rate exists) — Wagons 5/7.
- Admin: grant console, fraud/reversal tools, reporting — Wagon 6.
- Invitation lifecycle (sender `LabourMarket.ai <info@labourmarket.ai>`;
  **no email sending before Wagon 7 gate**) — Wagon 7.
- 11-locale copy for all of the above — Wagon 7 (blocked on #842 denylist
  release of `messages/*`).

---

## 13. Conflict map against PR #842

PR #842 (`fix/journal-supersede-attachment-continuity-v1`, head
`a1db774c74b2d6f924c05b8a07d395895027580f`) changes 45 files: journal/learning
app code, journal guards, **all top-level + journal locale message files**,
`scripts/db-proof-journal-*.mts`, `db-proof-learning-*.mts`, and migrations
`20260720150000` / `20260720170000` (+ rollbacks).

| Overlap surface | Status |
|---|---|
| `supabase/migrations/*` | **No overlap** — Wagon 1 migration is `20260720190000_*`, after the verified #842 chain (`…150000`, `…170000`). |
| `apps/web/messages/*.json` | **Denylisted, not touched.** Wallet/referral i18n deferred to Wagon 7. |
| `apps/web/lib/guards/product-readiness.test.ts` | **Denylisted, not touched.** Ratchet bump 160 → 161 is a deferred integration step (§2.2) — the single expected guard failure in this stacked PR. |
| `apps/web/lib/guards/ops-bridge-migration.test.ts`, `market-map-read-layer-v1.test.ts` | **Denylisted, not touched.** No LMC change needed there beyond the deferred ratchet literal. |
| Journal/learning app code + proofs | **No overlap** — LMC touches none of those files. |

No commit, amend, force-push or any other modification of PR #842 or its
branch is performed by this train. This PR is stacked on the #842 head as a
temporary base and retargets to `main` after #842 merges (separate reviewed
action).

---

## 14. Production activation gates (Wagon 8) and rollback strategy

**Nothing activates without ALL of:**
1. Owner-approved final price table (§6 matrix decided).
2. Owner-applied production migration(s) via Supabase MCP `apply_migration`
   (never `db push`; never from an agent session).
3. Owner-approved referral rate + eligibility formula (else referrals stay
   disabled forever).
4. Fraud/reversal tooling accepted (Wagon 6).
5. Legal copy review of all public wallet/credit wording (no cash-out
   implications; §1 positioning).
6. Stripe live keys added by owner only; `LIVE_PAYMENTS_ENABLED` flipped by
   owner only.
7. Acceptance proofs re-run against production shape (Wagon 8).

**Rollback strategy:**
- Every LMC migration ships a paired `supabase/rollbacks/<name>.down.sql`
  that removes **only** that migration's objects (proof 22).
- Rollback → re-apply is proven clean in the scratch DB (proof 23).
- Because balances are derived and writes are RPC-only, disabling every flag
  (all default false) is a complete behavioural rollback without schema
  changes: no grant, purchase, spend or referral path can execute — spends
  are DB-gated by `lmc_spending_enabled` inside `lmc_spend_v1`.
- Ledger data itself is append-only and is **never** deleted in production;
  a production rollback of an applied LMC migration is an OWNER GATE with a
  data-preservation review first (§3 CLAUDE.md destructive-migration gate).

---

## 15. Train wagons and exact Draft PR sequence

| Wagon | Scope | PR |
|---|---|---|
| 0 | Current-state audit + binding LMC contract (this document) | PR-A `feat(billing): add immutable LMC ledger foundation v1` (this PR, stacked on #842) |
| 1 | Immutable LMC ledger foundation (schema, RPCs, flags OFF, proofs) | PR-A (same PR as Wagon 0) |
| 2 | Wallet server layer, purchased top-ups (TEST), promotional grant wiring + activity-day instrumentation | PR-B (stacked on PR-A after it retargets `main`) |
| 3 | Personal/company plan repricing + usage limits (owner price gate decided here) | PR-C |
| 4 | Stripe TEST subscriptions + LMC top-ups (no live keys) | PR-D |
| 5 | Direct Referral Network v1 — schema + attribution, rewards disabled by default | PR-E |
| 6 | Admin controls, fraud/reversal tools, reporting | PR-F |
| 7 | Wallet/referral UI, 11-locale copy, invitation lifecycle (sender `LabourMarket.ai <info@labourmarket.ai>`) | PR-G |
| 8 | Production activation + acceptance (owner-only gates §14) | PR-H |

Each PR: Draft, one Codex review per exact final head, all commercial flags
OFF, no production mutation. Wagons 2+ **do not start** without a new owner
decision.
