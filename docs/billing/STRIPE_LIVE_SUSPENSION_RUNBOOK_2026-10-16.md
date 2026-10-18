# Stripe — safe suspension of NEW live charging (prepared 2026-10-16, nothing executed)

Owner direction (2026-10-16): prepare a safe suspension of new live charging
until the actual payment state and webhook processing are independently
verified; change no production payment setting without explicit authorization.
This runbook is that preparation. **No step below has been executed.** The
agent cannot read the Stripe dashboard; the facts are database reads only.

## 1. Measured state (production database, read-only, 2026-10-16 ~20:30 UTC)

| Fact | Value |
|---|---|
| `billing_customers` created by the app | 3 |
| `billing_checkout_operations` (all `test_mode = false`) | 3 — 1 `expired`, **2 `open`** |
| `billing_subscriptions` | 0 |
| `payment_webhook_events` | **0 — no webhook has ever been recorded** |
| `lmc_settings.live_payments_enabled` | `false` (last changed 2026-07-21); the other six LMC flags also `false` |
| Billing adapter state in code | `stripe_live` resolves only with `STRIPE_LIVE_ACTIVATION` present in the deployed env + the code constant + a complete live key set (`lib/billing/config-core.ts`) |

Reading: a checkout operation is closed only by a webhook; none has arrived.
The two `open` rows cannot be told apart from "paid, trial started" on our
side — only the Stripe dashboard can (owner Step 0 below).

## 2. Two containment options (owner chooses one; both reversible)

| Option | Who | Effect on NEW live checkouts | Effect on webhook / portal / existing subscriptions | Re-arm |
|---|---|---|---|---|
| **A — code gate, RED PR #2441** (`fix/cc/stripe-live-second-act-red`, billing class, no migration, no env change) | owner approves + merges; Claude cannot auto-merge a RED PR | refused with 503 `live_not_enabled` while `lmc_settings.live_payments_enabled = false` | webhook keeps verifying and recording; portal and refresh keep working — the webhook proof can still be run | flip the one owner-only DB flag after the proof |
| **B — env disarm** | owner, hosting env (Vercel today; the restored host tomorrow) | none possible (`stripe_live_blocked`) | **webhook also rejects** — a live subscription, if one exists, stays invisible until re-armed; entitlement enforcement switches off (nobody locked out) | one env change back |

Recommendation: **A first** (keeps the verification path alive), B only if
the owner wants zero live code paths during hosting restoration. A and B
compose; neither touches Stripe itself.

## 3. Independent verification the owner performs BEFORE re-arming (read-only, ~15 minutes)

1. Stripe dashboard (live mode) → Customers: the three app-created customers —
   any subscription, invoice or payment? Note ids only.
2. Checkout sessions of 2026-09-22 ~07:33 UTC and 2026-10-02 ~16:08 UTC —
   `expired` or `complete`?
3. Developers → Webhooks: is `https://<apex>/api/billing/webhook` registered in
   LIVE mode, which events, and does the signing secret match the deployed
   `STRIPE_WEBHOOK_SECRET`? (Compare presence and prefix `whsec_` only — never
   paste the value anywhere.)
4. If 1 or 2 shows a real payment: cancel/refund in Stripe; the entitlement, if
   owed, is granted through the existing admin override path
   (`manual_override_plan_key`) — no code change.

## 4. Proof of webhook processing (after hosting is restored, before any re-arm)

- Smallest live charge + immediate refund, by the owner, on a test customer.
- Expected on our side within a minute: **one** new `payment_webhook_events`
  row (signature verified, mode = live) and **one** `billing_subscriptions`
  row; the matching `billing_checkout_operations` row leaves `open`.
- Then enable the recovery cadence (`BILLING_RECOVERY_ENABLED` /
  `BILLING_RECOVERY_SCHEDULE_ENABLED`, names only — values are the owner's).
- Only then: owner decision N-1 (re-arm) → flip `live_payments_enabled`
  (option A) or restore the env (option B).

## 5. What the agent did and did not do

Did: read the counts above; read the code paths; re-checked #2441's scope
(route gate before any provider call; route tests present). Did not: touch
Stripe, env, DNS, hosting, any flag, or merge anything.
