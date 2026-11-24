# BILLING SUBJECT MODEL V1 — M-P0-7 (owner directive 2026-08-06 §13)

State target: `STRIPE_MULTI_SUBJECT_TEST_MODE_MODEL_CODE_COMPLETE_PENDING_OWNER_GATES`

## Canonical subject

| §13 requirement | Canonical home |
|---|---|
| `subject_type = profile \| organization` | DERIVED, one rule: `origin_organization_id IS NULL` ⇔ profile subject; `organization_id = <org>` ⇔ organization subject (PR #844 migration `20260721150000`, owner-gated, UNAPPLIED) |
| `subject_id` | `owner_id` (profile subject) / `organization_id` (organization subject) |
| payer profile | `billing_subscriptions.owner_id` — always a real person; the Stripe customer is per-PAYER (`billing_customers.owner_id`) |
| billing authority | the §11 capability matrix's **`manage-billing`** — owner/admin ONLY (added by this slice); membership alone is NEVER billing authority |
| Stripe customer id / subscription id / plan | `provider_customer_id` / `provider_subscription_id` / `plan_key` (unchanged columns) |
| entitlement subject | the ACTIVE WORKSPACE's billing subject (`resolveBillingSubject()` → `getEffectiveEntitlements()`) |

## Behaviour (each §13 line, and where it is enforced)

- **Personal plan + pay for A + pay for B, same plan key in both** — storage: #844's
  partial uniques (`(owner_id, plan_key, provider) WHERE origin_organization_id IS NULL`
  + `(organization_id, plan_key, provider)`) replace the blocking
  `unique (owner_id, plan_key, provider)`; until applied, `subscription-store.ts`
  keeps its honest `conflict-live-subscription` refusal (never clobbers).
- **Cancel/resubscribe in A cannot overwrite B** — per-organization rows + the
  webhook upsert keyed on `provider_subscription_id`.
- **Membership ≠ billing authority** — `resolveBillingSubject().billingAuthority`
  is `hasOrganizationCapability(role, "manage-billing")`: owner/admin true;
  manager/external_manager/member false; engagement-only workers resolve a
  PERSONAL subject inside any workspace (employment is never billing power).
- **Workspace selection determines the PROPOSED billing subject** —
  `apps/web/lib/billing/billing-subject.ts`: Personal → profile subject;
  organization workspace → that organization (via
  `resolveEmployerCompanyContext()`, membership-truth chain).
- **Server validates billing role** — the same resolver runs server-side on
  every checkout/portal/entitlement read; no client field names a subject.
- **Webhook metadata binds and verifies the subject** — #844
  `metadata-core.ts`: `owner_id` + optional `organization_id` on session AND
  `subscription_data`; the webhook store writes exactly that binding.
- **No entitlement transfer on workspace switch** —
  `getEffectiveEntitlements()` reads ONLY the active subject's rows:
  organization workspace → `eq(organization_id, subject)`; personal →
  `owner_id = uid AND origin_organization_id IS NULL`. Feature-detected
  (42703): unapplied schema ⇒ org subject has zero rows (free) and the
  personal query falls back to the legacy owner-only shape — behaviour is
  byte-identical to today until the owner gate opens.

## What this slice deliberately does NOT do

- No migration (the schema half lives in owner-gated PR #844; its
  `org-membership.ts` binding still reads `engagement_contexts` and must move
  to `company_memberships` when #844 rebases — recorded there).
- No Stripe Live, no prices, no charges, no provider calls added
  (`config-core.ts` keeps live unreachable; untouched).
- No LMC coupling (all six `lmc_settings` flags stay false; separation guard
  untouched).

## Remaining owner gates

1. Apply #844's `20260721150000` (multi-subject schema) — human gate.
2. Stripe TEST credentials + products/prices + webhook endpoint
   (`BLOCKED_EXTERNAL_STRIPE_TEST_CREDENTIALS`, recorded on #844).
3. Rebase #844's membership binding onto `company_memberships` + the
   `manage-billing` capability.
