# Super Max Cosmo Pilot Readiness v1 — evidence

> **Sprint:** `feat/cc/super-max-cosmo-pilot-readiness-v1`  
> **Base commit:** `90a1b2a` (PR #38)  
> **Theme:** pilot clarity + safety + verifiable progress, with zero
> risky changes.

## What changed

### A. Owner production smoke checklist consolidation

- New `owner-production-smoke-checklist.md` in this folder. Single
  consolidated checklist covering everything shipped from PR #30
  through PR #38 plus this sprint.
- Covers mobile (iPhone 13) + desktop + explicit FAIL criteria.
- Status block stays **PENDING** until the owner walks through the
  real production deploy. The guard test enforces it.
- Companion to the PR #30-only checklist
  (`docs/evidence/post-merge-production-smoke-pr30.md`) — both stay
  PENDING.

### B. Honest journal pilot framing

- New i18n key `pilotBackboneNote` in `messages/{lt,en}/journal.json`.
  Tells the worker entries are private today and the manager / client
  confirmation + audit layer ships with PR #18 / issue #32.
- `app/[locale]/dashboard/journal/page.tsx` renders the note above the
  composer.
- Mobile-first: small bordered card, no horizontal overflow, no broken
  CTA. Read-only addition, no DB / RLS / RPC change.

### C. Guard extension

`apps/web/lib/guards/product-readiness.test.ts` adds 4 assertions
(73 / 73 total, up from 69 in PR #38):

1. Journal page renders `t("pilotBackboneNote")`.
2. LT + EN expose the note with the required "preparing / pilot /
   private" signals.
3. The new owner checklist file exists AND its status block says
   PENDING.
4. PR #30's checklist also still says PENDING. Belt-and-braces — both
   smoke checklists move in lock-step.

The existing PR #31 / #36 / #37 / #38 guards continue to apply:
no fake AI / verified / matching / automatic-approval claims; only
worker is `active` in the role + feature catalogues; matching and
marketplace stay hidden; no new Supabase migration files; the smoke
status cannot be silently flipped.

## What was intentionally NOT touched

- **PR #18** — journal security hardening migration. Still
  BLOCKED_MIGRATION per issue #32. No file in the PR #18 branch was
  read, modified, or rebased by this sprint.
- **Production smoke status** — PR #30 + this sprint's checklist both
  remain PENDING. Only the owner flips them, and the guard test
  enforces that.
- **DB / migrations / RLS / RPCs / schema** — zero files in
  `supabase/migrations/` changed; the file-count guard from PR #35
  still holds.
- **Billing / payment / pricing / checkout / provider integrations** —
  no changes anywhere.
- **Deploy / Vercel / DNS / env / secrets / Supabase project
  settings** — no changes anywhere.
- **Auth flow** — `lib/auth/*`, the `dashboard` layout's auth wall,
  and the role switcher's server actions are unchanged.
- **Non-worker role activation** — company / agency / customer stay
  `availability: "preparing"`; freelancer / team_lead /
  service_provider stay `availability: "hidden"`. No catalogue row
  was promoted in this sprint.
- **Worker dashboard cinematic redesign** — explicitly out of scope.
  This sprint adds one bordered honest note to the journal page; the
  rest of the dashboard layout from PR #38 is unchanged.
- **CV file extraction, matching engine, marketplace, scoring** —
  remain `hidden` features. No work done toward them.

## How this was tested

- `pnpm -F web typecheck` ✓
- `pnpm -F web lint` ✓ (0 errors / 0 warnings)
- `pnpm -F web test` ✓ — **73 / 73**
- `pnpm -F web build` ✓ (all 10 locales prerender)
- `pnpm -F web placeholders:check` ✓ — 173 entries
- No mobile screenshots in this sprint — the journal page note is
  only visible on the authenticated route, which this sandbox cannot
  reach without writing to the production Supabase project. Source
  review + guard tests are authoritative for the static invariants.
  The owner checklist references the existing iPhone 13 captures from
  PR #38 (`docs/evidence/role-catalogue-dashboard-surfaces-mobile/`)
  for the catalogue-driven surfaces, which this sprint doesn't change.

## What the owner must manually check after returning

1. Run the consolidated checklist at
   `owner-production-smoke-checklist.md` against the live production
   deploy of the post-merge `main`.
2. **Do not** flip the status block until every row is green.
3. If anything fails, open a fix branch off `main`; do not edit the
   PENDING checklist before a real pass.
4. PR #18 / issue #32 — separate decision; not part of this sprint.

## Remaining risks

- **PR #18 sits unreviewed** longer. The pilot-backbone note now
  honestly tells workers it's preparing, but the longer the migration
  sits, the larger the re-validation cost against an evolving schema.
- **Production mobile smoke is still PENDING.** Two checklists now,
  both owner-only. The product is honest about what it does and
  doesn't do; the live walk-through is still the owner's job.
- **Three unmapped branches from PR #33** (`dev`,
  `feat/labourmarketai-foundation-v1`, `docs/cc/post-pr26-wow-handoff`)
  still await owner triage.

## Next recommended sprint after this PR merges

1. Owner runs the consolidated checklist + flips the status if it
   passes.
2. PR #18 migration review per issue #32 OR formal archive decision.
   Once that lands, `external_confirmation` flips from preparing →
   active in `lib/config/feature-availability.ts` AND the
   `pilotBackboneNote` on the journal page can be removed in the same
   PR (one row + one note in lock-step).
3. First non-worker role promotion — likely company or agency. The
   catalogue, role card, and grid wiring all work; what's missing is
   a real `/dashboard/<role>` management surface and matching i18n.
