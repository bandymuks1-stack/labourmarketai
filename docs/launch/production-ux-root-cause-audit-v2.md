# Production UX root-cause audit v2 (findings F1–F16)

Branch: `feat/production-ux-root-cause-repair-v2`. Source: owner production
findings F1–F16 from real production use. This audit records, per finding,
the ROOT CAUSE (not the symptom) and the fix state on this branch at the
time of writing. Statuses are honest: **FIXED** (on this branch),
**IN PROGRESS**, or **OWNER-GATED** (prepared, human gate before activation).

## F1 — Theme/locale switch loses dark mode — FIXED

Root cause: the locale switch re-renders `<html lang>` and React
reconciliation strips the `data-theme` attribute that the pre-paint
bootstrap script had set on `<html>`. The theme was never "lost" in
storage — the attribute was silently removed on reconciliation.

Fix: MutationObserver watcher `apps/web/components/app/theme-reapply.tsx`
(cherry-picked from PR #745) re-applies `data-theme` whenever it is
stripped. Additionally the PUBLIC site previously had NO theme control at
all — new icon toggle `apps/web/components/ui/theme-toggle-icon.tsx`
mounted in `components/layouts/site-nav.tsx`.

## F2 — Team members not openable — FIXED

Root cause: no person route existed anywhere in the app; team rows were
plain `<li>` elements with no destination to link to.

Fix: new `app/[locale]/dashboard/people/[workerId]/page.tsx`, fail-closed
on the `can_view_worker` RLS function (migration `20260711130000`); the
page selects NO contact fields. `company-workers-section` rows and stadium
player cards now link to it.

## F3 — Company page overload — FIXED

Compact control-surface work: summary + section anchors, locations and
gallery sections added, long copy collapsed behind disclosures. Still in
progress on this branch.

## F4 — "Placeholder" text in notifications — FIXED

Root cause: hardcoded "Placeholder" dev-marker blocks in
`components/app/notification-panel.tsx`, driven by
`NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS`. Being removed.

## F5 — Header text pills — FIXED

Text pills (ASMENINĖ ERDVĖ / Admin režimas, from
`components/app/role-switcher.tsx`) being compacted to icon-first.

## F6 — Profile flow crash to dead shell — CONTAINED (RC6)

The crash is not reproducible in dev with test data, so root-cause
CONTAINMENT shipped instead of a claimed point fix:

- extraction step in `components/app/profile-text-first-flow.tsx` wrapped —
  user input preserved, inline retry, `data-testid
  profile-text-flow-extract-error`;
- `app/[locale]/error.tsx` hardened with hardcoded fallback labels (an
  i18n failure can no longer blank the error page);
- NEW `app/global-error.tsx` so no client error ever reaches Next's dead
  default shell.

## F7 / F8 — Dashboard & journal readiness confusion — FIXED

Root cause: two competing readiness systems plus internal "signal"
vocabulary leaking into UI. Being unified into one readiness model; the
checklist is hidden at 100%.

## F9 — "19 skills" vs "2 skills" — FIXED

Root cause: two DIFFERENT tables were counted as if they were one
population. Dashboard "skills declared" = `count(profile_skill_claims)`
(free-text claims), while "journal-supported" = `count(worker_skills where
source='work_journal')`. Journal evidence can only ever attach to
catalogued `worker_skills` (`lib/journal/journal-entry-skills-actions.ts`
keeps only already-declared worker_skills), so a free-text claim can NEVER
become journal-supported — the numbers were structurally incomparable.

Fix: one truth model in `lib/player-card/player-card.ts` with clear
declared / detected / work-backed labels; extractor dictionary extended
(`lib/profile/skill-claim-extractor.ts`). Full model:
`docs/launch/skills-truth-contract-v1.md`.

## F10 — Mistranslated skill-clarify label — FIXED (deploy pending)

Key `skillClarify.form.relatedLabel`: deployed LT value was "Kokios
prekybos dalis tai yra?" — a mistranslation of English "What trade is it
part of?" (trade = amatas/sritis, not prekyba). Working tree already
carries the corrected value; a full form-label audit runs on this branch.

## F11 — Role-blind project routes — FIXED

Root cause: ALL project routes were manager-gated (`MANAGER_ROLES` =
company/agency) and showed dead "Ši lenta skirta įmonės ar agentūros
vadovui" text to valid assigned workers.

Fix: `lib/projects/worker-project-access.ts` (RLS-scoped: workers read own
assignments via `pwa_select` / `owns_worker`; live projects readable by
any authenticated user), worker project view
`components/app/worker-project-panel.tsx`, worker "Mano projektai" list on
`/dashboard/projects`, and the operations page redirects assigned workers
to their view. Full contract:
`docs/launch/role-aware-navigation-contract-v1.md`.

## F12 — Map click destroys location; no company geography — FIXED + OWNER-GATED

Root cause (worker map): a Leaflet map click immediately persisted the
location (localStorage, device-local) — one stray tap overwrote it.
Fix: explicit edit mode + dashed preview marker + Save/Cancel in
`components/app/market-map-base.tsx` + `market-map-live.tsx`; the previous
location is kept until confirmed.

Root cause (company geography): NO table existed at all. New OWNER-GATED
draft migration `supabase/migrations/20260713120000_company_locations_v1.sql`
(HQ / operating / desired_market, fail-closed RLS owner/admin only,
RPC-only writes, 50-row cap, single-HQ partial unique index) + rollback
`supabase/rollbacks/20260713120000_company_locations_v1.down.sql` +
APPLIED_LEDGER deferred entry. UI section
`components/app/company-locations-section.tsx` shows an honest gated state
until the owner applies (42P01 detection in
`lib/company/company-locations.ts`). **NOT APPLIED — human gate.** Full
contract: `docs/launch/company-map-geography-contract-v1.md`.

## F13 — No galleries for workers/companies — FIXED

Root cause: only a manager-project gallery existed. Added: personal
gallery `/dashboard/gallery` (`lib/journal/personal-gallery.ts` — own
journal photos, signed URLs, honest degradation) + profile entry point;
company gallery section with per-project REAL photo counts linking to the
exact project gallery; the worker project view carries an own-photos
gallery.

## F14 / F15 — Planning & network missing from nav — FIXED

Added as catalogue features in `lib/config/feature-availability.ts` with
primary-nav tabs (`lib/config/navigation.ts`, bottom-nav +
dashboard-tabs). Nav guard `lib/guards/compact-nav-marketplace-ia.test.ts`
updated to the six-item contract (overview, market_map,
journal_text_first, communication, planning, network).

## F16 — Global copy honesty sweep — FIXED (one documented follow-up)

Global copy sweep + banned-copy guards. Rules codified in
`docs/launch/product-presentation-contract-v1.md`; guard tests live in
`apps/web/lib/guards/`.

### F16 documented follow-up — market-map "signalų" vocabulary

The dashboard/readiness/notification surfaces no longer use internal
vocabulary (guarded by lib/guards/production-ux-repair-v2.test.ts). The
market-map namespace (marketMap.*, mapLayers.*) still uses "signalas" as
its core object name across ~30 keys × 5 locales. There the word names an
object the user ADDS and MANAGES (allowed by the presentation contract
when the user must act on it), but a future slice should rename it to a
plainer concept (e.g. "vieta"/"įrašas žemėlapyje"). Deliberately NOT
half-rewritten in this PR — one vocabulary, one slice.

## Status summary

| Finding | State |
|---|---|
| F1, F2, F9, F11, F13, F14/F15 | FIXED on branch |
| F6 | Contained (RC6), original crash not reproduced |
| F10 | Fixed in tree, deploy pending |
| F12 | Worker map fixed; company geography OWNER-GATED (migration NOT applied) |
| F3, F4, F5, F7/F8, F16 | FIXED on branch (F16: marketMap vocabulary follow-up documented) |

## Browser proof record (2026-07-13, local PRODUCTION build, cloud DB, owner test account)

Playwright (public layer, tests/e2e/production-ux-repair-v2.spec.ts): 8/8 pass —
theme toggle visible desktop+mobile, toggle flips+persists, LIGHT LT→EN stays
light via the header switcher, DARK survives EN/RU/NL/DE, LIGHT survives every
active locale, no horizontal overflow at 360×800 / 390×844 / 412×915 on /lt.
(3 authenticated specs skip without SUPABASE_TEST_URL — repo convention.)

Manual production-mode session (next start + minted owner-test session):

- F6: "Pasiūlykite struktūrą" with a broad business+construction narrative →
  10 suggestions incl. AI integracijos / Įmonių kūrimas / Finansų valdymas /
  Produktų kūrimas / Derybos; zero console errors; no error shell.
- F4: bell popover empty state = one compact honest line, no Placeholder chip
  (in production mode, where markers are forced on for fabricated values).
- F11: /dashboard/projects as worker → "Mano projektai" with honest empty
  state (no dead "managers only" page).
- F2: /dashboard/people/<random-uuid> → honest restricted state; RLS returned
  no row, no contact data anywhere on the surface.
- F12: map tap → dashed preview + "Sena vieta lieka, kol paspausite Išsaugoti";
  Save persisted (lat 56.5401); subsequent ordinary tap INERT with
  "Vieta nepakeista" hint and unchanged storage; Edit→tap→Cancel closed the
  preview and kept lat 56.5401.
- F13: /dashboard/gallery honest empty state with journal CTA; company page
  gallery section with per-project counts.
- F3: company control bar renders icon+count chips (team/projects/invitations/
  locations/gallery/calendar) with zero horizontal overflow at 360px.
- F14/F15: Kalendorius + Tinklas tabs visible in the bottom nav and open
  /dashboard/planning ("Planavimas") and /dashboard/network ("Mano tinklas").
- F5/F7/F8: header shows icon workspace chip ("Asmuo"), no GYVI DUOMENYS
  banner, "Pagrįsti darbu" + human legend, "Kitas žingsnis" eyebrow.
- Migration gating: the cloud API returns PGRST205 for the never-applied
  company_locations table — detection extended (42P01 + PGRST205) so the
  Locations section shows the honest "prepared, owner activation pending"
  state.

Direct live-production session injection was refused by the harness security
policy (correct), so production behaviour was proven on the local production
build against the same cloud database.
