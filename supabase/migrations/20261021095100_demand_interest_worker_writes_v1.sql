-- ============================================================================
-- demand_interest_worker_writes_v1 — a worker writes only their OWN act on
-- their OWN interest row (owner-approved fix programme 2026-10-21, item
-- "interest: worker RLS too broad").
--
-- RED by rule: a policy is dropped and three are created (j), a trigger is
-- created (o) and function privileges are revoked (h). Draft PR +
-- needs-human-gate; apply only via Supabase MCP apply_migration after the
-- owner approves this exact SQL. Never `db push`.
--
-- DEFECT. `demand_interest_signals_worker_all` (20260704230000) is FOR ALL
-- and checks only worker_id, on a table granted select/insert/update to
-- authenticated. Through the raw API a worker could therefore
--   * set their own row to 'reviewed' / 'contacted' — forging the company's
--     acknowledgement (the company's answer is ONLY ever written by the
--     SECURITY DEFINER acknowledge_demand_interest);
--   * reset a reviewed / contacted row back to 'interested' (the 2026-10-20
--     audit fixed that in the app only);
--   * insert a signal on ANY request_id — a draft, a closed need, an
--     unverified company — or move an existing row to another need, around
--     the board's visibility gate (list_open_demand_for_workers) that the app
--     re-runs before every express.
--
-- CHANGE (the narrowest one that keeps every current writer working):
--   1. FOR ALL is split:
--        SELECT — own rows (unchanged meaning);
--        INSERT — own worker, status 'interested', and the target is either a
--                 need the board shows this worker RIGHT NOW (the SAME
--                 list_open_demand_for_workers() the app's gate calls — no
--                 parallel visibility rule) or a public vacancy (whose
--                 liveness the vacancy flow and create_commercial_handoff_v1
--                 already re-check);
--        UPDATE — own rows, own worker after the write.
--      No DELETE policy: the table never granted DELETE, so the FOR ALL
--      policy's delete arm was unreachable; nothing is lost.
--   2. A BEFORE UPDATE trigger for END-USER roles only (current_user
--      authenticated / anon — the same boundary as the hours guard): the
--      target (worker_id, request_id, public_vacancy_id) and id / created_at
--      are immutable; the worker may change status only to 'withdrawn' (from
--      anything) or back to 'interested' from 'withdrawn' — and re-opening a
--      platform need re-checks the board. 'reviewed' / 'contacted' are never
--      worker-writable, and a standing reviewed / contacted row stays so.
--      Column privileges cannot do this: the PostgREST upsert the app uses
--      writes request_id / worker_id in its ON CONFLICT DO UPDATE SET list,
--      so an UPDATE-column revoke would break the legitimate re-express.
--
-- UNCHANGED, verified against the callers on main:
--   * lib/opportunities/interest.ts expressInterestCore — new row (INSERT,
--     status interested, board need), withdrawn row re-opened (upsert →
--     withdrawn → interested, board need), standing row refreshed (UPDATE of
--     match_snapshot / note / updated_at, status untouched);
--   * withdrawInterest + vacancy-interest.ts withdraw (status → withdrawn);
--   * vacancy-interest.ts express (upsert on worker_id,public_vacancy_id);
--   * acknowledge_demand_interest, the invitation acceptance insert
--     (accept_invitation_apply_v2) and the erasure executor run as the
--     function owner, so the trigger does not apply to them and the owner's
--     table rights are untouched;
--   * the demand-owner SELECT policy (and 20261021095000's widening of it).
--
-- No table, column or data change.
--
-- ROLLBACK: supabase/rollbacks/20261021095100_demand_interest_worker_writes_v1.down.sql
--   (drops the three policies, the trigger and its function, and re-creates
--   demand_interest_signals_worker_all verbatim).
-- ============================================================================

begin;

-- ── 1. Split the FOR ALL policy ─────────────────────────────────────────────
drop policy if exists demand_interest_signals_worker_all
  on public.demand_interest_signals;

drop policy if exists demand_interest_signals_worker_select
  on public.demand_interest_signals;
create policy demand_interest_signals_worker_select
  on public.demand_interest_signals for select
  to authenticated
  using (
    worker_id in (select w.id from public.workers w where w.profile_id = auth.uid())
  );

drop policy if exists demand_interest_signals_worker_insert
  on public.demand_interest_signals;
create policy demand_interest_signals_worker_insert
  on public.demand_interest_signals for insert
  to authenticated
  with check (
    worker_id in (select w.id from public.workers w where w.profile_id = auth.uid())
    and status = 'interested'
    and (
      (demand_interest_signals.request_id is not null
       and exists (select 1 from public.list_open_demand_for_workers() b
                    where b.id = demand_interest_signals.request_id))
      or (demand_interest_signals.request_id is null
          and demand_interest_signals.public_vacancy_id is not null)
    )
  );

drop policy if exists demand_interest_signals_worker_update
  on public.demand_interest_signals;
create policy demand_interest_signals_worker_update
  on public.demand_interest_signals for update
  to authenticated
  using (
    worker_id in (select w.id from public.workers w where w.profile_id = auth.uid())
  )
  with check (
    worker_id in (select w.id from public.workers w where w.profile_id = auth.uid())
  );

-- ── 2. What an end user may change on an existing row ───────────────────────
-- INVOKER rights ON PURPOSE (the demand_org_attribution_guard / hours-guard
-- pattern): current_user must be the caller's role. Inside a SECURITY DEFINER
-- function it is the function owner, which this guard does not restrict.
create or replace function public.demand_interest_signals_worker_write_guard_v1()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.worker_id is distinct from old.worker_id
     or new.request_id is distinct from old.request_id
     or new.public_vacancy_id is distinct from old.public_vacancy_id
     or new.created_at is distinct from old.created_at then
    raise exception 'interest_target_immutable' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'withdrawn' then
      return new;                       -- the worker may always lower a hand
    end if;
    if new.status = 'interested' and old.status = 'withdrawn' then
      -- Raising it again on a platform need: the board must show it now.
      if new.request_id is not null
         and not exists (select 1 from public.list_open_demand_for_workers() b
                          where b.id = new.request_id) then
        raise exception 'interest_demand_not_visible' using errcode = '42501';
      end if;
      return new;
    end if;
    -- reviewed / contacted are the company's answer; a standing answer is
    -- not reset by the worker.
    raise exception 'interest_status_not_worker_writable' using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- A trigger function is never called by a role directly.
revoke all on function public.demand_interest_signals_worker_write_guard_v1() from public;
revoke all on function public.demand_interest_signals_worker_write_guard_v1() from anon;
revoke all on function public.demand_interest_signals_worker_write_guard_v1() from authenticated;

drop trigger if exists demand_interest_signals_worker_write_guard
  on public.demand_interest_signals;
create trigger demand_interest_signals_worker_write_guard
  before update on public.demand_interest_signals
  for each row execute function public.demand_interest_signals_worker_write_guard_v1();

commit;

-- ROLLBACK
--   supabase/rollbacks/20261021095100_demand_interest_worker_writes_v1.down.sql
