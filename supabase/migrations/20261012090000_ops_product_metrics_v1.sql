-- ops_product_metrics_v1 — aggregate product metrics for the operator view and
-- the hourly monitor (owner programme 2026-10-12 §8–§9).
--
-- WHY A FUNCTION. In production `service_role` deliberately holds no SELECT on
-- profiles / organizations / invitations / customer_requests / team_demand_offers
-- / conversations / engagement_contexts / worker_skills / … (least privilege;
-- measured 2026-10-12, has_table_privilege = false). The first monitor run
-- therefore read those tables as 42501 and reported them UNKNOWN. Granting
-- service_role table SELECT would hand every service-role caller row-level
-- access to people's data. This function instead returns ONLY numbers.
--
-- WHAT IT RETURNS. One jsonb object: metric key → number, or → {REAL, TEST,
-- INTERNAL} where the subject is a person or an organization. No id, e-mail,
-- name or free text is ever returned. Population rule (the same as
-- apps/web/lib/ops/product-metrics.ts classifyAccount/classifyOrganization):
--   TEST      app_metadata.qa_synthetic, qa.*@labourmarket.ai, example/.invalid/.test domains,
--             organizations labelled QA-SYNTHETIC / [E2E] / E2E-FIXTURE
--   INTERNAL  @labourmarket.ai addresses, profiles.active_role = 'admin'
--   REAL      everyone else (an unknown owner is REAL — never hide a real org)
--
-- WHO MAY CALL. service_role only (revoked from public, anon, authenticated).
-- Read-only (STABLE), SECURITY DEFINER, pinned search_path.
--
-- -- ROLLBACK
-- drop function if exists public.ops_product_metrics_v1();
-- (also: supabase/rollbacks/20261012090000_ops_product_metrics_v1.down.sql)

