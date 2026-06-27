# Manual paid-launch runbook + final authenticated smoke

Date: 2026-06-28. Owner-operated. **No automated payments are introduced or
required.** This runbook explains how to onboard a *paying* pilot using ONLY the
surfaces that already exist: off-platform payment collection + the superadmin
**manual grant** on the admin billing page. The automated-payment pipeline stays
the next-sprint, owner-gated work — see the pointers in §5.

> If you want to *collect money inside the app* (checkout, Stripe, invoices),
> that is the RED billing sprint, not this runbook. See
> `stripe-next-sprint-handoff.md`. Nothing here flips `PAYMENTS_ENABLED`.

---

## 1. Posture (verified in code — unchanged by this doc)

- Payments are **off by default and live-blocked**: `lib/billing/config-core.ts`
  forces `stripe_live_blocked` on any live mode/key; `PAYMENTS_ENABLED` stays
  false. Enforced by `lib/guards/no-live-payments.test.ts`.
- There is **no in-app checkout, no invoice generation, no card capture**.
- The only paid-access mechanism today is a **manual grant** written to
  `billing_subscriptions` with `test_mode = true` and a `manual_…`
  `provider_subscription_id` (never a real charge).

So a "paid launch" right now means: **the owner agrees a price and collects
payment OFF the platform** (existing invoicing / bank transfer), then **manually
grants** the plan so the pilot gets their entitlement. No money moves through the
app.

## 2. Existing surfaces this runbook uses (do not rebuild)

- `app/[locale]/dashboard/admin/billing/page.tsx` — superadmin billing center
  (`requireSuperadmin`): shows config state (`disabled` / `stripe_test` /
  `stripe_live_blocked`), recent subscriptions + webhook events, payment-readiness
  blockers, and the **manual pilot grant / revoke** form.
- `lib/admin/billing-actions.ts` — `grantPilotAccessAction({ locale, ownerId,
  planKey })` and `revokePilotAccessAction(...)`. Grant upserts an `active`,
  `test_mode: true`, `manual_<uuid>` row on `billing_subscriptions`; revoke sets
  `status: 'cancelled'` on the `manual_%` row only. Superadmin-gated; honest
  `needs_migration` / `invalid_plan` / `error` results.
- `lib/billing/plans.ts` — the plan slugs. Paid pilot plans (the ones a grant
  accepts, `accessState = "payment_not_enabled"`) are the non-free tiers, e.g.
  `company_pilot` / `agency_pilot` / `worker_plus`.

## 3. Manual paid-launch procedure (per pilot)

1. **Agree price off-platform.** Owner and pilot agree scope + price in writing
   (email / contract). No in-app pricing copy implies an active charge.
2. **Collect payment off-platform.** Use the owner's existing invoicing / bank
   transfer. Record proof outside the app. (The app records no payment.)
3. **Identify the pilot's `ownerId`.** In `/dashboard/admin/users/[id]` (or the
   admin overview) find the pilot's profile id.
4. **Grant the plan.** On `/dashboard/admin/billing`, use the manual grant form
   (→ `grantPilotAccessAction`) with the pilot's `ownerId` and the agreed paid
   plan slug.
5. **Verify the grant.** Confirm a new `billing_subscriptions` row appears:
   `status = active`, `test_mode = true`, `provider_subscription_id` starts with
   `manual_`. The page must still label billing **test / disabled** — never
   "live" or "revenue".
6. **Confirm entitlement.** The pilot's gated features resolve from the granted
   plan's entitlements. (No feature claims a real charge happened.)
7. **On churn / refund / end of term.** Use revoke (→ `revokePilotAccessAction`)
   to set the `manual_%` row to `cancelled`; settle any refund off-platform.

**Honest boundaries (must hold):** no in-app "pay now" / "subscription active"
to the pilot as if automated; no live keys; no fake unlock; the manual grant is
an admin operation backing an OFF-platform agreement, and the billing surface
keeps saying test/disabled.

## 4. Final authenticated smoke checklist

Run logged in on production (`https://labourmarket.ai`). Pairs with the
unauthenticated `first-users-checklist.md` (public 200s, identity, worker/company
paths, map signal-only, payments-being-prepared copy, mobile). This list covers
the authenticated identity/profile/marketplace/admin surfaces, including the
recent train (#538–#541).

- [ ] **Player card identity** (`/dashboard/journal`): the card shows your real
      avatar or honest initials (`•` when no name) + name + profession — no
      fabricated face/score.
- [ ] **Profile completion** (`/dashboard/profile`): the hub shows honest
      CV/skills/journal status from real data; no percentage; the "not verified"
      disclaimer is present.
- [ ] **CV import is discoverable**: when no CV text is saved, the hub shows the
      "Add your CV — paste or upload" link → it lands on the in-page editor with
      the paste/upload panel (file is not stored).
- [ ] **Marketplace requester tile** (`/dashboard/service-requests`, provider
      with an incoming request): the requester shows display-name + initials only
      (no email/phone/extra identity).
- [ ] **Admin gate** (`/dashboard/admin`): a non-admin is redirected to login
      (no 500, not visible); a superadmin sees the operational dashboard.
- [ ] **Manual billing round-trip** (`/dashboard/admin/billing`, superadmin):
      config state reads test/disabled; a manual grant to a test owner creates an
      `active` `test_mode` `manual_…` subscription row; revoke cancels it. No
      "live"/"revenue" wording anywhere.
- [ ] **No automated payment surfaced** anywhere: no checkout, no "pay now", no
      "subscription active" implying a real charge.

## 5. Pointers (do not duplicate)

- `payment-logic-before-stripe.md` — the inert plan/entitlement model.
- `stripe-next-sprint-handoff.md` — the owner-gated automated-payment sprint
  (checkout → webhook → subscription → entitlement → invoices).
- `first-users-checklist.md` — the unauthenticated pre-invite owner smoke.
- `admin-operator-guide.md` — broader admin operations.
- `docs/audits/launch-readiness-source-audit-v1.md` — the drift gate; the paid
  launch cutline lives there (§5/§6).
