# `usage_cost_events` — PRODUCTION-AHEAD-OF-MAIN DRIFT INVENTORY AND RECOVERY PLAN

**Date** 2026-08-03 · **Base commit** `2813c78b` · **Production project ref**
`gorgitwvdzxbnaxhrsrw` · **Method** READ-ONLY (SELECT against
`supabase_migrations.schema_migrations`, `pg_catalog`, `information_schema`;
`git show` against the unmerged branch). **No migration applied. No production
DDL or data changed. No ledger row written.**

Parent record: [`post-merge-production-readiness-baseline-2026-08-03.md`](./post-merge-production-readiness-baseline-2026-08-03.md) §4.

---

## 0. Verdict, first

> ## `PRODUCTION_SCHEMA_DRIFT_REQUIRES_MANUAL_RECONCILIATION`

The four production-applied migrations and the two Draft PR #898 files **do not
match** — not in count, not in version, not byte-for-byte, and not fully in
semantics (one table `COMMENT` differs). Per the standing instruction *"if
production and the PR #898 files do not match, stop and present the difference;
do not create a 'similar' migration"*, **no recovery PR was opened.** §5 gives
the exact reconciliation options for the owner to choose between.

The resulting *behavioural* schema is equivalent. The *history* is not, and the
history is what the migration runner acts on.

---

## 1. The four production ledger rows

All four were applied by `bandymuks1@gmail.com` via Supabase MCP
`apply_migration` (which mints its own `version` from the wall clock), not via
`supabase db push`. That is why no version corresponds to a repo filename.

| # | Ledger version | Name | Stmts | SQL bytes | SQL md5 | Rollback stmts stored |
|---|---|---|---|---|---|---|
| 1 | `20260728114008` | `usage_cost_events_v1` | 1 | 5266 | `c05d4a1308582e9eaeda3404d4d52fe4` | **0** |
| 2 | `20260728114254` | `usage_cost_events_v1_reapply` | 1 | 5351 | `76066638444ff54e96a56028263f63b8` | **0** |
| 3 | `20260728114301` | `usage_cost_events_truncate_guard_v1` | 1 | 759 | `6da7b0d1dceec7d5ac9f5c0f31ce7322` | **0** |
| 4 | `20260728114353` | `usage_cost_events_v1_clean_start` | 1 | 6134 | `0d924cf8e4b7742b260587e331670242` | **0** |

Read as a story: apply → re-apply a corrected version → add the TRUNCATE guard →
drop everything and recreate from a clean start (row 4 explicitly removes a
single synthetic proof event created by the production verification run). This
is an interactive fix-forward session, faithfully recorded.

## 2. The two repo files (Draft PR #898, branch `feat/canonical-usage-cost-event-model-v1` @ `466062be`)

| Repo file | Lines | SHA-256 | Paired rollback |
|---|---|---|---|
| `supabase/migrations/20260728120000_usage_cost_events_v1.sql` | 191 | `e0e07a1984065efa393005d7f014b3224db9af3098a84a4dab997a7490fa6615` | `supabase/rollbacks/20260728120000_usage_cost_events_v1.down.sql` — **present**, zero-row guarded |
| `supabase/migrations/20260728140000_usage_cost_events_truncate_guard_v1.sql` | 44 | `6306791a601a746983b1ef7d8fb02a941c381b60cb5b5a72803a3cd13aed52f4` | `supabase/rollbacks/20260728140000_usage_cost_events_truncate_guard_v1.down.sql` — **present** |

## 3. The required comparison table

