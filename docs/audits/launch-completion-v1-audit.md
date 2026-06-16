# Launch Completion v1 — Audit (before Stripe)

Goal: make Labourmarket.ai ready for the first real users (people + companies),
**before** Stripe. Live billing stays disabled/inert this sprint. Active locales:
LT / EN / RU. Repo: `C:\Users\Mano\Documents\labourmarketai`.

Baseline = `main` after #426 (systemic UX/roles/skills/map/comms) and #427
(work-market atlas core). This audit drives the launch PR train (A–E).

Legend: **OK** works · **MISLEAD** confusing copy/CTA · **HIDE** should be hidden
until real · **FIX** small fix now · **FUTURE** later · **STRIPE** belongs to the
Stripe sprint.

## Area-by-area

| Area | State | Finding | Action |
|---|---|---|---|
| Public LT/EN/RU | OK | apex 307→/lt; /lt,/en,/ru 200; robots+sitemap 200 (smoke verified) | — |
| Onboarding | OK | person-first; company is a start path; no agency/buyer identity | explain (PR B) |
| Personal account (Asmuo) | OK | base identity; actions = work/buy/sell/rent/help | explain (PR B) |
| Company account (Įmonė) | OK | base identity; actions = hire/buy/sell/rent/need/projects | explain (PR B) |
| Worker flow | OK | profile → journal → skills → opportunities | explain (PR B) |
| Company flow | OK | need → criteria → review → request | explain (PR B) |
| Profile | OK | CV/skills/journal unified; honest "not verified" | explain (PR B) |
| Documents / readiness | OK (model) | eligibility model honest (no docs abroad → not "ready abroad") | surface badges (PR B/D) |
| Work journal | OK | Save now runs skill recognition + links declared skills (#426) | explain (PR B) |
| Skills recognition | OK | runs on Save; LT lexicon widened; signal, not fact | label as signal (PR B) |
| Evidence / trust | OK | deterministic status (none/some/all), no contradiction (#426) | explain (PR B) |
| Company needs | OK | structured demand intake; dark pickers (#426) | — |
| Opportunities | OK | worker board; visibility policy honest | explain (PR B) |
| Marketplace | FUTURE | atlas model exists (#427); no offer object / UI yet | STRIPE-independent next PRs |
| Map / market-map | OK | signal-only; no fake markers; verified-coords-only marker rule | explain (PR B) |
| Communication / inbox / project chat | OK | project chat CTA → real inbox `/dashboard/communication` (#426) | explain (PR B) |
| Admin | OK | fail-closed layout (#426); `/dashboard/admin` → 307 login (smoke) | — |
| Legal pages | PARTIAL | privacy/terms/cookies exist | add marketplace rules + payment-not-active (PR D) |
| Pricing / payment copy | MISLEAD-RISK | billing disabled by default; must say so honestly | payment-not-active copy (PR C) |
| All CTAs | FIX | every CTA must be: real, disabled-with-reason, or hidden | CTA cleanup (PR B) |
| Mobile | OK | overflow + dark pickers fixed (#426) | spot-check (PR E) |
| Desktop | OK | — | spot-check (PR E) |

## What works / misleads / hide / fix / future / stripe

- **Works:** identity model (Asmuo/Įmonė + actions), journal→skills→evidence,
  signal-only map, project location + chat, fail-closed admin, atlas model,
  billing-disabled safety (live impossible to activate).
- **Misleads (to fix):** any pricing/paid copy that implies active payments;
  any "ruošiama" without a plain explanation; marketplace surfaces that imply a
  live offer marketplace before the offer object exists.
- **Hide until real:** marketplace offer creation/publish (no moderation/offer
  model yet); any paid-unlock affordance.
- **Fix now (this train):** user-facing explanations for every active feature;
  CTA states; honest payment-not-active copy; marketplace rules + legal;
  localization sweep (no LT-in-EN/RU, no internal terms).
- **Future (post-launch, pre/within other sprints):** marketplace offer object,
  brigade calendar, trust/moderation queue, action radar, rate map.
- **Stripe sprint (NOT now):** checkout, real billing, paywall unlocks,
  subscription state, invoices/receipts/refunds. Documented as a handoff only.

## Billing posture (verified, unchanged this sprint)

`lib/billing/config-core.ts`: provider **disabled by default**; **LIVE is
impossible to activate** (live mode or `sk_live_/pk_live_/rk_live_` →
`stripe_live_blocked`, `paymentsEnabled=false`). No Stripe/billing keys in
`.env.local`. Enforced by `guards/no-live-payments.test.ts` (strengthened, never
disabled). **This sprint changes none of it** — it only adds honest UI/doc copy.

## PR train

- **PR A (this):** launch audit + `docs/launch/` package + launch guards
  (docs-exist, billing-disabled, stripe-handoff-exists-not-connected).
- **PR B:** user-facing explanations + CTA cleanup (real / disabled-with-reason /
  hidden).
- **PR C:** payment logic before Stripe (plans/entitlement/billing-status model,
  all inert) + honest "payments being prepared" copy + billing-disabled guards.
- **PR D:** legal / marketplace rules / help / FAQ + localization cleanup.
- **PR E:** launch readiness smoke + first-users owner checklist.

Every PR: typecheck · lint · tests · build · migration-safety · i18n parity ·
no-old-names · no-external-names · no-fake/demo copy · no-standalone-agency/buyer ·
no-live-payments · `git diff --check`. No DB apply, no Stripe, no merge without
owner approval.
