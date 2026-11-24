-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260711310000 — worker_saved_opportunities v1 (marketplace precision
-- programme, decision pack MP-5; gap map
-- docs/launch/marketplace-precision-booking-gap-map-v1.md §7/§9).
--
-- PROBLEM (audit-verified): the company side can shortlist workers
-- (demand_shortlist) but a worker has NO way to save an opportunity and
-- return to it — the only persistence-free stand-ins are URL filters and
-- device-local state, which do not survive devices.
--
-- SOLUTION (smallest honest slice): ONE worker-owned save-marker table +
-- TWO gated write RPCs. This mirrors demand_shortlist's shape on the worker
-- side WITHOUT duplicating demand truth — a row stores ONLY (worker,
-- request id, saved_at, optional note): no copied titles, salaries or
-- company names (the board re-reads live truth through the gated worker RPC,
-- so a stale save can never show stale facts; a save whose demand closed
-- simply no longer matches a board row and renders as "no longer open").
--
--   RLS: SELECT/no-write for the saving worker only (owner-scoped;
--   admins via is_admin()). The demand owner NEVER sees who saved —
--   saving is a private worker bookmark, not an interest signal
--   (interest stays demand_interest_signals, consent-gated).
--   Writes RPC-only: save_worker_opportunity_v1 / unsave_worker_opportunity_v1.
--   ABUSE BOUNDS: unique (worker_id, request_id); cap 200 saves/worker;
--   note <= 500; no free text beyond the private note.
--
-- COMPATIBILITY / BACKFILL: none — new table.
-- ROLLBACK: paired 20260711310000_worker_saved_opportunities_v1.down.sql.
--
-- POST-APPLY VERIFICATION:
--   As a worker: select save_worker_opportunity_v1('<request uuid>', null);
--   select * from worker_saved_opportunities;         -- 1 own row
--   As the demand owner: select * from worker_saved_opportunities; -- 0 rows
--   As the worker: select unsave_worker_opportunity_v1('<request uuid>');
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (new table + SECURITY DEFINER
-- functions + grants = RED-class; annotation downgrades the CI finding only —
-- the OWNER still applies manually).
-- ============================================================================

begin;

create table if not exists public.worker_saved_opportunities (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references public.workers(id) on delete cascade,
  request_id uuid not null references public.customer_requests(id) on delete cascade,
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (worker_id, request_id)
);

create index if not exists worker_saved_opportunities_worker_idx
  on public.worker_saved_opportunities (worker_id, created_at desc);

alter table public.worker_saved_opportunities enable row level security;

-- Private bookmark: ONLY the saving worker (and admin) can see it. The demand
-- owner never learns who saved — that would turn a private bookmark into an
-- unconsented signal.
drop policy if exists worker_saved_opportunities_select on public.worker_saved_opportunities;
create policy worker_saved_opportunities_select
  on public.worker_saved_opportunities for select
  using (
    exists (select 1 from public.workers w
             where w.id = worker_id and w.profile_id = auth.uid())
    or public.is_admin()
  );

-- No insert/update/delete policies — writes are RPC-only.

create or replace function public.save_worker_opportunity_v1(
  p_request_id uuid,
  p_note       text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  w_id uuid;
  row_id uuid;
  open_saves integer;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Note too long' using errcode = '22023';
  end if;

  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  -- The saved demand must be one the worker could actually see on the board:
  -- an existing, submitted-or-later, non-closed request. (No details are
  -- copied — this only prevents saving arbitrary/private uuids.)
  if not exists (
    select 1 from public.customer_requests cr
     where cr.id = p_request_id
       and cr.status not in ('draft','closed')
  ) then
    raise exception 'Opportunity not open' using errcode = 'P0002';
  end if;

  select count(*) into open_saves
    from public.worker_saved_opportunities
   where worker_id = w_id;
  if open_saves >= 200 then
    raise exception 'Save limit reached' using errcode = '22023';
  end if;

  insert into public.worker_saved_opportunities as wso (worker_id, request_id, note)
  values (w_id, p_request_id, v_note)
  on conflict (worker_id, request_id)
  do update set note = excluded.note
  returning wso.id into row_id;

  return row_id;
end;
$$;

create or replace function public.unsave_worker_opportunity_v1(
  p_request_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  w_id uuid;
  removed integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  delete from public.worker_saved_opportunities
   where worker_id = w_id and request_id = p_request_id;
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

grant select on public.worker_saved_opportunities to authenticated;
revoke insert, update, delete on public.worker_saved_opportunities from authenticated;

revoke all on function public.save_worker_opportunity_v1(uuid, text) from public;
grant execute on function public.save_worker_opportunity_v1(uuid, text) to authenticated;
revoke all on function public.unsave_worker_opportunity_v1(uuid) from public;
grant execute on function public.unsave_worker_opportunity_v1(uuid) to authenticated;

commit;
