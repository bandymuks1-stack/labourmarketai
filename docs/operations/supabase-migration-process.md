# Supabase migrations — safe process and history reconciliation

Process documentation only. This repository is public: the production evidence behind it (history rows,
record counts, telemetry, security analysis) is kept in the owner's private audit (2026-10-18), not here.

## Why the `Supabase Preview` check fails

Production migrations are applied by hand through Supabase MCP `apply_migration` after owner approval. That tool
records the **apply timestamp** as the version in `supabase_migrations.schema_migrations`, while the repo file keeps
its own `YYYYMMDDHHMMSS_name.sql` version. The Supabase GitHub integration compares the two before it builds
anything and stops with "Remote migration versions not found in local migrations directory." This is a recording
difference, not missing schema: the 2026-10-18 audit found the live schema consistent with the repo apart from a
small number of findings handled privately with the owner.

## Rule: production changes only after explicit owner approval

- Production migrations: Supabase MCP `apply_migration`, one migration at a time, after owner approval.
- Never `supabase db push`, `db reset`, `migration repair`, rollback or `DROP` against production without a
  separate owner approval for that exact step.
- Never rename or renumber repo migration files (re-run hazard; `000N` files are frozen).
- Keep the `Supabase Preview` check enabled; it is not a required merge check.

## Safe integration configuration (owner, Supabase dashboard)

The integration's default branch `main` points at the production project. Supabase offers **Deploy to production**
as a separate option from **Automatic branching**. Before any history reconciliation:

1. Supabase Dashboard → project → **Project Settings → Integrations → GitHub Integration**.
2. Turn **Deploy to production** OFF. Keep the repository connection, **Automatic branching** and **Supabase
   changes only** unchanged.
3. Save. Evidence: a screenshot of the toggle, and no production deployment under **Branches → main** after the
   next merge.

Without step 2, aligning the history would let the integration apply merged-but-unapplied migration files to
production automatically, bypassing the owner gate.

Plan note: preview branches (PR environments) require the Supabase Pro plan; on the Free plan the check may stay
red even after reconciliation.

## Reconciliation order (each step needs its own owner approval)

1. **Deploy to production** OFF (above).
2. Resolve the open findings from the private audit.
3. Back up `supabase_migrations.schema_migrations` to the encrypted VPS archive.
4. History-only reconciliation with `supabase migration repair` semantics (writes the history table, never the
   schema): mark each production version that maps to a repo file `reverted` and the repo version `applied`, in one
   transaction, reversible from the backup.
5. Preview replay on an empty database: data migrations need guards (base: draft #2150).
6. Verify: a production schema-only dump hash is unchanged before/after; a merge to `main` triggers no production
   apply.

## How to audit again (read-only)

- Compare `statements` in `supabase_migrations.schema_migrations` with each repo file after normalising comments,
  whitespace, `;` and a `BEGIN`/`COMMIT` wrapper; match by version, then by name/filename suffix.
- Cross-check every `.rpc("…")` and `.from("…")` call in runtime code on `main` against the live catalog
  (`pg_proc`, `pg_class`, `storage.buckets`) — this is what tells you whether shipped code depends on structure that
  production does not have.
- Keep the results in the private audit; publish only process changes here.
