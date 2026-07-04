# Skill installation TRUTH AUDIT — why "done" was not done

**Date:** 2026-07-04 · **Branch:** `fix/cc/skill-installation-truth-audit`
· **Type:** accountability / source-of-truth audit (owner mandate).
· **Companions:** `universal-profession-skill-root-audit-2026-07-04.md`,
`universal-profession-skill-cleanup-dry-run-2026-07-04.md`.

This audit does not defend previous work — including work done by this agent.
Section 3 includes a defect **in PR #583 itself** discovered by this audit.

---

## 1. Definitions

These words were used interchangeably in past reports. They are not the same
thing. From now on they have exactly one meaning each:

| Term | Meaning | What it does NOT mean |
|---|---|---|
| **recognized** | A lexicon row (`SKILL_HINTS_LT` / activity / capability dictionary) maps free text to a slug or label at runtime. Pure TypeScript. | Not stored anywhere. Not evidence. Not in the DB. |
| **label-only** | Recognition produces a human-readable string with `slug: null` (or a synthetic `claim:` slug). Confirming it stores a free-text `profile_skill_claims` row; the slug — if any — is discarded. | Never becomes `worker_skills` or `journal_entry_skills` evidence. Second-class by construction. |
| **present in locale JSON** | The slug has a display name in `messages/{locale}/skill-names.json` / `professions.json`. | Says nothing about the DB. `builder` was in professions.json for months with **no DB seed row**. |
| **candidate skill** | A `new-skill-suggestions.ts` CATALOG entry offered as "possible new skill". Saved by **name only** as a self-declared claim. | Not a catalogue row; its kebab slug was deliberately absent from skill-names.json before PR #583. |
| **canonical DB skill** | A row in `public.skills` created by a **committed seed migration** (`supabase/migrations/*.sql`). | A Studio-inserted row is prod state but NOT canon — the repo can't reproduce it. |
| **persistable evidence skill** | A canonical DB skill that `worker_skills.skill_id` / `journal_entry_skills.skill_id` can FK-reference, so journal auto-link and manual linking can persist it as evidence. | Recognition alone can never produce this. |
| **fully installed skill** | ALL of: (1) canonical seed migration row; (2) display name in **all 11** locale files; (3) recognition mapping if text-detectable; (4) profession/family classification (sector tag + `profession_skills` link where relevant); (5) FK-referenceable by `journal_entry_skills` / `worker_skills`; (6) surfaces correctly in profile/CV/player-card/matching where relevant; (7) regression test coverage. | Anything less. There is no "mostly installed". |

## 2. Before PR #583 — the verified reality

| Layer | Construction | Everything else |
|---|---|---|
| `public.skills` seed migrations (0002 + 0011) | **94 skills, 94 construction** (`construction.*` categories) | **0 rows. Zero universal skills were ever migration-seeded.** |
| `public.professions` seed (0008) | 15 construction professions | **0** |
| professions.json (all locales) | **18** slugs | 0 — and 3 of the 18 (`builder`, `rebar_worker`, `site_manager`) had **no DB seed at all**: locale-only ghosts whose 0011 `profession_skills` links silently inserted **zero rows** (the JOIN found no profession) |
| skill-names.json (all locales) | 94/94 construction | 0 universal slugs |
| `SKILL_HINTS_LT` (only lexicon emitting catalogue slugs) | all rows construction | none — and the generic cleaning needle `valym` mapped to the **construction** skill `site-cleaning` |
| Cross-sector recognition (`ACTIVITY_HINTS_LT`, `recognizeUniversal`, capability dictionary) | n/a | rich coverage, but **`slug: null` label-only** — deliberately fenced |
| Candidate catalogue (`new-skill-suggestions.ts`) | deliberately excluded | 22 curated skills with kebab slugs **intentionally NOT in skill-names.json or the DB** |
| Evidence tables (`worker_skills`, `journal_entry_skills`) | FK → construction-only `skills` table | **structurally impossible** to hold non-construction evidence |
| `profile_skill_claims` | n/a | the only home for non-construction work: free-text label, slug discarded at save (`journal-entry-composer` `addNewSkill`) |
| Tests | positive construction assertions | ~10 tests **actively enforced** `skillSlugs === []` / `activitySlug === null` for non-construction inputs |

