# Launch Readiness — Source Audit v1

Date: 2026-06-28. Type: **source-grounded inventory + drift gate.** No code,
UI, DB, or behaviour changed to produce this file.

**Why this file exists.** The project has accumulated fragment PRs that add a
surface and then later repair it. Before any further Player Card / profile /
onboarding / admin / payment implementation, this audit fixes — from the actual
source — what already exists, what must NOT be rebuilt, and the narrow set of
PRs that are allowed next. It consolidates (does not contradict) the prior
launch audits listed in §9.

> Governance rule: **no agent may start a new Player Card / profile / onboarding
> / admin / payment implementation unless that exact work is listed under §7
> "Allowed next PRs".** Anything else is drift and must be refused with a pointer
> to this file.

---

## 1. Executive cutline

There are **two different launch lines**; conflating them is the main drift risk.

- **Free first-users line — already reached.** Prior audits (§9) and current
  source agree: the core cycle (worker → profile/player-card → journal → skills
  evidence → company need → scouting → manager confirmation) renders with honest
  empty states, no fake data, and payments inert by guard. This line is GO,
  pending only owner-side production verification + manual first-user approval.
- **First *paid* launch line — NOT reached.** The only thing standing between
  "free first users" and "collect money" is a real billing pipeline, which is
  deliberately **hard-blocked** today (`PAYMENTS_ENABLED` off by default; live
  Stripe keys rejected by the config resolver). That is the **paid-launch
  cutline**, and it is RED / owner-gated (§5, §6).

**Therefore the next work is NOT new identity/profile features.** The identity,
completion, readiness, player-card and CV-text surfaces already exist (§2, §3).
The remaining value is **adoption/consolidation** of what exists (§7) — and, when
the owner opens it, the payment sprint (§6). Building another profile-completion
or player-card surface now would duplicate live code.

---

## 2. Existing surfaces inventory (verified in source)

### Identity & player card (canonical foundation)
- `apps/web/lib/identity/player-identity.ts` — visual identity contract
  (initials, fallback tile, avatar scale, 7 variants).
