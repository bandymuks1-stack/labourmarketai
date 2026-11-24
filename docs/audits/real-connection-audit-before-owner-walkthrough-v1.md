# Real-Connection Audit — Before Owner Live Walkthrough (v1)

> **Type:** Read-only audit. No features built, no UI/DB/RLS/RPC/billing changes.
> **Date:** 2026-06-28
> **Scope:** Verify what is *actually* connected end-to-end (UI → server/API → DB
> table/RPC) across the 10 owner-walkthrough product paths, and produce an exact
> owner-run checklist for everything that needs a logged-in browser or a prod-DB
> confirmation that source alone cannot prove.
> **Method:** source trace of `apps/web` (4 parallel path traces), required
> keyword sweep, public production HTTP smoke, and reconciliation of migration
> *applied* status against `docs/APPLIED_LEDGER.md`.

---

## 0. Verdict

**GO WITH OWNER-SMOKE.**

Every audited product path is **wired in code** (UI → server action / route → a
real Supabase table or `SECURITY DEFINER` RPC), with disciplined honest-state
degradation (`needs-migration` → calm "not available yet", never a 500, never
fake data). Public production smoke is clean. **Nothing is BROKEN.**

The one thing source cannot prove is **which recent migrations are actually
applied to prod.** The canonical record (`docs/APPLIED_LEDGER.md`) is **stale**:
its last entry is **2026-06-16 (S6)**, while **25 migration files dated
2026-06-12 → 2026-06-27** — including the marketplace request loop, service
offerings, human-in-loop learning, market-map data model, and profile avatar —
are **not recorded** there. PR history / project memory indicate the W6/W8/W10/P0
set was applied, but the only source-of-truth confirmation is the Supabase ledger
table (`supabase_migrations.schema_migrations`), which is out of audit scope.

→ The walkthrough is safe to run. Before declaring a path "live" on screen, the
owner must do the **authenticated smoke** in §7 to confirm each table/RPC is
present in prod (if absent, the path shows its honest "not available yet" state —
expected, not a defect).

---

## 1. Required keyword sweep — classification

Searched: `needsMigration`, `needs-migration`, `notAvailable`, `not implemented`,
`throw new Error`, `coming soon`, `preview`, `M2`, `TODO`, `stub`,
`payment_not_enabled`, `PAYMENTS_ENABLED`, `stripe_live_blocked`, `manual`,
`pilot`, `grant`, `buildPlayerCardMinimum`, `CvImportUpload`,
`requestServiceOffering`, `respondToRequest`, `withdrawRequest`.

