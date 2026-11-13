-- Rollback of 20261112100000_unconfirmed_company_public_needs_v1.
--
-- Restores the worker board to the verified-only body of 20261029190000 (byte for byte, same
-- signature, so the dependant policy demand_interest_signals_worker_insert is untouched),
-- removes every new door and helper, and closes the public reader first.
--
-- Operator decisions and the companies' publication choices are evidence of who allowed what,
-- when. Each table is dropped ONLY when it holds zero rows; otherwise it stays (RLS on, no
-- client grant, no policy) and nothing reads it — no data is lost and nothing becomes visible.

begin;

revoke execute on function public.list_public_company_needs_v1(text, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_open_demand_for_workers()
 RETURNS TABLE(id uuid, role_text text, country text, team_size integer, start_period text, accommodation text, created_at timestamp with time zone, company_name text, route_status text, location_label text, transport text, required_tools text[], structured jsonb, need_skill_slugs text[], need_skill_source text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid      uuid := auth.uid();
  v_worker uuid;
  v_sees_fixtures boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    return; -- not a worker -> empty, never an error surface
  end if;
  -- A synthetic QA identity keeps seeing fixtures; nobody else (20261028123000).
  v_sees_fixtures := public.is_synthetic_viewer_v1();

  return query
  select cr.id,
         cr.role_or_work_type,
         cr.country,
         cr.team_size,
         cr.start_period,
         case
           when cr.payload ->> 'accommodation' in (
             'provided_free', 'provided_paid', 'provided_deducted',
             'not_provided', 'yes', 'no', 'unknown'
           ) then cr.payload ->> 'accommodation'
           else null
         end as accommodation,
         cr.created_at,
         coalesce(
           nullif(trim(c.display_name), ''),
           nullif(trim(c.legal_name), '')
         ) as company_name,
         'approved_direct_partner'::text as route_status,
         coalesce(
           (select nullif(trim(coalesce(cdl.city, cdl.location_label)), '')
              from public.company_demand_locations cdl
             where cdl.request_id = cr.id
               and cdl.active
             order by cdl.updated_at desc
             limit 1),
           nullif(trim(cr.location), '')
         ) as location_label,
         case
           when cr.payload ->> 'transport' in (
             'provided', 'compensated', 'not_provided', 'unknown'
           ) then cr.payload ->> 'transport'
           else null
         end as transport,
         case
           when jsonb_typeof(cr.payload -> 'required_tools') = 'array' then
             (select array_agg(v order by v)
                from jsonb_array_elements_text(cr.payload -> 'required_tools') as v
               where v in (
                 'bulldozer-operator', 'compactor-operator', 'crane-operator',
                 'equipment-operation', 'excavator-operator',
                 'forklift-operator', 'grader-operator', 'hand-tools',
                 'loader-operator', 'scaffolding'
               ))
           else null
         end as required_tools,
         -- Worker-safe structured_v2 projection - SQL-side whitelist, never
         -- the raw payload (see demand_structured_v2_public).
         public.demand_structured_v2_public(cr.payload -> 'structured_v2')
           as structured,
         -- THE NEED'S REQUIRED SKILLS (20261029190000): catalogue slugs only,
         -- each an ACTIVE public.skills.slug — never free text.
         ns.slugs as need_skill_slugs,
         ns.source as need_skill_source
    from public.customer_requests cr
    -- THE NEED'S OWN COMPANY — the one rule (20261020010000).
    join public.companies c
      on c.id = public.demand_company_id_v1(cr.organization_id, cr.profile_id)
     and c.verification_status = 'verified'
    -- 1. the company's confirmed set; 2. the set derived at intake.
    left join lateral (
      select hs.slugs as human_slugs,
             ds.slugs as derived_slugs,
             case
               when cr.payload -> 'need_skills' ->> 'source' in (
                 'esco_mapped', 'recognized_from_text', 'profession_expanded'
               ) then cr.payload -> 'need_skills' ->> 'source'
               else null
             end as derived_source
        from (select array_agg(distinct v order by v) as slugs
                from jsonb_array_elements_text(
                       case
                         when jsonb_typeof(cr.payload -> 'structured_need' -> 'skill_slugs') = 'array'
                           then cr.payload -> 'structured_need' -> 'skill_slugs'
                         else '[]'::jsonb
                       end) as v
               where exists (select 1 from public.skills s
                              where s.slug = v and s.is_active is not false)) hs,
             (select array_agg(distinct v order by v) as slugs
                from jsonb_array_elements_text(
                       case
                         when jsonb_typeof(cr.payload -> 'need_skills' -> 'slugs') = 'array'
                           then cr.payload -> 'need_skills' -> 'slugs'
                         else '[]'::jsonb
                       end) as v
               where exists (select 1 from public.skills s
                              where s.slug = v and s.is_active is not false)) ds
    ) nsr on true
    cross join lateral (
      select case
               when nsr.human_slugs is not null then nsr.human_slugs
               when nsr.derived_source is not null then nsr.derived_slugs
               else null
             end as slugs,
             case
               when nsr.human_slugs is not null then 'human_structured'
               when nsr.derived_source is not null and nsr.derived_slugs is not null
                 then nsr.derived_source
               else null
             end as source
    ) ns
   where cr.status = 'submitted'
     -- DIRECTION OF THE MARKET (owner window 7 section 4). A worker board
     -- shows DEMAND. agency_offer is an agency offering the people it HAS -
     -- supply - and rendering it here presents an offer as a vacancy.
     -- Closed allow-list: a future supply kind is invisible by default.
     -- The null branch keeps the pre-kind buyer-spine rows (0028).
     and (cr.kind is null or cr.kind in ('company_request', 'buyer_request'))
     -- SYNTHETIC QA FIXTURES (20261028123000): another organization's fixture
     -- need is not market reality. Kept for the need's own people and for a
     -- synthetic viewer (lib/qa/synthetic-fixture.ts).
     and (v_sees_fixtures
          or not public.demand_is_synthetic_fixture_v1(cr.organization_id, cr.profile_id)
          or cr.profile_id = uid
          or coalesce(public.has_org_demand_access(cr.organization_id), false))
   order by cr.created_at desc
   limit 100;
end
$function$;

revoke all on function public.list_open_demand_for_workers() from public, anon;
grant execute on function public.list_open_demand_for_workers() to authenticated;
revoke all on function public.list_open_demand_for_workers() from service_role;

drop function if exists public.set_need_public_publication_v1(uuid, boolean);
drop function if exists public.decide_need_public_review_v1(uuid, text, text);
drop function if exists public.list_need_public_review_queue_v1();
drop function if exists public.get_my_need_public_states_v1(uuid[]);
drop function if exists public.list_public_company_needs_v1(text, text);
drop function if exists public.need_public_state_v1(uuid);
-- The append-only triggers stay with any kept history table (the evidence stays protected);
-- the trigger function is dropped only when neither table remains (end of this file).
drop function if exists public.is_disposable_email_domain_v1(text);
drop function if exists public.need_public_text_flags_v1(text);
-- The duplicate-check key: its index first (it depends on the function), then the function.
drop index if exists public.customer_requests_need_summary_key_idx;
drop function if exists public.need_summary_key_v1(text);
-- The organization-key trigger is not protection: it goes even when the table is kept.
do $$
begin
  if to_regclass('public.customer_request_publications') is not null then
    drop trigger if exists customer_request_publications_set_organization on public.customer_request_publications;
  end if;
end
$$;
drop function if exists public.need_publication_set_organization_v1();

do $$
begin
  if not exists (select 1 from public.customer_request_public_reviews) then
    if to_regclass('public.privacy_erasure_registry_v3') is not null then
      delete from public.privacy_erasure_registry_v3
       where schema_name = 'public' and table_name = 'customer_request_public_reviews' and column_name = 'decided_by';
    end if;
    drop table public.customer_request_public_reviews;
  else
    raise notice 'customer_request_public_reviews kept: it holds operator decisions (evidence); nothing reads it';
  end if;
  if not exists (select 1 from public.customer_request_publications) then
    if to_regclass('public.privacy_erasure_registry_v3') is not null then
      delete from public.privacy_erasure_registry_v3
       where schema_name = 'public' and table_name = 'customer_request_publications' and column_name = 'actor_id';
    end if;
    drop table public.customer_request_publications;
  else
    raise notice 'customer_request_publications kept: it holds the companies'' publication choices (evidence); nothing reads it';
  end if;
  if to_regclass('public.customer_request_publications') is null
     and to_regclass('public.customer_request_public_reviews') is null then
    drop function if exists public.need_public_history_append_only_v1();
  end if;
end
$$;

commit;
