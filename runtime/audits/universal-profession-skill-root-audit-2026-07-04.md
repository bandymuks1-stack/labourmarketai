# Universal profession/skill model — ROOT audit

**Date:** 2026-07-04 · **Branch:** `feat/cc/universal-profession-skill-model`
· **Owner mandate:** find the original construction-first skill source/model and make
all professions first-class — a qualitative model correction, not a cosmetic patch.

Builds on (and goes one level below) `runtime/audits/work-journal-recognition-root-cause-v1.md`
(2026-06-29), which fixed needle-level false positives but left the catalogue
asymmetry in place.

---

## 1. Where is the earliest/root construction-first skill source?

The root is **the seed catalogue itself**, created in the first migrations and
mirrored into the locale registries:

| Root artifact | Content | Status |
|---|---|---|
| `supabase/migrations/0002_reference_data.sql` (+ `supabase/reference-data.sql`) | first 38 `public.skills` rows — all `construction.*` categories | frozen (applied) |
| `supabase/migrations/0008_professions.sql` | `public.professions` table + seed of **15 professions, every one `sector='construction'`** | frozen (applied) |
| `supabase/migrations/0011_seed_skills.sql` | ~56 more skills → **94 total, all categories `construction.*`** + `profession_skills` links for 18 construction professions | frozen (applied) |
| `apps/web/messages/{locale}/skill-names.json` (11 locales) | **94/94 slugs construction** | mirror of the seed |
| `apps/web/messages/{locale}/professions.json` (11 locales) | **18/18 slugs construction** | mirror of the seed |
| `apps/web/lib/structuring/keywords.ts` → `SKILL_HINTS_LT` | the ONLY lexicon that emits **first-class catalogue skill slugs** (`recognizeSkills`) — every slug is a construction trade skill | live code |

The mechanism that keeps construction first-class while every other profession is
second-class:

- `public.worker_skills.skill_id` and `public.journal_entry_skills.skill_id` are
  **FK-hard-gated to `public.skills`** — the construction-only catalogue. Canonical
  skill evidence therefore *can only be construction*.
- Everything non-construction was deliberately fenced into **label-only** paths:
  `ACTIVITY_HINTS_LT` rows with `slug: null`, the `new-skill-suggestions.ts`
  `CATALOG` (slugs intentionally NOT in `skill-names.json`), and
  `universal-recognition.ts` rules with `canonicalSlug: null`. Confirming any of
  them stores a **free-text `profile_skill_claims` row (slug discarded at
  `journal-entry-composer.tsx` `addNewSkill`)** — never a catalogue skill, never
  linkable journal evidence.

That is the "still feels like a construction catalogue under the surface" the owner
sees: later fixes made recognition sector-aware, but only construction output ever
reaches the catalogue, the picker, the profession↔skill links, and verified badges.

## 2. Which files depend on it?

Recognition / suggestion layer (consume `SKILL_HINTS_LT` / catalogue slugs):
- `apps/web/lib/structuring/skill-recognition.ts` (`recognizeSkills` — the only
  emitter of catalogue slugs; engine itself is sector-agnostic)
- `apps/web/lib/structuring/extract-journal-suggestions.ts` (wraps recognizeSkills +
  activity table + capability extractor)
- `apps/web/lib/structuring/recognition-tiers.ts` (AUTO tier = catalogue slugs or labels)
- `apps/web/lib/structuring/universal-recognition.ts` (cleaning rule maps to the
  **construction** slug `site-cleaning`)
- `apps/web/lib/structuring/synonyms.ts`, `misspellings.ts`
- `apps/web/lib/journal/entry-skill-source.ts` (recognizable vocabulary =
  `SKILL_HINTS_LT` slugs)
- `apps/web/lib/skills/skill-groups.ts` (functional grouping; profession set = 18
  construction slugs)

Persistence layer:
- `apps/web/lib/journal/journal-entry-skills-actions.ts` (auto-link + manual link →
  `journal_entry_skills`, FK-gated)
- `apps/web/lib/profile/profile-skill-claims.ts` (label-only escape hatch)
- `apps/web/app/api/professions/[id]/skills/route.ts` (`profession_skills` join —
  construction curated lists)

