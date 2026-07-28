# Commercial Readiness Audit v1 — labourmarket.ai

| Field | Value |
|---|---|
| Date | 2026-07-28 |
| Branch | `feat/commercial-readiness-audit-v1` |
| Base | `main` @ `f6dc410b` |
| Production | https://labourmarket.ai · Supabase `gorgitwvdzxbnaxhrsrw` |
| Scope | The whole commercial chain: registration → profile → CV → LMC → matching → chat → workspace → Time Engine → payment → active subscription → full access |
| Stripe SDK / API | `stripe@22.2.1`, pinned API version **`2026-05-27.dahlia`** |

This audit **found and fixed real defects**. It did not create a new
architecture, a new billing system or a new LMC — every fix completes the
system that already existed. No migration was written, no production data was
changed, no flag was flipped, no Stripe object was created, no secret was set.

---

## 0. The one-paragraph answer

The payment chain was **built but broken in ways that would have cost money**,
and nobody could have seen it, because it has never run once: production still
holds **0 billing customers, 0 subscriptions, 0 webhook events** against 31
profiles. Six of the defects were not cosmetic — the pinned Stripe API version
no longer sends two fields the code read, so **every invoice event was a silent
no-op** (a failed payment never reached the subscription) and every billing
period was stored empty; subscription events carried **no owner and no plan**,
so entitlement depended on winning a race Stripe does not guarantee; a
**re-subscription** hit a unique index, the write was dropped, and Stripe was
still answered `HTTP 200` — a paid customer with no access and no alarm
anywhere. All six are fixed and pinned by tests that fail without the fix.
What is **not** fixed is everything that is not code: there is **no Stripe
account configuration, no price for any plan, no customer-portal configuration
and no payment/refund/cancellation clause in the Terms**. Those are owner
decisions, and they are the reason the verdict on taking real money is
**NO-GO**. Letting real people in to use the product **free** is **GO**.

---

## 1. What was found and fixed (code)

Each item below was verified against the pinned Stripe API types in
`node_modules/stripe`, and each is covered by a test that **fails when the fix
is reverted** (negative control run: reverting three of them turned 5 tests red).

### C-01 — Every invoice event was silently discarded · PAYMENT BLOCKER

`parseInvoiceObject` read `invoice.subscription`. That field was **removed** at
API version `2025-04-30.basil`; the pinned version is `2026-05-27.dahlia`, where
the value lives at `invoice.parent.subscription_details.subscription`. The read
returned `null`, `applyInvoicePayment` returned early, and **no invoice event
ever touched a subscription row** — a failed payment never produced `past_due`,
and a successful retry never restored access.

Fixed in `lib/billing/webhook-core.ts` (`parseInvoiceSubscriptionId`): canonical
location first, the removed top-level field and the per-line parent as
fallbacks, so replayed and older-API events still parse.

### C-02 — Every billing period was stored empty · HIGH

`Subscription.current_period_start/end` were removed in the same API change and
now live on `subscription.items.data[].current_period_*`. Every stored period
was `null`, which also made any period-based grace window impossible.
Fixed (`parseSubscriptionPeriod`), legacy shape still accepted.

### C-03 — Subscription events carried no owner and no plan · PAYMENT BLOCKER

Checkout set `metadata` on the **session**. Stripe does **not** copy session
metadata onto the subscription, so `customer.subscription.*` events arrived with
`metadata: {}` — no `client_reference_id`, no `plan_key`. The chain therefore
only worked if `checkout.session.completed` arrived *first*, which Stripe does
not guarantee. Fixed by also sending `subscription_data.metadata`
(`lib/billing/providers/stripe-test.ts`).

### C-04 — A late link event downgraded a paying subscriber · PAYMENT BLOCKER

`checkout.session.completed` carries no lifecycle status and was written as
`incomplete`. Arriving after `customer.subscription.updated (active)` it
**overwrote an active subscription with `incomplete`** and revoked entitlement
from someone who had paid. Fixed with explicit status precedence
(`shouldApplyStatus`, `{ fromLink: true }`); terminal states still win.

