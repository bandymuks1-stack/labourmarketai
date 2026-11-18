-- @human-gate-approved
--
-- SAFETY CLASS: RED (CHECK change on the consent ledger, new columns on the purpose registry,
-- SECURITY DEFINER functions replaced/added, GRANT/REVOKE). Draft PR + needs-human-gate.
-- Applied by main via Supabase MCP `apply_migration` after the owner's ONE confirmation. Never
-- `db push`. Applying it changes NOTHING visible: the default stays OFF until the switch is armed.
--
-- 20261025100000 — FREE WORKERS ARE DISCOVERABLE BY DEFAULT (owner decision 2026-10-25)
--
-- THE RULE (one ledger, no second visibility store):
--   privacy_consent_events stays the ONE record. Per person, for purpose
--   profile_discoverability, the newest DECISION row decides:
--     granted   (current text version) -> EXPLICITLY_ENABLED  -> discoverable
--     withdrawn                         -> EXPLICITLY_DISABLED -> never discoverable by default
--     declined  (NEW: the "not now")    -> EXPLICITLY_DISABLED -> never discoverable by default
--     granted   (superseded text)       -> an explicit choice under an old text: off until re-chosen
--   With NO decision row the person is NOT_ASKED. NOT_ASKED is never a refusal. A NOT_ASKED person
--   is discoverable by the DEFAULT only when ALL hold:
--     1. the owner switch is armed (privacy_consent_purposes.default_on_from is set);
--     2. the default information notice (current version) was shown to THIS person and recorded in
--        the ledger as 'notice_shown' — and, for an account that existed before the switch was
--        armed, at least default_grace_days_existing days ago;
--     3. the person holds the worker role;
--     4. the person is a FREE worker: no active employee / manager engagement with an
--        organization and no active company roster row (employed people keep the limited,
--        relationship-scoped visibility — caller_has_worker_relation_v1 — unless THEY grant);
--     5. the person is not a learner: no active student / intern engagement and no current
--        education row (learners are very often minors — LIA safeguard);
--     6. no open account-deletion request (unchanged rule of 20261019070000).
--   This applies to NEW and EXISTING NOT_ASKED workers alike — never to anyone with a decision row.
--   Nothing is written on a person's behalf: the default is DERIVED from the person's own ledger
--   facts at read time, so leaving a company re-applies it and joining one suspends it, without a
--   row, and a switch-off is final until the person switches it on.
--
-- WHAT ELSE
--   * 'notice_shown' rows: written ONLY by record_visibility_default_notice_v1() from the person's
--     own session when the notice is on their screen; version + hash pinned like a consent text.
--   * decline_profile_discoverability_v1(): records the "not now" as a decision (it used to write
--     nothing, so a "not now" could not be told apart from "never asked").
--   * withdraw_profile_discoverability_consent(): the ledger locale is the person's account
--     language (it was always 'lt'). Signature unchanged.
--   * current_profile_discoverability_consent(): adds 'default_on' / 'default_pending' statuses,
--     the three-way `choice`, `noticeDue`, `defaultScope` and `defaultFrom`.
--
-- WHAT IT DOES NOT DO
--   * no existing row is changed; no row is written for anyone; no consent text / version / hash
--     changes (existing grants keep counting);
--   * contacts, name, Work Journal entries, documents and external profiles are untouched: a
--     discoverable worker is reached ONLY through list_discoverable_worker_profiles_v1 /
--     list_discoverable_worker_ids_v1 (professional fields, anonymous label); RLS on workers,
--     profiles, journal_entries, worker_documents and worker_external_profiles is not modified.
--
-- ARMING (the owner's one step, after the privacy policy wording in this PR is published):
--   update public.privacy_consent_purposes
--      set default_on_from = now(), default_basis = 'legitimate_interest'
--    where purpose = 'profile_discoverability';
--   (default_grace_days_existing defaults to 14; default_notice_version/hash are pinned below.)
--   Disarm: set default_on_from and default_basis back to NULL — every default stops at once;
--   explicit choices are untouched.
--
-- ROLLBACK: supabase/rollbacks/20261025100000_free_worker_visibility_default_v1.down.sql

begin;

-- 1. The ledger's actions: two new, honestly named kinds — neither is a consent.
alter table public.privacy_consent_events
  drop constraint if exists privacy_consent_events_action_check;
alter table public.privacy_consent_events
  add constraint privacy_consent_events_action_check
  check (action in ('granted', 'withdrawn', 'declined', 'notice_shown'));
alter table public.privacy_consent_events
  drop constraint if exists pce_discoverability_only_actions;
alter table public.privacy_consent_events
  add constraint pce_discoverability_only_actions
  check (action not in ('declined', 'notice_shown') or purpose = 'profile_discoverability');

comment on column public.privacy_consent_events.action is
  'granted / withdrawn = consent decisions; declined = an explicit "not now" (a decision, off); notice_shown = the default-visibility information notice was on the person''s screen (not a decision). State = newest decision row (granted|withdrawn|declined).';

-- 2. The owner's switch and the pinned notice text. NULL switch = no default (today's behaviour).
alter table public.privacy_consent_purposes
  add column if not exists default_on_from timestamptz,
  add column if not exists default_basis text,
  add column if not exists default_notice_version text,
  add column if not exists default_notice_hash text,
  add column if not exists default_grace_days_existing integer not null default 14;
