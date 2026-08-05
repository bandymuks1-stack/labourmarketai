# HUMAN GATE — worker display-name write path + backfill

Status: `APPROVED_CONDITIONALLY_2026-08-05 — Decisions 1 and 2 recorded below`

## RECORDED OWNER APPROVALS — 2026-08-05

Source: owner directive "LABOURMARKET.AI — OWNER DECISIONS AND
MULTI-ORGANIZATION STRUCTURAL TRAIN" (2026-08-05), section "PR #1013 —
APPROVED CONDITIONALLY". Exact wording:

> **Decision 1** — "Apply the canonical worker display-name write-path
> repair."
> **Decision 2** — "Apply the complete factual backfill, including the
> guarded country/location recovery defined in the reviewed package."

Conditions attached by the owner (all honoured in this episode): rebase onto
current main; no semantic migration change beyond ratchet/conflict resolution
and the already-reviewed stale-ledger protection; final checksums reported;
exact production counts reported; blank/conflicting/newer values classified;
newer post-apply values never overwritten; rollback verified; migration-safety
findings narrowly human-gated; **only these two migrations applied**.

Migration sha256 at approval/review time (pre-marker, exactly as reviewed):

- `20260805090000_worker_display_name_write_path_v1.sql`
  `c41cdc5d0767c141fceb813962c78445cd799f711240c4618b9ee7d5de8c6693`
- `20260805090100_worker_display_name_backfill_v1.sql`
  `e1e10f21ef49b44284a13bb29644ee6fb0f8e0c6be929e89725bfaaee06dfc78`

The only change made to either file after these checksums were taken is the
addition of the `-- @human-gate-approved` marker block itself (recorded in the
same commit as this approval note; post-marker checksums in the PR report).

Production preflight (read-only, measured 2026-08-05 against
`labourmarket.ai` prod before apply):

| measure | count |
|---|---|
| total profiles | 32 |
| total workers | 32 |
| workers with NULL display_name (blank-non-NULL: 0) | 27 |
| workers whose profile has a factual `full_name` | 24 |
| name-backfill eligible (NULL name + factual full_name) | 19 |
| country-backfill eligible | 21 |
| nonblank name conflicts (display_name ≠ full_name, both set) | 0 |
| rows already carrying a different nonblank display_name | 5 (all conflict-free) |
| workers rows with `updated_at` ≠ `created_at` | 8 |
| before-state hash (profile_id|name|country, md5) | `11add5b764d6664998dc7af31ab54402` |

Expected residual: 27 − 19 = 8 workers stay NULL (no `full_name` to recover
from — not repaired by guessing).

> OWNER DECISION 2b (ledger retention): not yet decided — ledger table stays
> until the owner closes the episode; 90-day ceiling proposed.

Prior status (superseded):
`WORKER_DISPLAY_NAME_CANONICAL_PATH_CODE_COMPLETE_PENDING_HUMAN_GATE`

## APPLY + PROOF RECORD — 2026-08-05

Both migrations applied to prod `gorgitwvdzxbnaxhrsrw` via Supabase MCP
`apply_migration` in strict order (ledger `20260805155514` write-path,
`20260805155601` backfill). Full record: `docs/APPLIED_LEDGER.md`. Results:
19 names filled, 21 countries filled, 8 honest residual NULLs, 0 conflicts,
0 overwrites (3 ledger rows with pre-existing names provably unchanged);
prod function body md5 `8b8f0ae34bc6ec6deb249ef0463dd465` byte-identical to
this branch's migration file body.

**Browser proof (2026-08-05, disposable LOCAL data only, deleted after).**
On a local stack with the write-path fix applied, a fresh worker who typed
"Jonas Statybininkas" at onboarding (real `complete_onboarding` RPC through
the signed-in client) was shown by name in all three required contexts:
1. **Personal** — "Jonas Statybininkas · Personal space" header + "Hi, Jonas"
   greeting on /dashboard;
2. **Org-facing 1** — project board "The field — who is on the team today"
   roster (the exact `listProjectAssignments` surface that previously showed
   a raw UUID fragment) listed "Jonas Statybininkas";
3. **Org-facing 2** — the employer's person-profile page
   (/dashboard/people/…) rendered heading "Jonas Statybininkas" while the
   active workspace was the disposable company "UAB Disposable Statyba".
Pre-fix control: the same seed on the unfixed local stack reproduced the
defect (display_name stayed NULL) — the repair, not coincidence, produced
the name.

Verdict: `WORKER_DISPLAY_NAME_CANONICAL_PATH_SCHEMA_ACTIVE_BROWSER_PROVEN_PENDING_OWNER_MERGE_DECISION`
Prepared: 2026-08-05 (recreated from fresh main `de38b3db`; the 2026-08-04
parked package carried over verbatim except timestamps — see history note).
Decisions 1 and 2 are now recorded above; both files carry the narrow
`@human-gate-approved` marker referencing this record. The original package
shipped RED on purpose until this decision was recorded.

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
  excluded, idempotent on re-run. A re-apply is additionally EDIT-PRESERVING:
  each column is written only while it still holds the BEFORE value the
  ledger recorded, so a value the person changed between two applies (e.g.
  an updated `current_location_country`) is never reverted by the stale
  ledger row — the same current-value guard the rollback uses.
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