### C-05 — Re-subscribing after cancellation lost the payment · PAYMENT BLOCKER

`billing_subscriptions` carries `UNIQUE (owner_id, plan_key, provider)`
(verified live). A returning customer gets a **new** subscription id for the
same owner+plan, so the write hit `23505`, the store returned `"error"` — and
the route answered Stripe **`HTTP 200`**. Stripe recorded success, never
retried, and the customer had paid for nothing.
Fixed in `lib/billing/subscription-store.ts`: the owner+plan row is **rebound**
to the new subscription id (fresh period, cleared payment history). No migration
required — the constraint is respected, not removed.

### C-06 — A failed write was reported to Stripe as success · PAYMENT BLOCKER

Any store failure was swallowed into a 200. The webhook now answers **500** on a
genuine write failure so Stripe retries, and `recordWebhookEvent` distinguishes
a *settled* duplicate (ignore) from a *failed* earlier attempt (reprocess) — so
the retry is not dismissed as a duplicate. `needs-migration` stays a 200:
retrying cannot fix an unapplied migration.
(The retry deliberately does **not** delete the ledger row — the migration grants
service_role only SELECT/INSERT/UPDATE on `payment_webhook_events`.)

### C-07 — A paused subscription kept paid access forever · REVENUE LEAK

`paused` mapped to `past_due`, which is an *entitling* grace state: pausing —
a legitimate Stripe control that collects no money — granted indefinite free
paid access. Now maps to `unpaid`. The second pause mechanism,
`pause_collection` with `behavior: void|mark_uncollectible` (status stays
`active`), is treated the same way.

### C-08 — The `past_due` grace window was unbounded · REVENUE LEAK

`past_due` entitled forever. Now bounded: `PAST_DUE_GRACE_DAYS = 7` after the
period end (`withinPastDueGrace`), which is inside Stripe's own dunning
schedule. An unknown period end still grants grace — Stripe's own status
transition ends it.

### C-09 — A double-clicked checkout could open two subscriptions · MEDIUM

No idempotency key was sent. Now deterministic per `user+plan+price`
(`checkout:<uid>:<plan>:<price>`), so a second click returns the same session;
a price change still starts a new checkout. The known Stripe customer is also
reused, so a returning buyer does not accumulate duplicate customers.

### C-10 — No way to cancel, change a card or get an invoice · PAYMENT + LEGAL BLOCKER

There was no portal route, and `billing_customers` (applied, empty) was never
written, so even adding one later would have had no customer to address.
Added:
- `app/api/billing/portal/route.ts` — same gating as checkout; the customer id
  is resolved **from the session**, never from the request body;
- `upsertBillingCustomer` on checkout and on subscription events;
- **Manage billing** on `/dashboard/account`.

Under EU consumer rules, ending a subscription must be at least as easy as
starting it. This ships with checkout, not after it.

### C-11 — The checkout return landed on a page that said nothing · MEDIUM

`?billing=test_success` / `test_cancelled` were produced by the checkout route
and read by **no code at all**. `/dashboard/account` now acknowledges the return
(and `portal_return`), shows the real subscription status, period end,
cancel-at-period-end and grace state, and offers the portal — or the honest
"payments are not enabled" statement when billing is off.

### C-12 — `invoice.paid` was not handled · MEDIUM

Only `invoice.payment_succeeded` was in the handled set. `invoice.paid` is the
modern success event on the pinned API version; a webhook subscribed only to it
would have gone unprocessed. Added, plus recovery: a succeeded payment restores
`past_due`/`unpaid`/`incomplete` → `active` (the "customer fixed their card"
path), while a terminal row is never resurrected by a stray invoice event.

### C-13 — The LMC ledger had no product at all · LAUNCH BLOCKER for LMC

