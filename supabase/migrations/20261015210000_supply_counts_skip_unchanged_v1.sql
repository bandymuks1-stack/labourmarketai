-- 20261015210000 — the 10-minute supply-count refresh skips when nothing changed
--
-- WHY (production, 2026-10-15): cron job `public-vacancy-supply-counts-10min`
-- runs refresh_public_vacancy_supply_counts_v1() every 10 minutes: a full
-- count + count(distinct employer_name) over every active ad (3-10 s, 29 s
-- once during an import burst; 144 runs/day). Supabase edge logs, 24 h,
-- signed-in requests: in the minute the job starts p95 719 ms / p99 2,029 ms /
-- 1.04 % over 2 s, versus 430 ms / 1,484 ms / 0.60 % in every other minute —
-- the scan competes with page reads on the small instance.
--
-- WHAT: the same function (same name, owner, ACL, search_path, work_mem, same
-- caller check, same aggregate) first looks up the newest last_seen_at among
-- live ads (an index walk) and returns WITHOUT recomputing when that value is
-- unchanged AND the stored counts are younger than 55 minutes. An import
-- changes last_seen_at, so counts still refresh within one cron tick after
-- every import; ads that merely EXPIRE are reflected within the hour.
--
-- Dry run (production, rolled back): unchanged → skipped (0.2 ms warm);
-- after a simulated import touch → recomputed (822 ms); again → skipped.
--
-- @human-gate-approved  (acknowledgement only: PR is DRAFT + needs-human-gate; prod apply waits for the owner)
--
-- UNDO: supabase/rollbacks/20261015210000_supply_counts_skip_unchanged_v1.down.sql

create or replace function public.refresh_public_vacancy_supply_counts_v1()
returns void
language plpgsql
security definer
set search_path to 'public'
set work_mem to '64MB'
as $$
declare
  v_latest timestamptz;
  v_prev_latest timestamptz;
  v_prev_computed timestamptz;
begin
  -- Only the scheduler (postgres) or the service role may trigger the aggregate.
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select c.last_refreshed_at, c.computed_at
    into v_prev_latest, v_prev_computed
    from public.public_vacancy_supply_counts c
   where c.singleton;

  select v.last_seen_at
    into v_latest
    from public.public_vacancies v
   where v.is_active
     and (v.expires_at is null or v.expires_at > now())
   order by v.last_seen_at desc nulls last
   limit 1;

  -- Nothing imported since the stored counts, and they are under an hour old:
  -- the full scan would only reproduce them.
  if v_prev_computed is not null
     and v_prev_computed > now() - interval '55 minutes'
     and v_latest is not distinct from v_prev_latest then
    return;
  end if;

  insert into public.public_vacancy_supply_counts
    (singleton, active_vacancies, distinct_employers, last_refreshed_at, computed_at)
  select true,
         count(*)::bigint,
         count(distinct v.employer_name)::bigint,
         max(v.last_seen_at),
         now()
    from public.public_vacancies v
   where v.is_active
     and (v.expires_at is null or v.expires_at > now())
  on conflict (singleton) do update
     set active_vacancies   = excluded.active_vacancies,
         distinct_employers = excluded.distinct_employers,
         last_refreshed_at  = excluded.last_refreshed_at,
         computed_at        = excluded.computed_at;
end;
$$;