| Dimension | Production | PR #898 | Equivalent? |
|---|---|---|---|
| **Ledger version(s)** | `20260728114008`, `114254`, `114301`, `114353` | would mint `20260728120000`, `20260728140000` | **NO** — 4 vs 2, and no version overlaps |
| **Migration count** | 4 | 2 | **NO** |
| **File ↔ ledger mapping** | none — no repo file corresponds to any ledger row | — | **NO** |
| **Final table columns (20)** | see §4 | identical | **YES** |
| **CHECK/PK/FK constraints (22)** | see §4 | identical | **YES** |
| **Indexes (5 + pkey)** | identical definitions | identical | **YES** |
| **Triggers (2)** | `usage_cost_events_no_mutation` (BEFORE UPDATE OR DELETE, ROW), `usage_cost_events_no_truncate` (BEFORE TRUNCATE, STATEMENT) | identical | **YES** |
| **Trigger function bodies** | `forbid_mutation` `prosrc` md5 `df712894ab30a336b6a8813904042a01`; `forbid_truncate` md5 `61320d6dec459951aff7eb98ab834f97` | repo bodies md5 `a7b34aff77071a44985e80a0cd2c7359` / `597c58b79951472bef1a8b8ca4e9f04b` | **NO byte-equal / YES semantically** — production's `clean_start` collapsed `raise exception … \n using errcode` onto one line; the statement, message, and SQLSTATE `42501` are identical |
| **RLS enabled** | `true` | `true` | **YES** |
| **Policy** | `usage_cost_events_select` — `SELECT TO authenticated USING is_admin()` | identical | **YES** |
| **Grants** | `authenticated: SELECT`; `service_role: SELECT, INSERT`; owner `postgres` full (default) | identical | **YES** |
| **Table `COMMENT`** | `"… INSERT-only: update/delete/**truncate** are revoked and trigger-blocked …"` | `"… INSERT-only: update/delete are revoked and trigger-blocked …"` — the repo's truncate-guard file never updates the comment | **NO** — one token differs |
| **Dependencies** | `public.profiles(id)`, `public.organizations(id)` (both `ON DELETE SET NULL`), `public.is_admin()`; **nothing depends on `usage_cost_events`** — no view, no FK inbound, and no reader on `main` | same | **YES** |
| **Rollback in the ledger** | **absent** — all four rows store 0 rollback statements | both files ship paired, guarded `.down.sql` | **NO** — production cannot self-rollback |
| **Statement-level DML** | `INSERT INTO` **no** · `DELETE FROM` **no** · `UPDATE` **no**. Row 4 carries `DROP TABLE IF EXISTS`, which destroyed one synthetic proof row. | no DML in either file | **YES for DML — there is none to repeat** |
| **DDL class** | `create table`, `create policy`, `grant`/`revoke`, `create function`, `create trigger`, and (row 4) `drop table` | same classes, minus `drop table` | partially |
| **Safe to restore the PR #898 files to `main` as an already-applied record?** | — | — | **NO — see §4.3** |

## 4. Detail

### 4.1 Behavioural equivalence — confirmed

Every behavioural object matches: 20 columns, 22 constraints (`usage_cost_events_pkey`,
two FKs, and 19 CHECKs including the five honesty constraints
`currency_eur` / `amount_types` / `amount_sign` / `pricing_version_required` /
`billing_source_for_actual` / `no_fabricated_zero`), 5 indexes plus the primary-key
index, both append-only triggers, RLS on, one admin-only SELECT policy, and grants
`authenticated:SELECT` + `service_role:SELECT,INSERT` with UPDATE/DELETE granted to
no role.

**If the goal were only "does production behave like the PR intended?", the answer
is yes.**

### 4.2 The two real mismatches