The ledger (10 tables, 18 `SECURITY DEFINER` RPCs) has been live in production
since 2026-07-21 with **zero** application code: no way to credit anyone, no way
for anyone to see a balance, and `lmc_expire_lots_v1` — the only mechanism that
sheds liability — had **no caller anywhere**. Added, as a seam over the existing
ledger and nothing more:

- `lib/lmc/ledger.ts` — read balance (RLS-scoped), read the **database** flag
  states, aggregate outstanding liability, and credit through
  `lmc_admin_grant_v1` **with the admin's own session** (the RPC checks
  `auth.uid()` + `is_admin()` itself; a service-role client would bypass that);
- `/dashboard/admin/billing` → **LMC ledger** panel: live kill-switch states,
  outstanding/promotional/purchased liability, and the credit form;
- `/dashboard/account`: the user's own balance — shown **only** when it is
  non-zero, with the non-cash statement, in all 5 active locales;
- `pnpm -C apps/web lmc:expire-lots` (+ `--dry-run`) — the missing expiry runner.

No new table, no new RPC, no new flag, no widened limit: the 1000-LMC cap and
the ≤365-day expiry are the ledger's own, mirrored not relaxed. A guard asserts
the application never calls `lmc_set_flag_v1`.

### C-14 — Documentation pointed the webhook at a retired host · OPERATIONAL

`docs/audits/stripe-test-activation-runbook.md` told the owner to register the
Stripe webhook at `labourmarketai.vercel.app` — a **retired** project. Following
it would have produced a silently dead chain. Corrected to
`https://labourmarket.ai/api/billing/webhook`, `invoice.paid` added to the event
list, and Steps 6 (portal + cancel/re-subscribe check) and 7 (LMC crediting)
appended.

### C-15 — Which entitlement engine to wire was ambiguous · MEDIUM

Two modules describe entitlement with different semantics. Wiring a runtime gate
to `gateFeature` (the plan-boundary evaluator, which cannot see a subscription)
would let a cancelled subscriber keep access. `lib/billing/entitlements.ts` now
states which engine is canonical for runtime enforcement (`hasFeature`) and why.
The duplication itself is left in place — `gateFeature` has a real consumer (the
readiness guard), so deleting it would be churn, not cleanup.

---

## 2. Verification

| Check | Result |
|---|---|
| `pnpm -F web typecheck` | **pass** |
| `pnpm -F web lint` | **pass** (0 errors; pre-existing warnings only) |
| `pnpm -F web build` | **pass** — `/api/billing/portal` registered |
| Full vitest suite | **770 files / 12 433 tests pass** (2 guards failed mid-work and were fixed, not silenced) |
| Negative control | Reverting C-01, C-04, C-07 turned **5** chain tests red; restored → green |
| Production DB | `billing_customers` 0 · `billing_subscriptions` 0 · `payment_webhook_events` 0 · `lmc_accounts` 0 · outstanding LMC 0 · all 6 LMC flags `false` · all 4 `plans.price_eur_monthly` `NULL` |

New tests:
- `lib/billing/commercial-chain.integration.test.ts` — the full chain against the
  **real store code** and an in-memory Postgres stand-in that enforces the same
  unique constraints as the applied migration: new user → checkout → active →
  entitled → failed payment → bounded grace → retry → active → cancel → not
  entitled → **re-subscribe** → entitled → sign-out/sign-in → still entitled;
  plus duplicate delivery, failed-event retry, paused, `pause_collection`,
  out-of-order events, upgrade, and stray-invoice resurrection.
- `lib/guards/commercial-readiness.test.ts` — pins every fix above.
- `tests/e2e/commercial-chain.spec.ts` — browser walk of the public and
  signed-in surfaces. It asserts the **honest disabled** branch while payments
  are off and automatically switches to asserting the **paid** branch once a
  valid Stripe TEST config exists. It cannot and does not fake a payment.

---

## 3. Requested E2E scenario — where it stands

