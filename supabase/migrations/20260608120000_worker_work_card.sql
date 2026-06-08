-- ─────────────────────────────────────────────────────────────────────────
-- Worker "Mano darbo kortelė" (work card) — owner-writable card fields
-- Slice: work-card-state-aware-v1
--
-- WHY THIS MIGRATION IS NEEDED
--   The worker card dimensions already exist as columns on public.workers
--   (availability_status, available_from, current_location_country,
--    preferred_countries, salary_min_eur, salary_max_eur). BUT `authenticated`
--   only has GRANT SELECT on public.workers (migration 0010), and the table
--   also holds SYSTEM fields the user must never set (trust_score,
--   profile_completeness). A blanket UPDATE grant would let a user write their
--   own trust_score — unacceptable.
--
--   So writes go through a SECURITY DEFINER RPC that updates ONLY the
--   whitelisted card fields WHERE profile_id = auth.uid(). This mirrors the
--   save_company_setup pattern (20260604120000) and keeps the system fields
--   off-limits.
--
-- WHAT THIS ADDS (all additive + reversible, no RLS loosening, no drops)
--   1. workers.work_card_confirmed_at timestamptz — when the owner last
--      saved/confirmed their card. Drives the calm "Ar tai vis dar galioja?"
--      staleness prompt WITHOUT restarting onboarding.
--   2. save_worker_card(...)  — owner-scoped upsert of the whitelisted fields,
--      stamps work_card_confirmed_at = now().
--   3. confirm_worker_card()  — owner says "Taip, galioja": stamps
--      work_card_confirmed_at = now() only (no field changes).
--   4. grant execute on both RPCs to authenticated.
--
-- HONESTY / SAFETY
--   - No fake verification / score: trust_score & profile_completeness are NOT
--     writable by these RPCs.
--   - Owner-scoped: every write is WHERE profile_id = auth.uid().
--   - availability_status is validated by the existing CHECK constraint on the
--     column ('available' | 'busy' | 'unavailable').
--
-- ROLLBACK (reversible)
--   drop function if exists public.confirm_worker_card();
--   drop function if exists public.save_worker_card(text, date, text, text[], int, int);
--   alter table public.workers drop column if exists work_card_confirmed_at;
-- ─────────────────────────────────────────────────────────────────────────

alter table public.workers
  add column if not exists work_card_confirmed_at timestamptz;

-- Owner-scoped save of the whitelisted card fields. Only overwrites a field
-- when a non-null value is supplied (partial saves are fine), and always
-- stamps the confirmation time so the card is "fresh" after any edit.
create or replace function public.save_worker_card(
  p_availability_status text   default null,
  p_available_from      date   default null,
  p_location_country    text   default null,
  p_preferred_countries text[] default null,
  p_salary_min          int    default null,
  p_salary_max          int    default null
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  stamp     timestamptz := now();
  avail     text := nullif(trim(coalesce(p_availability_status, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.workers where profile_id = uid) then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  if avail is not null and avail not in ('available','busy','unavailable') then
    raise exception 'Invalid availability_status' using errcode = '22023';
  end if;

  update public.workers set
    availability_status      = coalesce(avail, availability_status),
    available_from           = coalesce(p_available_from, available_from),
    current_location_country = coalesce(nullif(trim(coalesce(p_location_country, '')), ''), current_location_country),
    preferred_countries      = coalesce(p_preferred_countries, preferred_countries),
    salary_min_eur           = coalesce(p_salary_min, salary_min_eur),
    salary_max_eur           = coalesce(p_salary_max, salary_max_eur),
    work_card_confirmed_at   = stamp,
    updated_at               = stamp
  where profile_id = uid;

  return stamp;
end;
$$;

-- Owner says "Taip, galioja" — refresh the confirmation time only. Restarts
-- nothing; just clears the staleness flag for another window.
create or replace function public.confirm_worker_card()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  stamp timestamptz := now();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.workers
     set work_card_confirmed_at = stamp,
         updated_at             = stamp
   where profile_id = uid;

  return stamp;
end;
$$;

grant execute on function public.save_worker_card(text, date, text, text[], int, int) to authenticated;
grant execute on function public.confirm_worker_card() to authenticated;