UI surfaces: see §3. Matching: `lib/staffing/worker-intake.ts`
(`PROFESSION_DIRECTIONS` hardcoded construction starter list). Sector-neutral
matching (`lib/admin/match-suggestions.ts`, `lib/market/match-v1.ts`) is GREEN.

## 3. Which UI surfaces show its effects?

| Surface | Effect |
|---|---|
| Journal composer suggestions | construction text → catalogue skill chips; any other profession → label-only capability/candidate chips (second-class) |
| "Susieti įgūdį" picker (`journal-entry-skill-links.tsx`) | offers only the worker's `worker_skills` — FK-limited to the construction catalogue |
| Profile "Mano įgūdžiai" (`dashboard/profile`) | `worker_skills` dots = construction slugs; non-construction only as free-text claims |
| Profession dropdown + `ProfessionSkillsPicker` (profile page) | 18 construction professions; per-profession curated skills all construction |
| CV (`lib/cv-export/verified-cv.ts`, `app/[locale]/cv/page.tsx`) | evidence/confirmed tiers can only contain construction slugs |
| Player card (`lib/player-card/player-card.ts`) | verified badge chips construction-only (counts are neutral) |
| Work-market atlas (`lib/work-market/categories.ts`) | non-construction category blocks exist but `relatedSkills: []` — the catalogue fingerprint |

## 4. Which DB tables or migrations store old construction-first links?

