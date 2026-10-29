-- @human-gate-approved  (acknowledgement only: RED class — SECURITY DEFINER + REVOKE/GRANT; draft + needs-human-gate, owner applies)
-- agentai_daily_growth_aggregate_v1 — one UTC day of REAL registrations by first-touch attribution, plus ACTIVE Living CVs.
--
-- WHY. Owner directive 2026-10-29: Agentai OS invites candidates into LabourMarket.ai and is measured DAILY by real
-- registrations and active Living CVs, not by invitations sent. Agentai holds no database connection (owner 2026-10-21),
-- so it reports REGISTERED as NEPAMATUOTA. This function is what GET /api/internal/growth-daily/v1 reads; the route
-- applies the small-cell rule (lib/api/growth-daily.ts) before anything leaves this product.
--
-- WHY SECURITY DEFINER. It reads auth.users (confirmation time + the bounded first-touch utm_* keys the signup form
-- already writes into raw_user_meta_data) and workers / journal_entries, which the service role is not granted SELECT on
-- in this database — the same reason ops_product_metrics_v1 and agentai_capability_readback_counts_v1 are definer
-- functions. Pinned empty search_path, EXECUTE revoked from everyone and granted to service_role only.
--
-- WHAT LEAVES. Counts only: one integer total, one integer per (utm_source, utm_medium, utm_campaign, utm_content)
-- group, one integer of active Living CVs. No id, email, name, phone, CV text or timestamp of any person. Only the four
-- utm keys are read from the metadata — never the provider profile fields an OAuth signup stores beside them.
--
-- DEFINITIONS (definitionVersion lm-growth-daily/v1 — flagged for owner confirmation in the PR):
--   REAL person      = the population rule of ops_product_metrics_v1 verbatim (QA-synthetic / test domains → TEST,
--                      @labourmarket.ai or admin → INTERNAL, everyone else REAL). Guarded identical by a test.
--   registration     = a REAL auth user whose e-mail was CONFIRMED during the day (UTC). An unconfirmed signup is not a
--                      registration (production requires e-mail confirmation); an invitation sent never is.
--   ACTIVE Living CV = a REAL person with a worker profile who RECORDED at least one live (not deleted) journal entry in
--                      the 30 days ending with the day (UTC). A signup, onboarding, CV upload or self-declared skill alone
--                      is not activity.
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
         u.email_confirmed_at,
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
     and pp.email_confirmed_at >= b.day_start
     and pp.email_confirmed_at <  b.day_end
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
  'active_living_cv',   (select n from active_cv)
);
$$;

revoke all on function public.agentai_daily_growth_aggregate_v1(date) from public, anon, authenticated;
grant execute on function public.agentai_daily_growth_aggregate_v1(date) to service_role;

comment on function public.agentai_daily_growth_aggregate_v1(date) is
  'Aggregate daily counts only (registrations by first-touch utm, active Living CVs) for the Agentai OS growth route. EXECUTE: service_role only. Small cells are suppressed by the route, never here alone.';
