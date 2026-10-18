-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260914140000 — worker_saved_searches v1 (DEM-8, owner decision
-- "OWNER DECISIONS — APPROVED EXECUTION WAVE" 2026-09-14, E5).
--
-- THE GAP, IN THE REGISTER'S OWN WORDS: "Bookmarks exist; a recurring query
-- that notifies does not." `worker_saved_opportunities` remembers ONE
-- opportunity a worker already found. Nothing remembers the QUESTION — so a
-- worker who wants "welding work in the Netherlands, accommodation provided"
-- has to re-ask it by hand, forever, and learns about new work only by
-- happening to look on the right day.
--
-- WHY THIS NEEDS A TABLE AND EXISTING STRUCTURES CANNOT SATISFY IT. The
-- criteria live in URL search params today (`lib/opportunities/
-- discovery-filters.ts`), i.e. in a link the worker must keep. Checked
-- 2026-09-14: no relation stores a worker-owned query. `worker_saved_
-- opportunities` stores a request id, `demand_interest_signals` stores an
-- act of interest in ONE demand, `market_intelligence_insight_queries` is an
-- analytics log with no owner-facing lifecycle. None of them can hold "the
-- question, and whether to tell me when it has a new answer". This is the
-- narrow persistence the owner approved, and nothing more.
--
-- WHAT IS DELIBERATELY NOT BUILT. No second notification path and no second
-- scheduler: the alert is one more `notification_events` type, written by the
-- ONE audited service-role emitter, honouring the SAME notification
-- preferences, landing on the EXISTING opportunities board. This migration
-- therefore also widens the type constraint by the drop + re-add idiom that
-- v2..v6 established on that table.
--
-- THE CRITERIA COLUMN IS CLOSED, NOT FREE. A jsonb column is an invitation to
-- store anything; the CHECK below admits ONLY the seven discovery dimensions
-- the board actually filters on, each a short text or null. A saved search
-- can never become a place to keep notes, names or copied demand facts —
-- which also means it holds nothing that could go stale, because the board
-- re-reads live demand under the worker's own authorization every time.
--
--   RLS: SELECT own rows only (the saving worker; admins via is_admin()).
--   A saved search is private — an employer must never learn who is looking
--   for what, which would turn a private question into an unconsented signal
--   exactly as saving an opportunity would.
--   Writes RPC-only: save / delete / mark-seen.
--   ABUSE BOUNDS: 20 searches per worker, label 1..80 chars, criteria limited
--   to the seven known keys with values <= 64 chars.
--
-- COMPATIBILITY / BACKFILL: none — new table. The notification widening is a
-- strict superset: every row valid before is valid after.
-- ROLLBACK: supabase/rollbacks/20260914140000_worker_saved_searches_v1.down.sql
--
-- POST-APPLY VERIFICATION:
--   As a worker: select save_worker_search_v1('NL welding',
--     '{"profession":"welder","country":"NL"}'::jsonb, true);
--   select * from worker_saved_searches;               -- 1 own row
--   As another worker: select * from worker_saved_searches;  -- 0 rows
--   select mark_worker_search_seen_v1('<id>');         -- true
--   select delete_worker_search_v1('<id>');            -- true
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (new table + SECURITY DEFINER
-- functions + grants + a constraint swap = RED-class; the annotation
-- downgrades the CI finding only — the OWNER still applies manually).
-- ============================================================================

begin;

create table if not exists public.worker_saved_searches (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null references public.workers(id) on delete cascade,
  label         text not null,
  -- The seven discovery dimensions, and nothing else. See the CHECK below.
  criteria      jsonb not null default '{}'::jsonb,
  -- Whether the worker wants to hear about new answers. Off is a real,
  -- respected state: a saved search that never notifies is still useful.
  notify        boolean not null default true,
  -- When the worker last looked at this search's results. NULL = never; the
  -- alert path treats that as "since the search was created", never as
  -- "everything is new".
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint worker_saved_searches_label_len check (char_length(label) between 1 and 80),
  constraint worker_saved_searches_unique_label unique (worker_id, label),
  -- CLOSED KEY SET, enforced by the DATABASE so no later code path can
  -- quietly widen the column into a free-text store. Deleting the seven known
  -- keys must leave an empty object; anything else means an eighth key got in.
  --
  -- Written as key subtraction rather than the obvious `not exists (select …
  -- from jsonb_object_keys(...))`, because PostgreSQL forbids a subquery in a
  -- CHECK constraint ("cannot use subquery in check constraint") — verified
  -- against a real server while writing this, not assumed.
  constraint worker_saved_searches_criteria_keys check (
    jsonb_typeof(criteria) = 'object'
    and criteria - array[
      'profession', 'country', 'start', 'accommodation',
      'transport', 'tool', 'opportunityType'
    ] = '{}'::jsonb
  ),
  -- A hard ceiling the CHECK can express without a subquery. The per-value
  -- type and length rules need one, so they live in the write RPC below —
  -- which is the only writer, because there is no INSERT/UPDATE policy.
  constraint worker_saved_searches_criteria_size check (
    char_length(criteria::text) <= 600
  )
);

create index if not exists worker_saved_searches_worker_idx
  on public.worker_saved_searches (worker_id, created_at desc);
