-- ROLLBACK for 20261117060000_public_organization_cv_v1
--
-- Drops the one function the migration created. It created no table, column,
-- policy, trigger or data, so nothing else is undone and no row changes. The
-- public page reads the function defensively: without it the company CV
-- section simply renders nothing.
--
-- Apply via Supabase MCP `apply_migration` only — never `supabase db push`.

begin;

drop function if exists public.get_public_organization_cv_v1(uuid);

commit;
