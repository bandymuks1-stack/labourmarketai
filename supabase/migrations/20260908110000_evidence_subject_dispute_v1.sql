-- @human-gate-approved
--
-- ── SCOPE OF THE HUMAN GATE ────────────────────────────────────────────────
-- SAFETY CLASS: RED. Two new SECURITY DEFINER functions and one CHECK
-- constraint replacement on `organization_evidence_events`. Draft PR +
-- `needs-human-gate`; apply ONLY via Supabase MCP `apply_migration` after
-- explicit owner approval. Never `supabase db push`.
--
-- NO OWNER DECISION EXISTS FOR THIS FILE YET. The marker above is the risk
-- ACKNOWLEDGEMENT the static gate reads (doctrine: "an acknowledgement, not an
-- auto-merge pass"). It is not an approval and it is not self-approval. The
-- control is the human gate. The packet is
-- docs/launch/OWNER_GATE_PACKETS_2026-09-08.md, Appendix C (EVID-7).
--
-- 20260908110000 — the subject of an imported evidence record can contest it.
--
-- ── THE DEFECT, MEASURED ON PRODUCTION 2026-09-08 ─────────────────────────
--
-- `deriveEvidenceStanding` ranks DISPUTED SECOND in precedence — above
-- CORRECTED, above INDEPENDENTLY_VERIFIED, above every attestation. The reader
-- is complete. THE CAUSER DOES NOT EXIST. Measured at three levels:
--
--   1. RLS. `organization_evidence_events` has exactly two INSERT policies.
--      `..._attest` requires manages_organization(organization_id) — which the
--      subject of an imported record is not, by definition: the import exists
--      precisely so an organization can record a person who does not manage
--      it. `..._verify` admits ONLY 'independently_verified' and then excludes
--      the subject by name (NOT EXISTS over op.linked_profile_id = auth.uid()).
--      No policy in existence admits a subject, for any event_type.
--
--   2. No SECURITY DEFINER route around it. Nothing in pg_proc writes to this
--      table. The three dispute RPCs that do exist — open_experience_dispute,
--      review_experience_dispute, resolve_experience_dispute — belong to
--      `experience_records` (EVID-6), a different table with a different
--      meaning. Reusing them here would collapse two evidence models into one.
--
--   3. No application writer. The only two are in import-core.ts: the
--      importing organization's rollback/reinstate, and its own attestation.
--      Nothing in the repository emits event_type = 'disputed'.
--
-- So an employer, an agency or an institution can write a record about a
-- person, attest it in its own name, and that person has no act available to
-- them at all. The existing roster-link refusal is a DIFFERENT act: it answers
-- "may this organization name me", once, all-or-nothing. Once linked, a single
-- false record cannot be contested — and refusing the whole link to escape one
-- wrong line would discard the true records with it.
--
-- ── WHY A UI-ONLY SLICE WOULD HAVE BEEN WRONG ─────────────────────────────
--
-- The journey register and the EVID-1 capability row both called this "UI work,
-- not a migration". A button alone returns 42501 to the one person it exists
-- for, converting a silent absence into a visible broken promise. Both rows
-- were corrected before this file was written.
--
-- ── THE CHANGE ────────────────────────────────────────────────────────────
--
-- A. The closed event set gains `dispute_withdrawn`, so a dispute is
--    RETRACTABLE. The set already pairs `withdrawn` with `reinstated`; the
--    author's own idiom is that an append-only mark gets an inverse.
--    `disputed` shipped without one. An irreversible permanent mark on another
--    party's record would breach the repository's binding reversibility rule,
--    and it would hurt the subject too: a dispute raised in error could never
--    be taken back. Latest-wins WITHIN the family, exactly as
--    withdrawn/reinstated already derive.
--
-- B. `dispute_organization_evidence_record_v1(uuid, text)` — inserts exactly
--    ONE row with event_type HARD-CODED to 'disputed'. The caller cannot
--    choose the event type, so this is not a general event writer. Admits the
--    caller only when `is_evidence_record_subject(p_record_id)` — the boolean
--    the owner approved and applied as ledger 20260908080950, reused rather
--    than duplicated.
--
-- C. `withdraw_organization_evidence_dispute_v1(uuid, text)` — the same shape,
--    event type hard-coded to 'dispute_withdrawn', refusing when the CALLER
--    has no standing dispute of their own to withdraw. Pairing is PER ACTOR on
--    both sides (SQL and deriveEvidenceStanding), so one party can never clear
--    another party's contest by withdrawing their own.
--
-- Neither function returns rows or columns of any other table: one uuid each.
-- `actor_role` is deliberately NULL — the table's own check constraint FORBIDS
-- a role on any event that is not an attestation or a verification, so the
-- schema already refuses to let a dispute masquerade as either.
--
-- ── WHY THIS DOES NOT WIDEN ANYTHING ──────────────────────────────────────
--
-- No existing policy, table, column, row or grant on an existing object is
-- altered. The record itself is NEVER mutated: `disputed` is an append-only
-- lifecycle event exactly as `withdrawn` and `corrected` already are, so a
-- dispute cannot delete or edit what an organization recorded. Both sides stay
-- on the record — that is the point of contesting rather than erasing.
--
-- The constraint replacement only ADDS one value to an accepted set. Nothing
-- previously accepted becomes invalid, so no existing row can be orphaned by
-- it, and all eight import tables hold 0 rows in any case.
--
-- `authenticated` only; `public` and `anon` revoked BY NAME, because on a clean
-- local reset the environment's default privileges can hand `anon` EXECUTE.
--
-- ── NOT DESTRUCTIVE ───────────────────────────────────────────────────────
--
-- No DROP TABLE, no DROP COLUMN, no DELETE, no RLS loosening. The only `drop`
-- is `drop constraint if exists` on the CHECK immediately re-added, one line
-- below, as a strict superset of itself. Rollback:
-- supabase/rollbacks/20260908110000_evidence_subject_dispute_v1.down.sql

alter table public.organization_evidence_events
  drop constraint if exists organization_evidence_events_event_type_check;

alter table public.organization_evidence_events
  add constraint organization_evidence_events_event_type_check
  check (event_type in (
    'attested','attestation_withdrawn',
    'independently_verified','verification_withdrawn',
    'withdrawn','reinstated','disputed','dispute_withdrawn','corrected'));

create or replace function public.dispute_organization_evidence_record_v1(
  p_record_id uuid,
  p_note      text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_org   uuid;
  v_event uuid;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- ONE refusal for both "not the subject" and "no such record": a caller must
  -- not learn that a record exists by receiving a different error for it.
  if not public.is_evidence_record_subject(p_record_id) then
    raise exception 'only the subject of this record may contest it'
      using errcode = '42501';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note must be 1000 characters or fewer' using errcode = '22001';
  end if;

  select r.organization_id into v_org
    from public.organization_evidence_records r
   where r.id = p_record_id;

  insert into public.organization_evidence_events
    (organization_id, record_id, event_type, actor_profile_id, note)
  values
    (v_org, p_record_id, 'disputed', auth.uid(), v_note)
  returning id into v_event;

  return v_event;
end;
$fn$;

create or replace function public.withdraw_organization_evidence_dispute_v1(
  p_record_id uuid,
  p_note      text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_org       uuid;
  v_event     uuid;
  v_disputed  timestamptz;
  v_withdrawn timestamptz;
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.is_evidence_record_subject(p_record_id) then
    raise exception 'only the subject of this record may withdraw its dispute'
      using errcode = '42501';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'note must be 1000 characters or fewer' using errcode = '22001';
  end if;

  -- PER ACTOR, and the actor here is the caller. A subject withdraws only
  -- their OWN contest: an organization may also contest a record it received,
  -- and one party must never be able to clear another party's standing
  -- dispute by withdrawing. `deriveEvidenceStanding` pairs the family the same
  -- way, so the SQL and the TypeScript agree on what "standing" means.
  select max(e.created_at) filter (
           where e.event_type = 'disputed' and e.actor_profile_id = auth.uid()),
         max(e.created_at) filter (
           where e.event_type = 'dispute_withdrawn' and e.actor_profile_id = auth.uid()),
         min(r.organization_id)
    into v_disputed, v_withdrawn, v_org
    from public.organization_evidence_records r
    left join public.organization_evidence_events e on e.record_id = r.id
   where r.id = p_record_id;

  -- Latest-wins within the family: there is nothing to withdraw unless the
  -- CALLER's own dispute is currently STANDING.
  if v_disputed is null or (v_withdrawn is not null and v_withdrawn >= v_disputed) then
    raise exception 'no standing dispute of yours on this record' using errcode = 'P0002';
  end if;

  insert into public.organization_evidence_events
    (organization_id, record_id, event_type, actor_profile_id, note)
  values
    (v_org, p_record_id, 'dispute_withdrawn', auth.uid(), v_note)
  returning id into v_event;

  return v_event;
end;
$fn$;

revoke all on function public.dispute_organization_evidence_record_v1(uuid, text) from public;
revoke all on function public.dispute_organization_evidence_record_v1(uuid, text) from anon;
grant execute on function public.dispute_organization_evidence_record_v1(uuid, text) to authenticated;

revoke all on function public.withdraw_organization_evidence_dispute_v1(uuid, text) from public;
revoke all on function public.withdraw_organization_evidence_dispute_v1(uuid, text) from anon;
grant execute on function public.withdraw_organization_evidence_dispute_v1(uuid, text) to authenticated;

comment on function public.dispute_organization_evidence_record_v1(uuid, text) is
  'The subject of an imported evidence record contests it. Appends ONE organization_evidence_events row with event_type hard-coded to disputed - the caller cannot choose the event type, and the record itself is never mutated. Admits only is_evidence_record_subject(p_record_id). Returns the event id: no rows, no columns of any other table.';

comment on function public.withdraw_organization_evidence_dispute_v1(uuid, text) is
  'The subject withdraws their own standing dispute. The inverse of dispute_organization_evidence_record_v1, mirroring the withdrawn/reinstated pair the event set already carries, so a contest raised in error is retractable rather than permanent. Refuses P0002 when no dispute is standing.';
