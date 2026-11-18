-- ============================================================================
-- 20260928180000 — ONE meaning of "this organization acts as an agency".
--
-- RED by rule (redefines two SECURITY DEFINER functions). OWNER-APPROVED
-- 2026-09-28 ("APPROVED: AGENCY CAPABILITY CONSISTENCY + RED MIGRATION").
-- Apply only via Supabase MCP apply_migration. Never `db push`.
-- @human-gate-approved
--
-- WHY. Production walk 2026-09-28: QA-SYNTHETIC Gama is a construction
-- company that declared `workforce_provider` + `recruitment_partner`. Home
-- recognised it as an agency (company type OR declared role) and offered
-- "Pakviesti klientą"; the two RPCs below accepted only
-- company_type = 'staffing_agency' and raised `not_agency`. A construction
-- company may legitimately also supply people — its type is not rewritten.
--
-- WHAT CHANGES.
--   * `company_acts_as_agency(company_id)` — the SQL twin of
--     apps/web/lib/company/agency-capability.ts: the company's type is
--     'staffing_agency' OR its organization (organizations.legacy_company_id)
--     holds workforce_provider / talent_provider / recruitment_partner in
--     organization_roles. SECURITY INVOKER, no grant: it is called from the
--     definers below; it is a CAPABILITY rule, never an authorization.
--   * `create_agency_client_connection_v1` and
--     `submit_agency_candidate_offer_v1`: the `company_type` check becomes
--     that rule. Everything else is byte-identical to production (read back
--     2026-09-28) — `owns_company` (owner / admin membership) still gates the
--     caller first, the roster check, the share/connection liveness, the
--     idempotency. Grants restated exactly as production has them.
-- No table, column or policy change. No data change.
--
-- ROLLBACK: supabase/rollbacks/20260928180000_agency_capability_one_rule_v1.down.sql
-- ============================================================================

create or replace function public.company_acts_as_agency(p_company_id uuid)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select exists (
           select 1 from public.companies c
            where c.id = p_company_id and c.company_type = 'staffing_agency')
      or exists (
           select 1 from public.organizations o
             join public.organization_roles r on r.organization_id = o.id
            where o.legacy_company_id = p_company_id
              and r.role_slug in ('workforce_provider', 'talent_provider', 'recruitment_partner'));
$function$;

revoke all on function public.company_acts_as_agency(uuid) from public, anon;

create or replace function public.create_agency_client_connection_v1(p_agency_company_id uuid, p_invited_email text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_invited_email, '')));
  v_id    uuid;
  v_ctype text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  -- Caller must hold company authority (creator or active owner/admin
  -- member — the one rule in owns_company), and the company must act as an
  -- agency (company type OR a declared workforce role — company_acts_as_agency).
  if not public.owns_company(p_agency_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  select c.company_type into v_ctype from public.companies c
   where c.id = p_agency_company_id;
  if v_ctype is null then raise exception 'not_owner' using errcode = '42501'; end if;
  if not public.company_acts_as_agency(p_agency_company_id) then raise exception 'not_agency' using errcode = '42501'; end if;
  if v_email = '' or v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  -- Idempotent: reuse an existing non-terminal invite for this (agency, email).
  select id into v_id from public.agency_client_connections
   where agency_company_id = p_agency_company_id
     and lower(invited_email) = v_email
     and status in ('pending', 'active');
  if v_id is not null then return v_id; end if;

  insert into public.agency_client_connections (agency_company_id, invited_email, invited_by)
  values (p_agency_company_id, v_email, v_uid)
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.create_agency_client_connection_v1(uuid, text) from public, anon;
grant execute on function public.create_agency_client_connection_v1(uuid, text) to authenticated;

create or replace function public.submit_agency_candidate_offer_v1(p_request_share_id uuid, p_worker_id uuid, p_note text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid       uuid := auth.uid();
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_conn      uuid;
  v_agency    uuid;
  v_client    uuid;
  v_request   uuid;
  v_id        uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  -- Resolve the connection + request from the SHARE (client cannot forge these).
  -- Everything must be live at submit time.
  select c.id, c.agency_company_id, c.client_company_id, s.request_id
    into v_conn, v_agency, v_client, v_request
    from public.agency_client_request_shares s
    join public.agency_client_connections c on c.id = s.connection_id
   where s.id = p_request_share_id
     and s.status = 'active'
     and c.status = 'active';
  if v_conn is null then raise exception 'share_not_active' using errcode = '42501'; end if;

  -- The caller must OWN the agency company, and it must act as an agency.
  if not public.owns_company(v_agency) then raise exception 'not_owner' using errcode = '42501'; end if;
  if not public.company_acts_as_agency(v_agency) then
    raise exception 'not_agency' using errcode = '42501';
  end if;

  -- The worker must be an ACTIVE roster member of THAT agency company.
  if not exists (
    select 1 from public.company_workers cw
    where cw.company_id = v_agency and cw.worker_id = p_worker_id and cw.status = 'active'
  ) then
    raise exception 'worker_not_on_roster' using errcode = '42501';
  end if;

  -- Idempotent: re-affirm an existing active offer, never duplicate.
  insert into public.agency_candidate_offers
    (connection_id, request_share_id, agency_company_id, client_company_id,
     request_id, worker_id, status, note, created_by)
  values
    (v_conn, p_request_share_id, v_agency, v_client, v_request, p_worker_id, 'offered', v_note, v_uid)
  -- A re-offer re-binds to the CURRENT active share/connection (a stale row
  -- from a previously revoked connection must never keep the old provenance).
  on conflict (agency_company_id, request_id, worker_id) where (status = 'offered')
  do update set connection_id     = excluded.connection_id,
                request_share_id  = excluded.request_share_id,
                client_company_id = excluded.client_company_id,
                note              = coalesce(excluded.note, public.agency_candidate_offers.note),
                updated_at        = now()
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.submit_agency_candidate_offer_v1(uuid, uuid, text) from public, anon;
grant execute on function public.submit_agency_candidate_offer_v1(uuid, uuid, text) to authenticated;
