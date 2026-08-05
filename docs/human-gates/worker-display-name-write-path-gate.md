# HUMAN GATE — worker display-name write path + backfill

Status: `WORKER_DISPLAY_NAME_CANONICAL_PATH_CODE_COMPLETE_PENDING_HUMAN_GATE`
Prepared: 2026-08-05 (recreated from fresh main `de38b3db`; the 2026-08-04
parked package carried over verbatim except timestamps — see history note).
Neither migration is applied. Both ship RED (no `@human-gate-approved`
marker) on purpose. CI staying RED is the honest state until a decision is
recorded HERE.

## The defect (verified, reproduced)

`workers.display_name` is NULL for every account and nothing can fill it:
0009's `on_profile_created_ensure_worker` trigger pre-creates the workers
row, which turned 0008 `complete_onboarding`'s worker-branch
`on conflict (profile_id) do nothing` into an always-taken branch — the typed
name is read, trimmed, passed … and discarded. `complete_onboarding` is the
ONLY writer of the column in the entire system; the worker's own profile page
does not even SELECT it, so there is no self-service repair.

Customer-visible: employer rosters fall through
`profiles.full_name ?? workers.display_name ?? profile_id.slice(0,8)` — and
`profiles_select` (`id = auth.uid() or is_admin()`) makes `full_name`
unreadable cross-user — so employers see raw UUID fragments. Six leak sites
on current main, including two added since the original audit
(`lib/projects/project-workspace.ts:339`, `lib/engagements/engagements-result.ts`).
Launch stop-condition §22: "UUID-like names shown due to unresolved canonical
display-name path".

Full audit: `docs/audits/worker-display-name-canonical-write-path-broken.md`.

## The two decisions (separately approvable)

### Decision 1 — write-path repair (forward-only, no data touched)

File: `supabase/migrations/20260805090000_worker_display_name_write_path_v1.sql`
Rollback: `supabase/rollbacks/20260805090000_worker_display_name_write_path_v1.down.sql`

- Changes exactly one statement inside `complete_onboarding`: worker-branch
  conflict action `do nothing` → `do update set display_name =
  coalesce(excluded.display_name, workers.display_name), …` (+ same for
  `current_location_country`, + explicit `updated_at = now()`).
- Everything else carried byte-for-byte from 0008. Signature unchanged — no
  PostgREST 404 window, no client deploy sequencing.
- RED classes: (g) SECURITY DEFINER redefinition, (h) revoke/grant
  restatement. No DML. Rollback restores 0008 verbatim and is lossless.
- Guard pin: `apps/web/lib/guards/worker-display-name-write-path.test.ts`
  fails if the branch ever regresses to DO NOTHING.

> OWNER DECISION 1: apply the write-path repair — yes / no.

### Decision 2 — backfill of existing rows (production DML)

File: `supabase/migrations/20260805090100_worker_display_name_backfill_v1.sql`
Rollback: `supabase/rollbacks/20260805090100_worker_display_name_backfill_v1.down.sql`

- Copies `profiles.full_name` → `workers.display_name` (and
  `profiles.country` → `current_location_country`) ONLY where the target is
  NULL — hole-filling, never overwrites, no rows created/deleted, no-op rows
  excluded, idempotent on re-run.
- The copied value is literally the string the person typed at onboarding,
  recovered from the sibling column that kept it — a repair, not a guess.
  Rows with no `full_name` stay NULL (nothing is invented).
- Reversal ledger `public.worker_display_name_backfill_20260805` records
  exact BEFORE values pre-update (ledger-first, two-statement design); RLS
  enabled with NO policy = default deny (it holds real names).
- Refuses to run before Decision 1's fix is live (function-source guard).
- BEFORE/AFTER counts print as NOTICEs at apply time — those are the ONLY
  authoritative affected-row numbers; none are asserted in advance.
- To approve names but NOT countries: delete the `current_location_country`
  line from the UPDATE's SET list (instruction in the file header).

> OWNER DECISION 2: apply the backfill — yes / no / names-only.
> OWNER DECISION 2b: ledger retention — keep until episode closed, then a
> deliberate `drop table`; propose the same 90-day ceiling precedent used for
> `ai_runs`.

## Recording an approval

When the owner approves a decision: record it in this file (date + exact
wording + migration sha256 at approval time), add `-- @human-gate-approved`
naming the RED classes to THAT file only, update the guard test's marker
assertion, and apply via Supabase MCP `apply_migration` with the APPLIED_LEDGER
row in the same episode. Never self-approve; never apply Decision 2 before
Decision 1 is confirmed live in prod.

## History note

The 2026-08-04 package (worktree `display-name-v1`, timestamps
`20260804150000/150100`) was never committed; its timestamps now sort behind
the applied `20260804160000_booking_engagement_end_v2`, so the package was
recreated 2026-08-05 from fresh main with new timestamps and three previously
missing artifacts added (this gate doc, the guard test, the backfill
rollback). SQL bodies are otherwise verbatim.
