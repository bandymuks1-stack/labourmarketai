# Applied Migration Ledger

> Human-readable record of migrations **actually applied to prod**
> (`gorgitwvdzxbnaxhrsrw`), who approved each, and what it did. Source of truth
> for "is it live" is always the Supabase ledger (`supabase_migrations.schema_migrations`)
> + this file. Migrations are applied **manually via Supabase MCP `apply_migration`**
> — there is no automated apply step, and `supabase db push` is never used (the
> repo filenames don't match the ledger versions). See
> `docs/CONVERGENCE_CHANGELOG.md §3` and PLATFORM_DOCTRINE §16.
>
> **Naming note:** the repo filename (`YYYYMMDDHHMMSS_*` per §16) and the ledger
> `version` differ for everything applied via MCP `apply_migration` — the tool
> stamps its own apply-time timestamp. Both identify the migration by `name`.

| Repo file | Ledger version | Applied (UTC) | Approved by | What it did |
|---|---|---|---|---|
| `20260530120000_drop_legacy_threads_messages.sql` | `20260530120000` | 2026-05-30 | DI | Dropped the unused legacy `threads` + `messages` tables (0 rows) + `can_access_thread()`; `conversations*` is canonical. |
| `20260530120100_projects_company_to_organization.sql` | `20260530120100` | 2026-05-30 | DI | Added `projects.organization_id` (FK `organizations`, `ON DELETE RESTRICT`) + legacy-bridge backfill; kept nullable `company_id` (non-destructive). |
| `20260530130000_journal_integrity_guards.sql` | `20260530084241` | 2026-05-30 | DI + Chat-Claude | Salvaged from retired PR #10b 0014 (PR #156). Added `journal_entries_original_language_chk` CHECK (canonical 10-locale set, mirrors `apps/web/lib/i18n/config.ts`; `NOT VALID`→`VALIDATE`, 5 live rows all `lt`) + narrowed `journal_entries_insert` RLS to `owns_worker(worker_id) AND visibility_scope='closed'` (§4 default-closed). Additive, reversible. |

## Deferred (committed/known, NOT applied)
- Append-only **trigger** guards on journal tables (defense-in-depth beyond RLS default-deny) — must respect the correction/supersede/soft-delete lifecycle; `TASKS.md`.
- `feature_flags` / `proof_of_work` scaffolds (unshipped features) — `TASKS.md`.