alter table public.privacy_consent_purposes
  drop constraint if exists pcp_default_shape;
alter table public.privacy_consent_purposes
  add constraint pcp_default_shape check (
    default_grace_days_existing between 0 and 60
    and (
      (default_on_from is null and default_basis is null)
      or (
        purpose = 'profile_discoverability'
        and default_on_from is not null
        and default_basis in ('legitimate_interest', 'contract')
        and default_notice_version is not null
        and default_notice_hash is not null
      )
    )
  );

-- Pin the notice text the app shows (lib/privacy/consent-definitions.ts
-- PROFILE_DISCOVERABILITY_DEFAULT_NOTICE_V1). The switch itself stays OFF.
update public.privacy_consent_purposes
   set default_notice_version = '2026-10-25.notice.v1',
       default_notice_hash = '6d6ff972a720f656635e93aab63b25b58611b0e14191cd02115f422b1204d0a9'
 where purpose = 'profile_discoverability';

comment on column public.privacy_consent_purposes.default_on_from is
  'Owner switch (20261025100000): when set, NOT_ASKED free workers who were shown the current default notice are discoverable by default. NULL = consent only.';

-- 3. Scope helpers (internal, not callable by clients).
create or replace function public.worker_visibility_employed_v1(p_profile uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
      select 1 from public.engagement_contexts ec
       where ec.profile_id = p_profile
         and ec.status = 'active'
         and ec.organization_id is not null
         and ec.relationship_slug in ('employee', 'manager')
    )
    or exists (
      select 1 from public.company_workers cw
        join public.workers w on w.id = cw.worker_id
       where w.profile_id = p_profile
         and cw.status = 'active'
    )
$function$;
revoke all on function public.worker_visibility_employed_v1(uuid) from public;
revoke all on function public.worker_visibility_employed_v1(uuid) from anon;
revoke all on function public.worker_visibility_employed_v1(uuid) from authenticated;

create or replace function public.worker_visibility_learner_v1(p_profile uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
      select 1 from public.engagement_contexts ec
       where ec.profile_id = p_profile
         and ec.status = 'active'
         and ec.relationship_slug in ('student', 'intern')
    )
    or exists (
      select 1 from public.worker_education we
       where we.profile_id = p_profile
         and we.is_current
    )
$function$;
revoke all on function public.worker_visibility_learner_v1(uuid) from public;
revoke all on function public.worker_visibility_learner_v1(uuid) from anon;
revoke all on function public.worker_visibility_learner_v1(uuid) from authenticated;

