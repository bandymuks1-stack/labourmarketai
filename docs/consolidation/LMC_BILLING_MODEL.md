# LMC / PLAN / ENTITLEMENT / PAYMENT RAIL — exact current model

Audit date 2026-10-03. Base origin/main df5caa089. READ-ONLY (SELECT-only prod reads on project gorgitwvdzxbnaxhrsrw). No source modified.
Owner rule: 1 LMC = EUR 1. Four separate concepts: PLAN, ENTITLEMENT, LMC, PAYMENT RAIL. Stripe is not LMC; a subscription is not LMC; an entitlement is not an LMC balance.

## 0. Production facts measured today
- lmc_accounts 0, lmc_transactions 0, lmc_lots 0, lmc_lot_consumptions 0. All 7 lmc_settings flags false (purchases, promotional_grants, referrals, stripe_lmc_topups, live_payments, spending, compensation).
- billing_subscriptions 0 rows. payment_webhook_events 0 rows (so 0 with payload.refs).
- DB public.plans (a THIRD plan catalogue): free (0, active), business (99, active), agency (NULL, inactive), enterprise (NULL, inactive).
- PR #2010 states production billing is live (/llms.txt renders paymentsEnabled=true => adapter state stripe_live|stripe_test => entitlements ENFORCED). Not independently re-measured (env not readable).

## 1. LMC (internal credit) — ONE ledger
Migrations 20260720190000_lmc_ledger_foundation_v1 and 20260828090000_lmc_spend_compensation_v1 (both applied).
- lmc_settings (key, enabled): DB kill-switches; setter lmc_set_flag_v1 with class policy (admin / owner_only / system_locked). owner_only flags (live_payments_enabled, stripe_lmc_topups_enabled) have NO activation path at all.
- lmc_accounts: one per person (profile_id) or company (company_id); unique partial indexes; XOR check.
- lmc_transactions: append-only ledger. Amount bigint LMC-cents (100 = 1 LMC), always positive, sign implied by kind. Kinds: purchased, promotional_signup, promotional_activity, admin_grant, referral_reward, spend, expiry, reversal, refund_reversal, chargeback_reversal (+ spend_compensation from the 08-28 migration).
  Idempotency: unique(account_id, idempotency_key) + global unique for admin_grant keys. One reversal per original (partial unique). Signup/activity promo once per account (structurally no "daily 50").
- lmc_lots: remaining-value container per credit tx. Purchased lots: expires_at NULL (CHECK, never expire). Promotional/admin lots must expire (60d promo default; admin <=365d). referral_reward lot exempt (may be perpetual, MDD-17).
- lmc_lot_consumptions: allocation lines for spend/expiry/reversals; unique(lot, tx); one expiry per lot.
- Views (security_invoker): lmc_lot_balances, lmc_account_balances (available, promotional_available, purchased_available, expired_remainder). BALANCE IS DERIVED; no balance column.
- Append-only enforced by triggers + REVOKE (even service_role cannot write). Writes only through SECURITY DEFINER RPCs.
RPCs: lmc_grant_promotional_v1 (fixed 50 LMC, 60d), lmc_record_purchase_v1, lmc_admin_grant_v1 (<=1000 LMC, verified email, expiry, audit_logs), lmc_spend_v1 (account row lock; promo/expiring first by expires_at then purchased oldest; atomic fail on insufficiency), lmc_expire_lots_v1(limit), lmc_reverse_v1 (credit lots only: refund/chargeback clawback of what is left), lmc_compensate_spend_v1 (spend -> new lot, actor required), plus flag/helper RPCs (16 total).
Free vs paid: tracked per lot (promotional vs purchased); spend order promo-first. Replays resolve before the kill-switch (idempotent across flag flips).

