# Journal Evidence-Loop v3 — Report

Branch: `fix/journal-v3-correction-lifecycle-and-extraction`
Base: `origin/main` @ `02efa22` (PR #62 merged + migration 0017 applied on prod)
Date: 2026-05-25

## What v3 ships

Production now saves entries (v2 fix landed; 0017 applied), but the loop
is still not pilot-ready. Three gaps closed:

1. **Better LT extraction.** Compound durations (`valandą dvidešimt
   minučių` = 1h20, `valandą su puse` = 1.5h). New activity verticals
   (app testing, programming/fixes, wall plastering, horse care,
   lecturing). Institution + topic detectors. Unknown-phrase flagging.
2. **"Nesuprasta / patikslinkite" cards.** When a fragment has a
   duration but no recognised activity, the worker sees a label input.
   The label saves as a review-only `unknown_phrase` metric (no auto-
   promotion to verified taxonomy).
3. **Correction / edit / delete lifecycle.** Pre-confirmation: worker
   can soft-delete or supersede their own entries normally (basic
   version history via `superseded_by`). Post-confirmation: soft-delete
   is rejected; supersede creates a correction-request entry with
   `correction_of` pointing at the confirmed original, which stays
   untouched.

## Owner v3 test sentence — before vs after

> "15 minučių atlikau programėlės patikrinimą, valandą dvidešimt
> minučių programavau pataisymus. 4 valandas glaiščiau sienas ir dvi
> valandas prižiūrėjau žirgus ir valandą su puse dėsčiau paskaitą
> Vytauto Didžiojo universitete, tema: oratorystės meno taikymas
> dirbtinio intelekto rinkos pritaikymui verslo pasaulyje"

| Aspect | Before | After |
|--------|--------|-------|
| Fragments | 1 of 5 with a time, 0 with an activity | **5 fragments, all 5 with time, all 5 with an activity** |
| Time `15 minučių` | not detected (no activity hook) | 15 minutes |
| Time `valandą dvidešimt minučių` | not detected (compound numeral) | 80 minutes |
| Time `4 valandas` | partially detected | 4 hours |
| Time `dvi valandas` | not detected (word numeral) | 2 hours |
| Time `valandą su puse` | not detected (compound idiom) | 1.5 hours |
| Activity `atlikau programėlės patikrinimą` | unknown | Programėlės testavimas |
| Activity `programavau pataisymus` | unknown | Programavimas / kodo pataisymai |
| Activity `glaiščiau sienas` | unknown | Sienų glaistymas / lyginimas |
| Activity `prižiūrėjau žirgus` | unknown | Žirgų / gyvulių priežiūra |
| Activity `dėsčiau paskaitą` | unknown | Paskaitos / mokymai |
| Institution `Vytauto Didžiojo universitete` | not extracted | extracted (free text) |
| Topic `tema: oratorystės meno taikymas …` | not extracted | extracted (free text) |

All asserted by 6 new test cases in `extract-journal-suggestions.test.ts`.

## Files

| Path | Change |
|------|--------|
| `apps/web/lib/structuring/extract-journal-suggestions.ts` | New `detectFragmentTime` handles compound hours+minutes ("1h20" → 80 min normalised), "su puse" (+0.5h), word/digit forms. New `detectInstitution` (universitete/kolegijoje/gimnazijoje/institute/mokykloje/akademijoje) with optional 0–3 preceding capitalised words. New `detectTopic` (`tema:` / `theme:` prefix). New `isUnknown` flag on `JournalFragmentSuggestion` for time-only fragments. New `institutionName` + `topic` top-level fields on `JournalSuggestions`. |
| `apps/web/lib/structuring/keywords.ts` | Five new `ACTIVITY_HINTS_LT` rows: app testing, programming/fixes, wall plastering (LT verb `glaistyti`), horse/animal care, lecturing. Each row uses explicit LT inflected forms to avoid false-matches. |
| `apps/web/components/app/journal-entry-composer.tsx` | New state + cards for institution + topic. Per-fragment user-label input rendered when `isUnknown` is true. Submit forwards confirmed fragments with `isUnknown`/`userLabel`, plus `institution_name` + `topic`. |
| `apps/web/components/app/journal-entry-row.tsx` | **NEW.** Client row component with Delete button. Visible only when entry has zero external confirmations. Calls `softDeleteJournalEntry`; renders precise LT error on rejection. |
| `apps/web/app/[locale]/dashboard/journal/page.tsx` | Reads `deleted_at` + `superseded_by`; filters them out of the list. Falls back to legacy projection on un-migrated DBs. Routes each row through `JournalEntryRow` with a `canDelete` flag. |
| `apps/web/lib/journal/actions.ts` | Save action accepts `institution_name`, `topic`, per-fragment `isUnknown`/`userLabel`. Persists `institution_name` + `topic` + `unknown_phrase` metric rows. New `softDeleteJournalEntry` server action returns a tagged `JournalLifecycleResult` and routes through the 0018 RPC. Precise LT messages per code (`already_confirmed`, `not_owner`, `entry_not_found`, `rpc_unavailable`, `cannot_supersede_deleted`). |
| `supabase/migrations/0018_journal_correction_lifecycle.sql` | **NEW.** Adds `deleted_at` + `correction_of` columns + partial indexes. Two RPCs: `journal_entry_soft_delete(uuid)` rejects confirmed entries; `journal_entry_supersede(...)` creates a new entry, pre-confirmation links via `superseded_by`, post-confirmation via `correction_of`. Both `security definer` with internal `owns_worker` checks + pinned `search_path`. Revoked from `public`, granted to `authenticated`. |
| `apps/web/lib/guards/journal-evidence-loop.test.ts` | New assertions: `softDeleteJournalEntry` exists, calls the `journal_entry_soft_delete` RPC, returns the `JournalLifecycleResult` tagged union with `already_confirmed` + `rpc_unavailable` codes. |
| `apps/web/lib/guards/journal-v3-migration-0018.test.ts` | **NEW.** Pins 0018: additive schema only (no DROP/ALTER drop/DELETE FROM); RPCs are security-definer with pinned search_path and internal ownership checks; revoked from public + granted to authenticated. |
| `apps/web/lib/guards/product-readiness.test.ts` | `SPRINT_BASELINE` bumped 16 → 17 with rationale. |
| `apps/web/lib/structuring/extract-journal-suggestions.test.ts` | 14 new tests across compound durations, institution/topic, v3 activity verticals, unknown-phrase flagging, and the owner long sentence (5 fragments, 5 durations, 5 activities, institution, topic). |
| `apps/web/messages/{lt,en}/journal.json` + `messages/{lt,en}.json` | New copy: `fragment.unknownTitle/Hint/Placeholder`, `fragment.institutionHint/topicHint`, `structuring.buckets.institution/topic`, `entry.delete/deleting/deleteConfirm/deleteBlocked`. |

## Required checks

| Gate | Result |
|------|--------|
| `pnpm -F web lint` | green |
| `pnpm -F web typecheck` | green |
| `pnpm -F web test` (vitest) | **395 / 395** passed (21 files) |
| `pnpm -F web build` | green |

## Safety proof

- [x] No billing / payments / Stripe / Montonio / pricing edits.
- [x] No env / secrets / Vercel / Supabase dashboard changes.
- [x] **Migration 0018 ships but is NOT auto-applied to production** — per
      `CLAUDE.md` policy. Pre-migration UX degrades gracefully: the
      composer still extracts everything; only the Delete button surfaces
      a precise `"Pataisymų funkcija dar nepritaikyta šioje aplinkoje.
      Paprašykite administratoriaus pritaikyti migraciją 0018."` message
      until 0018 is applied.
- [x] Migration is **additive only** (no DROP / no ALTER drop / no DELETE).
- [x] No `service_role` runtime client. The two new RPCs are
      `security definer` with explicit `owns_worker` checks and
      pinned `search_path = public` — a caller can never act on someone
      else's entry.
- [x] No fake AI / matching / verification claims. `unknown_phrase`
      metrics carry `source='worker_input'` and are explicitly described
      as review-only ("stays private until a human confirmation step is
      added"). Activity slugs stay `null` for any concept the construction
      taxonomy doesn't model (programming, lecturing, horse care, etc.).
- [x] **PR #54 remains unmerged.**
- [x] **PR #18 remains untouched.**
- [x] Branch is fresh off `origin/main` at `02efa22`.

## Owner manual smoke checklist (after 0018 is applied)

1. Apply migration 0018 on production (Supabase SQL editor, paste the
   contents of `supabase/migrations/0018_journal_correction_lifecycle.sql`).
2. Open `/lt/dashboard/journal`.
3. Paste the v3 sentence and press **Pasiūlykite struktūrą**.
4. Confirm 5 fragment cards appear with the correct durations and
   activity labels; institution card shows "Vytauto Didžiojo universitete";
   topic card shows the AI/oratory string.
5. Save (Patvirtinti visus pasiūlymus → Patvirtinti įrašą). Expect the
   green saved card; new entry appears in Įrašai.
6. On any new entry: the Delete control reads "Pašalinti įrašą". Click
   it → confirm → entry disappears from the list. (It is soft-deleted —
   stays in the DB with `deleted_at` set; the list filter hides it.)
7. Pre-0018: Delete shows the "Pataisymų funkcija dar nepritaikyta…"
   error. Extraction + save still work normally.

## Out of scope (intentionally)

- Pre-confirmation **edit** wiring through the composer (the RPC ships;
  UI wiring will be a small follow-up — current Delete-then-recreate
  flow already gives the worker correction power).
- Skill-claim edit UI: `profile_skill_claims` is already owner-only and
  editable via standard RLS; surface polish is a separate slice.
- Manager / client confirmation backbone (PR #18) remains draft.
- PR #54 pilot draft flows still wait on owner role smoke.