**Net statement, without hedging: before PR #583, ZERO universal skills were
installed. Not one.** Everything non-construction existed only as recognition
labels, candidate offers, or free-text claims. "Universal skills downloaded /
installed long ago" was never true at the canonical DB layer.

## 3. Why previous "done" reports were wrong

**Which layer was checked:** recognition output (does the parser produce a
label/sector for cooking text?), UI rendering (do chips show?), locale copy
(is the wording sector-neutral?), and unit tests over those same TypeScript
layers. Prior audits (`universal-skill-recognition-core-v1`, the real-world
recognition audit, the cross-sector corrections) all validated at this level —
and honestly noted in fine print that catalogue promotion was "future,
owner-gated dictionary work". Reports then compressed that into "cross-sector
recognition done", which read as "universal skills installed".

**Which layer was not checked:** the canonical chain — seed migrations, FK
reachability, `profession_skills`, and DB↔locale↔recognition consistency. No
test compared `SKILL_HINTS_LT` (or professions.json) against
`supabase/migrations/`. Nothing could fail when the layers drifted.

**Why UI/recognition tests gave false confidence:** they were written as
anti-false-positive locks and asserted the *fenced* behaviour as correct:
`skill-recognition-multi-sector.test.ts` literally required
`skillSlugs === []` for cashier/programming/driving/cooking text. Green tests
therefore *certified* second-class status as success. Worse, the
construction-slug sets in ~6 guard files were derived as "everything in
SKILL_HINTS_LT", which was only valid while the catalogue stayed
construction-only — the test infrastructure itself assumed the defect.

**How construction remained the default source of truth:** the FK gate. Every
persistence path (`autoLinkRecognizedJournalSkills`, the "Susieti įgūdį"
picker, `worker_skills`, verified player-card badges, CV evidence tiers)
resolves slugs against `public.skills` — which contained only construction.
Non-construction confirmations fell through to the free-text claim path. So
regardless of how sector-neutral the recognition looked, everything durable
was construction.

**Why later fixes did not produce qualitative change:** each fix (sectors
registry, cross-sector labels, candidate tier, stale-chip honesty, copy
sweeps) improved the layer it touched but preserved the fence: labels stayed
`slug: null`, candidates stayed off-catalogue, the DB seed was never extended.
The qualitative boundary was always the catalogue + FK layer, and it was
explicitly deferred every time.

**This audit's own exhibit — the failure mode is alive, including in PR #583:**
1. PR #583's seed migration inserted `name_lt`/`name_en`/`name_ru` columns —
   **dropped by migration 0012 in the pre-history** (doctrine §2 moved names to
   JSON). The migration **would have failed at apply time**. It was reported
   as "ready to apply" after validating typecheck/tests/migration-safety —
   none of which check column existence against the migration history. Only
   the blocked MCP connector prevented a failed prod apply. Corrected in place
   this PR (safe: the version was never in any ledger).
2. `builder` / `rebar_worker` / `site_manager`: in professions.json since
   PR #2, never seeded by any migration, with dangling 0011 links silently
   inserting nothing — the same class of ghost, present since the
   construction-only era. Repaired this PR (`20260704130000`).

## 4. After PR #583 (merged `546c7c0`) — current reality

**Changed and already LIVE (Vercel auto-deploy succeeded):**
- Recognition model: sector tag on every `SKILL_HINTS_LT` row; 37 universal
  skill slugs + 17 universal professions recognised first-class from journal
  text; `valym` cleaning-services fix; activity fragments resolve to real
  professions; `universal-recognition` canonical slugs; document-handling rule.
- Locale registries: 131 skills + 35 professions in all 11 locales.
- Tests: fence tests rewritten (construction = sector-tagged subset); permanent
  guard `universal-profession-families.test.ts` (owner sentences, family
  coverage, locale parity).
