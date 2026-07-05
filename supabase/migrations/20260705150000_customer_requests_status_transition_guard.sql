-- @human-gate-approved
-- ─────────────────────────────────────────────────────────────────────────
-- PR15 launch hardening: DB-level status-transition guard on the ONE
-- canonical demand model (§17, public.customer_requests).
--
-- WHY (audit 2026-07-05): RLS grants owners UPDATE on their own rows —
-- required by the LIVE close/reopen and draft-remove flows — but that also
-- left them free to PATCH `status` to ANY value in the CHECK list straight
-- through PostgREST, including the admin-only pipeline states
-- (in_review / needs_followup / approved). The save_customer_request RPC
-- already demotes owner self-promotion, but the direct-table path did not.
-- This trigger closes that latitude at the database, mirroring the app's
-- closed whitelist (lib/demand/demand-lifecycle-model.ts +
-- deleteDemandDraft + submit path).
--
-- Caller classes:
--   • no JWT (service_role / SQL editor / migrations): bypass — not a
--     PostgREST user surface; RLS is bypassed there anyway;
--   • admin (public.is_admin()): full pipeline latitude (unchanged);
--   • owner: ONLY draft→submitted, draft→closed, submitted→closed,
--     closed→submitted. Anything else raises check_violation.
--
-- SAFETY: plain INVOKER trigger function (NOT security definer); touches
-- nothing beyond NEW/OLD + the same is_admin() already used by this
-- table's RLS; UPDATE-only (INSERT stays RPC-pinned / admin-RLS);
-- fully reversible via the paired rollback file.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.customer_requests_status_transition_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    if auth.uid() is null or public.is_admin() then
      return new;
    end if;
    if (old.status = 'draft' and new.status in ('submitted', 'closed'))
       or (old.status = 'submitted' and new.status = 'closed')
       or (old.status = 'closed' and new.status = 'submitted') then
      return new;
    end if;
    raise exception 'invalid demand status transition: % -> %',
      old.status, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists customer_requests_status_transition_guard
  on public.customer_requests;

create trigger customer_requests_status_transition_guard
  before update of status on public.customer_requests
  for each row
  execute function public.customer_requests_status_transition_guard();
