-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260819094500 — worker saved PUBLIC VACANCIES v1.
--
-- PROBLEM (production-verified 2026-08-19): the platform holds 39,743 browsable
-- imported vacancies — effectively its entire supply — and a signed-in worker
-- cannot record ANY relationship to one. `worker_saved_opportunities` exists,
-- but `request_id` is a NOT NULL FK to `customer_requests`, i.e. INTERNAL demand
-- only (17 rows, 11 submitted). So the funnel opened by #1190/#1193 ends at the
-- unlocked card: the worker clicks out to the publisher's site and the platform
-- retains nothing. No return path, no accumulated interest, no matching signal.
--
-- WHY EXTEND RATHER THAN ADD A TABLE (doctrine §2, canonical check): "worker
-- saved an opportunity" is ONE concept with two sources. A second table would be
-- the parallel structure the doctrine forbids — two save-lists that drift, two
-- caps, two RLS surfaces, and a board that has to union them forever. The column
-- goes on the canonical table.
--
-- WHY THIS IS DOCTRINE-SAFE FOR AN UNCLAIMED EXTERNAL AD. `opportunityCapabilities`
-- (lib/vacancy-sources/vacancy-presentation.ts) refuses canApplyInternally,
-- canShortlistForEmployer, canBookThroughPlatform and canMessageEmployerInbox
-- while an ad is unclaimed — every one of those reaches the EMPLOYER, who never
-- agreed to them. A private bookmark reaches nobody. The v1 migration states the
-- same rule from the other side: "the demand owner NEVER sees who saved — saving
-- is a private worker bookmark, not an interest signal". Nothing here changes
-- that: no new visibility, no employer-facing capability, no notification.
--
-- ── WHY THIS IS RED ────────────────────────────────────────────────────────
--
--   * `alter column request_id drop not null` — dropping a NOT NULL is on the
--     RED list in AGENTS.md / the doctrine, without exception;
--   * two new SECURITY DEFINER functions + grants.
--
-- The DROP NOT NULL is genuinely widening: every existing row keeps a non-null
-- request_id and stays valid under the new CHECK. But RED is not argued down —
-- uncertainty moves only in the cautious direction, so this ships UNAPPLIED.
--
-- COMPATIBILITY / BACKFILL: none. Existing rows satisfy
-- `num_nonnulls(request_id, public_vacancy_id) = 1` unchanged.
--
-- ROLLBACK: paired supabase/rollbacks/20260819094500_worker_saved_public_vacancies_v1.down.sql
--
-- POST-APPLY VERIFICATION (run as a worker, then as another worker):
--   select public.save_worker_public_vacancy_v1('<vacancy uuid>', null);
--   select count(*) from public.worker_saved_opportunities
--    where public_vacancy_id is not null;              -- 1, own row only
--   -- as a DIFFERENT worker: the same select returns 0.
--   select public.save_worker_public_vacancy_v1('<expired vacancy uuid>', null);
--                                                      -- raises P0002
--   select public.unsave_worker_public_vacancy_v1('<vacancy uuid>');  -- true
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (DROP NOT NULL + SECURITY DEFINER +
-- grants = RED-class; the annotation downgrades the CI finding only — the OWNER
-- still applies manually).
-- ============================================================================

begin;

-- ── 1. The second source ────────────────────────────────────────────────────
alter table public.worker_saved_opportunities
  add column if not exists public_vacancy_id uuid
    references public.public_vacancies(id) on delete cascade;

-- ── 2. Exactly one source per row ───────────────────────────────────────────
-- request_id becomes nullable so a row can point at a public vacancy instead.
-- The CHECK is what keeps the table honest: never both, never neither.
alter table public.worker_saved_opportunities
  alter column request_id drop not null;

alter table public.worker_saved_opportunities
  drop constraint if exists worker_saved_opportunities_exactly_one_source;
alter table public.worker_saved_opportunities
  add constraint worker_saved_opportunities_exactly_one_source
  check (num_nonnulls(request_id, public_vacancy_id) = 1);

