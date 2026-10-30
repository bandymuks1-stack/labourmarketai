-- @human-gate-approved  (acknowledgement only: RED class — SECURITY DEFINER + REVOKE/GRANT; draft + needs-human-gate, owner applies)
-- agentai_daily_growth_aggregate_v1 — one UTC day of REAL registrations by first-touch attribution, plus ACTIVE (recently
-- updated) and COMPLETED Living CVs.
--
-- WHY. Owner directive 2026-10-29: Agentai OS invites candidates into LabourMarket.ai and is measured DAILY by real
-- registrations and active Living CVs, not by invitations sent. Agentai holds no database connection (owner 2026-10-21),
-- so it reports REGISTERED as NEPAMATUOTA. This function is what GET /api/internal/growth-daily/v1 reads; the route
-- applies the small-cell rule (lib/api/growth-daily.ts) before anything leaves this product.
--
-- WHY SECURITY DEFINER. It reads auth.users (creation + first sign-in + the bounded first-touch utm_* keys the signup form
-- already writes into raw_user_meta_data), profiles, workers, journal_entries and the CV tables, which the service role is not granted SELECT on
-- in this database — the same reason ops_product_metrics_v1 and agentai_capability_readback_counts_v1 are definer
-- functions. Pinned empty search_path, EXECUTE revoked from everyone and granted to service_role only.
--
-- WHAT LEAVES. Counts only: one integer total, one integer per (utm_source, utm_medium, utm_campaign, utm_content)
-- group, one integer each of active and completed Living CVs. No id, email, name, phone, CV text or timestamp of any person. Only the four
-- utm keys are read from the metadata — never the provider profile fields an OAuth signup stores beside them.
--
-- DEFINITIONS (definitionVersion lm-growth-daily/v1). Registration and ACTIVE approved by the owner 2026-10-29; COMPLETED
-- is flagged for owner confirmation:
--   REAL person      = the population rule of ops_product_metrics_v1 verbatim (QA-synthetic / test domains → TEST,
--                      @labourmarket.ai or admin → INTERNAL, everyone else REAL). Guarded identical by a test.
--   registration     = a REAL account CREATED during the day (UTC) that has SIGNED IN at least once. An abandoned signup
--                      (never confirmed, never signed in) is not a registration; an invitation sent never is. The account's
--                      confirmation column is deliberately not read: it is not a trusted signal in this database
--                      (lib/guards/email-verified-boundary.test.ts), and sign-in is what every real path ends in. An
--                      account with no e-mail address (an anonymous or phone-only session; neither is offered today)
--                      is never a registration.
--   ACTIVE Living CV = a REAL person with a worker profile who RECORDED at least one live (not deleted) journal entry in
--                      the 30 days ending with the day (UTC). A signup, onboarding, CV upload or self-declared skill alone
--                      is not activity. This is the RECENTLY UPDATED count.
--   COMPLETED Living CV = a REAL person with a worker profile whose CV holds all five parts of the product's own CV
--                      checklist (lib/conversation/worker-activity.ts): own summary (profiles.profile_text), at least one
--                      skill, at least one language, an availability status, and at least one REAL work-history entry —
--                      an engagement with a title or an organization. The untitled, organization-less engagement every
--                      worker receives automatically on creation (20260702140000) is NOT work history and is excluded.
--                      A state, not an activity: a CV completed a year ago and never touched since still counts here and
--                      not in ACTIVE.
--
-- ROLLBACK: supabase/rollbacks/20261029120000_agentai_daily_growth_aggregate_v1.down.sql

create or replace function public.agentai_daily_growth_aggregate_v1(p_day date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with
bounds as (
  select (p_day::timestamp at time zone 'UTC')                         as day_start,
         ((p_day + 1)::timestamp at time zone 'UTC')                   as day_end,
         ((p_day - 29)::timestamp at time zone 'UTC')                  as window_start
),
people as (
  select u.id,
         u.created_at,
         u.last_sign_in_at,
         (u.email is not null) as has_email,
         u.raw_user_meta_data as meta,
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
registered as (
  select nullif(btrim(pp.meta ->> 'utm_source'), '')   as utm_source,
         nullif(btrim(pp.meta ->> 'utm_medium'), '')   as utm_medium,
         nullif(btrim(pp.meta ->> 'utm_campaign'), '') as utm_campaign,
         nullif(btrim(pp.meta ->> 'utm_content'), '')  as utm_content
    from people pp, bounds b
   where pp.pop = 'REAL'
     and pp.created_at >= b.day_start
     and pp.created_at <  b.day_end
     and pp.last_sign_in_at is not null
     and pp.has_email
),
groups as (
  select utm_source, utm_medium, utm_campaign, utm_content, count(*)::int as n
    from registered
   group by utm_source, utm_medium, utm_campaign, utm_content
),
active_cv as (
  select count(distinct w.id)::int as n
    from public.workers w
    join people pp on pp.id = w.profile_id and pp.pop = 'REAL'
    cross join bounds b
   where exists (
     select 1 from public.journal_entries j
      where j.worker_id = w.id
        and j.deleted_at is null
        and j.created_at >= b.window_start
        and j.created_at <  b.day_end
   )
),
completed_cv as (
  select count(*)::int as n
    from public.workers w
    join people pp on pp.id = w.profile_id and pp.pop = 'REAL'
    join public.profiles p on p.id = w.profile_id
   where nullif(btrim(coalesce(p.profile_text, '')), '') is not null
     and w.availability_status is not null
     and exists (select 1 from public.profile_skill_claims s where s.profile_id = w.profile_id)
     and exists (select 1 from public.worker_languages l where l.worker_id = w.id)
     and exists (
       select 1 from public.engagement_contexts ec
        where ec.profile_id = w.profile_id
          and (ec.organization_id is not null or nullif(btrim(coalesce(ec.title, '')), '') is not null)
     )
)
select jsonb_build_object(
  'day',                p_day,
  'registrations_total', (select count(*)::int from registered),
  'registrations_by_attribution', coalesce(
     (select jsonb_agg(jsonb_build_object(
               'utm_source', g.utm_source, 'utm_medium', g.utm_medium,
               'utm_campaign', g.utm_campaign, 'utm_content', g.utm_content, 'n', g.n)
             order by g.n desc)
        from groups g),
     '[]'::jsonb),
  'active_living_cv',   (select n from active_cv),
  'completed_living_cv', (select n from completed_cv)
);
$$;

revoke all on function public.agentai_daily_growth_aggregate_v1(date) from public, anon, authenticated;
grant execute on function public.agentai_daily_growth_aggregate_v1(date) to service_role;

comment on function public.agentai_daily_growth_aggregate_v1(date) is
  'Aggregate daily counts only (registrations by first-touch utm, active and completed Living CVs) for the Agentai OS growth route. EXECUTE: service_role only. Every count below 3 is suppressed by the route.';
