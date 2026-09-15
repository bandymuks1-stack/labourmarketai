-- @human-gate-approved
--
-- SUBJECT AUTHORITY, TWICE — RED #4 + RED #5, one migration.
-- Owner PREPARE approval 2026-09-15. PREPARED, NOT APPLIED.
--
-- Both halves answer the same question: a person is the SUBJECT of a record
-- somebody else controls, and today the database gives them no way to say
-- anything about it. Neither half lets them change what the other party
-- wrote. Both are additive; each has an exact rollback below.
--
-- ─────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES NOT DO — the invariants that survive it
--   * No UPDATE and no DELETE authority is created anywhere. A subject can
--     never edit or remove an employer's evidence row; `organization_evidence
--     _records` still has only INSERT (org managers) and SELECT policies.
--   * No employer impersonation. Both new paths pin `actor = auth.uid()`,
--     and the contest path additionally requires `actor_role IS NULL` and
--     `actor_organization_id IS NULL` — it cannot be written as if an
--     organisation said it.
--   * No widening of any unrelated INSERT / UPDATE / SELECT. Exactly one new
--     INSERT policy, on exactly one table, for exactly one `event_type`.
--   * Nothing is erased. The contest is an event ALONGSIDE the record; the
--     clash receipt is an event ALONGSIDE the clash, which stays computable
--     and stays rendered.
--   * UNKNOWN stays UNKNOWN. A disputed record does not become false, and an
--     un-disputed record does not become agreed.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- PART A — RED #4: the subject may contest evidence written about them.
--
-- EXTEND, NOT NEW. `organization_evidence_events` already exists, already
-- carries `event_type = 'disputed'` in its CHECK, and its SELECT policy
-- already lets a LINKED subject read the events on records about them. The
-- only thing missing is the authority to INSERT one: the two existing INSERT
-- policies are `_attest` (organisation managers) and `_verify` (a third-party
-- verifier org). A person the record is ABOUT matches neither.
--
-- The table's own CHECK `organization_evidence_events_actor_role` already
-- forces `actor_role IS NULL` for 'disputed'. The policy restates it, plus
-- `actor_organization_id IS NULL`, as defence in depth: the constraint says
-- what the row may look like, the policy says who may write it, and a
-- contest must be attributable to a PERSON, never to an organisation.
-- ═════════════════════════════════════════════════════════════════════════

create policy "organization_evidence_events_subject_dispute"
  on public.organization_evidence_events
  for insert
  to authenticated
  with check (
    event_type = 'disputed'
    -- The actor is the caller, stated, not defaulted.
    and actor_profile_id = auth.uid()
    -- A person, not an organisation, and not a supplier role.
    and actor_role is null
    and actor_organization_id is null
    -- A contest proposes NO replacement record. Creating one would need
    -- INSERT on organization_evidence_records, which the subject does not
    -- have and which this migration does not grant.
    and replacement_record_id is null
    -- Never the organisation's own manager writing through the subject door;
    -- that party already has `_attest`.
    and not public.manages_organization(organization_id)
    -- AND THE CALLER IS THE SUBJECT OF THIS EXACT RECORD. Same link the
    -- SELECT policy already trusts: a LINKED `organization_people` row whose
    -- `linked_profile_id` is the caller, in the same organisation as both
    -- the record and the event.
    and exists (
      select 1
        from public.organization_evidence_records r
        join public.organization_people op
          on op.id = r.organization_person_id
       where r.id = organization_evidence_events.record_id
         and r.organization_id = organization_evidence_events.organization_id
         and op.organization_id = organization_evidence_events.organization_id
         and op.linked_profile_id = auth.uid()
         and op.link_state = 'linked'
    )
  );

comment on policy "organization_evidence_events_subject_dispute"
  on public.organization_evidence_events is
  'RED #4. The person a record is about may record ONE dispute against it. '
  'Insert-only: no UPDATE/DELETE authority is created, the underlying '
  'organization_evidence_records row is untouched and untouchable by this '
  'path, and the dispute is attributed to the person (actor_role NULL, '
  'actor_organization_id NULL) so it can never read as an employer statement.';

-- A dispute is a FACT about a person and a record, not a message stream.
-- One per (record, actor) bounds the path and makes it idempotent; it binds
-- equally to a manager's dispute written through `_attest`.
create unique index if not exists organization_evidence_events_one_dispute_per_actor
  on public.organization_evidence_events (record_id, actor_profile_id)
  where event_type = 'disputed';

-- ═════════════════════════════════════════════════════════════════════════
-- PART B — RED #5: a person may knowingly accept a calendar clash, on the
-- record.
--
-- Today `respond_booking_request_v3` raises 23P01 ('Conflicting accepted
-- booking for these dates') and the worker simply cannot accept. That guard
-- is right by default and stays the default. What is missing is the case
-- where the overlap is real and the person has decided anyway — a half-day
-- edge, two sites they can genuinely cover, an arrangement made off-platform.
--
-- THE OVERRIDE RECORDS THE DECISION; IT DOES NOT ERASE THE CLASH. Both
-- bookings stay `accepted` with their real dates, `detectConflicts` keeps
-- returning the overlap, and the calendar keeps showing it. What changes is
-- that the decision now has an author, a timestamp and a named counterpart.
--
-- EXTEND, NOT NEW. `booking_request_events` is the existing immutable audit
-- log for a booking (SELECT-only to the two parties and admins; every write
-- already arrives through a SECURITY DEFINER function). The receipt is a row
-- in it, not a new table.
-- ═════════════════════════════════════════════════════════════════════════

alter table public.booking_request_events
  add column if not exists related_booking_request_id uuid
    references public.booking_requests(id) on delete cascade;

comment on column public.booking_request_events.related_booking_request_id is
  'The OTHER booking involved in this event. Set only on a '
  '''clash_acknowledged'' receipt, where it names the accepted booking the '
  'caller knowingly overlapped. One receipt row per clashing counterpart.';

alter table public.booking_request_events
  drop constraint if exists booking_request_events_event_type_check;

alter table public.booking_request_events
  add constraint booking_request_events_event_type_check
  check (event_type = any (array[
    'proposed', 'accepted', 'declined', 'withdrawn',
    'expired', 'rescheduled', 'deadline_set',
    'clash_acknowledged'
  ]));

-- An iff, in both directions: a receipt must name its counterpart, and no
-- other event type may borrow the column. Every existing row satisfies it
-- (related_booking_request_id is NULL, event_type is not the new value).
alter table public.booking_request_events
  add constraint booking_request_events_clash_receipt
  check ((event_type = 'clash_acknowledged') = (related_booking_request_id is not null));

-- ── the RPC ──────────────────────────────────────────────────────────────
-- v4 = v3 with ONE added parameter and ONE added branch. v3 is left in place
-- and unchanged, so every caller that does not pass the acknowledgement
-- behaves exactly as it does today, and the rollback is a client-side
-- revert plus a DROP.

create or replace function public.respond_booking_request_v4(
  p_booking_id uuid,
  p_decision text,
  p_reason_kind text,
  p_reason_note text,
  p_acknowledge_clash boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  br  public.booking_requests%rowtype;
  is_subject_worker boolean;
  v_kind text := nullif(trim(coalesce(p_reason_kind, '')), '');
  v_note text := nullif(trim(coalesce(p_reason_note, '')), '');
  v_company uuid;
  v_demand_owner uuid;
  v_demand_org uuid;
  v_company_count integer := 0;
  v_engagement text := null;
  v_updated integer := 0;
  v_clashes uuid[] := '{}';
  v_clash uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_decision not in ('accepted','declined') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  if v_kind is not null and v_kind not in
       ('dates_unsuitable','conditions_unsuitable','already_booked','other') then
    raise exception 'Invalid reason' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Reason note too long' using errcode = '22023';
  end if;

  -- L1: LOCK THE ROW FIRST.
  select * into br
    from public.booking_requests
   where id = p_booking_id
     for update;
  if br.id is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  select exists (select 1 from public.workers w
                  where w.id = br.worker_id and w.profile_id = uid)
    into is_subject_worker;
  if not is_subject_worker then
    raise exception 'Only the addressed worker may respond' using errcode = '42501';
  end if;

  -- L1 status gate, evaluated AFTER the lock.
  if br.status is distinct from 'proposed' then
    if br.status = p_decision then
      return jsonb_build_object(
        'decision', p_decision,
        'engagement', case when p_decision = 'accepted'
                           then 'already_recorded' else null end,
        'idempotent', true
      );
    end if;
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  if p_decision = 'accepted' and br.start_date is not null then
    -- L2: serialise every accept for THIS worker.
    perform pg_advisory_xact_lock(hashtextextended(br.worker_id::text, 0));

    select coalesce(array_agg(other.id order by other.id), '{}')
      into v_clashes
      from public.booking_requests other
     where other.worker_id = br.worker_id
       and other.id <> br.id
       and other.status = 'accepted'
       and other.start_date is not null
       and daterange(other.start_date, coalesce(other.expected_end_date, other.start_date), '[]')
           && daterange(br.start_date, coalesce(br.expected_end_date, br.start_date), '[]');

    -- DEFAULT IS UNCHANGED: without an explicit acknowledgement this is the
    -- same refusal, with the same errcode, that v3 raises today.
    if array_length(v_clashes, 1) is not null and coalesce(p_acknowledge_clash, false) is not true then
      raise exception 'Conflicting accepted booking for these dates'
        using errcode = '23P01';
    end if;
  end if;

  update public.booking_requests
     set status = p_decision, updated_at = now()
   where id = br.id
     and status = 'proposed';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status,
       reason_kind, reason_note)
    values (br.id, uid, p_decision, 'proposed', p_decision,
            case when p_decision = 'declined' then v_kind end,
            case when p_decision = 'declined' then v_note end);

  -- THE RECEIPT. One immutable row per counterpart the caller overlapped,
  -- written in the SAME transaction as the accept it belongs to. Nothing
  -- about either booking is altered, and no clash is marked resolved:
  -- `detectConflicts` will keep returning this overlap tomorrow.
  if p_decision = 'accepted' and coalesce(p_acknowledge_clash, false) is true then
    foreach v_clash in array v_clashes loop
      insert into public.booking_request_events
          (booking_request_id, actor_id, event_type, from_status, to_status,
           related_booking_request_id)
        values (br.id, uid, 'clash_acknowledged', 'proposed', 'accepted', v_clash);
    end loop;
  end if;

  -- Engagement: SAME transaction as the accept. ORG-FIRST (M-P0-6).
  if p_decision = 'accepted' then
    select cr.profile_id, cr.organization_id
      into v_demand_owner, v_demand_org
      from public.customer_requests cr
     where cr.id = br.request_id;

    if v_demand_owner is null
       or v_demand_owner is distinct from br.owner_id then
      v_engagement := 'no_company';
    elsif v_demand_org is not null then
      select o.legacy_company_id into v_company
        from public.organizations o
       where o.id = v_demand_org;
      if v_company is null then
        v_engagement := 'no_company';
      end if;
    else
      select count(*) into v_company_count
        from public.companies c
       where c.profile_id = v_demand_owner;

      if v_company_count = 0 then
        v_engagement := 'no_company';
      elsif v_company_count > 1 then
        v_engagement := 'ambiguous_company';
      else
        select c.id into v_company
          from public.companies c
         where c.profile_id = v_demand_owner;
      end if;
    end if;

    if v_engagement is not null then
      null;
    elsif exists (
      select 1 from public.company_worker_engagements e
       where e.source_booking_id = br.id
    ) then
      v_engagement := 'already_recorded';
    elsif exists (
      select 1 from public.company_worker_engagements e
       where e.company_id = v_company
         and e.worker_id = br.worker_id
         and e.status = 'active'
    ) then
      v_engagement := 'already_active';
    else
      insert into public.company_worker_engagements
          (company_id, worker_id, source_booking_id, created_by)
        values (v_company, br.worker_id, br.id, uid)
      on conflict (source_booking_id) do nothing;
      v_engagement := 'created';
    end if;
  end if;

  return jsonb_build_object(
    'decision', p_decision,
    'engagement', v_engagement,
    -- The caller is TOLD what they overrode. Silence here would be the same
    -- defect as erasing the clash.
    'acknowledged_clashes', coalesce(array_length(v_clashes, 1), 0)
  );
end;
$function$;

revoke all on function public.respond_booking_request_v4(uuid, text, text, text, boolean) from public;
grant execute on function public.respond_booking_request_v4(uuid, text, text, text, boolean) to authenticated;

comment on function public.respond_booking_request_v4(uuid, text, text, text, boolean) is
  'RED #5. v3 plus an explicit clash acknowledgement. Only the addressed '
  'worker may call it (unchanged). Without p_acknowledge_clash it refuses an '
  'overlapping accept exactly as v3 does. With it, the accept proceeds AND a '
  'clash_acknowledged receipt is written per overlapping booking. The clash '
  'is not resolved, not hidden and not deleted.';

commit;

-- ═════════════════════════════════════════════════════════════════════════
-- ROLLBACK (exact, reversible, no data loss for anything pre-existing)
--
--   begin;
--   drop function if exists public.respond_booking_request_v4(uuid, text, text, text, boolean);
--   delete from public.booking_request_events where event_type = 'clash_acknowledged';
--   alter table public.booking_request_events
--     drop constraint if exists booking_request_events_clash_receipt;
--   alter table public.booking_request_events
--     drop constraint if exists booking_request_events_event_type_check;
--   alter table public.booking_request_events
--     add constraint booking_request_events_event_type_check
--     check (event_type = any (array['proposed','accepted','declined',
--            'withdrawn','expired','rescheduled','deadline_set']));
--   alter table public.booking_request_events
--     drop column if exists related_booking_request_id;
--   drop index if exists public.organization_evidence_events_one_dispute_per_actor;
--   drop policy if exists "organization_evidence_events_subject_dispute"
--     on public.organization_evidence_events;
--   commit;
--
-- The only rows the rollback removes are receipts this migration made
-- possible; every pre-existing row predates both and is untouched. Rolling
-- back Part A removes an authority, never a record: a dispute already written
-- stays readable, and only the ability to write a NEW one goes away.
-- ═════════════════════════════════════════════════════════════════════════
