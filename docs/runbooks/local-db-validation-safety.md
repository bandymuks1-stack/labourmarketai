# Local DB validation safety runbook

> **Status:** Binding for any session that intends to validate a Supabase
> migration locally (PR #81 / future SR-1-style migrations). Authored
> after the two failure modes that blocked PR #81: Docker absent and
> Supabase CLI linked to production.

## Why this runbook exists

PR #81 (SR-1 Tier-2 schema, migration `0022_organization_tier2.sql`) is
still **DRAFT / do-not-merge / needs-db-validation / blocked:migration**
because local validation could not be attempted safely. Two independent
blockers were present and either one alone is enough to stop:

1. **Docker absent.** `supabase start` and `supabase db reset` require
   a local Postgres container. Without Docker there is no local target
   — the CLI's fallback behaviour is not something to rely on.
2. **CLI linked to production.** `supabase/.temp/linked-project.json`
   pointed at `gorgitwvdzxbnaxhrsrw` (the labourmarket.ai production
   project). A stray `--linked` flag, or a CLI minor version that
   changes a default, could have routed a destructive command at prod.

The harness this runbook gates exists so future agents and humans can
verify those preconditions deterministically before any DB action.

## The readiness doctor

```
pnpm -F web check:db-validation-readiness
```

The doctor is **read-only**. It never invokes a `supabase` subcommand,
never touches a database, never modifies link state, never writes any
file. It exits:

- **0** — environment looks safe for local DB validation.
- **1** — at least one blocker; do not proceed.

It reports on three things:

1. **Supabase CLI** presence (PASS if installed, FAIL otherwise).
2. **Docker** presence (PASS if installed and on PATH, FAIL otherwise).
3. **Supabase link state**:
   - No `linked-project.json` → PASS (CLI unlinked).
   - Linked to the known production ref `gorgitwvdzxbnaxhrsrw` → **FAIL**.
   - Linked to any other ref → WARN (verify it's a staging / local-only
     target before any DB command).

If the doctor exits non-zero, **stop**. Do not "just try" a Supabase
command "to see what happens." The whole point is that a wrong default
can leak to production.

## Hard rules — never do these for "validation"

- **Never** run `supabase db push`. Push applies migrations to the
  *linked* project. If the project is linked to prod, push hits prod.
  Validation does not require push.
- **Never** pass `--linked` to any `supabase` command during local
  validation. `--linked` routes the operation at the remote project.
- **Never** run `supabase db reset --linked` (catastrophic).
- **Never** use `supabase migration up --linked`.
- **Never** invoke MCP `apply_migration` for a draft migration without
  explicit owner approval recorded in the PR.
- **Never** "unlink to bypass the doctor" without then re-running the
  doctor afterwards.

## Safe sequence (local Docker target)

Run these in order. Stop at the first failure.

1. **Clean working tree.** `git status --short` must be empty (or only
   contain unrelated files you understand). The migration under test
   should already be on a checked-out branch.
2. **Confirm the branch.** `git branch --show-current` matches the
   migration PR branch. You're not on `main`.
3. **Run the doctor.**
   ```
   pnpm -F web check:db-validation-readiness
   ```
   Must exit 0. If it fails, stop and fix the listed blockers from
   outside this workflow (install Docker, `supabase unlink`, etc.).
4. **Start the local Supabase stack.**
   ```
   supabase start
   ```
   This downloads images on first run, then boots a local Postgres
   on the configured port. Verify with `supabase status` — the API
   URL and DB URL must be `127.0.0.1` / `localhost`, never a Supabase
   cloud hostname.
5. **Run local reset.** Only after step 4 confirms a local target:
   ```
   supabase db reset
   ```
   `db reset` (without `--linked`) rebuilds the local DB from
   migrations `0001..N`. It does NOT touch the remote project.
6. **Inspect results.** From the local DB:
   - All migrations applied in order, no errors.
   - New tables (`organization_representatives`,
     `organization_countries`) exist.
   - New columns on `organizations` exist (`tier`,
     `registration_code`, etc.).
   - The promotion RPC is invocable; calling it with a non-owner UUID
     errors with `42501`; calling it with a malformed input errors
     with `22023`.
   - RLS policies behave: an org owner sees their rows; another
     authenticated user does not.
7. **Staging-copy validation** (separate from local). Apply the
   migration to a copy of production data (NOT production itself) in
   a staging Supabase project. Verify:
   - All existing `organizations` rows now have `tier='pilot'` and
     no other field is touched.
   - RLS policies do not accidentally hide rows from authenticated
     users.
8. **Author the rollback plan.** Either a down migration or a
   documented `git revert` + manual rollback SQL, tested on the
   staging copy.
9. **Owner explicit prod-migration approval.** Owner posts approval
   in the migration PR thread. Agents never auto-approve this step.
10. **Apply to production.** Owner runs the apply step manually —
    Supabase SQL editor, or MCP `apply_migration` with the
    single-line COMMENT convention. Agents never execute this step,
    even with the doctor green.
11. **Post-apply verification.** Owner runs the tier-count and
    structural sanity queries documented in the PR body.

Only after every step is complete: convert the migration PR from
Draft → Ready and merge it.

## Stop conditions (anywhere in the sequence)

- The doctor reports any FAIL.
- `supabase status` shows a remote hostname instead of localhost.
- Any `supabase` command output mentions the production project ref
  (`gorgitwvdzxbnaxhrsrw`).
- `supabase db reset` errors in a way that suggests it tried to
  connect to a remote project.
- An RLS policy unexpectedly hides rows from `authenticated` (likely
  a missing GRANT — see the explicit-grants doctrine).
- A check constraint rejects valid existing data (suggests the new
  column's default did not apply atomically).
- Migration sequence cannot replay cleanly from 0001.

Stop, post a brief description of what you saw, and wait for explicit
owner direction.

## Why no agent ever applies the prod migration

Doctrine (`labourmarketai_supabase_project_ref` memory, the per-PR
DB-validation checklist, and the project's auto-commit policy
exclusion list) all hold the same line: agents may scaffold migrations,
draft PRs, and run local doctors. The actual prod apply is a manual
owner action because the failure modes are not bounded (lock
contention, RLS regressions, data-integrity races) and the recovery
cost is large.

This runbook codifies that line. Future migration PRs should link
back to it from their description.
