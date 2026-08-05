-- 20260805090100 — backfill workers.display_name from profiles.full_name
--
-- SAFETY CLASS: RED. This migration UPDATEs existing rows — class (n),
-- `data-mutation`, in .github/scripts/migration-safety.mjs. It also CREATEs a
-- table and a TRIGGER-free ledger used by its own rollback.
--
-- @human-gate-approved — RED class (n) data-mutation (production DML).
-- OWNER DECISION 2 ("Apply the complete factual backfill, including the
-- guarded country/location recovery defined in the reviewed package")
-- recorded 2026-08-05 with exact wording, reviewed-file sha256 and read-only
-- production preflight counts in
-- docs/human-gates/worker-display-name-write-path-gate.md.
-- Apply via Supabase MCP `apply_migration` only, AFTER 20260805090000 is
-- confirmed live (section 1 enforces this). This marker covers THIS file's
-- findings only.
--
-- ── WHY A BACKFILL IS WANTED (the recommendation, for the owner to accept) ──
-- 20260805090000 repairs the write path from here on. It does nothing for
-- accounts that already exist, and those accounts have NO self-service repair
-- path: the worker's own profile page does not even SELECT `display_name`, and
-- no app code writes it. Whatever number of rows are affected, they stay
-- affected forever unless something backfills them.
--
-- HOW MANY ROWS — NOT ASSERTED HERE. Production counts have not been measured.
-- Section 3 prints the real BEFORE counts and section 5 the AFTER counts at
-- apply time; those NOTICEs are the authoritative numbers and should be
-- captured into the human-gate record when the owner reviews this. Do not
-- quote an affected-row figure from anywhere else.
--
-- This backfill does NOT invent or infer a name. `profiles.full_name` is
-- written by exactly one thing in the entire system — step 1 of
-- `complete_onboarding`, from the same `p_display_name` argument whose value
-- step 3 discarded in the same transaction. `handle_new_user()` does not set
-- it; no other migration sets it. So the value being copied is literally the
-- string the person typed into onboarding, recovered from the sibling column
-- that happened to keep it. That is a repair, not a guess.
--
-- ── SAFETY PROPERTIES ──────────────────────────────────────────────────────
--  * HOLE-FILLING ONLY. `coalesce(w.display_name, ...)` — a row that already
--    has a value is never overwritten. Note this is the OPPOSITE direction to
--    the write-path fix, and deliberately so: onboarding is a person stating
--    their own name (newest wins), a backfill is repairing an absence (stored
--    value always wins). The backfill can only ever turn NULL into a name.
--  * NO ROW IS CREATED OR DELETED. UPDATE only.
--  * NO-OP ROWS ARE EXCLUDED. The WHERE clause requires a real change, so a
--    profile with no `full_name` either is skipped and `updated_at` is not
--    disturbed on rows that gain nothing.
--  * FULLY REVERSIBLE. Every touched row is recorded in
--    `public.worker_display_name_backfill_20260805` with its BEFORE value, so
--    the rollback restores the exact prior state (including NULL) for exactly
--    the rows this migration changed — and nothing else.
--  * BEFORE / AFTER COUNTS are captured in the ledger and RAISEd as NOTICEs.
--
-- ── SCOPE NOTE — current_location_country ──────────────────────────────────
-- The same DO NOTHING discarded `p_country` into `current_location_country`,
-- recoverable from `profiles.country` by the identical argument. It is
-- repaired here in the same pass and recorded separately in the ledger so the
-- owner can see the two counts independently. To approve the name repair but
-- NOT the country repair, delete the `current_location_country` line from the
-- UPDATE's SET list and the corresponding line from the rollback; nothing else
-- has to change.
--
-- ROLLBACK: supabase/rollbacks/20260805090100_worker_display_name_backfill_v1.down.sql
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Guard: the write-path fix must already be applied ──────────────────
-- Backfilling while `complete_onboarding` still discards the name would repair
-- history and keep breaking every new signup. Fail loudly rather than half-fix.
do $$
declare
  fn_src text;
begin
  select pg_get_functiondef(p.oid) into fn_src
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'complete_onboarding'
   limit 1;

  if fn_src is null then
    raise exception
      'public.complete_onboarding not found — apply 20260805090000 first';
  end if;

  if fn_src !~* 'on conflict \(profile_id\) do update' then
    raise exception
      'complete_onboarding still uses ON CONFLICT DO NOTHING — apply '
      '20260805090000 (write-path fix) BEFORE this backfill';
  end if;
end $$;

-- ── 2. Reversal ledger ────────────────────────────────────────────────────
-- One row per worker row this migration changes, holding the BEFORE values.
-- Named with the migration's date so it is self-identifying in the schema and
-- can be dropped once the change is confirmed good.
create table if not exists public.worker_display_name_backfill_20260805 (
  profile_id                    uuid primary key,
  display_name_before           text,
  display_name_after            text,
  location_country_before       text,
  location_country_after        text,
  backfilled_at                 timestamptz not null default now()
);

comment on table public.worker_display_name_backfill_20260805 is
  'Reversal ledger for migration 20260805090100. One row per workers row whose '
  'display_name / current_location_country was backfilled from profiles. Read '
  'by the paired .down.sql to restore exact prior values. Safe to DROP once the '
  'backfill is confirmed good.';

-- RLS enabled with NO policy = default deny for anon and authenticated. This
-- table holds real people's names; only the service role / SECURITY DEFINER
-- context (i.e. the owner applying the rollback) needs to read it. No policy
-- is created on purpose — adding one would widen the surface for no benefit.
alter table public.worker_display_name_backfill_20260805
  enable row level security;

-- ── 3. Before counts ──────────────────────────────────────────────────────
do $$
declare
  total_workers      bigint;
  null_names         bigint;
  null_countries     bigint;
  repairable_names   bigint;
begin
  select count(*) into total_workers from public.workers;

  select count(*) into null_names
    from public.workers where display_name is null;

  select count(*) into null_countries
    from public.workers where current_location_country is null;

  select count(*) into repairable_names
    from public.workers w
    join public.profiles p on p.id = w.profile_id
   where w.display_name is null
     and nullif(trim(coalesce(p.full_name, '')), '') is not null;

  raise notice 'BEFORE: workers=%  display_name NULL=%  current_location_country NULL=%  name-repairable=%',
    total_workers, null_names, null_countries, repairable_names;
end $$;

-- ── 4. The backfill ───────────────────────────────────────────────────────
-- Deliberately TWO statements, ledger first, in this order.
--
-- The tempting one-statement form — a data-modifying CTE that UPDATEs and
-- feeds its RETURNING into the ledger — CANNOT record the BEFORE values.
-- RETURNING yields the row AFTER the update, and PostgreSQL has no OLD
-- reference in a top-level UPDATE ... RETURNING. Reconstructing "it must have
-- been NULL" from the after-value is wrong in a real case: a worker whose
-- `display_name` is already correct AND equal to `profiles.full_name`, pulled
-- into the row set only by the country condition, would be recorded as
-- before=NULL and then NULLed by the rollback — silent data loss in the
-- reversal path. So the ledger is written FIRST, from the pre-update rows,
-- and the UPDATE is driven from the ledger.
--
-- A migration runs in one transaction, so the pair is atomic: no window exists
-- in which the ledger and the table disagree.

-- 4a. Record the exact BEFORE state of every row that is about to change.
insert into public.worker_display_name_backfill_20260805 (
  profile_id,
  display_name_before,
  display_name_after,
  location_country_before,
  location_country_after
)
select
  w.profile_id,
  w.display_name,
  coalesce(w.display_name, nullif(trim(coalesce(p.full_name, '')), '')),
  w.current_location_country,
  coalesce(w.current_location_country,
           nullif(trim(coalesce(p.country, '')), ''))
from public.workers w
join public.profiles p on p.id = w.profile_id
-- Only rows that actually gain something. Without this every worker row would
-- get a fresh updated_at for no change. `is distinct from` is NULL-safe.
where coalesce(w.display_name, nullif(trim(coalesce(p.full_name, '')), ''))
        is distinct from w.display_name
   or coalesce(w.current_location_country,
               nullif(trim(coalesce(p.country, '')), ''))
        is distinct from w.current_location_country
-- Re-run safety: a second application must not overwrite the original BEFORE
-- values recorded by the first.
on conflict (profile_id) do nothing;

-- 4b. Apply exactly what the ledger says, to exactly the rows it names —
-- but a column is written ONLY while it still holds the BEFORE value the
-- ledger recorded. This is the same current-value guard the rollback file
-- applies, for the same reason: on a RE-apply the ledger holds run-1 values,
-- and a worker who edited `current_location_country` (a user-editable column)
-- between the runs must keep their edit — the stale ledger row must never
-- revert it. On the first apply every row trivially passes the guard.
update public.workers w
   set display_name =
         case when w.display_name is not distinct from l.display_name_before
              then l.display_name_after
              else w.display_name end,
       current_location_country =
         case when w.current_location_country
                     is not distinct from l.location_country_before
              then l.location_country_after
              else w.current_location_country end,
       -- public.workers has no set_updated_at trigger; set it by hand.
       updated_at = now()
  from public.worker_display_name_backfill_20260805 l
 where l.profile_id = w.profile_id
   -- Idempotent AND edit-preserving: a row is touched only when a column
   -- both still needs the ledger's AFTER value and still holds its BEFORE.
   and (   (w.display_name is distinct from l.display_name_after
            and w.display_name is not distinct from l.display_name_before)
        or (w.current_location_country is distinct from l.location_country_after
            and w.current_location_country
                  is not distinct from l.location_country_before));

-- ── 5. After counts ───────────────────────────────────────────────────────
do $$
declare
  ledger_rows        bigint;
  names_filled       bigint;
  countries_filled   bigint;
  null_names_left    bigint;
begin
  select count(*) into ledger_rows
    from public.worker_display_name_backfill_20260805;

  select count(*) into names_filled
    from public.worker_display_name_backfill_20260805
   where display_name_before is null and display_name_after is not null;

  select count(*) into countries_filled
    from public.worker_display_name_backfill_20260805
   where location_country_before is null
     and location_country_after is not null;

  select count(*) into null_names_left
    from public.workers where display_name is null;

  raise notice 'AFTER: ledger rows=%  names filled=%  countries filled=%  display_name still NULL=%',
    ledger_rows, names_filled, countries_filled, null_names_left;
  raise notice 'Rows still NULL have no profiles.full_name to recover from — '
    'that is expected and is NOT repaired by guessing.';
end $$;
