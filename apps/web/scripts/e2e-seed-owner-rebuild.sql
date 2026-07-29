-- E2E seed for the owner-rebuild verification pass (LOCAL STACK ONLY).
-- Recreates the recipe from docs/TESTING.md + the local-e2e recipe:
--   1. the fixture company becomes VERIFIED (trigger disabled around the
--      update — it blocks non-admin verification changes);
--   2. one SUBMITTED customer_request so the worker board / map has a demand
--      (skills are recognised from the LT demand text by the PR4 engine);
--   3. worker_skills for the fixture worker so deriveJobRecommendations
--      produces a skillFit instead of filtering everything out;
--   4. the fixture project carries the W4 spec's default name.
-- Idempotent: every insert is ON CONFLICT DO NOTHING / update is absolute.

begin;

alter table public.companies disable trigger trg_company_verification_guard;
update public.companies
   set verification_status = 'verified'
 where id = 'cccccccc-0000-0000-0000-000000000001';
alter table public.companies enable trigger trg_company_verification_guard;

insert into public.customer_requests
  (id, profile_id, title, need_summary, country, location,
   role_or_work_type, team_size, start_period, status, kind, payload)
values
  ('99999999-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002',
   'Mūrininkų komanda Amsterdame',
   'Reikalingi mūrininkai: mūrijimas, betono liejimas, klojinių montavimas, pastolių montavimas, rankinių įrankių naudojimas.',
   'NL', 'Amsterdam',
   'Mūrininkas', 4, '2026-09', 'submitted', 'company_request',
   jsonb_build_object(
     'accommodation', 'provided_free',
     'transport', 'provided',
     'required_tools', jsonb_build_array('hand-tools', 'scaffolding'),
     'structured_v2', jsonb_build_object(
       'opportunity_type', 'employment',
       'target_supply', 'multiple_workers',
       'site_mode', 'single',
       'work_mode', 'onsite',
       'contract_country', 'NL',
       'time', jsonb_build_object('start_earliest', '2026-09-01')
     )
   ))
on conflict (id) do nothing;

insert into public.worker_skills (worker_id, skill_id, source, self_rated_level)
select w.id, s.id, 'self_declared', 4
  from public.workers w
  join public.skills s on s.slug in ('bricklaying', 'concrete-pouring')
 where w.profile_id = 'aaaaaaaa-0000-0000-0000-000000000001'
on conflict do nothing;

update public.projects
   set title = 'Amsterdam Zuid gyvenamasis kvartalas'
 where id = 'eeeeeeee-0000-0000-0000-000000000001';

commit;