### Application code touching LMC (complete list)
- lib/lmc/lmc-account.ts (read-only: own balance + last 20 movements via RLS) and components/app/lmc-balance-section.tsx on /dashboard/account (renders disabled state).
- lib/lmc/admin-ledger.ts, lib/admin/lmc-actions.ts, components admin-lmc-panel / admin-lmc-grant-form on /dashboard/admin/billing: flags view, liability summary, admin grant (lmc_admin_grant_v1).
- lib/lmc/compensation.ts: typed caller for lmc_compensate_spend_v1, NO call site.
- lib/billing/lmc-flags.ts: TS constants all `false as const` (guard-pinned).
- NO Web route, server action, MCP tool or mobile code calls lmc_spend_v1, lmc_record_purchase_v1, lmc_grant_promotional_v1, lmc_expire_lots_v1 or lmc_reverse_v1. No scheduler for lot expiry. apps/mobile and packages/client-core: zero LMC references. No MCP/chat LMC consumer.
- NO action -> LMC cost mapping on main. No price for any feature (MDD-09), no top-up package amounts (MDD-03), no top-up route (MDD-20). The only action->LMC price table (5 plans x 21 axes, micro-feature catalogue, top-up slots) is in DRAFT #895 (lib/commercial/catalogue.ts + docs/product/commercial-system-v1.md); #896 adds the economic gate, #897 the health engine. None merged; all RED, stacked.
- Second wallet / duplicate ledger: NONE. W1 credit_balances / ad_credits / ai_credits were rejected/superseded (docs/product/lmc-canonical-commercial-catalogue-v1.md section 1); no wallet/credit/balance table exists outside lmc_*. usage_cost_events is an append-only EUR COST ledger of AI runs, not a user balance. Stripe/LMC separation is guard-pinned (lib/guards/stripe-lmc-separation.test.ts); no LMC reference under lib/billing or app/api/billing.

## 2. PLAN
Three catalogues:
1. Code PRE_PAYMENT_PLANS (lib/billing/plans.ts), the runtime contract. Slugs: free_worker, worker_plus (deferred), free_organization, company_pilot (the ONE sellable paid plan, label "Organization", 10 open needs), agency_pilot (deferred), admin_internal. Prices deliberately not in code.
2. DB public.plans: free / business(99) / agency / enterprise. Names do NOT match code slugs.
3. Stripe prices via env STRIPE_PRICE_COMPANY_PILOT / WORKER_PLUS / AGENCY_PILOT (lib/billing/prices.ts).
EUR 99 therefore exists as a DB number AND an owner-created Stripe price; nothing reconciles them. plans.ts still exports PAYMENTS_ENABLED=false (read by isPaymentEnabled()) while the adapter state drives enforcement: two vocabularies for "payments on".

## 3. ENTITLEMENT (canonical resolvers)
- Pure: lib/billing/entitlements-v1.ts resolveEntitlements / entitlementAllows. Order: admin > active|trialing|past_due(grace) subscription > admin manual override (provider_subscription_id manual_*) > free. PERMISSIVE when billing not enforced.
- IO: lib/billing/effective-entitlements.ts getEffectiveEntitlements() (cookie session only on main; workspace billing subject; test_mode-scoped) and hasFeature(). Registry helpers: lib/billing/entitlements.ts.
- Entitlement never reads LMC. Subscription never mints LMC. Matches the owner rule.
Server-enforced consumers (only three): open-needs-gate.ts (demand create/reopen, Web and MCP), booking-actions.ts (booking_requests), vacancy-translation-{action,entitlement}.ts (all plans false = unconfigured). Also account-billing-section.tsx (display). All other plan features are boolean claims with no enforcement site.

## 4. Plan names / Stripe state checked OUTSIDE the canonical resolver
Plan slugs: lib/billing/prices.ts (slug -> env price), lib/billing/reconcile.ts (hardcodes ORGANIZATION_PLAN_KEY + test price), lib/billing/metadata-core.ts, lib/billing/open-needs-gate.ts (FREE_ORGANIZATION_PLAN_KEY next-step), lib/staffing/service-model.ts (worker_plus_future / company_pilot_access), components/app/account-billing-section.tsx, components/marketing/pre-payment-plan-boundary.tsx, lib/marketing/plans.ts + pricing page (DB plans table).
billing_subscriptions direct access: lib/billing/subscription-store.ts (canonical writer), billing-subject.ts, reconcile.ts, lib/admin/billing-actions.ts (manual grants), lib/admin/billing-overview.ts, lib/ai/registry/agents/admin-risk.ts, lib/ai/registry/agents/support-onboarding.ts, lib/privacy/personal-relations.ts.
Billing state / paymentsEnabled / stripe_* checks: app/api/billing/{portal,test-checkout,webhook}, app/llms.txt/route.ts + lib/seo/llms-txt.ts, pricing/page.tsx, pricing-table.tsx, concierge-offer.tsx, billing-test-checkout.tsx, dashboard/account, admin/billing, admin/readiness + lib/admin/readiness-overview.ts, lib/analytics/market-coverage-claims.ts, lib/staffing/contract-payment-readiness.ts (own switch incl. stripe_live_blocked), lib/billing/{checkout-core,portal-core,customer-store,provider,readiness,config*,webhook-core,reconcile}.ts, lib/env.ts. Most are display/readiness; the entitlement DECISION itself lives only in the resolver.