create index if not exists worker_saved_searches_notify_idx
  on public.worker_saved_searches (notify) where notify;

alter table public.worker_saved_searches enable row level security;

-- Private question: ONLY the saving worker (and admin) can see it. An
-- employer never learns who is looking for what.
drop policy if exists worker_saved_searches_select on public.worker_saved_searches;
create policy worker_saved_searches_select
  on public.worker_saved_searches for select
  using (
    exists (select 1 from public.workers w
             where w.id = worker_id and w.profile_id = auth.uid())
    or public.is_admin()
  );

-- No insert/update/delete policies — writes are RPC-only.

create or replace function public.save_worker_search_v1(
  p_label    text,
  p_criteria jsonb,
  p_notify   boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  w_id    uuid;
  row_id  uuid;
  saved   integer;
  v_label text := nullif(trim(coalesce(p_label, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_label is null or char_length(v_label) > 80 then
    raise exception 'Label required' using errcode = '22023';
  end if;
  if p_criteria is null or jsonb_typeof(p_criteria) <> 'object' then
    raise exception 'Criteria required' using errcode = '22023';
  end if;
  -- The per-value rules the CHECK cannot express (a CHECK may not contain a
  -- subquery). This is the ONLY writer — the table has no INSERT/UPDATE
  -- policy — so enforcing them here is enforcement, not decoration.
  if exists (
    select 1 from jsonb_each(p_criteria) e
     where jsonb_typeof(e.value) <> 'string'
        or char_length(e.value #>> '{}') > 64
  ) then
    raise exception 'Criteria values must be short strings' using errcode = '22023';
  end if;

  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  select count(*) into saved
    from public.worker_saved_searches where worker_id = w_id;
  if saved >= 20 then
    raise exception 'Saved search limit reached' using errcode = '22023';
  end if;

  -- Re-saving under the same label UPDATES it: a worker refining a question
  -- keeps one search, not a pile of near-duplicates. `last_seen_at` is reset,
  -- because the answers to a changed question have not been seen.
  insert into public.worker_saved_searches as wss (worker_id, label, criteria, notify)
  values (w_id, v_label, p_criteria, coalesce(p_notify, true))
  on conflict (worker_id, label)
  do update set criteria     = excluded.criteria,
                notify       = excluded.notify,
                last_seen_at = null,
                updated_at   = now()
  returning wss.id into row_id;

  return row_id;
end;
$$;

create or replace function public.delete_worker_search_v1(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  w_id    uuid;
  removed integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  delete from public.worker_saved_searches
   where id = p_id and worker_id = w_id;
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

-- Marks the search as looked-at. Separate from the alert emitter on purpose:
-- the ONLY thing that clears "new since you last looked" is the worker
-- actually looking.
create or replace function public.mark_worker_search_seen_v1(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  w_id    uuid;
  touched integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  update public.worker_saved_searches
     set last_seen_at = now(), updated_at = now()
   where id = p_id and worker_id = w_id;
  get diagnostics touched = row_count;
  return touched > 0;
end;
$$;

grant select on public.worker_saved_searches to authenticated;
revoke insert, update, delete on public.worker_saved_searches from authenticated;

revoke all on function public.save_worker_search_v1(text, jsonb, boolean) from public, anon;
grant execute on function public.save_worker_search_v1(text, jsonb, boolean) to authenticated;
revoke all on function public.delete_worker_search_v1(uuid) from public, anon;
grant execute on function public.delete_worker_search_v1(uuid) to authenticated;
revoke all on function public.mark_worker_search_seen_v1(uuid) from public, anon;
grant execute on function public.mark_worker_search_seen_v1(uuid) to authenticated;

-- ── notification events v7: the saved-search alert type ─────────────────────
-- The SAME table, the SAME emitter, the SAME preferences. Widening by the
-- drop + re-add idiom v2..v6 established here; a strict superset, so every
-- row valid before is valid after.
--
-- The row is a POINTER, not a payload, exactly as `weekly_digest` is: no
-- match count is persisted, because a count computed by a background writer
-- would be a claim nobody re-checked. The numbers are recomputed where the
-- href lands, under the worker's own authorization.

alter table public.notification_events
  drop constraint notification_events_type_check;

alter table public.notification_events
  add constraint notification_events_type_check check (event_type in (
    'booking_proposed',
    'booking_accepted',
    'booking_declined',
    'booking_withdrawn',
    'absence_requested',
    'absence_approved',
    'absence_rejected',
    'engagement_created',
    'engagement_ended',
    'workflow_step_pending',
    'workflow_decided',
    'workflow_delegated',
    'workflow_escalated',
    'document_ack_assigned',
    'document_ack_completed',
    'document_expiring',
    'work_task_assigned',
    'demand_interest_expressed',
    'demand_interest_reviewed',
    'weekly_digest',
    'saved_search_match'
  ));

alter table public.notification_events
  drop constraint notification_events_entity_type_check;

alter table public.notification_events
  add constraint notification_events_entity_type_check check (entity_type in (
    'booking_request',
    'worker_absence',
    'engagement',
    'workflow_instance',
    'worker_document',
    'org_document',
    'document_acknowledgement',
    'work_task',
    'demand_interest_signal',
    'demand_interest_response',
    'weekly_digest',
    'saved_search'
  ));

commit;
