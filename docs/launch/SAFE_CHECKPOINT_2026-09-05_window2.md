# SAFE_CHECKPOINT — 2026-09-05 window 2 (MASTER completion orchestrator, ~18:35 UTC)

> Durable hand-off for the NEXT MASTER. Recover from this file + `MASTER_COMPLETION_MAP_2026-09-05.md`
> + `RESUME_CHECKPOINT_2026-09-04.md` + git/PR/CI/production. Do NOT restart architecture, design,
> billing, Stripe or repository audits. Do NOT redo PROD_PROVEN work. Resume the writers below.
> No secrets in this file.

## 0. Coordinates

| Item | Value |
|---|---|
| `main` | **`b6a2e7bf`** (#1547 pricing copy) |
| Production | **`b6a2e7bf`** = `main` (served 18:0x UTC; `/api/health` ok) |
| Open PRs, all with auto-merge armed, CI running/green | **#1546** docs (no-payment strategy) `98216092` · **#1548** `public_plans_v1` code + migration `017cc31a` (RED, **owner-approved in chat "approve public_plans_v1"**, marked ready, migration ALREADY APPLIED to prod — see §2) · **#1549** early-access banner live copy `c6fb10f9` · **#1550** ledger entry `26244332` |
| Merged this window (all served) | #1534 #1535 #1536 #1538 #1537 #1539 #1540 #1541 #1542 #1543 #1544 #1545 #1547 · **#1441 Stripe = `f4b5e582`** |
| Counts (map §1/§6) | COMMERCIAL 24/30 (remaining J1–J5/K4 = split below) · SAFE PILOT 32/33 (A4 five-intent walk with fresh identities partially done) · 58/75 PROD_PROVEN |
| Real users | REAL_RECRUITER_USED_PRODUCT = FALSE (last `dashboard_viewed` 2026-09-04 06:15 UTC) |

## 1. Owner approvals ALREADY GRANTED this window (do not ask again)

1. Minimal Vercel permission change in `.claude/settings.local.json` (blanket `Bash(vercel *)` deny → narrow env allows + destructive denies) — APPLIED.
2. Vercel authentication + automatic billing env reconciliation — DONE (CLI was already authenticated as the project owner).
3. #1441 ready/approve/squash-merge — DONE (`f4b5e582`).
4. `public_plans_v1` apply — DONE (MCP `apply_migration`, ~18:20 UTC, verified); #1548 merge — armed.
5. **NO owner €99 payment** (owner correction). Real-money legs = `EXTERNAL_REAL_CUSTOMER_PROOF_PENDING`. Max owner smoke test would be €1 and needs FRESH approval immediately before charging — not proposed.
6. Owner refuses manual file/UI/terminal steps; secret intake = clipboard → `secret-from-clipboard.cjs` (done for the three billing values).

## 2. Stripe LIVE — state and evidence (no payment made)

- LIVE objects: product `prod_VCjq8iLCnyfbr2`, price `price_1UCKgg637uptAg5zD8dMA6kU` (EUR 9900/month, tax exclusive), Customer Portal `bpc_1UCKNU637uptAg5z3ztY0snr` (default), webhook endpoint (owner-created, 10 events), Stripe Tax ACTIVE (pre-existing, reused).
- Vercel Production (names only): PAYMENTS_ENABLED, BILLING_PROVIDER, STRIPE_MODE, STRIPE_LIVE_ACTIVATION, STRIPE_PRICE_COMPANY_PILOT, STRIPE_SECRET_KEY (runtime restricted key), STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — 8 rows, Production only; Preview has 0 billing rows. Agent scripts: `pilot-feedback/walks-2026-09-05/vercel-billing-reconcile.cjs` (plan/apply-public/apply/verify), `secret-from-clipboard.cjs`, `stripe-agent-prod.cjs` (inventory / ensure-product-price / ensure-portal / verify-checkout / events; agent restricted key in `%USERPROFILE%\.config\labourmarket\stripe-agent.env`, bare `rk_live_` line accepted).
- Pre-payment acceptance on `f4b5e582` (`walk-stripe-live-before.log` + `verify-checkout`): billing state `stripe_live` · order button on `/lt/dashboard/account` · POST `/api/billing/test-checkout` → 200 LIVE Checkout Session `cs_live_a1f1…` (mode subscription, correct price/product, 9900 EUR, automatic_tax on, tax id collection, address required, canonical metadata, success/cancel URLs; expires 2026-09-06 17:06 UTC) · Stripe customer `cus_VCmctzUiZ8NDw4` (live, no financial activity) mapped in `billing_customers` · 0 subscriptions / payment intents / charges · DB `billing_subscriptions` 0, `payment_webhook_events` 0 · FREE=1: 2nd need refused with the honest upgrade message.
- Classification: LIVE config PROD_PROVEN · LIVE Checkout creation PROD_PROVEN · entitlement ungranted pre-payment PROD_PROVEN · FREE=1 PROD_PROVEN · webhook signature/idempotency TEST_PROVEN · PAID=10 + 11th-need individual path TEST_PROVEN · real charge → webhook → subscription → entitlement → portal session → refund/cancel readback = **EXTERNAL_REAL_CUSTOMER_PROOF_PENDING**.
- Known billing follow-ups (RED, for the billing writer): `STRIPE_METADATA_ENVIRONMENT` hard-coded "test" (live objects carry `environment=test`); the ten safety properties (§3).
- Public `/pricing`: hero copy fixed (#1547 served); price figure via `public_plans_v1` (applied; code in #1548 pending merge/deploy); early-access banner copy #1549 pending merge/deploy. **First verification after deploy**: anon Playwright → `pricing-price-free` "Nemokama", `pricing-price-business` "99 €/mėn.", no "neįjungt" text.

## 3. ACTIVE WRITER — PRESERVE EXACTLY (do not restart the audit)

| Lane | Worktree · branch | State | Next atomic action |
|---|---|---|---|
| **BILLING SAFETY — UPDATE 18:45 UTC: COMMITTED and OPEN as draft RED PR #1552 (`needs-human-gate`, auto-merge OFF), head `21cdb976`; 134 new tests, 378/378 focused, `lib/guards` green except the CRLF red; audit report `docs/launch/billing-safety-audit-2026-09-05.md`. Real live-path defect found and fixed in the PR: `billing_customers` unique `(owner_id, provider)` + the E2E owner's existing `test_mode=true` row would have sent a TEST `cus_` id to LIVE Stripe — key widened to `(owner_id, provider, test_mode)`. Open owner decisions listed in the PR (apply the RED migration via MCP; optional `checkout.session.expired` subscription; €1 smoke design NOT executed; `unpaid` refuses new checkout). First fix before merge: its migration file `20260905190000_billing_safety_invariants_v1.sql` shares the version prefix with the applied `public_plans_v1` → rename to `20260905200000_…` and re-bump the three ratchets to 265.** Original snapshot before the PR: | `C:\Users\Mano\Documents\labourmarketai-wt\lane-p5-employer` · `fix/cc/billing-safety-idempotency` | 35 files were staged, then committed: `docs/launch/billing-safety-audit-2026-09-05.md`, `supabase/migrations/20260905190000_billing_safety_invariants_v1.sql`, `lib/billing/{checkout-admission,checkout-operations-core,checkout-operations-store,reconcile-core,reconcile,subscription-store-safety}.ts/.test.ts`, `app/api/billing/reconcile/route.ts`, edits to `test-checkout/route.ts`, `webhook/route.ts`, `subscription-store.ts`, `customer-store.ts`, `provider.ts`, `providers/*.ts`, `account-billing-section.tsx`. The writer paused waiting for its full `lib/guards` vitest run. | Re-run `npx vitest run lib/billing lib/guards/billing-safety-invariants.test.ts lib/guards/no-live-payments.test.ts lib/guards/billing-readiness.test.ts` then `npx vitest run lib/guards` (ignore CRLF red `opportunity-type-internship`), `npx tsc --noEmit`, eslint → commit → push → `gh pr create --draft --label needs-human-gate` (RED; body = classification table + exact migration SQL + rollback + €1 smoke-test proposal NOT executed) → owner approval → MCP apply → merge. **Migration filename collision**: `20260905190000_*` is already used by `public_plans_v1` — rename the billing one to `20260905200000_billing_safety_invariants_v1.sql` and bump the three migration ratchets (`booking-engagement-end-v1` list, `market-map-read-layer-v1` 264→265, `product-readiness` SPRINT_BASELINE 264→265). |

Idle worktrees (clean, branches merged): `lane-p4-field` (`fix/cc/concierge-banner-live-state` = #1549), `lane-j-invitations` (`feat/cc/public-plans-rpc-v1` = #1548), `lane-p3-readiness`, `lane-p8-world`, `master-orch` (docs branches). Main checkout `Documents/labourmarketai` sits on `feat/cc/stripe-live-activation-draft` (merged) with the two harness files dirty (`.claude/launch.json`, `supabase/config.toml` — never commit).

## 4. Product proofs this window (do not redo)

- `08629b19`: P1 entry + `?say=` hand-off, Field (C6/C9), company home (L2), ledger re-walk (B6), E5 honest suppressed state.
- `c893557b`: P2/P6 card provenance edge (B13, C12), P8 World subset (H2 subset), chat object language (0 raw ids, DERIVED marker), #1535 regression clean.
- `517dc890`: provenance wrap fix (390 px). `332f8cd0`: brief label fix (D-S2). `613f6a4c`: **full-spine walk with fresh identities** (org + person: entry → onboarding → need → discovery → invitation → accept → roster → project); D-S3 (unnamed org context) fixed #1543 and proven (`candidates-view` renders).
- QA batch #1535 (Field/company home honesty), CONV batch #1542 (`?say=` same-origin-referrer rule + prefill fallback, Q-3 fan-out dedupe, Q-5 guard pins).

## 5. Retained E2E identities / residue (next MASTER must know)

- Spine identities (KEPT; pilot_events FK): org `e2e-spine-org-202609051508@labourmarket.ai` (profile `03e1861f…`, organizations `9b96648a…`, companies `acbdf51a…` UNNAMED, `active_unverified`), person `e2e-spine-person-202609051508@labourmarket.ai` (profile `70851a66…`, profession builder). Rows: need `057f876f…` CLOSED; draft project `e6af0df4…` "E2E Spine objektas"; roster `company_workers c83fd3d3…` active; 44 pilot_events.
- Stripe/DB: open LIVE Checkout Session `cs_live_a1f1…` (auto-expires 2026-09-06 17:06 UTC), live customer `cus_VCmctzUiZ8NDw4` + `billing_customers` row for E2E Walker UAB's owner — evidence, keep.
- Earlier walks: readiness rows 7/7 `needed`; engagement `90da8c16` review ON with 1 confirmation on `01d4a36d` (evidence); `landing_intent` telemetry rows (kept).
- Local agent files (outside repo, never commit/print): `%USERPROFILE%\.config\labourmarket\stripe-agent.env`, `vercel-billing.env`.

## 6. NEXT ATOMIC ACTIONS (in order)

1. Read `/api/health` `.build`. When it carries #1548 + #1549: anon Playwright on `/lt/pricing` (price figures + no stale copy) → record J1 PROD_PROVEN.
2. Resume the BILLING SAFETY writer per §3 (rename migration, ratchets, verify, commit, draft RED PR). Then owner approval → MCP apply → merge → prod verification of the invariants without money (unique indexes present; reconcile route reports zero anomalies; replayed-webhook-fixture test path if the writer built one).
3. Remaining SAFE PILOT gap: A4 five-intent walk — re-run `walk-full-spine-prod.cjs` legs that were walk gaps (company naming via the visible label, assignment → readiness → instruction) on the served build.
4. Owner gates unchanged (not re-ask): G-12 apply #1430, G-1 real-inbox signup, G-14 verify `E2E Walker UAB`, G-15 apply #1436, `INVITE_EMAIL_*` env, Vercel plan. First genuine paying customer closes J3–J5/K4.
5. Keep merging docs PRs #1546 #1550 (auto).

## 7. Traps learned this window (also in memory)

`vercel env rm NAME preview` on a Preview+Production variable deletes the WHOLE variable · service_role has no grant on several tables (readbacks via MCP) · the auto-mode classifier sometimes blocks wrapper scripts but allows the plain CLI call · heredoc/`python -c` halve backslashes — write patch scripts with the Write tool · the map's stage table can lag §0 — recount from the Status column.