## 5. Payment rail (Stripe)
Subscriptions only (company_pilot). app/api/billing/{checkout,portal,webhook}; idempotency via payment_webhook_events; one state machine in subscription-store.ts with ordering guards; test/live mode separation (config-core, test_mode column). Stripe LMC top-ups: flag owner_only, no route exists.

## 6. Gated stack #2122 -> #2126 -> #2127 (open drafts)
- #2122: extracts the single apply primitive; no behaviour change.
- #2126 (head 0eef7f473): reconcileSubscription, bounded sweep (25/run, 45s budget, 30min cooldown, 10min stale), GET /api/cron/billing-recovery, GitHub cadence workflow.
  OPTION B: NOT IMPLEMENTED. Route gates are CRON_SECRET + billing state only. BILLING_RECOVERY_ENABLED does not exist. Only off-switch is the GitHub variable BILLING_RECOVERY_SCHEDULE_ENABLED (schedule, not server). A CRON_SECRET holder can trigger live Stripe reads and subscription writes. Batch/budget/cooldown/per-sub try-catch/mode match/stale ordering/audit idempotency are all preserved. Minimal diff: docs/consolidation/billing-option-b.patch.txt.
- #2127: POST /api/billing/refresh, session-only, no client input, subject-bound, same primitive (source user_refresh). Not covered by Option B as worded; decision flagged in the patch file.
- P1 payload.refs: NOT implemented on main or #2126. Webhook payload is {id,type,created[,summary]}. #2126's selector already reads payload.refs.subscription, so today every unprocessed event counts as unmappable. Extraction patch included (ids only, pattern-validated). Prod has 0 events; no backfill.

## 7. Other PRs
#895/#896/#897: draft RED docs+catalogue+gate+health engine; no migration/flag/Stripe change. #2010: draft RED fix for cookie-only entitlement subject over MCP; main still has the defect.

## 8. VERDICTS
1. ONE LMC source of truth: YES for ledger and balance (single append-only lmc_* ledger, derived balance, no second wallet). NO for the commercial layer: no price table, top-up amounts or action->cost map on main. LMC is built but unarmed.
2. Contradictions: (a) plan names code vs DB plans vs draft catalogue; (b) EUR 99 in DB plans and Stripe env, unreconciled; (c) PAYMENTS_ENABLED=false const vs adapter state enforced; (d) train doc says Stripe sells LMC top-ups, separation guard forbids a billing-API top-up surface (MDD-20); (e) referral/promo flags class admin where doc requires owner (MDD-18), referral lot perpetual (MDD-17); (f) #2126 described as inert while route is live with a secret.
3. Launch blockers on enabled paid features:
   B1 P0: MCP demand_create_confirm / demand_reopen_confirm: main gateOpenNeeds uses cookie entitlements; bearer resolves free_worker so every confirm is refused over_open_need_limit while billing is enforced. Fix = #2010.
   B2 P0 before #2126 merges: recovery writable by CRON_SECRET alone; apply Option B patch; keep BILLING_RECOVERY_ENABLED unset in prod.
   B3 P1: no webhook refs, so webhook-miss events cannot be mapped.
   B4: only three features are enforced; other plan claims are unenforced.
   B5: lmc_expire_lots_v1 has no scheduler and nothing calls spend/purchase; do not flip any lmc flag until price table (MDD-09/10/11), top-up route, VAT/refund policy exist. Safe today: all flags false, 0 rows.
   B6: triple plan catalogue can drift between pricing page and entitlement before the first paying customer.
