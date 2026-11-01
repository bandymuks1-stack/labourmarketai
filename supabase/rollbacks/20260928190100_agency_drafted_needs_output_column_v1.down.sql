-- ROLLBACK for 20260928190100_agency_drafted_needs_output_column_v1.sql
-- RECONSTRUCTED after the production apply; the production ledger stored NO rollback.
-- Returns list_agency_drafted_needs_v1() to its predecessor: the definition and grants of
-- 20260928190000_agency_delegated_demand_and_placement_v1.sql (lines 169-190), copied
-- verbatim. That predecessor already returns `shared`, so apps/web/lib/agency/
-- delegation-read.ts keeps working after this rollback. Local resets only.
begin;
drop function if exists public.list_agency_drafted_needs_v1();
create or replace function public.list_agency_drafted_needs_v1()
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
commit;
