# supabase/rollbacks — paired DOWN scripts

Every migration in `supabase/migrations/<name>.sql` must ship a paired
rollback at `supabase/rollbacks/<name>.down.sql` in the **same PR**. This is a
hard CI rule: `.github/scripts/migration-safety.mjs` (check `q`,
`missing-rollback-file`) fails any PR that adds a migration without its
`.down.sql`.

## Why a separate file (the in-migration `-- ROLLBACK` comment is not enough)

Conditional prod-apply autonomy (governance 2026-06-12, doctrine-guard §4)
lets the executing agent self-apply a **GREEN** migration to prod via Supabase
MCP. One of the five preconditions is a *tested rollback script*. A commented
block inside the forward migration cannot be executed without hand-editing
under pressure; a standalone `.down.sql` can be applied verbatim via MCP if the
forward change must be reversed.

## Conventions

- File name mirrors the migration exactly, with `.sql` → `.down.sql`.
- The down script reverses the forward change and is itself reversible-safe:
  destructive reversals (dropping a column/constraint) must guard or warn when
  data added under the forward change would be lost.
- Apply via Supabase MCP `apply_migration` — never `supabase db push`.
- RED-tier migrations also ship a `.down.sql`; they are simply applied by the
  owner channel after human approval, not self-applied.

## Backfill status

Forward-only: rollback files are authored for every NEW migration. Already-
applied historical migrations are backfilled on a best-effort basis starting
with the most recent (the `20260612130000` ru-locale CHECK widening is the
first, since it was self-applied under the new autonomy rule).
