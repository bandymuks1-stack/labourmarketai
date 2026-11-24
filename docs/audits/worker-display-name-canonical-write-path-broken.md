# WORKER_DISPLAY_NAME_CANONICAL_WRITE_PATH_BROKEN

**Status:** open gap, tracked separately.
**Found by:** the W11 authenticated browser proof on PR #1007.
**Relationship to W11:** PRE-EXISTING. Not introduced by W11, not in scope for
PR #1007, and not fixed by it. PR #1007 contains no migration, rollback or code
touching `workers.display_name` — verified against the PR's own file list.
**Fix location:** branch `fix/worker-display-name-canonical-write-path`, a
separate worktree based on `origin/main`. Not merged, not applied, owner-gated.

---

## Verified facts

Each line below is confirmed by reading the committed migrations in
`supabase/migrations/` and, where marked, by an end-to-end reproduction on a
disposable local stack built from the same migration set as production.

1. **`ensure_worker_profile()` creates the worker row at signup.**
   `handle_new_user()` (trigger `on_auth_user_created` on `auth.users`) inserts
   the `public.profiles` row. Trigger `on_profile_created_ensure_worker`
   (`0009_auth_role_architecture_v1.sql`) then runs `ensure_worker_profile()`,
   which executes `insert into public.workers (profile_id) values (new.id)` —
   supplying the FK only, leaving `display_name` NULL.

2. **`complete_onboarding` later reaches an already-existing
   `workers.profile_id`.** Because step 1 runs at signup, the row always exists
   by the time the person submits onboarding.

3. **The current conflict behaviour discards the submitted worker display
   name.** The worker branch of `complete_onboarding`
   (`0008_professions.sql`) is
   `insert into public.workers (profile_id, display_name,
   current_location_country) values (...) on conflict (profile_id) do nothing;`
   Given fact 2 the DO NOTHING branch always fires, so the typed name — read,
   trimmed, and passed into the INSERT — is dropped.

4. **This is an ordering accident, not an authoring error.** `0008` predates
   `0009`. When `0008` was written nothing else created the row, so its INSERT
   genuinely inserted. `0009` later made the row always pre-exist and thereby
   inverted `0008`'s conflict branch from unreachable to always-taken.

5. **`complete_onboarding` is the only writer of `workers.display_name`.** No
   other migration writes the column. No application code writes it — every
   occurrence under `apps/web` is a read. The worker's own profile page
   (`apps/web/app/[locale]/dashboard/profile/page.tsx`) does not even SELECT
   `display_name`, so the person cannot repair it themselves.

6. **`profiles.full_name` is written through onboarding and may provide a
   factual recovery source where present.** Step 1 of `complete_onboarding` is
   the only writer of `profiles.full_name` at the database layer, from the same
   `p_display_name` argument that step 3 discards in the same transaction.
   `handle_new_user()` does not populate it. Where a row has a non-blank
   `full_name`, that value is the string the person actually typed — recovery,
   not inference. Where it is blank there is nothing to recover from and
   nothing should be guessed.

7. **`public.workers` has no automatic `updated_at` trigger.** No
   `before update on public.workers` trigger exists in any migration, so any
   writer must set `updated_at` explicitly or the column keeps reporting
   row-creation time after a real content change.

8. **Employer-facing project rosters fall back to truncated identifiers when
   `workers.display_name` is NULL.** `listProjectAssignments`
   (`apps/web/lib/projects/projects.ts`) resolves a name as
   `profiles.full_name ?? workers.display_name ?? profile_id.slice(0, 8)`.
   `profiles_select` is `(id = auth.uid() or is_admin())`
   (`0001_initial_schema.sql`), so an employer cannot read another person's
   `profiles.full_name`; with `display_name` NULL both real names are
   unreachable and the "Assigned people" roster renders a raw UUID fragment.
   Same fallback in `apps/web/lib/projects/booking-engagement-workers.ts`.
   Name-only degradation (no UUID shown) in `lib/company/company-workers.ts`,
   `lib/agency/agency-workers.ts`, `lib/assets/assets.ts`,
   `lib/leave/absences.ts`, `lib/instructions/instructions.ts`.

9. **Employer access to `profiles.full_name` must not be broadened casually.**
   Widening `profiles_select` so employers can read other people's profile rows
   is not an acceptable fix for a missing display name — it exposes the whole
   profile row to solve a naming problem, and the naming problem has a direct
   fix in the column that is already employer-readable.

10. **Reproduced end-to-end** on a disposable local stack: create a user via
    the auth admin API, then call
    `complete_onboarding('worker','Jonas Petraitis','LT','{}'::jsonb,null)` as
    that user. Result: `workers.display_name` = NULL,
    `profiles.full_name` = `'Jonas Petraitis'`.

## Explicitly NOT established

- **Production row counts have not been measured.** The mechanism implies every
  account onboarded on the affected code path is hit, but no production query
  has been run and this record asserts no affected-row figure. Any number must
  come from a read-only production count, or from the BEFORE/AFTER `NOTICE`
  output of the backfill migration at apply time.
- Whether the owner wants the backfill at all. That is an open decision.

## What a fix requires

A fix is not a one-line change. It needs, as a separate owner-gated package:

- a separate migration repairing the write path (replacing a SECURITY DEFINER
  function — RED class (g) under `.github/scripts/migration-safety.mjs`);
- an explicit **backfill policy**: whether existing rows are repaired from
  `profiles.full_name`, and the overwrite direction (hole-filling only vs.
  newest-wins) stated rather than implied;
- a decision on **conflicts between `profiles.full_name` and
  `workers.display_name`** when both are present and differ;
- **privacy review** — the backfill copies real people's names between tables,
  and any reversal ledger holding those names must be access-controlled;
- **organization / employer visibility** review, without broadening
  `profiles_select` (fact 9);
- **`updated_at` handling** made explicit (fact 7);
- **rollback design** that restores exact prior values for exactly the rows
  changed, including restoring NULL;
- **audit requirements** — before/after counts captured at apply time;
- **migration-safety** classification and an owner human-gate decision. The
  backfill mutates production data (RED class (n)) and must not be
  self-approved or self-applied;
- **browser proof** that an employer-facing roster shows a real name.

---

## Re-evaluation addendum — 2026-08-05 (fresh main `de38b3db`)

The package was recreated from fresh main; timestamps moved to
`20260805090000` / `20260805090100` (the 2026-08-04 names now sort behind the
applied `20260804160000_booking_engagement_end_v2`). Corrections and new
facts against current main:

1. **Fact 8 correction:** `lib/instructions/instructions.ts:172` is NOT
   name-only degradation — it carries the identical
   `full_name ?? display_name ?? slice(0,8)` chain and DOES render a UUID
   fragment.
2. **Two NEW UUID-fallback readers landed since the original audit base
   (`f25f2828`):** `lib/projects/project-workspace.ts:339` (worker picker,
   W11 `08e198a7`) and `lib/engagements/engagements-result.ts:99,148-150`
   (#1009 `de38b3db`, degrades to `null`, no UUID). The blast radius grew.
3. **Still unfixed on main:** `complete_onboarding` last defined in 0008 with
   `do nothing`; no later migration redefines it; no app writer exists
   (`git log -S"complete_onboarding" f25f2828..de38b3db` shows proof-script
   hits only). W11's commit message documents the defect as FOUND, NOT FIXED.
4. **Previously missing artifacts now exist:**
   `docs/human-gates/worker-display-name-write-path-gate.md`,
   `apps/web/lib/guards/worker-display-name-write-path.test.ts`,
   `supabase/rollbacks/20260805090100_worker_display_name_backfill_v1.down.sql`.