-- 4. ONE state reading for a profile (internal). Returns the newest decision, the default facts
--    and the derived discoverability — every reader below uses it, so they cannot disagree.
create or replace function public.discoverability_state_v1(p_profile uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with pu as (
    select * from public.privacy_consent_purposes where purpose = 'profile_discoverability'
  ),
  decision as (
    select e.action, e.consent_text_version, e.created_at
      from public.privacy_consent_events e
     where e.user_id = p_profile
       and e.purpose = 'profile_discoverability'
       and e.action in ('granted', 'withdrawn', 'declined')
     order by e.created_at desc, e.seq desc
     limit 1
  ),
  notice as (
    select e.created_at
      from public.privacy_consent_events e, pu
     where e.user_id = p_profile
       and e.purpose = 'profile_discoverability'
       and e.action = 'notice_shown'
       and e.consent_text_version = pu.default_notice_version
     order by e.created_at desc, e.seq desc
     limit 1
  ),
  facts as (
    select
      (select action from decision) as d_action,
      (select consent_text_version from decision) as d_version,
      (select created_at from decision) as d_at,
      (select created_at from notice) as notice_at,
      pu.current_version,
      pu.default_on_from,
      pu.default_grace_days_existing,
      (select created_at from public.profiles where id = p_profile) as profile_created_at,
      exists (select 1 from public.profile_roles r where r.profile_id = p_profile and r.role = 'worker') as is_worker,
      public.worker_visibility_employed_v1(p_profile) as employed,
      public.worker_visibility_learner_v1(p_profile) as learner,
      exists (
        select 1 from public.customer_requests r
         where r.profile_id = p_profile
           and r.payload->>'privacy_request_type' = 'account_deletion'
           and r.status in ('submitted', 'in_review', 'needs_followup', 'approved')
      ) as deletion_open
    from pu
  ),
  derived as (
    select f.*,
      case
        when f.notice_at is null then null
        when f.default_on_from is not null and f.profile_created_at < f.default_on_from
          then f.notice_at + make_interval(days => f.default_grace_days_existing)
        else f.notice_at
      end as default_from
    from facts f
  )
  select jsonb_build_object(
    'choice', case
      when d_action = 'granted' then 'explicitly_enabled'
      when d_action in ('withdrawn', 'declined') then 'explicitly_disabled'
      else 'not_asked'
    end,
    'decision', d_action,
    'decisionCurrent', d_action = 'granted' and d_version = current_version,
    'decidedAt', d_at,
    'version', d_version,
    'armed', default_on_from is not null,
    'defaultScope', case
      when d_action is not null then null
      when employed then 'employed'
      when learner then 'learner'
      else 'free'
    end,
    'noticeAt', notice_at,
    'defaultFrom', default_from,
    -- The default covers this person (the worker role is checked by 'discoverable' only, so the
    -- onboarding notice reads ON before the role row exists).
    'defaultApplies', d_action is null and default_on_from is not null and notice_at is not null
      and not employed and not learner,
    'defaultInForce', d_action is null and default_on_from is not null and notice_at is not null
      and not employed and not learner and default_from <= now(),
    'discoverable', not deletion_open and (
      (d_action = 'granted' and d_version = current_version)
      or (d_action is null and default_on_from is not null and notice_at is not null
          and default_from <= now() and is_worker and not employed and not learner)
    )
  )
  from derived
$function$;
revoke all on function public.discoverability_state_v1(uuid) from public;
revoke all on function public.discoverability_state_v1(uuid) from anon;
revoke all on function public.discoverability_state_v1(uuid) from authenticated;

-- 5. The RLS predicate — every employer read goes through it (can_view_worker, the two discovery
--    projections, partner supply, admin counts). Same signature, ACL restated.
create or replace function public.worker_profile_discoverable(p_profile uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((public.discoverability_state_v1(p_profile) ->> 'discoverable')::boolean, false)
$function$;
revoke all on function public.worker_profile_discoverable(uuid) from public;
revoke all on function public.worker_profile_discoverable(uuid) from anon;
grant execute on function public.worker_profile_discoverable(uuid) to authenticated;
comment on function public.worker_profile_discoverable(uuid) is
  'True for a current-version grant as the newest decision, or (no decision, switch armed, notice shown, free worker, not a learner) the default; never with an open account_deletion request (20261025100000).';

-- 6. The person's own state read (shape kept: status / decidedAt / version / locale /
--    currentVersion; new keys added).
create or replace function public.current_profile_discoverability_consent()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with s as (
    select public.discoverability_state_v1(auth.uid()) as st
  ),
  pu as (
    select * from public.privacy_consent_purposes where purpose = 'profile_discoverability'
  )
  select case when auth.uid() is null then jsonb_build_object('status', 'not_set') else
    jsonb_build_object(
      'status', case
        when (st->>'decision') = 'granted' and (st->>'decisionCurrent')::boolean then 'granted'
        when (st->>'decision') = 'granted' then 'granted_stale_version'
        when (st->>'decision') in ('withdrawn', 'declined') then 'withdrawn'
        when (st->>'defaultInForce')::boolean then 'default_on'
        when (st->>'defaultApplies')::boolean then 'default_pending'
        else 'not_set'
      end,
      'choice', st->>'choice',
      'decision', st->>'decision',
      'decidedAt', st->'decidedAt',
      'version', st->'version',
      'currentVersion', pu.current_version,
      'defaultScope', st->'defaultScope',
      'defaultFrom', st->'defaultFrom',
      'noticeDue', (st->>'armed')::boolean
                   and (st->>'decision') is null
                   and (st->>'noticeAt') is null
                   and (st->>'defaultScope') = 'free'
    )
  end
  from s, pu
$function$;
revoke all on function public.current_profile_discoverability_consent() from public;
revoke all on function public.current_profile_discoverability_consent() from anon;
grant execute on function public.current_profile_discoverability_consent() to authenticated;

-- 7. The notice record — the person's own session, while the notice is on their screen.
create or replace function public.record_visibility_default_notice_v1(
  p_version text, p_hash text, p_locale text, p_source text
)
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
  if p_locale is null or p_locale not in ('lt', 'en', 'ru', 'nl', 'de', 'pl') then
    return jsonb_build_object('ok', false, 'error', 'invalid_locale');
  end if;
  if coalesce(char_length(btrim(p_source)), 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;
  select * into v_cur from public.privacy_consent_purposes where purpose = 'profile_discoverability';
  if v_cur.default_on_from is null then
    return jsonb_build_object('ok', false, 'error', 'default_not_armed');
  end if;
  if p_version is distinct from v_cur.default_notice_version or p_hash is distinct from v_cur.default_notice_hash then
    return jsonb_build_object('ok', false, 'error', 'stale_notice_version');
  end if;
  perform pg_advisory_xact_lock(hashtext('profile_discoverability_notice:' || v_uid::text));
  -- A decision always wins; a notice already on record for this version is not repeated.
  if exists (
       select 1 from public.privacy_consent_events e
        where e.user_id = v_uid and e.purpose = 'profile_discoverability'
          and e.action in ('granted', 'withdrawn', 'declined')
     ) then
    return jsonb_build_object('ok', true, 'recorded', false, 'reason', 'decision_on_record');
  end if;
  if exists (
       select 1 from public.privacy_consent_events e
        where e.user_id = v_uid and e.purpose = 'profile_discoverability'
          and e.action = 'notice_shown' and e.consent_text_version = v_cur.default_notice_version
     ) then
    return jsonb_build_object('ok', true, 'recorded', false, 'reason', 'already_recorded');
  end if;
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source, metadata)
  values
    (v_uid, 'profile_discoverability', 'notice_shown', v_cur.default_notice_version,
     v_cur.default_notice_hash, p_locale, p_source,
     jsonb_build_object('basis', v_cur.default_basis));
  return jsonb_build_object('ok', true, 'recorded', true);
end;
$function$;
revoke all on function public.record_visibility_default_notice_v1(text, text, text, text) from public;
revoke all on function public.record_visibility_default_notice_v1(text, text, text, text) from anon;
grant execute on function public.record_visibility_default_notice_v1(text, text, text, text) to authenticated;

-- 8. "Not now" is a decision now — recorded, so it is never mistaken for "never asked".
create or replace function public.decline_profile_discoverability_v1(p_locale text, p_source text)
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
  if p_locale is null or p_locale not in ('lt', 'en', 'ru', 'nl', 'de', 'pl') then
    return jsonb_build_object('ok', false, 'error', 'invalid_locale');
  end if;
  if coalesce(char_length(btrim(p_source)), 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;
  select * into v_cur from public.privacy_consent_purposes where purpose = 'profile_discoverability';
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source)
  values
    (v_uid, 'profile_discoverability', 'declined',
     coalesce(v_cur.current_version, 'unknown'), coalesce(v_cur.current_text_hash, 'unknown'),
     p_locale, p_source);
  return jsonb_build_object('ok', true, 'status', 'withdrawn');
end;
$function$;
revoke all on function public.decline_profile_discoverability_v1(text, text) from public;
revoke all on function public.decline_profile_discoverability_v1(text, text) from anon;
grant execute on function public.decline_profile_discoverability_v1(text, text) to authenticated;

-- 9. Withdrawal: same signature, same "always accepted"; the ledger locale is the person's
--    account language (it used to be the constant 'lt').
create or replace function public.withdraw_profile_discoverability_consent(p_source text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_cur public.privacy_consent_purposes;
  v_locale text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if coalesce(char_length(btrim(p_source)), 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;
  select * into v_cur from public.privacy_consent_purposes where purpose = 'profile_discoverability';
  select case when p.locale in ('lt', 'en', 'ru', 'nl', 'de', 'pl') then p.locale else 'en' end
    into v_locale
    from public.profiles p where p.id = v_uid;
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source)
  values
    (v_uid, 'profile_discoverability', 'withdrawn',
     coalesce(v_cur.current_version, 'unknown'), coalesce(v_cur.current_text_hash, 'unknown'),
     coalesce(v_locale, 'en'), p_source);
  return jsonb_build_object('ok', true, 'status', 'withdrawn');
end;
$function$;
revoke all on function public.withdraw_profile_discoverability_consent(text) from public;
revoke all on function public.withdraw_profile_discoverability_consent(text) from anon;
grant execute on function public.withdraw_profile_discoverability_consent(text) to authenticated;

commit;

-- ── POST-APPLY VERIFICATION (read-only; record the numbers to the owner, not on GitHub) ─────────
--   select default_on_from, default_basis, default_notice_version from public.privacy_consent_purposes
--    where purpose = 'profile_discoverability';                -- expect NULL, NULL, '2026-10-25.notice.v1'
--   select count(*) from public.workers w where w.profile_id is not null
--      and public.worker_profile_discoverable(w.profile_id);   -- expect exactly the pre-apply count
