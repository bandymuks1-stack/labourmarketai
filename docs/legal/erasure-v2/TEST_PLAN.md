# Test plan: privacy erasure executor v2

Three gates, in order. Nothing touches production until gate 3, and gate 3 is the owner's.

## 1. Local throwaway PostgreSQL 16 cluster (no Docker): **DONE 2026-10-15, all green**

Everything lives under the scratch directory `gdpr/test/`. The cluster is created there and stopped
afterwards. It never connects to anything remote.

```bash
export PATH="/c/Program Files/PostgreSQL/16/bin:$PATH"
cd gdpr/test
initdb -D pgdata -U postgres -A trust -E UTF8 --locale=C
pg_ctl -D pgdata -o "-p 54329" -l pg.log start -w
bash run_test.sh            # recreates db "erasure" every run; writes nothing outside gdpr/
pg_ctl -D pgdata stop -m fast
```

How the stub schema is built (production shape, no production data):

* `pre.sql`: Supabase look-alikes: roles `anon`/`authenticated`/`service_role`, `auth.users`,
  `auth.uid()`, `storage.objects (bucket_id, name, owner, owner_id)`.
* `gen_stub.py` → `stub_base.sql`: one table per production table that has an FK onto profiles/workers
  (187 tables). Each has every such FK column with **the production NOT NULL flag and ON DELETE action**,
  taken from `pg_constraint` (catalog query, 2026-10-15; `work/joined.txt`).
* `extra.sql`: the non-FK columns the logic touches, the intra-table FKs that matter (journal → engagement
  context RESTRICT, booking → engagement RESTRICT, invitation → acceptance CASCADE, thread children, …),
  the production text of the 8 CHECKs the migration amends, and the guard triggers (append-only ledgers
  and events, `timesheets_frozen`, approver fill-once, `set_updated_at`, `protect_last_owner`).
* `../migration_up.sql` applied as is, then `scenario.sql` seeds 39 relations for a subject U (worker,
  confirmed and unconfirmed journal, a correction chain, consent and disclosure ledgers, privacy, org and
  personal requests with attachments, booking + engagement, shared and solo threads, invitations both ways,
  roster row, audit/ai/usage/pilot/notification rows, records U created for others, an append-only event,
  a decided approver slot, storage objects). It also seeds a colleague V, an invitee W, and a last-owner X.

Executed checks (`run_test.sh`, output in `test_output.txt`):

| # | Check | Result |
|---|---|---|
| 1 | migration applies on the stub; registry = 266 rows | pass |
| 2 | prepare U → `prepared` with per-relation counts + storage counts; prepare X → blocker `last_active_owner` | pass |
| 3 | execute X → `blocked`, profile untouched | pass |
| 4 | execute U → `storage_pending`, 4 storage ops (3 delete + 1 move) | pass |
| 5 | **44 post-conditions** (`assert_after_execute.sql`): profile/worker gone, auth user kept; confirmed entry + correction retained detached, unconfirmed deleted; confirmation U gave kept with NULL confirmer; consent ledger one tombstone, month-coarse, not in job report; disclosure detached; privacy + org requests retained, personal deleted, org attachment moved/renamed; booking/engagement detached, subject_key re-minted; solo thread deleted, U's message emptied, V's intact; invitations revoked/scrubbed, W's acceptance survives; e-mail-keyed rows; roster scrubbed; audit ids/names scrubbed **and `updated_at` not bumped**; ai_runs/usage/pilot/notifications scrubbed; work_objects/agreements created by U survive; append-only event + timesheet detached; approver slot nulled under the amended CHECK; backfill row gone; storage owner cleared; **no trigger left disabled** | pass |
| 6 | execute again → `replayed: true` (idempotent) | pass |
| 7 | storage_done refuses while objects remain; passes after the simulated Storage delete/move | pass |
| 8 | complete refuses while `auth.users` row exists; after delete → `completed`, subject id + paths NULL, no job column contains the subject id | pass |
| 9 | drift guard: a new FK onto profiles → `unclassified_relation` blocker | pass |
| 10 | failure path: forced CHECK violation → job `failed 23514 table=ai_runs constraint=…`, profile kept, 0 triggers disabled; retry after fix → `auth_pending` | pass |
| 11 | grants: anon=false, authenticated=false, service_role=true | pass |
| 12 | rollback refused after an executed job; on a never-executed DB rollback restores NOT NULLs, drops functions + columns | pass |

Limits of gate 1: stub tables carry only the columns the logic needs. Production RLS policies, the full
trigger set, and the real guard function bodies are absent. The real ones are replaced by refusing
equivalents. PG16 locally vs PG17 in production.

## 2. Static review gates (before opening the PR)

* `node .github/scripts/migration-safety.mjs`: expect RED flags (SECURITY DEFINER grants, loosened CHECKs,
  `-- @human-gate-approved` present). The PR opens as **draft** with `needs-human-gate`.
* Diff the registry against a fresh catalog query on the day of apply:
  `select conrelid::regclass, attname, confdeltype from pg_constraint … where confrelid in (profiles, workers)`
  has to match `privacy_erasure_relations` exactly. Otherwise reclassify first.
* `pnpm -F web typecheck` after regenerating DB types: the 99 now-nullable columns have to be handled in
  the UI (erased participant, empty message body, `Erased person`).
* Guard tests: `privacy-export-completeness` must still pass. Add a guard that fails when an FK onto
  profiles/workers appears in a migration without a registry row.

## 3. Production-shaped rehearsal (owner gate; not done)

1. A **Supabase branch** or a restored copy of production. Never production itself. Apply the migration
   with MCP `apply_migration` on the branch.
2. Pick a synthetic QA account with real-shaped data (journal + confirmation, booking, thread, avatar).
   Never a real person. Run steps 1–9 of DESIGN §4 through the actual server action, with the real Storage
   API and `auth.admin.deleteUser`.
3. Verify: zero rows anywhere reference the profile/worker ids (dynamic sweep over the registry + JSON
   sweep); objects gone; `auth.users` row gone; completed job holds no id; the other parties' views (the
   colleague's thread, the employer's timesheet and journal) render correctly with an erased participant.
4. Measure lock time and duration of `execute_v2`. Expect under a second at today's volume.
5. Only then can the owner approve the production apply (RED), via MCP `apply_migration`, never
   `supabase db push`.
