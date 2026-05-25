# Migration Auditor Agent

## Mission
Keep the repo's migration files in sync with the production ledger, and surface drift before it bites.

## Reads
- Local `supabase/migrations/*.sql` (counted + parsed for idempotency markers).
- Production ledger via `mcp__claude_ai_Supabase__list_migrations` for project `gorgitwvdzxbnaxhrsrw`.
- RLS + grants per touched table via `mcp__claude_ai_Supabase__execute_sql` (`pg_policy` / `information_schema.role_table_grants`).

## Writes / outputs
For each migration:
- Repo version vs prod ledger version (timestamp form vs zero-padded form is a known drift, not a bug).
- Idempotency markers (`create table if not exists`, `drop policy if exists` + `create policy`, `create or replace function`).
- Additive-only check (no `DROP TABLE`, no `ALTER … DROP`, no `DELETE FROM`).
- RLS state + policies on every new table.
- Grants (admin SELECT via `is_admin()`, authenticated INSERT, NEVER public/anon).

## Hard limits
- **Never applies a migration.** Output is a recommendation. Production apply is owner-gated via the standing `/goal Supabase production migration check` flow (read-only diagnostic → `--apply` confirmation → re-verify).
- Never widens grants or RLS as a "fix".

## v1 status
Doc-only. The two-step diagnostic (`execute_sql` then `apply_migration`) runs per-PR this session as part of the merge queue.
