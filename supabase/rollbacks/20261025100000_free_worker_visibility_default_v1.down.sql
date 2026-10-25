-- ROLLBACK for 20261025100000_free_worker_visibility_default_v1.sql
--
-- Restores verbatim:
--   worker_profile_discoverable              (20261019070000)
--   current_profile_discoverability_consent  (20260711150000)
--   withdraw_profile_discoverability_consent (20260711130000)
-- drops the new functions, the new purpose columns and the widened ledger CHECK.
--
-- REFUSES when:
--   * the switch is armed (disarm first: every default stops at once, explicit choices stay);
--   * any 'declined' or 'notice_shown' row exists — the ledger is append-only (rows cannot be
--     removed) and the narrower CHECK would no longer hold. Those rows are people's recorded
--     facts; the owner decides what happens to them before any rollback.

begin;

do $$
begin
  if exists (select 1 from public.privacy_consent_purposes where default_on_from is not null) then
    raise exception 'rollback refused: the default is armed (set default_on_from/default_basis to NULL first)';
  end if;
  if exists (select 1 from public.privacy_consent_events where action in ('declined', 'notice_shown')) then
    raise exception 'rollback refused: declined / notice_shown ledger rows exist (append-only; owner decision needed)';
  end if;
end $$;

drop function if exists public.record_visibility_default_notice_v1(text, text, text, text);
drop function if exists public.decline_profile_discoverability_v1(text, text);

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
  and not exists (
    select 1
    from public.customer_requests r
    where r.profile_id = p_profile
      and r.payload->>'privacy_request_type' = 'account_deletion'
      and r.status in ('submitted', 'in_review', 'needs_followup', 'approved')
  )
$function$;
revoke all on function public.worker_profile_discoverable(uuid) from public;
revoke all on function public.worker_profile_discoverable(uuid) from anon;
grant execute on function public.worker_profile_discoverable(uuid) to authenticated;
comment on function public.worker_profile_discoverable(uuid) is
  'True only with a current-version profile_discoverability grant as the newest ledger row AND no open account_deletion privacy request (20261019070000).';

create or replace function public.current_profile_discoverability_consent()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((
    select jsonb_build_object(
      'status', case
        when e.action = 'granted' and e.consent_text_version = p.current_version then 'granted'
        when e.action = 'granted' then 'granted_stale_version'
        else 'withdrawn'
      end,
      'decidedAt', e.created_at,
      'version', e.consent_text_version,
      'locale', e.locale,
      'currentVersion', p.current_version
    )
    from public.privacy_consent_events e
    join public.privacy_consent_purposes p on p.purpose = e.purpose
    where e.user_id = auth.uid()
      and e.purpose = 'profile_discoverability'
    order by e.created_at desc, e.seq desc
    limit 1
  ), jsonb_build_object('status', 'not_set'))
$function$;
revoke all on function public.current_profile_discoverability_consent() from public;
revoke all on function public.current_profile_discoverability_consent() from anon;
grant execute on function public.current_profile_discoverability_consent() to authenticated;

create or replace function public.withdraw_profile_discoverability_consent(p_source text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_cur public.privacy_consent_purposes;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if coalesce(char_length(btrim(p_source)), 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;
  -- Withdrawal is ALWAYS accepted, whatever version the grant used.
  select * into v_cur from public.privacy_consent_purposes
    where purpose = 'profile_discoverability';
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source)
  values
    (v_uid, 'profile_discoverability', 'withdrawn',
     coalesce(v_cur.current_version, 'unknown'),
     coalesce(v_cur.current_text_hash, 'unknown'),
     'lt', p_source);
  return jsonb_build_object('ok', true, 'status', 'withdrawn');
end;
$function$;
revoke all on function public.withdraw_profile_discoverability_consent(text) from public;
revoke all on function public.withdraw_profile_discoverability_consent(text) from anon;
grant execute on function public.withdraw_profile_discoverability_consent(text) to authenticated;

drop function if exists public.discoverability_state_v1(uuid);
drop function if exists public.worker_visibility_employed_v1(uuid);
drop function if exists public.worker_visibility_learner_v1(uuid);

alter table public.privacy_consent_purposes drop constraint if exists pcp_default_shape;
-- Zero-data assertion done above (switch unarmed); the notice pin is derived from code.
alter table public.privacy_consent_purposes drop column if exists default_grace_days_existing;
alter table public.privacy_consent_purposes drop column if exists default_notice_hash;
alter table public.privacy_consent_purposes drop column if exists default_notice_version;
alter table public.privacy_consent_purposes drop column if exists default_basis;
alter table public.privacy_consent_purposes drop column if exists default_on_from;

alter table public.privacy_consent_events drop constraint if exists pce_discoverability_only_actions;
alter table public.privacy_consent_events drop constraint if exists privacy_consent_events_action_check;
alter table public.privacy_consent_events
  add constraint privacy_consent_events_action_check check (action in ('granted', 'withdrawn'));
comment on column public.privacy_consent_events.action is null;

commit;
