-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260802120000 — W12 Slice 1: ATOMIC double-booking prevention.
--
-- PROBLEM (audit-verified, W12 read-only audit P0-1). All THREE public accept
-- paths (`respond_booking_request`, `_v2`, `_v3`) carried the SAME race-prone
-- body:
--
--     select * into br from public.booking_requests where id = p_booking_id;  -- NO LOCK
--     if exists (... overlapping accepted booking ...) then raise 23P01; end if;
--     update public.booking_requests set status = p_decision where id = br.id; -- NO STATUS GUARD
--
-- Under the default READ COMMITTED isolation two concurrent transactions
-- accepting two DIFFERENT overlapping bookings for the SAME worker cannot see
-- each other's uncommitted row. Both `EXISTS` probes return false, both pass
-- the guard, both UPDATE different primary keys (so they never contend on a
-- row lock), and both COMMIT. The worker ends up with two accepted,
-- overlapping bookings — the exact state the 20260613100100 header promised
-- could not happen ("accept is BLOCKED ... no silent double-commit").
--
-- Secondarily, the UPDATE lacked an `and status = 'proposed'` guard (unlike
-- `expire_stale_booking_requests_v1`, which has it), so a duplicate submit of
-- the SAME response wrote the row twice and appended a SECOND
-- booking_request_events audit row.
--
-- SOLUTION — three complementary layers, no fourth acceptance mechanism:
--
--   L1  ROW LOCK + STATUS GATE. `select ... for update` on the booking row,
--       status re-checked AFTER the lock, and `update ... where id = ? and
--       status = 'proposed'`. Kills the same-row duplicate submit. Repeating
--       the SAME decision is now IDEMPOTENT (no second event row); a
--       DIFFERENT decision on a closed row still raises 22023 as before.
--
--   L2  WORKER-SCOPED SERIALISATION. `pg_advisory_xact_lock` keyed on the
--       worker id serialises check-then-act across DIFFERENT booking rows of
--       the same worker. This is what L1 alone cannot do (locking booking A's
--       row does not lock booking B's row). It makes the friendly `23P01`
--       message with its human-readable text the deterministic outcome.
--       Lock ORDER is always row-lock → advisory-lock, so no deadlock cycle
--       is possible between two accepts.
--
--   L3  STRUCTURAL DB INVARIANT. A partial `EXCLUDE USING gist` constraint
--       makes two overlapping accepted bookings for one worker UNREPRESENTABLE
--       — including for any future code path, a direct service-role write, or
--       a psql session that bypasses the RPC entirely. Exclusion violations
--       raise SQLSTATE 23P01 (`exclusion_violation`) — the SAME code the
--       hand-rolled guard raises, so the application's existing
--       `classify()` → `kind:"conflict"` mapping covers it with NO UI change.
--
-- ONE CANONICAL PATH. `respond_booking_request_v3` is the canonical, atomic
-- implementation (it is the version production actually uses for accepts).
-- `respond_booking_request` (v1) and `_v2` are REPLACED BY THIN DELEGATORS
-- that call v3 and map its jsonb result back to their original `text` return
-- type. No race-prone body survives anywhere.
--
-- DELIBERATE, DOCUMENTED SEMANTIC CONVERGENCE (not silent):
--   * An ACCEPT through v1/v2 now ALSO mints the company_worker_engagement,
--     because it now runs v3's body. Previously v1/v2 accepted without an
--     engagement. This is convergence onto the canonical path — it is the
--     point of the slice — and it can only ADD a correctly-derived engagement
--     row, never remove or alter one.
--   * Repeating the SAME decision returns success idempotently instead of
--     raising 22023. Repeating a DIFFERENT decision still raises 22023.
--   * v1 ignores reasons (it has no reason parameters) — unchanged.
--
-- INTERVAL SEMANTICS — UNCHANGED, verified against production before writing:
--   `daterange(start_date, coalesce(expected_end_date, start_date), '[]')`
--   * inclusive on BOTH ends;
--   * a NULL end collapses to the start day (a one-day booking → [d, d+1));
--   * TOUCHING bands overlap: A 08-01..08-04 and B 08-04..08-08 CONFLICT;
--   * ADJACENT bands do not: A 08-01..08-04 and B 08-05..08-08 are ALLOWED;
--   * rows with a NULL start_date never block and are never blocked (they
--     carry no date to compare) — mirrored exactly by the partial WHERE.
--   This slice stays DAY-LEVEL. It does NOT introduce time-of-day.
--
-- SCOPE BOUNDARY (explicit, per the W12 slice brief): this constraint governs
-- BOOKING-vs-BOOKING only. Approved leave (`worker_absences`), project
-- stages, travel buffers and timezone handling are deliberately OUT of scope
-- and remain later W12 slices. The constraint name says `accepted_booking` so
-- the limit is legible at the schema level.
--
-- PRODUCTION PREFLIGHT (read-only, 2026-08-02, project gorgitwvdzxbnaxhrsrw):
--   booking_requests            = 0 rows (all statuses 0)
--   booking_request_events      = 0 rows
--   accepted rows               = 0  → ZERO pre-existing overlap conflicts
--   existing constraints        = pkey, 3 FKs, 4 CHECKs, 1 UNIQUE (no EXCLUDE)
--   btree_gist                  = NOT installed, AVAILABLE v1.7
--   search_path (postgres role) = "$user", public, extensions  → the uuid
--                                 gist opclass resolves from `extensions`
--   daterange(date,date,text)   = IMMUTABLE (provolatile 'i') → indexable
-- The constraint can therefore be added without any data decision. If this
-- migration is ever applied to a database that DOES hold overlapping accepted
-- rows, the ADD CONSTRAINT will fail loudly rather than mutate data — no
-- booking is ever rewritten, cancelled or re-statused by this migration.
--
-- ROLLBACK: supabase/rollbacks/20260802150000_booking_atomic_double_booking_v1.down.sql
-- (drops the constraint and restores the three PRE-SLICE function bodies
--  verbatim; the extension is intentionally left installed — dropping a
--  shared extension is never part of a feature rollback).
--
-- POST-APPLY VERIFICATION:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'booking_requests_no_overlapping_accepted';
--   + the two-session concurrency proof in
--     scripts/db-proof/booking-atomic-double-booking.sql
--   + APPLIED_LEDGER.md row.
--
-- TIER: owner-gated RED by design (SECURITY DEFINER + GRANT + new constraint).
--
-- ── OWNER HUMAN GATE — GRANTED 2026-08-02 ──────────────────────────────────
-- The marker below was added ONLY on the owner's explicit written approval in
-- chat. The agent did not self-approve this gate at any point; the file shipped
-- without the marker until that approval arrived.
--
-- SCOPE OF THE APPROVAL — exactly these four migration-safety findings, for
-- THIS pull request (#976) and no other:
--   1. `security-definer-function` — the three respond_booking_request* RPCs
--      stay SECURITY DEFINER with a pinned `search_path`, as they already were.
--   2. `grant-or-revoke`          — REVOKE from public/anon + GRANT EXECUTE to
--      authenticated, for those same three functions only.
--   3. `create-extension`         — `btree_gist`, required for `uuid WITH =`
--      inside the gist exclusion constraint.
--   4. `data-dml`                 — the classifier matching
--      `update public.booking_requests` INSIDE the v3 function body. Verified
--      with `$$ … $$` bodies stripped: this migration performs ZERO
--      statement-level DML.
--
-- WHAT THE APPROVAL EXPLICITLY DOES **NOT** COVER:
--   * applying this migration to PRODUCTION — NOT approved. Production apply
--     stays PENDING_SEPARATE_OWNER_APPROVAL. Merging this PR and deploying the
--     application are NOT permission to run the migration.
--   * any mutation of production data — NOT approved. No seed, no status
--     rewrite, no destructive proof, no production concurrency test.
--   * installing `btree_gist` in production — NOT approved.
-- ============================================================================
-- @human-gate-approved
-- ============================================================================

begin;

-- ── L3a. Extension: uuid equality inside a gist exclusion constraint ────────
-- Matches the existing repo convention (0013_work_journal_m1.sql installs
-- pgcrypto `with schema extensions`); `extensions` is already on the
-- postgres role's search_path, so the opclass resolves without qualification.
create extension if not exists btree_gist with schema extensions;

-- ── L3b. The structural invariant ──────────────────────────────────────────
-- Two overlapping ACCEPTED bookings for one worker become unrepresentable.
-- Partial: only 'accepted' rows with a real start_date participate, which is
-- exactly the set the hand-rolled guard compares.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'booking_requests_no_overlapping_accepted'
  ) then
    alter table public.booking_requests
      add constraint booking_requests_no_overlapping_accepted
      exclude using gist (
        worker_id with =,
        daterange(start_date, coalesce(expected_end_date, start_date), '[]') with &&
      )
      where (status = 'accepted' and start_date is not null);
  end if;
end
$$;

-- ── L1+L2. The ONE canonical atomic implementation ─────────────────────────

create or replace function public.respond_booking_request_v3(
  p_booking_id  uuid,
  p_decision    text,
  p_reason_kind text,
  p_reason_note text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  br  public.booking_requests%rowtype;
  is_subject_worker boolean;
  v_kind text := nullif(trim(coalesce(p_reason_kind, '')), '');
  v_note text := nullif(trim(coalesce(p_reason_note, '')), '');
  v_company uuid;
  v_demand_owner uuid;
  v_company_count integer := 0;
  v_engagement text := null;
  v_updated integer := 0;
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

  -- L1: LOCK THE ROW FIRST. Under READ COMMITTED a blocked `for update` re-reads
  -- the LATEST committed version after the holder commits, so the status gate
  -- below sees the winner's outcome rather than the stale pre-race snapshot.
  select * into br
    from public.booking_requests
   where id = p_booking_id
     for update;
  if br.id is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;

  -- AUTHORIZATION IS NEVER DELEGATED TO A CONSTRAINT. Only the ADDRESSED
  -- worker may respond — checked here, server-side, from auth.uid() only. No
  -- client-supplied worker/company id exists in this signature.
  select exists (select 1 from public.workers w
                  where w.id = br.worker_id and w.profile_id = uid)
    into is_subject_worker;
  if not is_subject_worker then
    raise exception 'Only the addressed worker may respond' using errcode = '42501';
  end if;

  -- L1 status gate, evaluated AFTER the lock.
  if br.status is distinct from 'proposed' then
    -- IDEMPOTENT REPLAY: the same decision already landed (duplicate submit,
    -- retried request, double-tapped confirmation). Report the achieved state
    -- WITHOUT writing a second event/audit row and WITHOUT re-running the
    -- engagement branch.
    if br.status = p_decision then
      return jsonb_build_object(
        'decision', p_decision,
        'engagement', case when p_decision = 'accepted'
                           then 'already_recorded' else null end,
        'idempotent', true
      );
    end if;
    -- A DIFFERENT decision on a closed row stays the pre-slice error.
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  if p_decision = 'accepted' and br.start_date is not null then
    -- L2: serialise every accept for THIS worker. Locking br's row (L1) does
    -- not lock the OTHER overlapping booking's row, so without this the
    -- check-then-act below is still a TOCTOU window. Taken AFTER the row lock
    -- — a single, consistent lock order, so two accepts can never deadlock.
    perform pg_advisory_xact_lock(hashtextextended(br.worker_id::text, 0));

    if exists (
      select 1 from public.booking_requests other
       where other.worker_id = br.worker_id
         and other.id <> br.id
         and other.status = 'accepted'
         and other.start_date is not null
         and daterange(other.start_date, coalesce(other.expected_end_date, other.start_date), '[]')
             && daterange(br.start_date, coalesce(br.expected_end_date, br.start_date), '[]')
    ) then
      raise exception 'Conflicting accepted booking for these dates'
        using errcode = '23P01';
    end if;
  end if;

  -- L1: the status guard makes the write itself conditional. Combined with the
  -- row lock this is belt-and-braces, but it also means any future caller that
  -- reaches this UPDATE without the lock still cannot double-apply.
  update public.booking_requests
     set status = p_decision, updated_at = now()
   where id = br.id
     and status = 'proposed';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    -- Unreachable while the row lock is held; kept as a fail-closed assertion
    -- so a silent no-op can never be reported as a successful response.
    raise exception 'Booking is no longer open' using errcode = '22023';
  end if;

  insert into public.booking_request_events
      (booking_request_id, actor_id, event_type, from_status, to_status,
       reason_kind, reason_note)
    values (br.id, uid, p_decision, 'proposed', p_decision,
            case when p_decision = 'declined' then v_kind end,
            case when p_decision = 'declined' then v_note end);

  -- Engagement: SAME transaction as the accept — unchanged from the applied
  -- v3 body. Everything is derived from the booking's canonical origin chain
  -- server-side (booking.request_id → customer_requests.profile_id →
  -- companies); an ambiguous owner is an honest non-mint, never a guess.
  if p_decision = 'accepted' then
    select cr.profile_id into v_demand_owner
      from public.customer_requests cr
     where cr.id = br.request_id;

    select count(*) into v_company_count
      from public.companies c
     where c.profile_id = v_demand_owner;

    if v_demand_owner is null
       or v_demand_owner is distinct from br.owner_id
       or v_company_count = 0 then
      v_engagement := 'no_company';
    elsif v_company_count > 1 then
      v_engagement := 'ambiguous_company';
    else
      select c.id into v_company
        from public.companies c
       where c.profile_id = v_demand_owner;
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

  return jsonb_build_object('decision', p_decision, 'engagement', v_engagement);
end;
$$;
revoke all on function public.respond_booking_request_v3(uuid, text, text, text) from public;
revoke all on function public.respond_booking_request_v3(uuid, text, text, text) from anon;
grant execute on function public.respond_booking_request_v3(uuid, text, text, text) to authenticated;

-- ── v2 → thin delegator onto the canonical path ────────────────────────────
-- Signature and `text` return type preserved; the race-prone body is GONE.
create or replace function public.respond_booking_request_v2(
  p_booking_id  uuid,
  p_decision    text,
  p_reason_kind text,
  p_reason_note text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.respond_booking_request_v3(
    p_booking_id, p_decision, p_reason_kind, p_reason_note);
  return v_result ->> 'decision';
end;
$$;
revoke all on function public.respond_booking_request_v2(uuid, text, text, text) from public;
revoke all on function public.respond_booking_request_v2(uuid, text, text, text) from anon;
grant execute on function public.respond_booking_request_v2(uuid, text, text, text) to authenticated;

-- ── v1 → thin delegator onto the canonical path ────────────────────────────
-- v1 has no reason parameters, so it passes empty reasons through. Its
-- original two-argument signature and `text` return type are preserved so
-- every existing caller keeps working unchanged.
create or replace function public.respond_booking_request(
  p_booking_id uuid,
  p_decision   text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public.respond_booking_request_v3(p_booking_id, p_decision, null, null);
  return v_result ->> 'decision';
end;
$$;
revoke all on function public.respond_booking_request(uuid, text) from public;
revoke all on function public.respond_booking_request(uuid, text) from anon;
grant execute on function public.respond_booking_request(uuid, text) to authenticated;

commit;

-- ROLLBACK: see
-- supabase/rollbacks/20260802150000_booking_atomic_double_booking_v1.down.sql
