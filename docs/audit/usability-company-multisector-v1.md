# Usability: company profile request + multi-sector skills (v1)

Branch: `feat/cc/usability-company-multisector`
Status: **PR open, NOT merged, NOT deployed.** Migration committed, NOT applied.

This slice closes the core usability gap the owner reported: the product was
construction-shaped and a company could not record a real organisation profile,
while a large "coming later" block dominated the account screen.

## What changed

### 1. Skills are no longer construction-only
- New `apps/web/lib/structuring/sectors.ts` — an explicit, sector-AGNOSTIC
  registry (`SectorKey`, `SECTORS`, `DEFAULT_SECTOR = "other"`). Construction is
  one row among eleven; there is no construction default anywhere.
- `apps/web/lib/structuring/keywords.ts` — activity hints now carry a `sector`
  tag, and the lexicon gained non-construction coverage (hospitality/food,
  care/health, office/admin, cleaning, transport/logistics warehouse) on top of
  the existing transport, retail, IT, education and agriculture day-work rows.
- The journal recogniser already produced honest **label-only** suggestions for
  non-catalogue work (`activitySlug: null`); this slice proves and locks that
  with a guard. No fake taxonomy, no auto-verified skill.

### 2. Company profile **request** flow (not unrestricted creation)
- `supabase/migrations/20260604120000_company_profile_request.sql` (additive):
  - New nullable columns on `public.companies`: `registration_code`, `address`,
    `contact_email`, `contact_phone`, `requester_role`, `verification_note`,
    `requested_at`.
  - `verification_status` with a 4-state ladder
    `draft | pending_verification | unverified | verified` (default `draft`;
    legacy rows backfilled to `unverified` so nothing looks verified by accident).
  - `save_company_setup()` SECURITY DEFINER upsert. It can **request**
    (`pending_verification`) or keep a `draft`. It can **never** set `verified`
    — only an (future) admin path may. A guarded `unique(profile_id)` makes the
    upsert well-defined.
- `apps/web/lib/company/company-setup.ts` + `setup-actions.ts` — service +
  tagged-return server action mirroring the buyer/customer pattern, including
  graceful `needs-migration` handling (undefined column / function).
- `apps/web/components/app/company-setup-form.tsx` — full form: legal name
  (required), country, registration code (optional), address/location, website,
  contact email/phone, and **your role in the company** (owner / director /
  manager / HR / other). Two intents: *Save draft* and *Submit verification
  request*. An explicit notice states full company use requires human
  verification that does not happen automatically.
- `apps/web/app/[locale]/dashboard/start/company/page.tsx` — rewritten to use
  the request flow, show the live verification status + an honest explainer per
  state, and render a migration blocker when the DB columns/RPC are absent.
- LT + EN copy under `roleDashboards.company.setup`.

### 3. "Vėliau įjungiami moduliai" demoted
- On the account page the coming-soon module grid is now inside a collapsed
  `<details>` (`my-spaces-coming-later`), secondary to the real, actionable role
  catalogue above it. Still honestly discoverable in one click; no longer the
  main account experience. New key: `spaces.comingLaterToggle` (LT + EN).

### 4. Regression guards (CI via `pnpm -F web test`)
- `lib/guards/skill-recognition-multi-sector.test.ts` — sectors registry is
  multi-sector and never defaults to construction; the activity lexicon spans
  ≥5 sectors (≥4 non-construction); non-construction entries yield honest
  label-only suggestions (no catalogue skill, no verification); construction
  still works.
- `lib/guards/company-profile-request-honesty.test.ts` — migration declares the
  4-state ladder, defaults to draft, and the RPC can request but never fabricate
  a verified company; the service degrades to needs-migration; the page/form
  explain verification and expose the required fields; the name placeholder is
  not construction-only; LT/EN parity + honest notice.
- Updated pre-existing guards that codified the old assumptions:
  `role-dashboards.test.ts` (allow the honest verification vocabulary in the new
  `setup` block + assert the ladder is honest), `product-readiness.test.ts` +
  `ops-bridge-migration.test.ts` (migration baseline 43 → 44),
  `form-submit-feedback.test.ts` (company setup is now a client-async form, not a
  NATIVE-NAV exemption).