- All 11 owner example sentences produce correct sector-appropriate
  suggestions in production **as suggestions/labels** — because recognition is
  TypeScript over the locale registry, not the DB.

**Shipped but NOT live (blocked on owner apply):**
- `supabase/migrations/20260704120000_universal_profession_skill_catalogue.sql`
  (+ rollback) — corrected this PR to the real post-0012 table shape.
- `supabase/migrations/20260704130000_seed_missing_legacy_professions.sql`
  (+ rollback) — this PR.

## 5. Production DB gap — plain statement

- **Migration `20260704120000` is NOT applied.** (Nor is `20260704130000`.)
  Apply is owner-approved but blocked: no Supabase MCP connector is attached to
  the CLI session (`claude mcp list` → empty; prior applies used the
  "claude.ai Supabase" connector). Additionally, the merged version of
  `20260704120000` **must not be applied as merged** — it targets dropped
  columns; apply only the corrected version in this PR.
- **Until applied, universal skills are NOT fully installed.** They are:
  recognized ✓, locale-named ✓, sector-classified ✓, test-covered ✓ — but
  **not persistable as evidence**: journal auto-link resolves slugs via
  `public.skills` and silently skips missing ones; manual linking can't offer
  them; `worker_skills` can't hold them; per-profession skill pickers for the
  17 new professions return nothing; verified player-card badges and CV
  evidence tiers cannot contain them.
- **What works from the TypeScript registry regardless:** journal suggestions,
  capability labels, activity/profession chips, tier classification,
  free-text `profile_skill_claims` saves, all copy.
- By this audit's own definitions: today the universal catalogue is
  **recognized + locale-present, NOT fully installed**. Saying otherwise
  repeats the original mistake.

## 6. Permanent prevention rule (now enforced in CI)

New guard added this PR: **`apps/web/lib/guards/skill-installation-chain.test.ts`**.
It statically parses every `supabase/migrations/*.sql` and fails CI when any
layer drifts from the chain:

1. every `SKILL_HINTS_LT` slug has a `public.skills` seed row in a migration;
2. every recogniser-emitted profession slug has a `public.professions` seed row;
3. seeded skills == skill-names.json keys, seeded professions ==
   professions.json keys (**exact equality**, both directions — locale-only
   ghosts AND DB-only orphans fail);
4. all 11 locales carry identical taxonomy keys;
5. every `profession_skills` link tuple references a seeded profession AND a
   seeded skill (the 0011 dangling-link class), and every seeded profession
   has ≥1 link;
6. no post-0012 seed inserts dropped `name_*` columns (the PR #583 apply-bug
   class).

Run before the fixes in this PR, this guard fails on 4 counts (3 ghost
professions + the name-column bug). It passes after them. Combined with
`universal-profession-families.test.ts` (behaviour) and
`journal-no-raw-slug.test.ts` (rendering), a skill can no longer be "done" in
one layer only. **Rule: no skill/profession work may be reported complete
unless `skill-installation-chain.test.ts` and `universal-profession-families.test.ts`
pass AND any new migration is confirmed applied (or explicitly reported as
NOT applied).**

## 7. Required verification template for every future skill/profession change

Copy this table into the final report and fill every row with a verified
value — "not checked" is an acceptable value, "done" without verification is not:

```
| Chain link                | Status + evidence                                    |
|---------------------------|------------------------------------------------------|
| DB row (seed migration)   | migration file + applied? (ledger/MCP check or NOT APPLIED) |
| Locale names              | all 11 locales? (chain guard: exact-equality test)   |
| Recognition mapping       | lexicon row + probe sentence result                  |
| Profession/family link    | sector tag + profession_skills link present          |
| Journal evidence          | FK-resolvable? auto-link/manual-link possible?       |
| Worker/profile evidence   | worker_skills reachable? claims path?                |
| UI surfaces               | picker / Mano įgūdžiai / CV / player card / matching |
| Tests                     | chain guard + behaviour guard + suite result         |
```

The words "installed", "downloaded", "complete" may only be used when every
row is verified. Otherwise the report must say exactly which links are missing.
