-- ============================================================================
-- MIGRATION ALREADY APPLIED IN PRODUCTION — NEVER MANUALLY RE-APPLY.
--
-- Production ledger version : 20260928182413
-- Production ledger name    : agency_drafted_needs_output_column_v1
-- File timestamp            : 20260928190100, NOT the ledger version. This SQL replaces
--                             list_agency_drafted_needs_v1(), which is first created (and its
--                             column drafted_via_connection_id added) by
--                             20260928190000_agency_delegated_demand_and_placement_v1.sql, so
--                             the file sorts right after it and a local rebuild runs them in
--                             dependency order. The parity gate matches by name, not version.
-- Restored to repo          : 2026-11-01, for migration-history parity only. The live
--                             migration-parity gate (quality) found this ledger row with
--                             no repository file; the owner approved restoring the six
--                             such rows byte-exact (option 2, 2026-11-01).
-- Source of truth           : supabase_migrations.schema_migrations.statements of the row
--                             above, read 2026-11-01. Later-edited branch copies were NOT
--                             used as a source.
-- Parity proof              : everything after the marker line below is BYTE-EXACT to
--                             production's stored statements (1045 bytes).
--                             md5 = 2cf04bd4f272824cad1c2a5e8716bed3
--                             Verify: drop every line up to and including the marker line,
--                             then md5sum the remainder (no trailing newline).
-- ROLLBACK                  : supabase/rollbacks/20260928190100_agency_drafted_needs_output_column_v1.down.sql — RECONSTRUCTED after the
--                             production apply; the ledger stored no rollback. Local
--                             development resets and repo governance only.
--
-- @human-gate-approved
-- HUMAN GATE SCOPE: restoration of HISTORICAL, ALREADY-PRODUCTION-APPLIED SQL only
-- (owner decision 2026-11-01, option 2; RED draft PR, owner approves the merge).
-- migration-safety findings expected for this file: grant-or-revoke, security-definer function (drop + recreate).
-- This annotation grants NO right to apply, re-apply or change anything in production.
-- ============================================================================
-- >>> PRODUCTION STATEMENTS BELOW (byte-exact; do not edit) <<<
drop function if exists public.list_agency_drafted_needs_v1();
create function public.list_agency_drafted_needs_v1()
returns table(request_id uuid, connection_id uuid, title text, role_or_work_type text, status text, shared boolean, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.id, r.drafted_via_connection_id, r.title, r.role_or_work_type,
         r.status,
         exists (select 1 from public.agency_client_request_shares s
                  where s.request_id = r.id and s.connection_id = r.drafted_via_connection_id
                    and s.status = 'active'),
         r.created_at
    from public.customer_requests r
    join public.agency_client_connections c on c.id = r.drafted_via_connection_id
   where public.owns_company(c.agency_company_id)
   order by r.created_at desc
   limit 100;
$function$;
revoke all on function public.list_agency_drafted_needs_v1() from public, anon;
grant execute on function public.list_agency_drafted_needs_v1() to authenticated;