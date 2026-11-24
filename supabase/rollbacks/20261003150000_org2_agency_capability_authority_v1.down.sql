-- ROLLBACK for 20261003150000_org2_agency_capability_authority_v1.sql
-- Restores the PRODUCTION pre-image captured 2026-10-03 (pg_get_functiondef /
-- pg_policies, project gorgitwvdzxbnaxhrsrw). Manual: apply via Supabase MCP.
-- Marks written by the new R2 (payload.agency_id = company id) are plain jsonb
-- and stay in place; production held 0 such rows when this was written.

-- policy first: it references the helper dropped last
drop policy if exists job_demands_select on public.job_demands;
create policy job_demands_select on public.job_demands
  for select
  using (
    is_admin()
    or (exists (
          select 1
            from projects p
           where p.id = job_demands.project_id
             and owns_company(p.company_id)))
    or (
      status = 'open'::text
      and auth.uid() is not null
      and (
        visibility = 'public'::text
        or (visibility = 'agencies_only'::text and profile_role() = 'agency'::text)
      )
    )
  );

create or replace function public.mark_agency_can_offer(p_request_id uuid, p_note text default null::text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid      uuid := auth.uid();
  v_agency uuid;
  v_name   text;
  v_status text;
  v_marked boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select a.id, a.legal_name into v_agency, v_name
    from public.agencies a where a.profile_id = uid;
  if v_agency is null then
    return 'not_agency';
  end if;

  select cr.status,
         exists (
           select 1
           from jsonb_array_elements(
                  coalesce(cr.payload -> 'agency_offers', '[]'::jsonb)
                ) o
           where o ->> 'agency_id' = v_agency::text
         )
    into v_status, v_marked
    from public.customer_requests cr
   where cr.id = p_request_id;
  if not found then
    return 'request_not_found';
  end if;
  if v_status is distinct from 'submitted' then
    return 'request_not_open';
  end if;
  if v_marked then
    return 'already_marked';
  end if;

  update public.customer_requests
     set payload = jsonb_set(
           coalesce(payload, '{}'::jsonb),
           '{agency_offers}',
           coalesce(payload -> 'agency_offers', '[]'::jsonb)
             || jsonb_build_object(
                  'agency_id', v_agency::text,
                  'agency_name', v_name,
                  'marked_at', now(),
                  'note', nullif(btrim(coalesce(p_note, '')), '')))
   where id = p_request_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'agency_can_offer', 'customer_requests', p_request_id,
          jsonb_build_object('agency_id', v_agency,
                             'note', nullif(btrim(coalesce(p_note, '')), '')));

  return 'marked';
end $function$;

create or replace function public.list_open_demand_for_agencies()
returns table(id uuid, role_text text, country text, team_size integer, start_period text, duration text, created_at timestamp with time zone, can_offer_marked boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  uid      uuid := auth.uid();
  v_agency uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select a.id into v_agency from public.agencies a where a.profile_id = uid;
  if v_agency is null then
    return;
  end if;

  return query
  select cr.id,
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         cr.duration,
         cr.created_at,
         exists (
           select 1
           from jsonb_array_elements(
                  coalesce(cr.payload -> 'agency_offers', '[]'::jsonb)
                ) o
           where o ->> 'agency_id' = v_agency::text
         )
    from public.customer_requests cr
   where cr.status = 'submitted'
     -- DIRECTION OF THE MARKET. This board is the work an agency can staff,
     -- so it shows DEMAND. agency_offer is another agency offering the
     -- people it HAS - supply - and rendering it here shows two agencies
     -- each other as customers. Closed allow-list: a future supply kind is
     -- invisible by default. The null branch keeps the pre-kind rows (0028).
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
   order by cr.created_at desc
   limit 100;
end
$function$;

drop function if exists public.caller_agency_company_id();