| Token / pattern | Where | Classification |
|---|---|---|
| `needs-migration` / `needsMigration` | services, service-requests, documents, learning, market-map, journal review, worker invitations | **OK — honest state.** Standard degradation: table/RPC absent → calm "not available yet", never an error. |
| `notAvailable` (`en.json` services keys) | `dashboard/services` empty/absent state | **OK — honest state.** "Service offerings are not available yet. This area turns on once the data model is enabled." |
| `payment_not_enabled` / `PAYMENTS_ENABLED=false` / `stripe_live_blocked` | `lib/billing/config-core.ts`, `lib/billing/plans.ts`, billing banners | **RED future (by design).** Live payments hard-blocked; only test/noop wired. See §10. |
| `AI_ASSIST_ENABLED = false` | `lib/config/ai.ts:23`, `lib/ai/provider.ts` always returns noop | **RED future (by design).** No AI provider wired; CV recognition is real *parsing*, not AI. See §5. |
| `coming soon` | `messages/*/labour-market.json` `countryComingSoon`; DA/DE `[EN]` placeholders | **OK — honest state** (non-Tier-1 locale placeholder copy; Tier-1 = lt/en/ru). |
| `preview` | `app/[locale]/design/*`, market-map `futureLayers`, marketing match-preview | **OK — labelled.** Concept/preview surfaces explicitly marked; not presented as live. |
| `manual` / `pilot` / `grant` | `lib/admin/billing-actions.ts` (`grantPilotAccessAction`/`revokePilotAccessAction`), `scripts/admin-*`, manual-paid-launch runbook | **MANUAL-ONLY (admin-gated, by design).** See §9–§10. |
| `buildPlayerCardMinimum` | `lib/identity/player-card-minimum.ts`, adopted by `profile-hub-overview.tsx`, `worker-player-card.tsx` | **OK — connected.** Single source of "what's missing". See §4. |
| `CvImportUpload` / `CvInputPanel` | `components/app/cv-import-upload.tsx`, `cv-input-panel.tsx` → `/api/cv/extract` | **OK — connected.** See §5. |
| `requestServiceOffering` / `respondToRequest` / `withdrawRequest` | `lib/marketplace/service-requests.ts` → `SECURITY DEFINER` RPCs | **OK — connected** (code); table apply = owner-smoke. See §7. |
| `throw new Error(` | mostly guards/tests/env validation, billing webhook signature reject | **OK.** No user-path dead throw found; webhook throws are correct signature-rejection. |
| `M2` | no product-blocking hits | **OK.** |
| `TODO` / `stub` | tests, capture scripts, noop providers, placeholder tooling | **OK — not in live product paths** (noop billing/AI providers are intentional honest stubs). |
| `// @human-gate-approved` (migration headers) | the W6/W8/W10/P0 + market-map + avatar migrations | **Owner-smoke-needed.** Annotation = "passes CI but RED class"; *applied?* must be confirmed against Supabase ledger (§ this doc's headline finding). |

No unlabelled fake data, no dead user-path `throw`, no "demo" copy found.

---

## 2. Route reachability table

Locale routing: next-intl, `localePrefix: 'always'`, active locales **lt (default) /
en / ru** (`lib/i18n/config.ts:38,41`). `/` → 307 `/lt`. Unknown route →
branded 404 via `not-found.tsx` (no 500).

| Route | Auth | Reachable | Evidence |
|---|---|---|---|
| `/{lt,en,ru}` (marketing landing) | public | ✅ 200 (prod smoke) | `app/[locale]/(marketing)/page.tsx` |
| `/` | public | ✅ 307 → `/lt` | `lib/i18n/routing.ts` |
| `/{locale}/auth/{login,signup,callback,forgot-password,reset-password,logout}` | public | ✅ | `app/[locale]/auth/*` |
| `/{locale}/onboarding` | auth | ✅ (redirect target post-signup) | `lib/auth/actions.ts:120` |
| `/{locale}/dashboard` | auth | ✅ 307 → login when anon (prod smoke) | `dashboard/layout.tsx`, `middleware.ts:45` |
| `/{locale}/dashboard/profile` | auth | ✅ | `dashboard/profile/page.tsx` |
| `/{locale}/dashboard/player-card` | auth | ✅ 307 → `/dashboard/journal` (merged, by design 2026-06-25) | `dashboard/player-card/page.tsx:16` |
| `/{locale}/dashboard/journal` | auth | ✅ | `dashboard/journal/page.tsx` |
| `/{locale}/dashboard/services` | auth | ✅ | `dashboard/services/page.tsx` |
| `/{locale}/dashboard/service-requests` | auth | ✅ | `dashboard/service-requests/page.tsx` |
| `/{locale}/dashboard/market-map` | auth | ✅ | `dashboard/market-map/page.tsx` |
| `/{locale}/dashboard/learning` | auth | ✅ | `dashboard/learning/page.tsx` |
| `/{locale}/dashboard/account` | auth | ✅ | `dashboard/account/page.tsx` |
| `/{locale}/dashboard/admin` (+15 subroutes) | superadmin | ✅ 307 → login when anon (prod smoke); `requireSuperadmin` gate | `dashboard/admin/layout.tsx:31` |
| `/api/cv/extract` | auth | ✅ POST | `app/api/cv/extract/route.ts` |
| `/api/workers/[workerId]/skills` (+`/[skillId]`) | auth | ✅ GET/POST/DELETE | `app/api/workers/[workerId]/skills/route.ts` |
| `/api/billing/test-checkout` | auth | ✅ test-mode only | `app/api/billing/test-checkout/route.ts` |
| `/api/billing/webhook` | service | ✅ test-event only (rejects live) | `app/api/billing/webhook/route.ts` |
| unknown `/{locale}/<x>` | public | ✅ branded 404 (no 500) | `app/[locale]/not-found.tsx` |

---

## 3. End-to-end connection table

Status legend: **CONNECTED** (UI + server/API + DB/RPC traced) · **PARTIAL** ·
**AUTH-SMOKE-NEEDED** (code wired, needs logged-in browser to confirm runtime) ·
**MANUAL-ONLY** (owner runs script/admin action) · **RED** (intentionally
hard-blocked future) · **BROKEN**.

| # | Path | UI | Server/API | DB table / RPC | Status |
|---|---|---|---|---|---|
| 1 | Public landing (lt/en/ru) | `(marketing)/page.tsx` | next-intl SSR | — (static i18n) | **CONNECTED** (prod 200) |
| 2 | Auth + first-login bootstrap | login/signup/callback forms | `lib/auth/actions.ts` `completeOnboarding` | `profiles` upsert + RPC `complete_onboarding`/`add_role` | **CONNECTED** · runtime = AUTH-SMOKE |
| 3 | Dashboard shell + nav + role routing | `dashboard/layout.tsx`, tabs, AccountMenu | `getUser` + `profiles`/`profile_roles` reads | `profiles`, `profile_roles` | **CONNECTED** · AUTH-SMOKE |
| 4 | Profile hub / Player Card / completion | `profile-hub-overview`, `worker-player-card` | `buildPlayerCardMinimum`, `getWorkerPlayerCard`, `deriveProfileNextAction` | `profiles`, `workers`, `worker_skills`, `journal_entries`, `profile_skill_claims` | **CONNECTED** · AUTH-SMOKE |
| 4a | Avatar upload | avatar UI | `lib/profile/avatar-actions.ts` | `profiles.avatar_url` + storage policy (`20260623200000`) | **CONNECTED** code · apply = OWNER-SMOKE |
| 5 | CV import (upload + paste) | `CvImportUpload`, `CvInputPanel` | `/api/cv/extract` → `lib/cv/extract.ts` (`unpdf`/`mammoth`) | text → `profiles.profile_text`; skills → `profile_skill_claims` | **CONNECTED** (real parsing, **no AI**) · AUTH-SMOKE |
| 5a | CV "AI recognition" | — | `lib/ai/provider.ts` → noop | — | **RED** (no provider; `AI_ASSIST_ENABLED=false`) |
| 6 | Work Journal / skills / capability | `JournalEntryComposer`, skills section | journal RPCs, `/api/workers/[id]/skills`, `buildEntrySkillReview` | `journal_entries`, `worker_skills` (self_declared, never auto-verified) | **CONNECTED** · AUTH-SMOKE |
| 7 | Marketplace services | `service-offerings-section` | `lib/services/service-offerings.ts` (RLS-scoped CRUD) | `service_offerings` (`20260627121713`) | **CONNECTED** code · apply = OWNER-SMOKE |
| 7a | Marketplace request loop (request/respond/withdraw/seen) | `marketplace-loop-section` | `requestServiceOffering`/`respondToRequest`/`withdrawRequest`/`markServiceRequestsSeen` | `service_offering_requests` + 4 `SECURITY DEFINER` RPCs + `requester_identities_for_provider` + `service_offering_requests_seen` (`20260627145318/174500/181500`) | **CONNECTED** code · apply = OWNER-SMOKE |
| 8 | Market map / location signals | `market-map-shell`, `MarketMapCapture` | `lib/market-map/capture.ts`, `owner-readiness.ts` | `preferred_locations`, `consented_login_location_signals` (no lat/lng by design), `company_demand_locations` (signal-only write) | **CONNECTED** code (no fake markers) · apply = OWNER-SMOKE |
| 9 | Admin / owner ops | `dashboard/admin/*` (15 subroutes) | `requireSuperadmin` + RLS-scoped reads (user client, no service-role bypass) | dual-signal `is_admin()` (`0024`) | **CONNECTED** · AUTH-SMOKE (needs admin session) |
| 9a | Manual pilot grant / revoke | `admin-pilot-grant-form` on billing page | `grantPilotAccessAction`/`revokePilotAccessAction` (superadmin) | `billing_subscriptions` (`manual_<uuid>`, `test_mode=true`) | **MANUAL-ONLY** · apply = OWNER-SMOKE |
| 10 | Billing / payment boundary | pricing banners, `pre-payment-plan-boundary` | `lib/billing/config-core.ts`, test-checkout, webhook | `billing_*` (`test_mode=true` default, `20260613200000`) | **RED** for LIVE (hard-blocked) · test-mode CONNECTED code |
| 10a | Learning / human-in-loop | `LearningReviewSection` | `lib/learning/learning.ts` + RPC `apply_learning_auto_confirmation` | `learning_signals`/`learning_review_queue`/`learning_policy_settings` (`20260627132759`), **default-OFF** | **CONNECTED** code · apply = OWNER-SMOKE |

---

## 4. CONNECTED (traced UI → server → DB; runtime confirm = authenticated smoke)

- **Auth + first-login bootstrap** — password **and** Google OAuth both wired;
  `callback/route.ts` routes first-login → `/onboarding`, returning users →
  dashboard; `completeOnboarding` idempotently upserts `profiles` then calls
  `complete_onboarding` RPC (creates `profile_roles` + entity row), role-aware
  redirect (worker→`/dashboard`, company→`/dashboard/company`, etc.). Triple
  auth gate: middleware → layout → page, all redirect (no 500).
- **Dashboard shell + nav + role switching** — `RoleSwitcher`/`AccountMenu`/
  locale switcher/notifications all wired; admin signal derived from dual
  `active_role`/`profile_roles`.
- **Profile / Player Card / completion** — `buildPlayerCardMinimum` is the single
  "what's missing" source (concrete missing-field list, never a fake %), adopted
  by both the hub overview and the worker card; `getWorkerPlayerCard` reads real
  counts only.
- **CV import** — upload + paste **converge** on one handler; `/api/cv/extract`
  does **real** text extraction (`unpdf` for PDF, `mammoth` for DOCX), auth-gated,
  no storage/logging of text; extracted text → `profiles.profile_text`, skill
  suggestions → `profile_skill_claims` (always `self_declared`, never verified).
- **Work Journal / skills / capability** — entries → `journal_entries`; skills
  API upserts `worker_skills` with `source=self_declared`/`verified=false`
  defaults; `buildEntrySkillReview` is a pure review model that never
  auto-verifies. Verification only ever flips via the manager/learning RPC path.
- **Marketplace services + request loop** — full loop traced: discover (active +
  not-own), request (`request_service_offering` RPC, unique-open-request guard,
  idempotent on 23505), respond accept/decline (terminal-state-immutable),
  withdraw, requester-identity enrichment (display-name-only `SECURITY DEFINER`),
  seen/new tracking (fire-and-forget, rollout-safe). RLS = 2-party (buyer/provider)
  on tables + live re-check in every RPC.
- **Market map** — all layers built from real owner-scoped rows only; honest layer
  states (active/incomplete/off-map); `consented_login_location_signals` has **no
  lat/lng columns** by design; `company_demand_locations` enforces signal-only
  write (lat/lng NULL) via CHECK + RLS. No external map API key.
- **Admin** — fail-closed `requireSuperadmin` at layout; all reads via the
  user-scoped client relying on dual-signal `is_admin()` RLS; no mutations from
  the control room; real counts or "—".
- **Learning / human-in-loop** — default-**OFF** policy; the only confirmation
  authority is `apply_learning_auto_confirmation`, which re-checks manager
  authority + policy-enabled + scope + confidence + skill ownership before writing
  `worker_skills.verified=true`. Honest degradation if tables absent.

---

## 5. Partial / needs owner smoke

- **Migration apply status (headline).** `service_offerings`, the 4 request-loop
  objects, `human_in_loop_learning`, the market-map model, `profile_avatar`, and
  ~19 other files (2026-06-12 → 2026-06-27) are **not in `APPLIED_LEDGER.md`**
  (last entry 2026-06-16). Code degrades safely either way, so this is not a
  break — but "live on screen" for paths 4a/7/7a/8/9a/10a **cannot be asserted
  from source.** Confirm via authenticated smoke (§7) or the Supabase ledger.
- **Player Card route** — `/dashboard/player-card` is a deliberate 307 →
  `/dashboard/journal` (identity merged into Mano CV, 2026-06-25). PARTIAL only in
  the sense that it is not an independent page; this is intended, not a defect.
- **All authenticated runtime behavior** — OAuth round-trip, cookie refresh,
  RLS-as-experienced, role switching, admin gating — is wired in code but
  inherently needs a logged-in browser to prove (§7).

---

## 6. RED / future (intentional, do not "fix" during walkthrough)

- **Live payments — hard-blocked.** `lib/billing/config-core.ts` forces
  `stripe_live_blocked` on any live mode/key; `PAYMENTS_ENABLED=false`; provider
  falls back to noop. Guard `lib/guards/no-live-payments.test.ts` enforces it.
  Only **test-mode / manual pilot grants** (`test_mode=true`, `manual_<uuid>`) are
  reachable. This is the correct RED boundary for the manual paid launch.
- **AI recognition — not wired.** `AI_ASSIST_ENABLED=false` and every per-use-case
  flag false; `getAiProvider()` always returns noop. CV "recognition" is real
  deterministic parsing, **not** AI. Nothing AI-branded should appear in the
  walkthrough.
- **Avatar storage policy / market-map / service-loop migrations** carry
  `@human-gate-approved` headers → RED-class apply (manual, owner-approved, via
  Supabase MCP `apply_migration`), never `supabase db push`.

---

## 7. Owner walkthrough checklist (authenticated — source cannot prove these)

Run on prod (`app.labourmarket.ai`) signed in. Each step confirms a table/RPC is
applied; if a section shows "**not available yet**", the migration is simply not
applied in prod yet (honest state, not a bug).

**A. Auth + first user**
1. Sign up with a fresh email → lands on `/onboarding` (no email-confirm wall).
2. Complete onboarding as **worker** → redirected to `/dashboard`; confirm a
   `profiles` + `profile_roles` + `workers` row exists (admin or DB).
3. Log out → log back in with password → dashboard. Then test **Google OAuth**
   sign-in → callback → dashboard.
4. Hit `/dashboard/admin` as the new non-admin worker → expect redirect/forbid.

**B. Profile / Player Card / CV**
5. `/dashboard/profile`: edit profile text → reload → persists.
6. Upload an avatar. If it sticks → `20260623200000_profile_avatar` is applied; if
   it falls back to initials → not applied yet.
7. `/dashboard/profile` CV import: **upload a PDF** and separately **paste text** →
   both produce skill suggestions; confirm a few → they appear as **self-declared**
   (never "verified"). Confirm `/dashboard/player-card` redirects to journal.

**C. Journal / skills**
8. `/dashboard/journal`: add a work entry → persists; entry skill-review shows
   existing vs new candidates; nothing auto-verifies.

**D. Marketplace (confirms W8/P0 applied)**
9. `/dashboard/services`: create a service offering. If saved → `service_offerings`
   applied; if "not available yet" → not applied.
10. As a **second** account, `/dashboard/service-requests`: discover the offering →
    **Request** it. As the provider: see it under incoming → **Accept** then on
    another request **Decline**. As buyer on a fresh request → **Withdraw**.
    Confirm seen/new counts update. ("Not available yet" → request-loop migrations
    not applied.)

**E. Market map**
11. `/dashboard/market-map`: add a preferred location → person layer flips to
    active; set login-location consent. Empty/incomplete states are honest, not
    fake.

**F. Admin / billing / manual launch**
12. As **superadmin**, `/dashboard/admin` loads with real counts; visit billing
    page → state shows **disabled / test**, never "live".
13. Manual pilot grant: enter an `ownerId` + plan → grant → a `manual_<uuid>`,
    `test_mode=true` subscription row appears; then revoke → status `cancelled`.
14. Confirm no in-app "pay now" / live-checkout anywhere.

**G. Learning**
15. `/dashboard/learning`: confirm policy is **OFF** by default; enabling it is a
    manager action; no skills auto-confirm while OFF.

---

## 8. Suspicious / blockers

- **No BROKEN paths found.** No dead user-path `throw`, no `href="#"`, no
  unlabelled fake data, no "demo" copy.
- **Single real risk: ledger drift.** `docs/APPLIED_LEDGER.md` is not maintained
  past 2026-06-16; 25 newer migration files are unrecorded. This is a *bookkeeping*
  gap, not a runtime break — but it means **no one can assert from the repo which
  of the walkthrough-critical tables are live.** Recommended follow-up (separate
  PR, owner-gated): reconcile the ledger against
  `supabase_migrations.schema_migrations` and record each applied W6/W8/W10/P0
  migration. **(Out of scope for this read-only audit.)**
- **Type-cast at boundary** for `profile_skill_claims` (generated `Database` type
  not regenerated after the migration) — works via cast; cosmetic, noted for a
  future `db:types` regen.

---

## 9. Validation

| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm -F web typecheck` | ✅ exit 0 |
| Lint | `pnpm -F web lint` | ✅ exit 0 |
| Build | `pnpm -F web build` | ✅ exit 0 |
| Guard tests | `pnpm -F web test` (vitest) | ✅ 437 files / 6051 tests passed |
| Public prod smoke | `curl` `/lt /en /ru` + auth-gated | ✅ public 200; `/` 307→`/lt`; `/dashboard*` 307→login; no 500 |

(Docs-only change; full suite run to confirm the audit commit does not perturb the
web workspace.)

---

## 10. DB / RLS / RPC / migration confirmation

- **No DB change, no migration authored, no RLS/RPC change, no billing change** in
  this audit. Audit is docs-only (`docs/audits/…` + this entry).
- **RLS posture observed (read-only):** owner-scoped everywhere — `service_offerings`
  (`provider_id=auth.uid()`), request loop 2-party (`buyer_id`/`provider_id`),
  market-map (`profile_id`/`owner_id=auth.uid()`), learning (default-closed,
  worker/manager/admin scopes), admin via dual-signal `is_admin()` (`0024`). No
  `using (true)`, no grants to `anon` observed on the audited paths.
- **RPC posture observed:** all mutating marketplace/learning RPCs are
  `SECURITY DEFINER` with **live authority re-checks** inside the function
  (provider/buyer scope, terminal-state immutability, policy-enabled, skill
  ownership). Requester-identity RPC returns display-name only.
- **Applied-status truth source:** `supabase_migrations.schema_migrations` +
  `docs/APPLIED_LEDGER.md`. Prod migration **apply** stays **manual** (Supabase
  MCP `apply_migration` after human gate); `supabase db push` is never used. The
  W6/W8/W10/P0 + market-map + avatar migrations are RED-class (`@human-gate-approved`)
  — confirm applied via §7 smoke before treating those paths as live.

---

_End of audit v1. Read-only. No code, UI, DB, RLS, RPC, billing, or migration
changes made._
