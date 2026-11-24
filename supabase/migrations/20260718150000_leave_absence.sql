-- @human-gate-approved
-- Wagon 7 — Workforce Operations (slice: Leave & Absence).
--
-- Additive, default-closed. New `worker_absences` on the canonical worker spine.
-- No leave/absence model exists today (confirmed: the audit found none). A
-- worker REQUESTS an absence; only a real manager of that worker (canonical
-- caller_manages_worker) approves/rejects — approval is a genuine manager act,
-- never faked or auto-approved (doctrine §7). Worker self-review is impossible:
-- caller_manages_worker is false for the worker themselves.
--
-- RED class (SECURITY DEFINER RPCs + GRANTs). Applied under the owner's explicit
-- standing authorization for this train, via Supabase MCP after validation.
-- Rollback: supabase/rollbacks/20260718150000_workforce_leave_absence.down.sql

create table if not exists public.worker_absences (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  absence_type text not null
    check (absence_type in ('annual_leave','sickness','unpaid','training','other')),
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  note text,
  status text not null default 'requested'
    check (status in ('requested','approved','rejected','cancelled')),
  requested_by uuid not null references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worker_absences_dates check (end_date >= start_date),
  constraint worker_absences_note_len check (note is null or char_length(note) <= 500)
);

create index if not exists worker_absences_worker_idx
  on public.worker_absences (worker_id, start_date);

alter table public.worker_absences enable row level security;

-- Default-closed SELECT: the worker themselves, or a real manager of that
-- worker, or admin. Writes are RPC-only (no direct write policy → default-deny).
drop policy if exists worker_absences_select on public.worker_absences;
create policy worker_absences_select on public.worker_absences
  for select
  using (
    exists (select 1 from public.workers w where w.id = worker_absences.worker_id and w.profile_id = auth.uid())
    or public.caller_manages_worker(worker_id)
    or public.is_admin()
  );

grant select on public.worker_absences to authenticated;

-- ── Worker requests an absence (own worker only) ────────────────────────────
create or replace function public.request_worker_absence_v1(
  p_worker_id uuid,
  p_absence_type text,
  p_start_date date,
  p_end_date date,
  p_half_day boolean default false,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.workers w where w.id = p_worker_id and w.profile_id = auth.uid()) then
    raise exception 'not authorized: you can only request absence for your own worker profile';
  end if;
  if p_absence_type not in ('annual_leave','sickness','unpaid','training','other') then
    raise exception 'invalid absence_type';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid dates';
  end if;
  insert into public.worker_absences
    (worker_id, absence_type, start_date, end_date, half_day, note, status, requested_by)
  values
    (p_worker_id, p_absence_type, p_start_date, p_end_date, coalesce(p_half_day, false),
     nullif(left(coalesce(p_note, ''), 500), ''), 'requested', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ── Manager approves / rejects (real manager of the worker only) ────────────
create or replace function public.review_worker_absence_v1(
  p_absence_id uuid,
  p_decision text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker uuid;
  v_status text;
begin
  select worker_id, status into v_worker, v_status from public.worker_absences where id = p_absence_id;
  if v_worker is null then
    raise exception 'absence not found';
  end if;
  if not public.caller_manages_worker(v_worker) then
    raise exception 'not authorized to review this absence';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'invalid decision';
  end if;
  if v_status <> 'requested' then
    raise exception 'only a requested absence can be reviewed';
  end if;
  update public.worker_absences
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_absence_id;
end;
$$;

-- ── Worker cancels their own request (before or after approval) ─────────────
create or replace function public.cancel_worker_absence_v1(p_absence_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker uuid;
  v_status text;
begin
  select worker_id, status into v_worker, v_status from public.worker_absences where id = p_absence_id;
  if v_worker is null then
    return;
  end if;
  if not exists (select 1 from public.workers w where w.id = v_worker and w.profile_id = auth.uid()) then
    raise exception 'not authorized to cancel this absence';
  end if;
  if v_status not in ('requested','approved') then
    raise exception 'only a requested or approved absence can be cancelled';
  end if;
  update public.worker_absences set status = 'cancelled', updated_at = now() where id = p_absence_id;
end;
$$;

grant execute on function public.request_worker_absence_v1(uuid, text, date, date, boolean, text) to authenticated;
grant execute on function public.review_worker_absence_v1(uuid, text) to authenticated;
grant execute on function public.cancel_worker_absence_v1(uuid) to authenticated;

-- ROLLBACK: see supabase/rollbacks/20260718150000_workforce_leave_absence.down.sql