1. **Table `COMMENT`.** Production says `update/delete/truncate are revoked and
   trigger-blocked`; the repo's `20260728120000` file says `update/delete are
   revoked and trigger-blocked`, and `20260728140000` adds the truncate trigger
   **without** updating the comment. Replaying the repo files onto an empty
   database therefore produces a table whose own documentation understates its
   guarantees. Cosmetic in effect, but it means the file set is **not** a faithful
   record of production.

2. **Trigger-function source text.** Semantically identical, textually different
   (line break before `using errcode`). Any checksum-based drift detector will keep
   flagging this forever unless one side is normalised.

### 4.3 Why restoring the PR #898 files as-is would be unsafe

The repo files would mint versions `20260728120000` and `20260728140000`. Neither
exists in production's ledger. A migration runner (`supabase db push`, or the
Supabase Preview job) therefore classifies both as **pending** and will try to
apply them to production.

Most of `20260728120000` is idempotent (`create table if not exists`,
`create or replace function`, `create index if not exists`,
`drop trigger if exists`). **`create policy usage_cost_events_select` is not** —
PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, so the statement would raise
`42710 duplicate_object` and the migration would fail mid-transaction.

So the naive restore does not merely fail to fix the drift — it converts a red
*preview* check into a failing *production* push. This is the single most
important finding in this document.

### 4.4 Secondary observation (not fixed here)

Both PR #898 migration files and both rollback files already carry the
`-- @human-gate-approved` marker while the PR is still Draft and labelled
`needs-human-gate`. Whether that marker was owner-authorised is a question for the
owner; **this audit did not add, remove, or rely on it.**

---

## 5. RECOVERY PLAN

**Goal:** `local main schema == production schema history`, with a green
`Supabase Preview`, without rewriting the production ledger and without applying
anything to production a second time.

### 5.1 Recommended direction — Option A: repair the repo to match the ledger

Add four migration files to `supabase/migrations/` whose **filenames carry
production's exact ledger versions** and whose **bodies are production's exact
stored `statements` text**, copied verbatim from
`supabase_migrations.schema_migrations`:

```
20260728114008_usage_cost_events_v1.sql
20260728114254_usage_cost_events_v1_reapply.sql
20260728114301_usage_cost_events_truncate_guard_v1.sql
20260728114353_usage_cost_events_v1_clean_start.sql
```

Then supersede PR #898's two files (they become the *design* record; the four
above become the *history* record), and append four `Applied` rows to
`docs/APPLIED_LEDGER.md` stating the real apply date (2026-07-28), the real
applier, and the fact that they were applied via MCP before the files existed.

**Why this direction:**

- It does not touch the production ledger (the standing constraint).
- Every version already exists remotely → the runner sees zero pending
  migrations → `Supabase Preview` goes green with no apply.
- A local `supabase db reset` replays the true history and produces production's
  exact schema **including** the `/truncate` comment, so the §4.2 mismatches
  disappear by construction rather than by editing.
- There is no DML anywhere in the four bodies, so no backfill can repeat.

**Cost, stated honestly:** it enshrines the messy fix-forward history
(apply → reapply → guard → clean_start, where the fourth drops the third's
table) permanently in the repo. That is the price of a truthful history, and it
is the correct price.

### 5.2 Option B — repair the ledger to match the repo (NOT recommended)

Delete the four ledger rows and insert two for `20260728120000` /
`20260728140000`. This **rewrites the production ledger**, which the standing
constraint forbids, and it would also require an `ALTER TABLE … COMMENT` in
production to make the repo's comment true. Listed only so the owner sees the
whole option space.

### 5.3 Proof obligations before any such PR leaves Draft

Each must be demonstrated, not asserted:

| # | Obligation | How it is proven |
|---|---|---|
| 1 | Migration versions are unique | `ls supabase/migrations` sorted, no duplicate version prefix; and none of the four collides with the 173 existing files |
| 2 | File content matches production | `md5(file_body) == md5(array_to_string(statements, E'\n'))` for all four, reproducing §1's checksums exactly |
| 3 | `supabase db reset` passes locally | full local reset replaying all 177 migrations, 0 errors |
| 4 | The reset result equals production | post-reset catalog dump for `usage_cost_events` (columns, constraints, indexes, triggers, function `prosrc`, policy, grants, **table comment**) compared field-by-field against §4's production dump |
| 5 | The runner will not re-apply to production | `supabase migration list --linked` shows all four as Local **and** Remote; no pending rows |
| 6 | No data backfill repeats | grepped and confirmed: zero `INSERT INTO` / `UPDATE` / `DELETE FROM` in all four bodies (§3). The only data effect is row 4's `DROP TABLE`, which on a fresh reset drops a table that has just been created in the same replay |
| 7 | Rollback history is honest | the four restored files carry **no** invented rollback. Production stored none, and inventing one would be a fabricated record. PR #898's two guarded `.down.sql` files stay with PR #898, described as the rollback for the *design*, not for the applied history |
| 8 | `migration-safety` classification | these files contain `grant`/`revoke`, `create policy`, `drop table` → the gate will be **RED by classification**. That is correct and must stay red. **`@human-gate-approved` must not be self-added.** |

### 5.4 What is explicitly out of scope of any recovery PR

- Applying anything to production. All four are already applied.
- Touching `public.usage_cost_events` rows (there are none) or its privileges.
- Merging PR #898's application code. The drift fix is history-only; whether the
  usage/cost *feature* ships is a separate, billing-adjacent decision.

---

## 6. Owner decisions required

| # | Decision | Default if undecided |
|---|---|---|
| D1 | Option A (repair repo to ledger) or Option B (rewrite ledger)? | Nothing happens; `Supabase Preview` stays red on `main` and every local reset produces a schema that is not production's |
| D2 | If A: confirm that enshrining the four-step fix-forward history in the repo is acceptable | — |
| D3 | Confirm the `-- @human-gate-approved` markers already present in PR #898's files (§4.4) were owner-authorised | — |
| D4 | Decide PR #898's fate independently: merge the design + app code, or close it as superseded | Stays Draft |

**No production object, row, privilege or ledger entry was modified in producing
this document.**