> new user → registration → LMC → Stripe → webhook → active subscription →
> full rights → sign out → sign in → rights persist

| Step | Provable today | How |
|---|---|---|
| Registration + sign-in | **Yes** | existing auth E2E |
| LMC credit | **Blocked on one owner action** — the product path is complete; `lmc_promotional_grants_enabled` is `false` in the database and only the owner can flip it (service_role) | admin panel refuses honestly until then |
| Stripe checkout | **No** — no Stripe configuration exists | `payments_disabled` |
| Webhook → active subscription | **Yes, deterministically** — not in a browser | `commercial-chain.integration.test.ts` |
| Full rights after payment | **Yes** (for the one server-gated feature, `booking_requests`) | same test |
| Sign out → sign in → rights persist | **Yes** | same test + E2E spec |

The transactional half is proven against the real code and the real constraints.
The browser half becomes provable the moment the owner supplies Stripe TEST
keys — no further code is required for that.

---

## 4. GO / NO-GO

| # | Area | Status | Why |
|---|---|---|---|
| 1 | Registration → profile → CV → chat → workspace → Time Engine | **READY** | unchanged by this audit; covered by the existing suites |
| 2 | Nothing can charge a user by accident | **READY** | four independent layers: kill-switch, config resolver, live hard-block, noop provider |
| 3 | Webhook security (signature, live-event rejection, idempotency) | **READY** | verified before any business logic; guard-pinned |
| 4 | Webhook correctness (parsing, ordering, retries, re-subscription) | **READY** | C-01…C-06, C-12 fixed + tested |
| 5 | Subscription lifecycle (create, fail, retry, cancel, re-subscribe, upgrade) | **READY** in code | never executed against real Stripe |
| 6 | Customer self-service (cancel / card / invoices) | **READY** in code · **PARTIAL** in practice | needs the Stripe portal configuration saved once in the dashboard |
| 7 | Entitlement is not leaked (paused / grace / cancelled) | **READY** | C-07, C-08 |
| 8 | Entitlement enforcement breadth | **PARTIAL** | only `booking_requests` is server-gated; 12 of 19 feature keys are declared-only. Not a blocker to a paid journey — nobody is *stopped* — but a paying and a free user get the same product for most features |
| 9 | Stripe account, products, prices, webhook endpoint, env | **NOT READY** | nothing is configured anywhere (owner) |
| 10 | A price for any plan | **NOT READY** | all four `plans.price_eur_monthly` are `NULL`; Worker Plus has no price in copy, DB, code or Stripe. A Stripe price object cannot be created without an amount (owner) |
| 11 | One coherent plan catalogue | **NOT READY** | two disjoint catalogues render on `/pricing` (owner decision) |
| 12 | Terms: payment, refund, cancellation, consumer withdrawal | **NOT READY** | the Terms say invoices are issued and payments received, and contain **no** payment, refund, cancellation or withdrawal clause. Taking money under them is exposed (owner + legal) |
| 13 | Invoice records / refunds / disputes | **PARTIAL** | invoices exist in Stripe and via the portal; no `billing_invoices` table, and `charge.refunded` / `charge.dispute.*` are recorded but not acted on |
| 14 | Company/agency subscriptions bound to an organisation | **NOT READY** | checkout binds a subscription to a person; B2B tiers are not sellable in a form a company would accept (needs the org-binding migration) |
| 15 | LMC: credit a tester | **PARTIAL** | the product path is complete and safe; one owner flag flip away |
| 16 | LMC: a tester can *use* the credit | **NOT READY** | `lmc_spending_enabled` is false **and** nothing in the product is priced in LMC — a credited balance is currently visible but unusable |
| 17 | LMC liability is measured and shed | **READY** in code | admin liability panel + expiry runner; the runner still needs a schedule |
| 18 | LMC governance (flag classes, no-MLM structure) | **PARTIAL** | referral + promotional grants are class `admin`, not `owner_only`; the no-MLM guarantee is documentary, not a schema invariant. Zero exposure today (no referral schema exists) |

