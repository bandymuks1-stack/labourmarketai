-- @human-gate-approved
--
-- ── SCOPE OF THE HUMAN GATE ────────────────────────────────────────────────
-- SAFETY CLASS: RED. One SECURITY DEFINER function, one trigger function, one
-- CHECK constraint widening and one unique-index replacement on
-- `organization_evidence_events`. Draft PR + `needs-human-gate`; apply ONLY via
-- Supabase MCP `apply_migration` after explicit owner approval. Never
-- `supabase db push`. NO OWNER APPROVAL EXISTS FOR THIS FILE YET: the marker
-- above is the risk acknowledgement the static gate reads, not an approval.
--
-- 20261003110000 — the subject can WITHDRAW a contest, and contest again.
--
-- ── WHAT ALREADY EXISTS ON MAIN (not re-built) ─────────────────────────────
-- 20260915180000_subject_contest_and_clash_receipt (RED #4):
--   * policy organization_evidence_events_subject_dispute — the linked subject
--     inserts event_type 'disputed' with actor_profile_id = auth.uid(),
--     actor_role NULL, actor_organization_id NULL;
--   * unique index organization_evidence_events_one_dispute_per_actor
--     on (record_id, actor_profile_id) where event_type = 'disputed'.
-- The UI/action (disputeEvidenceRecordAction) and the DISPUTED derivation are
-- live. What is MISSING is the way back: a contest raised in error, or settled
-- off-platform, can never be taken back, and the one-per-actor index would make
-- a second contest impossible even if it could.
--
-- ── THE EVENT MODEL ────────────────────────────────────────────────────────
-- Append-only, per actor, latest-wins inside the dispute family:
--   'disputed'           the actor contests the record
--   'dispute_withdrawn'  the same actor takes THEIR OWN contest back
-- A contest STANDS for an actor while their latest family event is 'disputed'.
-- Withdrawal appends a row; it never updates or deletes the earlier 'disputed'
-- row, so the historical fact that the contest existed (who, when, the note)
-- is permanent. Re-contesting after a withdrawal appends a new 'disputed'.
-- Pairing is PER ACTOR (as deriveEvidenceStanding does): one party's
-- withdrawal can never clear another party's standing contest.
--
-- ── WHAT THIS CHANGES ──────────────────────────────────────────────────────
-- A. The CHECK on event_type gains exactly one value, 'dispute_withdrawn'.
-- B. The partial unique index "one 'disputed' row per (record, actor), ever" is
--    replaced by a BEFORE INSERT trigger that enforces the rule "no second
--    STANDING contest by the same actor, and no withdrawal without a standing
--    contest". Same 23505 on a duplicate contest (the existing action already
--    maps it to "already on file"), so every existing write path keeps its
--    behaviour. The trigger guards ALL writers (subject policy, manager
--    `_attest`, the RPC below) the same way.
-- C. withdraw_organization_evidence_dispute_v1(uuid, text) — SECURITY DEFINER,
--    event type hard-coded, authority identical to the dispute policy
--    (LINKED organization_people.linked_profile_id = auth.uid() on THIS record,
--    and not a manager of the record's organization), NULL-safe, idempotent:
--    withdrawing when nothing of the caller's stands appends nothing and
--    returns the current state.
--
-- ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────────
-- No policy is created, altered or dropped. No UPDATE/DELETE authority exists
-- anywhere. organization_evidence_records is never touched. No grant on an
-- existing object changes. The function returns one small jsonb about the
-- caller's own standing, never rows or columns of any other table.
--
-- Rollback: supabase/rollbacks/20261003110000_subject_contest_withdraw_v1.down.sql
-- (refuses rather than failing halfway while 'dispute_withdrawn' rows or
-- repeat-contest rows exist; never deletes a person's contest).

begin;

-- ── A. widen the closed event set by exactly one value ─────────────────────
alter table public.organization_evidence_events
  drop constraint if exists organization_evidence_events_event_type_check;

alter table public.organization_evidence_events
  add constraint organization_evidence_events_event_type_check
  check (event_type in (
    'attested','attestation_withdrawn',
    'independently_verified','verification_withdrawn',
    'withdrawn','reinstated','disputed','dispute_withdrawn','corrected'));

-- ── B. replace "one contest ever" with "one STANDING contest at a time" ───
create or replace function public.organization_evidence_dispute_state_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_latest text;
begin
  if new.event_type not in ('disputed', 'dispute_withdrawn') then
    return new;
  end if;

  -- Serialise this (record, actor) pair so two concurrent writes cannot both
  -- pass the check. Re-entrant: the RPC takes the same lock first.
  perform pg_advisory_xact_lock(
    hashtextextended(new.record_id::text || ':' || coalesce(new.actor_profile_id::text, ''), 0));

  -- Latest event of the family for THIS actor (NULL actors pair with NULL
  -- actors only: an unattributable contest is its own party). On a timestamp
  -- tie the withdrawal wins, exactly as deriveEvidenceStanding does.
  select e.event_type into v_latest
    from public.organization_evidence_events e
   where e.record_id = new.record_id
     and e.actor_profile_id is not distinct from new.actor_profile_id
     and e.event_type in ('disputed', 'dispute_withdrawn')
   order by e.created_at desc, (e.event_type = 'dispute_withdrawn') desc
   limit 1;

  if new.event_type = 'disputed' and v_latest is not distinct from 'disputed' then
    raise exception 'a contest by this actor already stands on this record'
      using errcode = '23505';
  end if;

  if new.event_type = 'dispute_withdrawn' and v_latest is distinct from 'disputed' then
    raise exception 'no standing contest by this actor on this record'
      using errcode = '23514';
  end if;

  return new;
end;
$fn$;

revoke all on function public.organization_evidence_dispute_state_guard() from public;
revoke all on function public.organization_evidence_dispute_state_guard() from anon;
revoke all on function public.organization_evidence_dispute_state_guard() from authenticated;

drop trigger if exists organization_evidence_events_dispute_state_guard
  on public.organization_evidence_events;
create trigger organization_evidence_events_dispute_state_guard
  before insert on public.organization_evidence_events
  for each row
  when (new.event_type in ('disputed', 'dispute_withdrawn'))
  execute function public.organization_evidence_dispute_state_guard();

drop index if exists public.organization_evidence_events_one_dispute_per_actor;

-- ── C. the withdraw operation ──────────────────────────────────────────────
create or replace function public.withdraw_organization_evidence_dispute_v1(
  p_record_id uuid,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_latest  text;
  v_event   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- ONE refusal for "no such record", "not the subject" and "unlinked": a
  -- caller must not learn that a record exists from a different error. The
  -- predicate is the dispute policy's, evaluated for this record.
  select r.organization_id into v_org
    from public.organization_evidence_records r
    join public.organization_people op
      on op.id = r.organization_person_id
     and op.organization_id = r.organization_id
   where r.id = p_record_id
     and op.linked_profile_id = v_uid
     and op.link_state = 'linked';

  if v_org is null
     or public.manages_organization(v_org) is distinct from false then
    raise exception 'only the subject of this record may withdraw their contest'
      using errcode = '42501';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note must be 1000 characters or fewer' using errcode = '22001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_record_id::text || ':' || v_uid::text, 0));

  select e.event_type into v_latest
    from public.organization_evidence_events e
   where e.record_id = p_record_id
     and e.actor_profile_id = v_uid
     and e.event_type in ('disputed', 'dispute_withdrawn')
   order by e.created_at desc, (e.event_type = 'dispute_withdrawn') desc
   limit 1;

  -- IDEMPOTENT: nothing of the caller's stands -> append nothing, say so.
  if v_latest is distinct from 'disputed' then
    return jsonb_build_object(
      'standing', false, 'withdrawn', false, 'idempotent', true, 'event_id', null);
  end if;

  -- clock_timestamp(), not now(): a contest and its withdrawal in one
  -- transaction must still order correctly under latest-wins.
  insert into public.organization_evidence_events
    (organization_id, record_id, event_type, actor_profile_id, actor_role,
     actor_organization_id, replacement_record_id, note, created_at)
  values
    (v_org, p_record_id, 'dispute_withdrawn', v_uid, null, null, null, v_note,
     clock_timestamp())
  returning id into v_event;

  return jsonb_build_object(
    'standing', false, 'withdrawn', true, 'idempotent', false, 'event_id', v_event);
end;
$fn$;

revoke all on function public.withdraw_organization_evidence_dispute_v1(uuid, text) from public;
revoke all on function public.withdraw_organization_evidence_dispute_v1(uuid, text) from anon;
grant execute on function public.withdraw_organization_evidence_dispute_v1(uuid, text) to authenticated;

comment on function public.withdraw_organization_evidence_dispute_v1(uuid, text) is
  'The subject withdraws THEIR OWN standing contest of an evidence record. Appends one dispute_withdrawn event (type hard-coded); the earlier disputed row is never altered, so the fact that the contest existed stays on record. Authority = the dispute policy (linked subject, not a manager of the record organization). Idempotent: with no standing contest it appends nothing and returns standing=false. Returns a small jsonb about the callers own standing only.';

comment on function public.organization_evidence_dispute_state_guard() is
  'BEFORE INSERT guard on organization_evidence_events for the dispute family. Replaces the one-contest-ever unique index with: no second STANDING contest by the same actor (23505, as before) and no withdrawal without a standing contest by the same actor (23514). Per actor, latest-wins.';

commit;
