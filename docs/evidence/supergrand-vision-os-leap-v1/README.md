# Supergrand Vision OS Leap v1 — evidence

> **Sprint:** `feat/cc/supergrand-vision-os-leap-v1`  
> **Base commit:** `260aca2` (PR #39)  
> **Theme:** the first publicly-shareable surface that proves the
> labour-market OS vision is real and honest at the catalogue level —
> not a slogan, not a fake mockup.

## What changed

### A. Three product / architecture docs

- **`docs/product/labourmarketai-supergrand-vision-os-v1.md`** — the
  product narrative: what the OS is, role evolution, no-lock-in,
  text-first, work journal as reality backbone, proof CV, next action
  engine, role catalogue, live monitor, future scouting / marketplace,
  AI orchestrator gate, what's active vs preparing vs blocked.
- **`docs/architecture/labourmarketai-operating-system-map-v1.md`** —
  the layer-by-layer map (Identity, Role, Profile/CV, Skill, Work
  Journal, Evidence, Confirmation, Project/Team/Company, Opportunity,
  Communication, Next Action, Trust, AI Orchestrator, Safety/Privacy,
  Billing). Each layer carries purpose, current state, target state,
  dependencies, risks, allowed next slice.
- **`docs/product/labourmarketai-pilot-to-grand-vision-roadmap-v1.md`** —
  the 5-phase roadmap (Now → Future). Each phase declares user value,
  required real functionality, what must not be faked, owner smoke
  requirement, merge / deploy risk.

### B. Public `/[locale]/vision` page

- New route at `apps/web/app/[locale]/(marketing)/vision/page.tsx`.
- New server component
  `apps/web/components/marketing/labour-market-os-map.tsx` reads ALL
  three catalogues (`roles.ts`, `feature-availability.ts`,
  `activity-types.ts`) and groups them by availability into Today /
  Preparing / Roles / Activities sections + a Control Room snapshot +
  Future Layers + Workflow strip.
- Site nav (`components/layouts/site-nav.tsx`) gets a "Vizija /
  Vision" link.
- New i18n: `vision.*`, `activityTypes.*`, `nav.vision` in LT + EN.
- The control room is derived data (`getVisibleFeatures()` counts +
  catalogue-sourced rows for PR #18 / non-worker / fake-claims
  statuses). Zero hardcoded "live metrics".

### C. Owner manual review checklist

- `docs/evidence/supergrand-vision-os-leap-v1/owner-review-checklist.md`.
- 10-second test + section-by-section + non-locking + honesty +
  mobile + desktop + status block. Stays PENDING until owner physical
  walk-through.

### D. Guard extension — +9 vitest assertions (82 / 82 total)

1. Public `/vision` page + `LabourMarketOsMap` exist AND import all
   three catalogue modules.
2. Vision page renders today / preparing / control-room / future
   sections + the honesty paragraph.
3. Control-room rows declare PR #18 BLOCKED + owner smoke PENDING +
   fake-claims "never used" in BOTH locales.
4. `activityTypes.*` labels resolve in LT + EN for all 10 activity
   ids.
5. `nav.vision` exists in LT + EN; SiteNav links to `/vision`.
6. Super Max Cosmo + the older PR #30 smoke checklists both still
   PENDING. Belt-and-braces guard.
7. All five vision-related docs exist and are non-trivial in size.
8. Vision doctrine docs refuse "patent / patented / patent-pending"
   language anywhere in `docs/product/` + `docs/architecture/`.
9. `LabourMarketOsMap` uses `getVisibleFeatures()` for the
   control-room counts and does NOT embed any hardcoded "live" metric
   strings.

All earlier guards (PR #31 → #39) still apply.

### E. Mobile evidence

`docs/evidence/supergrand-vision-os-leap-v1/screenshots/` — 8 iPhone
13 (390 × 844, lt-LT) captures of the live `/lt/vision` page against
`next start` of this branch. **Public route — no auth, no mock data.**
These are the real visible surface a pilot participant would see.

## What was intentionally NOT touched

- **PR #18** — not merged, not modified, not rebased. Still
  BLOCKED_MIGRATION per issue #32.
- **`supabase/migrations/`** — zero files added or changed
  (file-count guard still holds).
- **billing / payment / pricing / checkout / providers** — no
  changes anywhere.
- **production deploy settings, Vercel, DNS, secrets, env, Supabase
  project settings** — no changes.
- **auth flow** — `lib/auth/*`, the dashboard auth wall, role-switch
  server actions are unchanged.
- **non-worker role activation** — company / agency / customer stay
  preparing; freelancer / team_lead / service_provider stay hidden.
- **no patent / patent-pending claim** anywhere in any document
  (guard-enforced).
- **no outbound / email / Telegram / scraping / paid API**
  integrations.
- **no fake AI / matching / verified / scoring / guaranteed**
  language anywhere in user-facing copy.
- **PR #30 + PR #39 production smoke status** stays PENDING (guards
  enforce both).

## How this was tested

- `pnpm -F web typecheck` ✓
- `pnpm -F web lint` ✓ (0 / 0)
- `pnpm -F web test` ✓ — **82 / 82** (5 files; +9 new guard
  assertions vs PR #39's 73)
- `pnpm -F web build` ✓ (all 10 locales prerender; `/lt/vision` + 9
  more locales render successfully)
- `pnpm -F web placeholders:check` ✓ — 173 entries
- Live capture against `next start` produced 8 honest mobile shots
  of the unauthenticated `/lt/vision` route.

## What the owner must manually check after returning

1. Walk through `owner-review-checklist.md` against the live
   production deploy of post-merge `main`. Do not pre-flip its
   status block.
2. Also walk through the consolidated PR #39 checklist
   (`docs/evidence/super-max-cosmo-pilot-readiness-v1/owner-production-smoke-checklist.md`)
   if it wasn't done yet.
3. Decide whether the `/vision` URL is ready for external sharing
   with prospective pilot participants. Until the production smoke
   PASSES, keep it as an internal demo URL only.
4. Schedule the PR #18 review (issue #32) so Phase 2 of the
   roadmap can start.

## Remaining risks

- **PR #18 sits unreviewed** longer. The vision page + the roadmap
  honestly tell readers it's preparing, but the longer the migration
  sits, the larger the re-validation cost against an evolving schema.
- **Two production mobile smokes still PENDING.** Owner-only.
- **`/vision` is publicly indexable** if the marketing layout
  doesn't add `robots: noindex`. Owner should decide whether to
  share it externally now or behind a soft block until the production
  smoke passes — this PR does not add or remove a robots directive.
- **Three unmapped branches from PR #33** still await owner triage.

## Next recommended sprint after this PR merges

1. Owner runs all three smoke / review checklists (PR #30, PR #39,
   this sprint).
2. PR #18 migration review per issue #32, OR formal archive
   decision. Once landed, `external_confirmation` flips from
   preparing → active in the feature catalogue and the journal
   `pilotBackboneNote` is removed in the same PR.
3. First non-worker role promotion (likely company or agency) once
   PR #18 lands and a real `/dashboard/<role>` management surface
   ships. The catalogue + nav + role grid + vision page all update
   automatically when the row flips.
