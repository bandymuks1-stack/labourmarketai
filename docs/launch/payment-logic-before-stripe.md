# Payment logic before Stripe (all inert)

This stage prepares the *logical model* for pricing, plans and entitlements
**without connecting any payment provider**. Everything here is **disabled /
none / inert** and clearly marked as not yet active.

## Current billing posture (verified in code)
- `lib/billing/config-core.ts`: provider **disabled by default**.
- **LIVE is impossible to activate**: a live mode or a live key shape
  (`sk_live_/pk_live_/rk_live_`) forces `stripe_live_blocked`, `paymentsEnabled=false`.
- No Stripe/billing keys in `.env.local`.
- Enforced by `guards/no-live-payments.test.ts` (strengthened, never disabled).
- **This sprint changes none of it.**

## Plan / entitlement model (inert)
- **Free tier** (default for all early users): full network preview while the
  network is small (< ~1000 active users); core profile, journal, needs, map signals.
- **Future paid tiers** (verified / business): wider map visibility, priority
  surfaces, advanced marketplace features — **only described, never enforced**
  until billing is live.
- **Entitlement matrix**: maps a tier → features. Until billing is live the
  resolver behaves as if everyone is free; paid widening is flagged as a *fake
  unlock* and never applied (see `lib/work-market/visibility.ts`).

## Monetization logic by surface (described, not active)
- **Worker:** free profile/journal; future: highlighted availability, verified badge.
- **Company:** free needs/projects; future: wider talent reach, priority demand.
- **Marketplace:** future: featured offers, verified seller — gated by moderation.
- **Map:** free signals; future: wider visibility scope by tier.
- **Communication:** free inbox; future: higher limits.

## Billing status model (states to document, all inert now)
`payment pending` · `active` · `cancelled` · `failed` — documented for the Stripe
sprint; none are produced today.

## Invoice / receipt / refund / cancellation
- Documented as *future* flows for the Stripe sprint. No invoices/receipts are
  generated now; no refunds because no charges exist.

## Honest UI copy (this stage)
- "Mokėjimai ruošiami" — payments are being prepared.
- "Stripe bus prijungtas kitame etape" — Stripe is connected in the next stage.
- "Kol kas pirmi vartotojai jungiami rankiniu / owner-review būdu."
- "Mokama prieiga dar neaktyvi" — paid access is not active.

See [stripe-next-sprint-handoff.md](./stripe-next-sprint-handoff.md).