-- ── 3. Uniqueness for the new source ────────────────────────────────────────
-- The existing `unique (worker_id, request_id)` no longer constrains vacancy
-- rows, because SQL treats NULLs as distinct — without this a worker could save
-- the same vacancy unboundedly. PARTIAL so it ignores demand rows entirely.
create unique index if not exists worker_saved_opportunities_worker_vacancy_key
  on public.worker_saved_opportunities (worker_id, public_vacancy_id)
  where public_vacancy_id is not null;

create index if not exists worker_saved_opportunities_vacancy_idx
  on public.worker_saved_opportunities (public_vacancy_id)
  where public_vacancy_id is not null;

-- ── 4. RLS: UNCHANGED, deliberately ─────────────────────────────────────────
-- `worker_saved_opportunities_select` is already scoped to the saving worker
-- (or is_admin()), and it filters on worker_id, so it covers the new rows with
-- no edit. Writes stay RPC-only — there are still no insert/update/delete
-- policies. Restating the policy here would risk widening it by accident.

-- ── 5. Write path ───────────────────────────────────────────────────────────
create or replace function public.save_worker_public_vacancy_v1(
  p_vacancy_id uuid,
  p_note       text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  w_id   uuid;
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

  -- The vacancy must be one the worker could actually reach: the BROWSABLE
  -- predicate the public job board itself uses (count_public_vacancies_v1 and
  -- siblings), NOT `lifecycle = 'published'`. PR #1196 established that those
  -- two disagree by thousands of expired ads; saving on the looser one would
  -- let a worker bookmark something the board refuses to show them.
  if not exists (
    select 1 from public.public_vacancies pv
     where pv.id = p_vacancy_id
       and pv.is_active
       and (pv.expires_at is null or pv.expires_at > now())
  ) then
    raise exception 'Vacancy not open' using errcode = 'P0002';
  end if;

  -- ONE cap across both sources — the limit is on the worker's list, not on
  -- either half of it.
  select count(*) into open_saves
    from public.worker_saved_opportunities
   where worker_id = w_id;
  if open_saves >= 200 then
    raise exception 'Save limit reached' using errcode = '22023';
  end if;

  insert into public.worker_saved_opportunities as wso
    (worker_id, public_vacancy_id, note)
  values (w_id, p_vacancy_id, v_note)
  on conflict (worker_id, public_vacancy_id) where public_vacancy_id is not null
  do update set note = excluded.note
  returning wso.id into row_id;

  return row_id;
end;
$$;

create or replace function public.unsave_worker_public_vacancy_v1(
  p_vacancy_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  w_id uuid;
  hit  integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  delete from public.worker_saved_opportunities
   where worker_id = w_id and public_vacancy_id = p_vacancy_id;
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

-- Narrow grants: the two new RPCs only. No table-level write grant is added —
-- writes remain RPC-only, which is what keeps the private-bookmark rule
-- enforceable rather than merely documented.
--
-- `anon` is revoked EXPLICITLY, not just via PUBLIC. Revoking from PUBLIC does
-- not remove a privilege a role holds in its own right, so a definer function
-- can still be reachable anonymously after a `from public` revoke alone. These
-- functions read auth.uid() and would raise 42501 for an anonymous caller
-- anyway, but "it would fail inside" is not the same as "it cannot be called" —
-- guard: secdef-local-reset-reproducibility.
revoke all on function public.save_worker_public_vacancy_v1(uuid, text) from public;
revoke all on function public.save_worker_public_vacancy_v1(uuid, text) from anon;
revoke all on function public.unsave_worker_public_vacancy_v1(uuid) from public;
revoke all on function public.unsave_worker_public_vacancy_v1(uuid) from anon;
grant execute on function public.save_worker_public_vacancy_v1(uuid, text) to authenticated;
grant execute on function public.unsave_worker_public_vacancy_v1(uuid) to authenticated;

commit;
