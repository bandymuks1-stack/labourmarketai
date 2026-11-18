-- @human-gate-approved  (acknowledgement only: RED class — SECURITY DEFINER + REVOKE/GRANT; draft + needs-human-gate, OWNER APPLIES — NOT applied by the agent)
-- lm_registrations_daily_v1 — NEW and ACTIVE counts for five platform groups, one UTC day (owner decision 2026-11-14).
--
-- WHY A MIGRATION. The route GET /api/internal/registrations-daily/v1 needs auth.users (creation / last sign-in and the
-- e-mail-based TEST/INTERNAL rule), public.profiles and public.organizations. In production `service_role` holds no
-- SELECT on any of the three (measured read-only 2026-11-14: has_table_privilege = false), and none of the functions
-- already applied (ops_product_metrics_v1, agentai_capability_readback_counts_v1) splits by group or by day. Granting
-- table SELECT would hand every service-role caller row access to people's data; this function returns ONLY numbers,
-- exactly like ops_product_metrics_v1. Until the owner applies it, the route answers 503 (never 200 with zeros).
--
-- INDEPENDENT OF PR #2886 (agentai_daily_growth_aggregate_v1): nothing here reads or depends on it.
--
-- POPULATION. The REAL / TEST / INTERNAL rule of ops_product_metrics_v1, copied VERBATIM for people and for
-- organizations (a vitest guard compares the text with 20261013140000_ops_product_metrics_staff_acceptance_v2.sql).
-- Every count is returned as {REAL, TEST, INTERNAL}; the route publishes REAL only and applies the 1–2 small-cell rule.
--
-- GROUPS (they may overlap: a student is usually also a worker).
--   workers    a person with a public.workers row, or an active 'worker' entry in public.profile_roles
--   students   a person with an education_cohort_members row in status 'active' or 'left' (admitted to a cohort)
--   employers  a CLAIMED, non-archived organization of type 'company' that is not an education institution
--   agencies   a CLAIMED, non-archived organization of type 'agency'
--   education  a CLAIMED, non-archived organization holding the 'training_provider' organization role or owning a
--              non-archived education programme
--   Discovered (unclaimed, imported) organizations are not registrations and are never counted.
--
-- METRICS.
--   new        subject created during p_day (UTC): auth.users.created_at for people, organizations.created_at for
--              organizations (a discovered organization claimed later keeps its discovery date — documented drift).
--   active7d / active30d   AS OF READ TIME (now()), not as of p_day: a person whose latest sign-in
--              (auth.users.last_sign_in_at — only the LATEST sign-in is stored) or latest production pilot_event falls in
--              the last 7 / 30 days; an organization whose owner or an active member is such a person. Past days cannot
--              be reconstructed from last_sign_in_at, so the route publishes these only for p_day = today / yesterday
--              and marks them unmeasured otherwise.
--
-- OUTPUT. { "groups": { <group>: { "new": {REAL,TEST,INTERNAL}, "active7d": {...}, "active30d": {...} } } } — integers
-- only. No id, e-mail, name, timestamp or free text leaves this function.
--
-- WHO MAY CALL. service_role only (revoked from public, anon, authenticated). STABLE (read-only), SECURITY DEFINER,
-- empty search_path (every object schema-qualified).
--
-- -- ROLLBACK
-- drop function if exists public.lm_registrations_daily_v1(date);
-- (also: supabase/rollbacks/20261114120000_lm_registrations_daily_v1.down.sql)

