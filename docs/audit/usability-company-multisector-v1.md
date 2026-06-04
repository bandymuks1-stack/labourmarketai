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

## Verification (this branch)
- `pnpm -F web typecheck` → clean
- `pnpm -F web lint` → 0 errors (1 pre-existing unrelated warning in
  `design-tokens.test.ts`)
- `pnpm -F web build` → success
- `pnpm -F web test` → 140 files, **2140 passed**
- `check:pilot-honesty-copy`, `check:constitution`, `check:fit-signal-copy` → clean

## What remains PENDING (owner / follow-up)
1. **Apply the migration.** `20260604120000_company_profile_request.sql` is
   committed but NOT applied. The agent never runs prod migrations. Until the
   owner applies it (Supabase SQL editor / MCP `apply_migration`), the company
   setup page shows the honest "feature not available yet" blocker.
2. **Admin verification UI.** There is intentionally NO self-service path to
   `verified`. An admin review surface that flips
   `pending_verification → verified` (and writes `verification_note`) is the
   next slice. Today a request simply sits at `pending_verification`.
3. **Gate full company features on `verified`.** The company dashboard still
   opens on role-hold; a follow-up should gate full company actions on
   `verification_status = 'verified'` and show the pending/unverified state.
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
