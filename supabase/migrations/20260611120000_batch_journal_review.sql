-- ============================================================================
-- APPLIED to prod via Supabase MCP apply_migration after owner review
-- (2026-06-11, ledger version 20260611064423). Never `db push`. Suggested
-- repo filename per owner instruction:
--   supabase/migrations/20260611120000_batch_journal_review.sql
--
-- Batch manager confirmation with the EXCEPTIONS PYRAMID (DESIGN_SOUL §3):
-- routine flows in one honest gesture, exceptions surface BEFORE the click,
-- and the mass confirmation stays a TRUE testimony ("patvirtinau ŠITĄ
-- sąrašą") with a full audit trail.
--
-- WHAT (additive — two functions; no schema/table/RLS/grant change to any
-- table; the only grants are EXECUTE on the two new functions):
--
--   public.batch_review_exceptions(p_entry_ids uuid[])
--     -> table (entry_id uuid, exception_slug text)
--   public.review_journal_entries_batch(
--       p_entry_ids uuid[], p_decision text, p_note text,
--       p_acknowledged_exception_ids uuid[])
--     -> table (entry_id uuid, outcome text)
--
-- ALIGNMENT with the existing confirm chain (0034):
--   * The batch write DELEGATES per entry to public.review_journal_entry()
--     — ONE source of gate logic (admin/manager scope, journal_review_enabled
--     core gate, reviewer-engagement anchor, append-only evidence row,
--     per-entry audit_logs row). The batch adds NO second write path and can
--     never approve anything the single-entry RPC would refuse.
--   * Decisions are the same three: 'approved' | 'rejected' |
--     'changes_requested'; per-entry outcomes return the 0034 outcome strings
--     verbatim ('approved', 'review_not_enabled', 'not_authorized', …).
--   * Like 0034, expected states are RETURNED, not raised — only
--     not-authenticated raises.
--
-- EXCEPTIONS PYRAMID (computed from REAL rows only — nothing invented):
--   'worker_first_entries' — the entry's worker has fewer than 3 already-
--                            confirmed (approved) entries: a new person's
--                            first records deserve individual eyes.
--   'unusual_hours'        — the entry's explicit fragment_time metrics sum
--                            to more than 12 hours: unusual day, look first.
--   'new_skill'            — the entry links (journal_entry_skills) a skill
--                            the worker holds NO verified worker_skills row
--                            for: confirming it starts a new trust line.
--
-- HONESTY SAFEGUARD (server-enforced, not UI-only): the batch write
-- RECOMPUTES the exceptions and refuses ('exception_not_acknowledged') any
-- excepted entry whose id was not explicitly passed back in
-- p_acknowledged_exception_ids. The UI flow is therefore forced to surface
-- exceptions BEFORE the click; acknowledging is itself recorded in the batch
-- audit payload. The human can always review each entry individually instead
-- (DESIGN_SOUL §3: the person is always above the stream).
--
-- AUDIT: every per-entry write keeps its own 0034 audit_logs row, and the
-- batch writes ONE additional append-only audit_logs row
-- (action 'review_journal_entries_batch') carrying the generated batch id,
-- the EXACT requested list, the decision, the acknowledged-exception ids and
-- the per-entry outcomes — the testimony names the list it confirmed.
--
-- LIMITS / SAFETY: list capped at 100 (else 'batch_too_large' on every row),
-- ids de-duplicated, empty list returns nothing; SECURITY DEFINER with
-- pinned search_path; EXECUTE revoked from public, granted to authenticated.
--
-- ROLLBACK at the bottom (new objects only; fully reversible).
-- ============================================================================

begin;

-- ── batch_review_exceptions: surface the pyramid BEFORE the click ─────────
create or replace function public.batch_review_exceptions(
  p_entry_ids uuid[]
) returns table (entry_id uuid, exception_slug text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_entry_ids is null or array_length(p_entry_ids, 1) is null then
    return;
  end if;

  return query
  -- Only entries the caller may actually review right now (the gated 0034
  -- pending set) are inspected — exceptions never leak other entries' data.
  with reviewable as (
    select r.id
    from public.reviewable_journal_entry_ids() as r(id)
    where r.id = any (p_entry_ids)
  ),
  entries as (
    select je.id, je.worker_id
    from public.journal_entries je
    join reviewable rv on rv.id = je.id
  )
  -- New person: fewer than 3 already-approved entries on record.
  select e.id, 'worker_first_entries'::text
  from entries e
  where (
    select count(*)
    from public.journal_entries je2
    join public.journal_entry_confirmations c on c.entry_id = je2.id
    where je2.worker_id = e.worker_id
      and (c.confirmation_scope ->> 'decision' = 'approved'
           or c.confirmation_scope ->> 'action' = 'confirm')
  ) < 3
  union all
  -- Unusual day: explicit recorded time above 12 hours.
  select e.id, 'unusual_hours'::text
  from entries e
  where (
    select coalesce(sum(
             case m.unit_slug
               when 'hours'   then m.value_numeric
               when 'minutes' then m.value_numeric / 60.0
               else 0
             end), 0)
    from public.journal_entry_metrics m
    where m.entry_id = e.id
      and m.metric_slug = 'fragment_time'
      and m.value_numeric is not null
  ) > 12
  union all
  -- New trust line: the entry links a skill with no verified row yet.
  select distinct e.id, 'new_skill'::text
  from entries e
  join public.journal_entry_skills jes on jes.journal_entry_id = e.id
  where not exists (
    select 1
    from public.worker_skills ws
    where ws.worker_id = e.worker_id
      and ws.skill_id = jes.skill_id
      and ws.verified is true
  );
end $$;

revoke all on function
  public.batch_review_exceptions(uuid[]) from public;
grant execute on function
  public.batch_review_exceptions(uuid[]) to authenticated;

-- ── review_journal_entries_batch: one honest gesture, full trail ──────────
create or replace function public.review_journal_entries_batch(
  p_entry_ids                  uuid[],
  p_decision                   text,
  p_note                       text default null,
  p_acknowledged_exception_ids uuid[] default '{}'::uuid[]
) returns table (entry_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_ids      uuid[];
  v_batch_id uuid := gen_random_uuid();
  v_excepted uuid[];
  v_id       uuid;
  v_outcome  text;
  v_results  jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- De-duplicate, drop NULLs; empty in → empty out.
  select coalesce(array_agg(distinct x), '{}'::uuid[])
    into v_ids
  from unnest(coalesce(p_entry_ids, '{}'::uuid[])) as x
  where x is not null;
  if array_length(v_ids, 1) is null then
    return;
  end if;

  if p_decision not in ('approved','rejected','changes_requested') then
    return query select unnest(v_ids), 'invalid_decision'::text;
    return;
  end if;

  if array_length(v_ids, 1) > 100 then
    return query select unnest(v_ids), 'batch_too_large'::text;
    return;
  end if;

  -- Server-side pyramid: recompute the exceptions for THIS list.
  select coalesce(array_agg(distinct e.entry_id), '{}'::uuid[])
    into v_excepted
  from public.batch_review_exceptions(v_ids) e;

  foreach v_id in array v_ids loop
    if v_id = any (v_excepted)
       and not (v_id = any (coalesce(p_acknowledged_exception_ids,
                                     '{}'::uuid[]))) then
      -- Surfaced-before-the-click rule, enforced at the write: an excepted
      -- entry is NEVER swept through silently.
      v_outcome := 'exception_not_acknowledged';
    else
      -- The single source of review truth (0034): same gates, same
      -- append-only evidence row, same per-entry audit row.
      v_outcome := public.review_journal_entry(v_id, p_decision, p_note);
    end if;
    v_results := v_results || jsonb_build_object(
      'entry_id', v_id, 'outcome', v_outcome);
    entry_id := v_id;
    outcome  := v_outcome;
    return next;
  end loop;

  -- The batch testimony: ONE append-only record naming the exact list.
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'review_journal_entries_batch', 'journal_entry_review_batch',
          v_batch_id,
          jsonb_build_object(
            'decision', p_decision,
            'requested_entry_ids', to_jsonb(v_ids),
            'acknowledged_exception_ids',
              to_jsonb(coalesce(p_acknowledged_exception_ids, '{}'::uuid[])),
            'exception_entry_ids', to_jsonb(v_excepted),
            'results', v_results,
            'note', nullif(btrim(coalesce(p_note, '')), '')));

  return;
end $$;

revoke all on function
  public.review_journal_entries_batch(uuid[], text, text, uuid[]) from public;
grant execute on function
  public.review_journal_entries_batch(uuid[], text, text, uuid[]) to authenticated;

commit;

-- ROLLBACK (reverse SQL — new objects only; reversible):
-- drop function if exists public.review_journal_entries_batch(uuid[], text, text, uuid[]);
-- drop function if exists public.batch_review_exceptions(uuid[]);