- `apps/web/lib/identity/player-card-minimum.ts` — **minimum field contract**
  (`buildPlayerCardMinimum`, PR #536). Pure, null-safe; not yet adopted by a UI.
- `apps/web/components/app/worker-player-card.tsx` — the **real** premium
  scouting self-view card; live on `/dashboard/journal` (`#mano-cv-identity`).
- `apps/web/components/app/player-card.tsx` — **marketing showcase only**
  (mock/illustrative data); used by `(marketing)/for-workers` +
  `components/marketing/player-card-showcase.tsx`. **Not** a real worker surface.
- `apps/web/components/app/avatar-display.tsx` — shared avatar (photo or honest
  initials monogram), already adopting the visual foundation.

### Profile / completion / guidance (ALREADY a full system)
- `apps/web/app/[locale]/dashboard/profile/page.tsx` — the unified profile route;
  imports and renders `ProfileHubOverview` as the consolidated lead (page comment:
  "P0 profile rescue: the ProfileHubOverview above is the [consolidated hub]").
- `apps/web/components/app/profile-hub-overview.tsx` — **primary completion hub**:
  3-pillar status (CV / skills / journal) + skill-evidence counts + one honest
  next action.
- `apps/web/components/app/profile-cv-clarity-card.tsx` — step checklist
  (added / to-add), no aggregate %.
- `apps/web/components/app/profile-process-assistant.tsx` — known vs missing
  signals + suggested next actions with reasons (suggestion-only).
- `apps/web/components/app/work-card.tsx` + `lib/worker/work-card.ts` +
  `lib/worker/work-card-state.ts` — state-aware 5-dimension worker card
  (clear / missing / one next action; new / returning / stale).
- `apps/web/components/app/worker-readiness-panel.tsx` +
  `apps/web/components/app/readiness-ring.tsx` — 6-pillar readiness checklist +
  visual met/total ring (never a %, never a rating).
- `apps/web/components/app/my-zone.tsx` — dashboard incomplete/ready badge.
- Pure logic already in place: `lib/profile/profile-next-action.ts`,
  `lib/process-brain/profile-process-brain.ts`, `lib/player-card/readiness.ts`
  (`deriveWorkerReadiness`, `missingReadinessPillars`),
  `lib/player-card/readiness-steps.ts`, `lib/dashboard/next-action.ts`.

### CV (text extraction is REAL; import/store is NOT)
- `apps/web/app/api/cv/extract/route.ts` + `apps/web/lib/cv/extract.ts` +
  `apps/web/lib/cv/cv-import-client.ts` — auth-gated upload → server-side text
  extraction (PDF via unpdf, DOCX via mammoth, TXT). 5 MB cap. **No storage of
  the file**; extracted text feeds the existing deterministic skill parser →
  `profile_skill_claims`.
- `apps/web/components/app/cv-input-panel.tsx` + `cv-import-upload.tsx` — live
  text-first entry (upload or paste) on `/dashboard/profile`.
- `apps/web/lib/cv/types.ts` + `lib/cv/normalize.ts` — M2 import shapes,
  **stubbed (throws not-implemented)**. No normalization/AI extraction yet.
- `apps/web/components/app/cv-engagement-cards.tsx` — **orphan** (only types
  imported; rendering duplicated inside `capability-profile-section.tsx`).

### Marketplace (live, no money)
- `/dashboard/services` (provider offerings) + `/dashboard/service-requests`
  (discover/request/inbox); free-text `rate_text` only, **no price/transaction**.
  Reachable + hardened by PRs #533–#535. Provider identity on discover is RED
  (needs a provider-display RPC).

### Market map (signal-only)
- `apps/web/components/app/market-map-*.tsx` — aggregated/own signals; exact
  markers gated by existing permissions (verified coords only). No new cross-user
  identity read without RLS/RPC.

### Bookings (live, no money)
- `/dashboard/bookings` + `lib/booking/*` + `booking_requests` — propose / accept
  / decline / withdraw, conflict-safe, entitlement-gated. No payment attached.

### Admin / owner monitoring (ALREADY a full operational dashboard)
- `apps/web/app/[locale]/dashboard/admin/` — superadmin-gated control room with
  ~15 sub-pages (overview KPIs, billing, company-verification, need-structuring,
  matching, candidate-pool, market, readiness, telemetry, users/[id], …). Real
  data, honest empty states.

### Payments (test-mode only, live hard-blocked)
- `apps/web/lib/billing/config-core.ts` + `config.ts` — `PAYMENTS_ENABLED` off by
  default; resolver forces `stripe_live_blocked` on any live key/mode.
- `apps/web/lib/billing/plans.ts` + `entitlements*` — 5 plans, manual-grant only,
  paid plans = `payment_not_enabled`.
- `supabase/migrations/20260613200000_billing_test_mode_records.sql` —
  `billing_customers` / `billing_subscriptions` / `payment_webhook_events`
  (`test_mode = true` always).
- `apps/web/app/[locale]/dashboard/admin/billing/page.tsx` — read-only billing
  state + **manual pilot grant/revoke** (test-mode subscriptions).
- Guard `apps/web/lib/guards/no-live-payments.test.ts` — fails the build if live
  payments are wired. **No checkout, no invoice, no real money — by design.**

---

## 3. Already exists → DO NOT rebuild

| Concern | Already provided by | Do instead |
| --- | --- | --- |
| Profile-completion / "what's missing" surface | `profile-hub-overview.tsx` (+ clarity card, process assistant, readiness panel, work-card) | Reuse / adopt; never add a new checklist surface |
| Readiness / next-action logic | `lib/player-card/readiness*.ts`, `lib/profile/profile-next-action.ts`, `lib/dashboard/next-action.ts` | Call the existing pure functions |
| Player card (real worker self-view) | `worker-player-card.tsx` on `/dashboard/journal` | Extend in place; do not fork |
| Minimum identity field contract | `lib/identity/player-card-minimum.ts` (#536) | Adopt `buildPlayerCardMinimum` in existing surfaces |
| CV text extraction (upload/paste) | `/api/cv/extract`, `lib/cv/extract.ts`, `cv-input-panel.tsx` | Build on it; do not re-add an extractor |
| Admin / owner monitoring | `dashboard/admin/*` (~15 pages) | Add a page inside it if needed; do not build a new admin app |
| Marketplace request loop | `/dashboard/services`, `/dashboard/service-requests` | Closed pass (#533–#535); changes need a true blocker |
| Payment guardrails | `lib/billing/*`, `no-live-payments.test.ts` | Keep inert until the owner-gated payment sprint |

---

## 4. Duplication / drift risks (live today)

1. **Multiple completion surfaces already coexist** (hub overview, clarity card,
   process assistant, work-card, readiness panel, my-zone). They are reconciled
   on `/dashboard/profile` + `/dashboard/journal`, but a *new* completion surface
   would be the 7th and pure drift. **The Player Card minimum contract (#536) must
   be ADOPTED into these, not used to spawn a new card.**
2. **Two "player card" components** — `worker-player-card.tsx` (real) vs
   `player-card.tsx` (marketing mock). Future identity work must target the real
   one; the marketing card must never be wired to real worker data.
3. **`cv-engagement-cards.tsx` orphan** — superseded by
   `capability-profile-section.tsx`. Safe-to-remove later (not in this PR); do not
   resurrect it.
4. **CV "import" ambiguity** — text extraction is real; normalization/store
   (`lib/cv/normalize.ts`) is a throwing stub. Do not present CV import as
   finished, and do not silently build the M2 parser under a "small fix".
5. **Prior-audit sprawl** — many launch docs (§9) describe the *free* line as
   done; do not re-litigate that. This file is the single current entry point.

---

## 5. Missing for first *paid* launch

Strictly the money path (everything else for free first-users exists):
1. Provider/payment decision (Stripe vs alternative) — **owner**.
2. Checkout session creation + client integration (route + UI).
3. Subscription write path + production webhook signature verification.
4. Entitlement enforcement flip (`PAYMENTS_ENABLED`) + pilot→paid migration.
5. Invoice / receipt generation + delivery.
6. Tax / compliance + refund / dunning lifecycle.
7. Legal review of billing & refund terms; secrets in Vercel env only.

(Also still open but **not** money-blockers, per prior audits: marketplace offer
object + moderation, owner-gated verified map geocoding, persistent project chat,
brigade calendar. These are separate future trains, not part of this audit's
allowed next PRs.)

---

## 6. RED items — never allowed in a GREEN PR

These require a migration / RLS / RPC / secret / product decision and an explicit
owner gate (draft PR + `needs-human-gate`):
- Any **payment** wiring: checkout, live keys, `PAYMENTS_ENABLED=true`,
  subscription writes, webhooks, invoicing, refunds.
- **CV import M2**: parsing-to-structured-data pipeline, AI extraction, storing
  CV files, any new storage bucket.
- **Provider identity on marketplace discover** (new provider-display SECURITY
  DEFINER RPC).
- **Cross-user identity on the map** beyond current verified-coords permissions.
- **Matching / ranking / scoring / top-3** changes (must stay honest signals).
- Any **new DB table / column / migration / RLS / RPC**.

---

## 7. Allowed next PRs (the ONLY sanctioned sequence)

Each is GREEN (no DB/RLS/RPC), narrow, and **adopts existing code** — none create
a new surface. Build them one at a time, in order, unless the owner reorders.

1. **Adopt the minimum contract in the existing player card.** Wire
   `buildPlayerCardMinimum` into `worker-player-card.tsx` / its label builder so
   the minimum identity (avatar, name, headline, location, skills, about) is
   sourced through the one contract. No new component, no new route.
2. **Reuse the minimum contract on the marketplace requester tile** (display
   name + initials only — the data already legally available there per #531). No
   new identity read.
3. **Consolidate the profile-completion surfaces** — reduce the overlap in §4.1
   by having the existing hub reference the contract's `missing` list; remove or
   fold redundant cards. Pure UI/logic reuse, honest, no %.
4. **CV upload entry clarity** — improve the EXISTING `/api/cv/extract` entry
   copy/affordance only (no M2 parser, no storage).

Anything not on this list — including a new onboarding flow, a new admin page, a
new completion checklist, or any payment work — is **out of bounds** until added
here by the owner.

---

## 8. Forbidden until first paid launch

- No live payments / checkout / paid unlock / "subscription active" copy.
- No fake data, fake counts, fake badges, fake verification, fake completion
  percentage, fake match/score.
- No `demo` / `preview` / `coming-soon` framing in product copy (doctrine §18).
- No external / competitor / old-project names in code, files, tests, docs, or UI.
- No new subsystem that duplicates a surface in §2.

---

## 9. Prior launch audits reconciled (do not contradict)

Consensus across these: the **free** first-users line is GO (pending owner
production verification + manual approval); payments are deliberately inert and
guarded; manual gates (first-user approval, document verification, marketplace
moderation) are owner-driven.

- `docs/audits/LAUNCH_READINESS_SELF_TEST_V1.md` — GO for first testers (22
  routes, 0 blocking findings).
- `docs/audits/launch-completion-v1-audit.md` — pre-Stripe; honest
  payment-disabled copy mandatory.
- `docs/audits/pre-payment-readiness-current-state.md` /
  `pre-payment-readiness-final-report.md` — seed/wire/extend/gate, not greenfield;
  Stripe test-mode may start; **no money collected**.
- `docs/audits/CLOSED-BETA-GO-CHECKPOINT-V1.md` — conditional GO for tiny closed
  beta (owner production checks).
- `docs/PILOT_READINESS.md`, `docs/launch/README.md`,
  `docs/launch/final-launch-readiness-report.md`,
  `docs/launch/first-users-checklist.md` — owner-driven manual smoke; person +
  company identities; map signal-only; payments being prepared.

---

## 10. Source evidence table

| File | Current behaviour | Launch relevance | Action |
| --- | --- | --- | --- |
| `app/[locale]/dashboard/profile/page.tsx` | Renders `ProfileHubOverview` (consolidated completion) + text-first CV + capability section | Profile completion is LIVE | Do not rebuild; reuse |
| `components/app/profile-hub-overview.tsx` | 3-pillar completion + skill-evidence + next action | Primary completion surface | Adopt `missing` from #536; don't fork |
| `components/app/worker-player-card.tsx` | Real scouting self-view on `/dashboard/journal` | Canonical player card | Wire `buildPlayerCardMinimum` (PR #7.1) |
| `components/app/player-card.tsx` | Marketing showcase, mock data | Marketing only | Never wire to real worker data |
| `lib/identity/player-card-minimum.ts` | Pure minimum field contract (#536) | Identity contract | Adopt in surfaces (PR #7.1–7.2) |
| `lib/player-card/readiness.ts` + `readiness-steps.ts` | Honest 6-pillar readiness + next steps | Completion logic | Reuse; do not duplicate |
| `app/api/cv/extract/route.ts` + `lib/cv/extract.ts` | Real auth-gated CV text extraction (no store) | CV entry is partly LIVE | Build on; M2 store is RED |
| `lib/cv/normalize.ts` | M2 import shapes, throws not-implemented | CV import NOT done | RED (no parser in GREEN PR) |
| `dashboard/admin/*` (~15 pages) | Superadmin operational dashboard, real data | Admin is LIVE | Don't rebuild; add inside if needed |
| `lib/billing/config-core.ts` + `no-live-payments.test.ts` | Payments off by default, live hard-blocked | Paid-launch gate | Keep inert until owner payment sprint |
| `app/[locale]/dashboard/admin/billing/page.tsx` | Read-only billing + manual pilot grant | Pre-payment ops | Manual grants only; no checkout |
| `supabase/migrations/20260613200000_billing_test_mode_records.sql` | Test-mode billing tables (`test_mode=true`) | Payment scaffolding | No live writes; RED to extend |
| `components/app/service-offerings-section.tsx` | Free-text `rate_text`, no transaction | Marketplace supply | Closed pass; no price/pay field |
| `components/app/market-map-*.tsx` | Signal-only, verified-coords markers | Map identity | No new cross-user read (RED) |
| `components/app/cv-engagement-cards.tsx` | Orphan (types only) | Dead code | Leave; safe-remove later |