create or replace function public.lm_registrations_daily_v1(p_day date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with
bounds as (
  select (p_day::timestamp at time zone 'UTC') as day_start,
         ((p_day + 1)::timestamp at time zone 'UTC') as day_end
),
people as (
  select u.id,
         u.created_at,
         u.last_sign_in_at,
         case
           when coalesce(u.raw_app_meta_data ->> 'qa_synthetic', '') = 'true'
             or u.email ~* '^qa\.[^@]*@labourmarket\.ai$'
             or u.email ~* '@(example\.(com|org|net)|[^@]*\.invalid|[^@]*\.test|local\.test)$'
             then 'TEST'
           when u.email ~* '@labourmarket\.ai$' or p.active_role = 'admin'
             then 'INTERNAL'
           else 'REAL'
         end as pop
    from auth.users u
    left join public.profiles p on p.id = u.id
),
seen as (
  select e.profile_id, max(e.created_at) as last_event
    from public.pilot_events e
   where e.created_at > now() - interval '30 days'
     and e.profile_id is not null
     and coalesce(e.metadata ->> 'deploy_env', 'production') = 'production'
   group by e.profile_id
),
person_activity as (
  select pp.id, pp.pop, pp.created_at,
         greatest(pp.last_sign_in_at, s.last_event) as last_active
    from people pp
    left join seen s on s.profile_id = pp.id
),
orgs as (
  select o.id, o.organization_type, o.created_at, o.owner_profile_id,
         case
           when coalesce(o.legal_name, '') || ' ' || coalesce(o.display_name, '')
                ~* '(\mQA[-_ ]SYNTHETIC\M|\[E2E\]|\mE2E[-_ ]FIXTURE\M)' then 'TEST'
           else coalesce((select pp.pop from people pp where pp.id = o.owner_profile_id), 'REAL')
         end as pop,
         (exists (select 1 from public.organization_roles r
                   where r.organization_id = o.id and r.role_slug = 'training_provider')
          or exists (select 1 from public.education_programs ep
                      where ep.organization_id = o.id and ep.archived_at is null)) as is_education
    from public.organizations o
   where o.archived_at is null
     and o.claim_state = 'claimed'
),
org_members as (
  select o.id as organization_id, o.owner_profile_id as profile_id
    from orgs o
   where o.owner_profile_id is not null
  union
  select cm.organization_id, cm.profile_id
    from public.company_memberships cm
   where cm.status = 'active' and cm.revoked_at is null
),
org_activity as (
  select m.organization_id, max(pa.last_active) as last_active
    from org_members m
    join person_activity pa on pa.id = m.profile_id
   group by m.organization_id
),
subjects as (
  select 'workers' as grp, pa.pop, pa.created_at, pa.last_active
    from person_activity pa
   where exists (select 1 from public.workers w where w.profile_id = pa.id)
      or exists (select 1 from public.profile_roles r
                  where r.profile_id = pa.id and r.role = 'worker' and r.is_active)
  union all
  select 'students', pa.pop, pa.created_at, pa.last_active
    from person_activity pa
   where exists (select 1 from public.education_cohort_members m
                  where m.profile_id = pa.id and m.status in ('active', 'left'))
  union all
  select 'employers', o.pop, o.created_at, oa.last_active
    from orgs o
    left join org_activity oa on oa.organization_id = o.id
   where o.organization_type = 'company' and not o.is_education
  union all
  select 'agencies', o.pop, o.created_at, oa.last_active
    from orgs o
    left join org_activity oa on oa.organization_id = o.id
   where o.organization_type = 'agency'
  union all
  select 'education', o.pop, o.created_at, oa.last_active
    from orgs o
    left join org_activity oa on oa.organization_id = o.id
   where o.is_education
),
counted as (
  select g.grp,
         jsonb_build_object(
           'new', jsonb_build_object(
             'REAL',     count(*) filter (where s.pop = 'REAL'     and s.created_at >= b.day_start and s.created_at < b.day_end),
             'TEST',     count(*) filter (where s.pop = 'TEST'     and s.created_at >= b.day_start and s.created_at < b.day_end),
             'INTERNAL', count(*) filter (where s.pop = 'INTERNAL' and s.created_at >= b.day_start and s.created_at < b.day_end)),
           'active7d', jsonb_build_object(
             'REAL',     count(*) filter (where s.pop = 'REAL'     and s.last_active > now() - interval '7 days'),
             'TEST',     count(*) filter (where s.pop = 'TEST'     and s.last_active > now() - interval '7 days'),
             'INTERNAL', count(*) filter (where s.pop = 'INTERNAL' and s.last_active > now() - interval '7 days')),
           'active30d', jsonb_build_object(
             'REAL',     count(*) filter (where s.pop = 'REAL'     and s.last_active > now() - interval '30 days'),
             'TEST',     count(*) filter (where s.pop = 'TEST'     and s.last_active > now() - interval '30 days'),
             'INTERNAL', count(*) filter (where s.pop = 'INTERNAL' and s.last_active > now() - interval '30 days'))
         ) as metrics
    from (values ('workers'), ('employers'), ('agencies'), ('students'), ('education')) g(grp)
   cross join bounds b
    left join subjects s on s.grp = g.grp
   group by g.grp
)
select jsonb_build_object('groups', jsonb_object_agg(c.grp, c.metrics))
  from counted c;
$$;

revoke all on function public.lm_registrations_daily_v1(date) from public;
revoke all on function public.lm_registrations_daily_v1(date) from anon;
revoke all on function public.lm_registrations_daily_v1(date) from authenticated;
grant execute on function public.lm_registrations_daily_v1(date) to service_role;

comment on function public.lm_registrations_daily_v1(date) is
  'NEW (on the given UTC day) and ACTIVE (7/30 days as of read time) counts for workers, employers, agencies, students, education; {REAL,TEST,INTERNAL} integers only. service_role only. Owner decision 2026-11-14.';