## Hardening pass (pre-undraft review)
- **Access model proven.** `authenticated` holds only `SELECT` on
  `public.companies` (0023); there is NO table-level INSERT/UPDATE grant, so the
  only write path is the `SECURITY DEFINER` RPC, which writes
  `WHERE profile_id = auth.uid()`. A user can therefore only create/update
  THEIR OWN request, never another user's, and never self-verify. A new guard
  asserts no migration ever grants INSERT/UPDATE on companies to authenticated.
- **Defense-in-depth trigger.** `enforce_company_verification_guard()` +
  `trg_company_verification_guard` (BEFORE INSERT/UPDATE) make promotion to
  `verified` admin-only on EVERY write path, even if a future migration adds a
  direct UPDATE grant. `auth.uid()`/`is_admin()` reflect the end user inside the
  SECURITY DEFINER RPC, so the self-service RPC can never verify.
- **RPC robustness.** `save_company_setup` now branches on existence instead of
  `ON CONFLICT`, so it does not depend on a unique constraint that could fail to
  apply on legacy duplicate rows. The `unique(profile_id)` is added only when no
  duplicates exist (apply never fails).
- **Sector coverage proven.** Guard asserts the activity lexicon recognises all
  owner-named sectors (construction, transport/logistics, retail, hospitality,
  care, office/admin, IT, education, cleaning, agriculture) — construction is
  one of them, not the default.

## Verification (this branch)
- `pnpm -F web typecheck` → clean
- `pnpm -F web lint` → 0 errors (1 pre-existing unrelated warning in
  `design-tokens.test.ts`)
- `pnpm -F web build` → success (all three target routes compile)
- `pnpm -F web test` → 140 files, **2144 passed**
- `check:pilot-honesty-copy`, `check:constitution`, `check:fit-signal-copy`,
  `check:pricing-honesty-copy` → clean
- `migration-safety` (static gate) → the only `drop` in executable SQL is
  `drop constraint` (CHECK re-runnability), comments are stripped, and a
  `Rollback` block is present, so the migration stays GREEN class.

## Authenticated browser smoke — EXECUTED (real signed-in run)

Ran end-to-end in a **fully local real stack** (no production, no owner action):
- **Environment:** `supabase start` (local Docker stack) — Auth (GoTrue) + PostgREST
  + Postgres at `127.0.0.1:54321/54322`, all repo migrations applied (incl.
  `20260604120000`). Next dev server at `127.0.0.1:3000` against that local
  Supabase via a gitignored local `.env.local` (public local demo keys only).
- **Test user:** a created+onboarded local user (worker+company roles), real
  magic-link session minted into Playwright `storageState` (no fake/forged auth).
- **Spec:** `apps/web/tests/e2e/pr250-company-multisector-smoke.spec.ts` — **6/6 passed.**

Screenshots (committed for review under `docs/evidence/pr250-company-multisector/`):
- `01-lt-account.png` — `/lt/dashboard/account`: real role catalogue ("Mano erdvės")
  is primary; "Vėliau įjungiami moduliai" is the collapsed `<details>` at the bottom.
- `02-lt-start-company.png` — `/lt/dashboard/start/company`: full request form
  (legal name + country + registration code + address + website + contact
  email/phone + your role), honest verification notice, draft + request buttons,
  honest status; no fake verified.
- `03-lt-journal.png` — `/lt/dashboard/journal`: real composer; a non-construction
  entry ("…kasininku…") yields its honest sector label, not a construction trade.

Verified at the data layer (browser-driven writes landed in the local DB):
draft save persists all fields; **Submit request → `pending_verification` +
`requested_at`** (see bug fix below); cross-checks confirm no fake verified.

