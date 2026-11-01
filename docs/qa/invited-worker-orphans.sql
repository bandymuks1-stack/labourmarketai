-- READ-ONLY orphan and integrity check after docs/qa/invited-worker-purge.sql. Counts only.
-- Every value must be 0.
select
  (select count(*) from auth.users where lower(email) = 'qa.invited+act1@labourmarket.ai')                    as synthetic_account,
  (select count(*) from public.invitations where external_reference = 'QA-SYNTHETIC-invited-act1')         as synthetic_invitation,
  (select count(*) from public.profiles p where not exists (select 1 from auth.users u where u.id = p.id)) as profiles_without_account,
  (select count(*) from public.workers w where not exists (select 1 from public.profiles p where p.id = w.profile_id)) as workers_without_profile,
  (select count(*) from public.journal_entries j where not exists (select 1 from public.workers w where w.id = j.worker_id)) as journal_without_worker,
  (select count(*) from public.invitation_acceptances a where not exists (select 1 from public.invitations i where i.id = a.invitation_id)) as acceptances_without_invitation,
  (select count(*) from public.invitations i where i.accepted_by_profile_id is not null
      and not exists (select 1 from public.profiles p where p.id = i.accepted_by_profile_id))             as invitations_accepted_by_missing_profile;