### The three questions asked

**Can real users be let in tomorrow?** — **YES, for free use.** Nothing in the
product can charge anyone; every paid surface degrades honestly. This audit made
that safer, not weaker.

**Can LMC be credited to every tester safely?** — **Technically yes, after one
owner action** (`lmc_promotional_grants_enabled → true`), and it is safe: capped
at 1000 LMC per grant, mandatory expiry ≤ 365 days, idempotent, immutable,
admin-only, fully auditable. **But it is not yet useful**: spending is frozen by
a separate flag and nothing in the product is priced in LMC, so a tester would
see a balance they cannot spend. Crediting before a spend surface exists creates
a euro-denominated liability with no product behind it. **Recommendation: do not
credit LMC yet.**

**Can real payments be accepted?** — **NO.** Not because of code: because there
is no Stripe configuration, **no price for anything**, no portal configuration,
and no Terms covering payment, refund or cancellation. The first two make it
technically impossible; the third and fourth make it legally unwise.

### Verdict

- **GO** — free real-user testing on production, today.
- **NO-GO** — taking real money, until §5 OG-1…OG-5 are done.
- **NO-GO (recommended)** — crediting LMC, until it can be spent.

The code side of the paid chain is now, to the best of this audit's ability,
correct: the defects that would have taken money without granting access are
closed and pinned. What remains is owner input, not engineering.

---

## 5. Owner gates — the exact remaining work

| # | Gate | Blocks | Notes |
|---|---|---|---|
| OG-1 | Choose ONE plan catalogue and final tier names | 11 | `/pricing` currently shows two disjoint sets |
| OG-2 | Set the price for every paid plan | 10, 9 | nothing can be created in Stripe without an amount |
| OG-3 | Create the Stripe TEST account objects (3 products + prices, webhook endpoint at `https://labourmarket.ai/api/billing/webhook`, events incl. `invoice.paid`) and set the 9 env values in Vercel | 9 | step-by-step in `docs/audits/stripe-test-activation-runbook.md` |
| OG-4 | Save a Customer portal configuration in Stripe (Settings → Billing → Customer portal) | 6 | without it the portal API errors and the button reports it honestly |
| OG-5 | Commission the Terms addendum: price/VAT, payment, renewal, cancellation, consumer 14-day withdrawal, refunds, success/coordination fee | 12 | must be owner/lawyer wording, never agent wording |
| OG-6 | Decide whether LMC gets a spend surface before any credit is issued | 15, 16 | crediting without spending = liability with no product |
| OG-7 | Reclassify `lmc_referrals_enabled` + `lmc_promotional_grants_enabled` to `owner_only` | 18 | needs a migration |
| OG-8 | Schedule `pnpm -C apps/web lmc:expire-lots` (daily) | 17 | the liability-shedding job |
| OG-9 | Org-bound B2B subscriptions (additive `organization_id` migration) | 14 | company/agency tiers |
| OG-10 | LIVE Stripe activation | everything | only after OG-1…OG-5; live is DB- and code-blocked until then |

Nothing above was performed by this session, and none of it can be: they need
credentials, money decisions, legal wording, or a production migration.

---

## 6. Deliberately not done

- **No migration was written.** Every fix works against the schema as applied.
  The org binding (OG-9) and the LMC flag reclassification (OG-7) genuinely need
  one and are left to an owner-gated slice.
- **Entitlement enforcement was not broadened.** Wiring 12 feature gates blind,
  without the catalogue and price decisions (OG-1/OG-2), would have changed what
  existing pilot users can do — a product decision, not an audit fix.
- **No price, plan name or fee was invented.** Where a number was missing, the
  report says it is missing.
- **No flag was flipped and no Stripe object created.**

---

*Audit and fixes: `feat/commercial-readiness-audit-v1`. Nothing in production
was changed by this session.*