### Bug found & fixed during this smoke
The "Pateikti patvirtinimo užklausą" (Submit request) button behaved like Save
draft — it left the company at `draft`. Cause: in Next.js 15 / React 19 a
submit button's `name`/`value` is **not** carried into a function `formAction`,
so `intent=submit` never reached the server action. Fixed
`components/app/company-setup-form.tsx` to use `<form action={formAction}>` + a
hidden `intent` field set on each button's `onClick`. Re-verified in-browser:
submit now moves the company to `pending_verification`. The smoke spec now
asserts the pending status after submit so this can't silently regress.

## Owner final smoke — automated (also re-runnable on a real preview)
This environment has no `.env.local`, no Supabase auth backend, and Docker is
down, so authenticated browser screenshots cannot be produced here (a bare
Postgres can't serve the app's auth; faking a session would not be a real
smoke). The `build` proves the routes compile and the preview-DB gate proves
the data/security behavior. To get the three required screenshots + the PASS
assertions, run the dedicated Playwright spec against a real preview/local with
a Supabase test user (migration applied first):

```
# 1) once
pnpm -F web e2e:install
# 2) mint a session for a real test user (needs NEXT_PUBLIC_SUPABASE_URL /
#    ANON_KEY / SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local)
E2E_OWNER_EMAIL=<test-user@…> pnpm -F web exec tsx scripts/e2e-mint-session.ts
# 3) run the PR #250 smoke against the target (omit E2E_BASE_URL to use local dev)
E2E_BASE_URL=<preview-url> pnpm -F web exec playwright test \
  tests/e2e/pr250-company-multisector-smoke.spec.ts
```

`apps/web/tests/e2e/pr250-company-multisector-smoke.spec.ts` signs in, asserts
every owner PASS criterion (account coming-later is a collapsed `<details>` with
the real role catalogue primary; company form has name+country + optional fields,
saves a draft and submits a request, status visible, no fake `verified`; journal
recognises a non-construction entry as its honest sector label, not construction),
and writes:
- `runtime/review-evidence/labourmarketai/pr250-company-multisector/screenshots/01-lt-account.png`
- `…/02-lt-start-company.png`
- `…/03-lt-journal.png`

It is gated on a minted session and **skips cleanly** when absent (CI-safe), so it
never blocks the quality gate.

## What remains PENDING (owner / follow-up)
1. **Apply the migration.** `20260604120000_company_profile_request.sql` is
   committed but NOT applied. The agent never runs prod migrations. Until the
   owner applies it (Supabase SQL editor / MCP `apply_migration`), the company
   setup page shows the honest "feature not available yet" blocker.
2. **Admin verification UI.** There is intentionally NO self-service path to
   `verified`. An admin review surface that flips
   `pending_verification → verified` (and writes `verification_note`) is the
   next slice. Today a request simply sits at `pending_verification`.
3. ~~**Gate full company features on `verified`.**~~ **SUPERSEDED — wrong
   direction.** The corrected model is **automatic-first** (see
   `company-automatic-first-onboarding-v1.md` / the `fix/cc/company-automatic-first-onboarding`
   PR): a company is usable immediately as `active_unverified`; `verified` is a
   stronger trust state, NOT a gate on basic use. Do **not** block company
   features behind `verified`.
4. **Catalogue skills for non-construction sectors.** Recognition is multi-sector
   now, but the seeded `skills` / `professions` taxonomy is still construction.
   Non-construction work surfaces as honest free-text labels (no fake catalogue
   skill). Seeding real per-sector skill taxonomies is a data migration, no code
   change (the schema already supports `professions.sector` + `skills.category`).
5. **Manual smoke after apply.** Sign in → /dashboard/start/company → save draft
   → submit request → confirm status shows "Pending verification"; add a
   non-construction journal entry (e.g. "3h kasininku") → confirm an honest
   label-only suggestion with no verification claim. Capture screenshots.

## Honesty posture (PLATFORM_DOCTRINE §7)
No fake company verification (verified is admin-only, never self-service or
automatic), no fake AI/matching, no fake paid claims. The verification ladder
includes an explicit `unverified` state and the UI states plainly that full
company use requires human verification.
