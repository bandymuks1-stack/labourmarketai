-- Rollback for 20260707120000_company_need_public_intake.sql
--
-- Drops ONLY the two NEW objects introduced by that migration: the anon
-- intake RPC and its dedicated table. There is no pre-existing object to
-- restore. Any already-submitted rows are removed with the table — this is
-- acceptable because the table is brand-new in the same migration and holds
-- only v1 public intake rows; if rows must be preserved before a rollback,
-- export them via the service-role path first.

begin;

drop function if exists public.submit_company_need_public_v1(
  text, text, text, text, text, text, text, text, integer, text,
  text, text, text, boolean, text, text, text, text
);

drop table if exists public.company_need_public_intakes;

commit;