- `public.skills` — 94 rows, all `construction.*` (0002 + 0011).
- `public.professions` — 18 rows, all `sector='construction'` (0008 + PR#2 additions).
- `public.profession_skills` — construction-only links (0011).
- `public.worker_skills` — FK into `skills`; all rows necessarily construction.
- `public.journal_entry_skills` — FK into `skills`; **may contain stale links created
  by the pre-fix biased recognizer on non-construction entries** (the dog-walking →
  construction-chip class). Display is already honest (`stale_needs_review` in
  `entry-skill-source.ts`), but the rows persist → see cleanup dry-run doc.
- `public.profile_skill_claims` — free-text labels, sector-neutral (GREEN), but it is
  the *only* home non-construction work ever gets.

## 5. Which tests currently protect the wrong assumption?

Tests below were written as anti-false-positive locks but they **pin non-construction
work to label-only status** (they fail if any non-construction skill becomes a
first-class catalogue slug):

1. `lib/guards/skill-recognition-multi-sector.test.ts` — asserts `skillSlugs === []`
   and `activitySlug === null` for cashier/programming/driving/cooking/bookkeeping —
   the explicit lock.
2. `lib/structuring/journal-recognition-owner-cases.test.ts` — asserts empty slug sets
   for the owner's programming/office/event sentence.
3. `lib/guards/taxonomy-residual-sweep.test.ts` — asserts manufacturing fragment has
   `activitySlug === null`.
4. `lib/structuring/extract-journal-suggestions.test.ts` — cashier/driver fragments
   must have `activitySlug === null`.
5. `lib/structuring/recognition-tiers.test.ts` — delivery/order-picking/QA/childcare
   etc. must stay tier-2 candidates, never AUTO signals.
6. The `CONSTRUCTION_SLUGS = new Set(SKILL_HINTS_LT…)` family
   (`journal-realworld-recognition`, `journal-recognizer-fulltext`,
   `journal-stale-skill-review`, `cross-sector-journal-recognition`,
   `sector-neutral-recognition`) — flawed derivation: it defines "construction" as
   *whatever is in `SKILL_HINTS_LT`*, so any promoted universal slug would be
   miscounted as construction.
7. Coupling guard (correct, kept): `lib/guards/journal-no-raw-slug.test.ts` — every
   recognition slug must have a locale name.

## 6. Which parts are GREEN and already universal?

- `lib/structuring/sectors.ts` — 12-sector registry, no construction default.
- `recognizeUniversal` engine + `DOMAIN_SECTOR` (14 domains) — cross-sector, object-gated.
- Capability extraction (`skill-claim-extractor.ts`) + activity lexicon coverage —
  broad cross-sector *labels*.
- `new-skill-suggestions.ts` `CATALOG` — 22 curated, real-world-audited cross-sector
  skills (the natural promotion set).
- `profile_skill_claims` free-text persistence; `player-card-minimum.ts`;
  onboarding wizard (no profession dropdown); `lib/admin/match-suggestions.ts`;
  `lib/market/match-v1.ts` (ESCO-based); `lib/taxonomy/work-categories.ts`;
  `lib/structuring/structure-need.ts`; public copy guards
  (`whole-labour-market-copy.test.ts`, `general-labour-market-platform-principle.md`).
- ESCO scaffolding (dormant, disjoint from recognition; real import owner-gated).

## 7. Which parts are RED and still construction-first?

1. **The catalogue**: `skills` / `professions` / `profession_skills` seeds + the 11-locale
   `skill-names.json` / `professions.json` mirrors — 100% construction.
2. **`SKILL_HINTS_LT`** — only construction rows ⇒ only construction ever becomes a
   catalogue suggestion (and `site-cleaning`'s broad needles `valym`/`уборк` route
   *generic cleaning text into a construction skill*).
3. **`universal-recognition.ts` cleaning rule** — maps "Patalpų valymas" to the
   construction slug `site-cleaning`.
4. **FK-gated evidence** — `worker_skills`/`journal_entry_skills` can only reference
   the construction catalogue.
5. **Profession surfaces** — profile profession dropdown + per-profession skill picker.
6. **`lib/staffing/worker-intake.ts` `PROFESSION_DIRECTIONS`** — construction starter enum.
7. **`lib/work-market/categories.ts`** — empty `relatedSkills` for non-construction blocks.
8. The fence tests in §5.
9. Stale `journal_entry_skills` rows from the old biased recognizer (data, not code).

## 8. What is safe to fix in code now? (this PR)

- Extend the slug registries: add universal skills + professions to
  `skill-names.json` / `professions.json` in **all 11 locales** (doctrine §2/§10).
- Ship the **additive** catalogue seed migration + paired rollback (INSERT … ON
  CONFLICT DO NOTHING only ⇒ GREEN class) — *ship, not apply*.
- Promote recognition: sector-tagged `SKILL_HINTS_LT` rows for the universal slugs
  (reusing the already-audited needles from `CATALOG` / `ACTIVITY_HINTS_LT` /
  `universal-recognition` rules); fix `site-cleaning` needle leak; give
  non-construction activity rows real profession slugs.
- Attach canonical slugs to tight non-construction `universal-recognition` rules;
  re-point cleaning to `cleaning-services`.
- Extend `skill-groups.ts`, `worker-intake.ts` directions, work-market
  `relatedSkills`.
- Rewrite the §5 fence tests to assert the *universal* contract (non-construction
  text → non-construction first-class skills; construction text → construction
  skills; construction never a fallback) with a sector-aware construction-slug
  derivation.
- Add a permanent guard (`universal-profession-families.test.ts`) covering the
  owner's example sentences + family coverage + locale parity.

## 9. What requires owner-gated DB work later?

1. **Apply the new catalogue migration to prod** (Supabase MCP `apply_migration`,
   owner channel). Until applied: recognition/labels work immediately; DB-backed
   persistence of the new slugs silently no-ops (auto-link resolves slugs via DB and
   skips missing ones) — no breakage, just not yet first-class in the DB.
2. **Stale-link cleanup** of `journal_entry_skills` rows created by the old biased
   recognizer — see
   `runtime/audits/universal-profession-skill-cleanup-dry-run-2026-07-04.md`
   (dry-run first, explicit owner gate before any mutation).
3. Optional later: re-categorising the legacy generic slugs that live under
   `construction.*` DB categories (`team-coordination`, `quality-control`,
   `work-scheduling`, `safety-officer`, `first-aid`-adjacent) — cosmetic in DB terms,
   not needed for behavior (code-side grouping already treats them as generic).
4. Full ESCO import (existing separate owner-gated track) — unchanged by this PR.