create or replace function public.ops_product_metrics_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
with
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
         end as pop,
         coalesce(p.onboarded, false) as onboarded
    from auth.users u
    left join public.profiles p on p.id = u.id
),
orgs as (
  select o.id, o.organization_type, o.created_at,
         case
           when coalesce(o.legal_name, '') || ' ' || coalesce(o.display_name, '')
                ~* '(\mQA[-_ ]SYNTHETIC\M|\[E2E\]|\mE2E[-_ ]FIXTURE\M)' then 'TEST'
           else coalesce((select pp.pop from people pp where pp.id = o.owner_profile_id), 'REAL')
         end as pop
    from public.organizations o
   where o.archived_at is null
),
team_members as (
  select ec.organization_id, count(*) as n
    from public.engagement_contexts ec
   where ec.status = 'active' and ec.relationship_slug = 'employee'
   group by ec.organization_id
),
inv as (
  select i.invitation_type, i.status, i.delivery_status, coalesce(i.open_count, 0) as open_count,
         (i.status = 'pending' and i.expires_at < now()) as expired_open,
         coalesce((select pp.pop from people pp where pp.id = i.inviter_profile_id), 'REAL') as pop
    from public.invitations i
   where i.created_at > now() - interval '90 days'
),
needs as (
  select r.id, r.status, r.created_at,
         coalesce((select o.pop from orgs o where o.id = r.organization_id),
                  (select pp.pop from people pp where pp.id = r.profile_id), 'REAL') as pop
    from public.customer_requests r
),
offers as (
  select t.status, t.request_id, t.offered_at,
         coalesce((select o.pop from orgs o where o.id = t.team_org_id), 'REAL') as pop
    from public.team_demand_offers t
),
events as (
  select e.profile_id, e.event_name, e.created_at
    from public.pilot_events e
   where e.created_at > now() - interval '30 days'
     and coalesce(e.metadata ->> 'deploy_env', 'production') = 'production'
),
active as (
  select pp.pop,
         max(e.created_at) as last_event
    from events e
    join people pp on pp.id = e.profile_id
   group by e.profile_id, pp.pop
),
journal as (
  select j.created_at, j.deleted_at, j.correction_of,
         coalesce((select pp.pop from people pp join public.workers w on w.profile_id = pp.id where w.id = j.worker_id), 'REAL') as pop
    from public.journal_entries j
   where j.created_at > now() - interval '90 days'
),
waiting as (
  select s.submitted_at
    from public.journal_entry_review_submissions s
   where s.submitted_at > now() - interval '90 days'
     and not exists (select 1 from public.journal_entry_confirmations c where c.entry_id = s.entry_id)
)
select jsonb_build_object(
  -- users
  'accounts_total',  (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from people),
  'signups_7d',      (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from people where created_at > now() - interval '7 days'),
  'signups_30d',     (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from people where created_at > now() - interval '30 days'),
  'onboarded_accounts', (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from people where onboarded),
  'signin_dau',      (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from people where last_sign_in_at > now() - interval '1 day'),
  'signin_wau',      (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from people where last_sign_in_at > now() - interval '7 days'),
  'signin_mau',      (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from people where last_sign_in_at > now() - interval '30 days'),
  'returning_7d',    (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from people where last_sign_in_at > now() - interval '7 days' and created_at <= now() - interval '7 days'),
  'active_dau',      (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from active where last_event > now() - interval '1 day'),
  'active_wau',      (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from active where last_event > now() - interval '7 days'),
  'active_mau',      (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from active),
  'registration_started_7d', (select count(*) from events where event_name = 'registration_started' and created_at > now() - interval '7 days'),
  'signup_completed_7d',     (select count(*) from events where event_name = 'signup_completed' and created_at > now() - interval '7 days'),
  'first_real_action_30d',   (select count(*) from events where event_name = 'first_real_action'),
  'organizations_by_type_company', (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from orgs where organization_type = 'company'),
  'organizations_by_type_agency',  (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from orgs where organization_type = 'agency'),
  -- teams
  'teams_total',       (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from orgs where organization_type = 'team'),
  'teams_created_30d', (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from orgs where organization_type = 'team' and created_at > now() - interval '30 days'),
  'teams_with_member', (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from orgs o join team_members m on m.organization_id = o.id where o.organization_type = 'team' and m.n >= 1),
  'teams_offerable',   (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from orgs o join team_members m on m.organization_id = o.id where o.organization_type = 'team' and m.n >= 2),
  'invites', (
    select jsonb_object_agg(k, v) from (
      select scope || '_' || what as k,
             jsonb_build_object('REAL', count(*) filter (where pop = 'REAL' and hit), 'TEST', count(*) filter (where pop = 'TEST' and hit), 'INTERNAL', count(*) filter (where pop = 'INTERNAL' and hit)) as v
        from (
          select s.scope, w.what, i.pop,
                 (s.scope = 'all' or i.invitation_type = 'join_team') and case w.what
                   when 'created' then true
                   when 'emailed' then i.delivery_status = 'sent'
                   when 'link_only' then i.delivery_status = 'not_sent'
                   when 'delivery_failed' then i.delivery_status = 'delivery_failed'
                   when 'opened' then i.open_count > 0
                   when 'accepted' then i.status = 'accepted'
                   when 'declined' then i.status = 'declined'
                   when 'expired_open' then i.expired_open
                 end as hit
            from (values ('all'), ('team')) s(scope)
           cross join (values ('created'), ('emailed'), ('link_only'), ('delivery_failed'), ('opened'), ('accepted'), ('declined'), ('expired_open')) w(what)
           left join inv i on true
        ) x
       group by scope, what
    ) y
  ),
  -- b2b
  'needs_open',       (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from needs where status = 'submitted'),
  'needs_posted_30d', (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from needs where status <> 'draft' and created_at > now() - interval '30 days'),
  'team_offers', (
    select jsonb_object_agg(s.st, (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from offers where status = s.st))
      from (values ('offered'), ('accepted'), ('declined'), ('withdrawn'), ('assigned')) s(st)
  ),
  'need_to_first_offer_hours_p50', (
    select percentile_disc(0.5) within group (order by extract(epoch from (f.first_at - n.created_at)) / 3600.0)
      from needs n
      join (select request_id, min(offered_at) as first_at from offers group by request_id) f on f.request_id = n.id
  ),
  'conversations_started_30d', (select count(*) from public.conversations where created_at > now() - interval '30 days'),
  'service_requests', (
    select jsonb_object_agg(s.st, (
      select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL'))
        from (select coalesce((select pp.pop from people pp where pp.id = r.provider_id), 'REAL') as pop from public.service_offering_requests r where r.status = s.st) z))
      from (values ('sent'), ('accepted'), ('declined'), ('withdrawn')) s(st)
  ),
  'agency_candidate_offers', (select count(*) from public.agency_candidate_offers),
  -- work + Living CV
  'journal_entries_7d',      (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from journal where deleted_at is null and created_at > now() - interval '7 days'),
  'journal_entries_30d',     (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from journal where deleted_at is null and created_at > now() - interval '30 days'),
  'journal_corrections_90d', (select jsonb_build_object('REAL', count(*) filter (where pop = 'REAL'), 'TEST', count(*) filter (where pop = 'TEST'), 'INTERNAL', count(*) filter (where pop = 'INTERNAL')) from journal where correction_of is not null),
  'journal_confirmations_30d', (select count(*) from public.journal_entry_confirmations where created_at > now() - interval '30 days'),
  'review_queue_open',       (select count(*) from waiting),
  'review_queue_older_14d',  (select count(*) from waiting where submitted_at <= now() - interval '14 days'),
  'worker_skills_total',     (select count(*) from public.worker_skills),
  'worker_skills_verified',  (select count(*) from public.worker_skills where verified),
  'worker_skills_recomputed_7d', (select count(*) from public.worker_skills where coalesce(last_recompute_at, updated_at) > now() - interval '7 days'),
  'competency_recognitions_live', (select count(*) from public.competency_recognitions where revoked_at is null),
  -- integrity (monitor)
  'integrity_accepted_without_acceptor', (select count(*) from public.invitations where status = 'accepted' and accepted_by_profile_id is null),
  'integrity_offer_on_missing_need', (select count(*) from public.team_demand_offers t where not exists (select 1 from public.customer_requests r where r.id = t.request_id)),
  'integrity_confirmation_on_deleted_entry', (select count(*) from public.journal_entry_confirmations c join public.journal_entries j on j.id = c.entry_id where j.deleted_at is not null),
  'integrity_join_team_into_non_team', (select count(*) from public.invitations i join public.organizations o on o.id = i.organization_id where i.invitation_type = 'join_team' and i.status = 'accepted' and o.organization_type <> 'team'),
  'stale_offers_real_7d', (select count(*) from offers where status = 'offered' and pop = 'REAL' and offered_at < now() - interval '7 days')
);
$$;

revoke all on function public.ops_product_metrics_v1() from public;
revoke all on function public.ops_product_metrics_v1() from anon;
revoke all on function public.ops_product_metrics_v1() from authenticated;
grant execute on function public.ops_product_metrics_v1() to service_role;

comment on function public.ops_product_metrics_v1() is
  'Aggregate product metrics (numbers only, REAL/TEST/INTERNAL split). service_role only. Owner programme 2026-10-12.';
