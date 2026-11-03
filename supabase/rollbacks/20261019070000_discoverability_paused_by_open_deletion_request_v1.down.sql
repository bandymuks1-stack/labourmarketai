-- ROLLBACK for 20261019070000_discoverability_paused_by_open_deletion_request_v1.sql
--
-- Restores worker_profile_discoverable() to its previous body, read from
-- production on 2026-10-19 (pg_get_functiondef): the consent ledger alone
-- decides. Grants are unchanged by CREATE OR REPLACE. No data is touched.

begin;

create or replace function public.worker_profile_discoverable(p_profile uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((
    select e.action = 'granted' and e.consent_text_version = p.current_version
    from public.privacy_consent_events e
    join public.privacy_consent_purposes p on p.purpose = e.purpose
    where e.user_id = p_profile
      and e.purpose = 'profile_discoverability'
    order by e.created_at desc, e.seq desc
    limit 1
  ), false)
$function$;

comment on function public.worker_profile_discoverable(uuid) is null;

commit;
