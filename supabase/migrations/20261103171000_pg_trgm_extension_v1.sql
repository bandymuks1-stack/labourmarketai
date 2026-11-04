-- @human-gate-approved — RED draft (create-extension): pg_trgm for the public job search trigram index. NOT applied. Apply only after explicit owner approval, via Supabase MCP apply_migration, as step 1 of the procedure in 20261103171100_public_vacancies_occupation_trgm_idx_v1.sql.
-- 20261103171000_pg_trgm_extension_v1
--
-- ONE statement: install pg_trgm into the `extensions` schema (where the
-- project's other extensions live: pg_stat_statements, pgcrypto, uuid-ossp,
-- btree_gist). No table, function, grant, policy or row is touched.
--
-- WHY: owner decision 2026-11-03 — free-text job search takes the pg_trgm
-- index direction, never a cap on the result total. The index itself is the
-- next migration (20261103171100); it needs the `gin_trgm_ops` operator class
-- this extension provides.
--
-- PRIVILEGE (read-only check, production 2026-11-03): pg_trgm 1.6 is
-- available and not installed; it is on `supautils.privileged_extensions`, so
-- the non-superuser `postgres` role may create it; `postgres` owns the
-- `extensions` schema and has CREATE on it. No new role or grant.
--
-- RUNTIME COST: none until an index or query uses it (it adds functions,
-- operators and two operator classes; no background worker, no shared memory).

begin;

create extension if not exists pg_trgm with schema extensions;

commit;

-- ROLLBACK
-- see supabase/rollbacks/20261103171000_pg_trgm_extension_v1.down.sql
-- (drop extension WITHOUT cascade: it refuses while the trigram index exists,
-- so the index rollback must run first).
