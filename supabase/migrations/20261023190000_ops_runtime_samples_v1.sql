-- @human-gate-approved
--
-- ── HUMAN GATE ─────────────────────────────────────────────────────────────
-- SAFETY CLASS: RED because of the GRANT/REVOKE lines (a privilege surface
-- change, doctrine-guard §4). Owner approved applying this migration and
-- merging #2719 in chat on 2026-10-23. Apply ONLY via Supabase MCP
-- `apply_migration` (before the code deploys), never `supabase db push`.
--
-- 20261023190000 — ops_runtime_samples v1: in-process runtime evidence for the
-- P0 origin stalls of 2026-10-23 (Cloudflare 522 / ~20 s no first byte while
-- Supabase was healthy and the container never restarted).
--
-- WHAT: ONE new table. Written by the server process's runtime sampler
-- (apps/web/lib/ops/runtime-sampler*.ts, started from instrumentation.ts):
-- 4 rows per minute per process (~5,760 rows/day, ~80k rows at the 14-day
-- horizon). Read later with SQL to tell apart (a) host frozen / starved,
-- (b) Node blocked or cgroup-throttled, (c) network path while Node was idle.
--
-- WHY NO EXISTING TABLE FITS (doctrine §2 canonical check): the only ops
-- surfaces are computed-on-read (`ops_product_metrics_v1()` stores nothing)
-- and job telemetry (`ai_runs_retention_sweeps`, one row per sweep). Nothing
-- persists time-series process samples, and none of them may grow at this
-- rate under their own retention rules.
--
-- PRIVACY: numbers only. No user id, IP, path, URL, header or env value. The
-- only text columns are a random per-process hex id and the build sha, both
-- CHECK-constrained to lowercase hex so no free string can land here.
--
-- ACCESS: RLS enabled with NO policies; every role's inherited privilege is
-- revoked; service_role alone gets INSERT (the sampler), SELECT (readback and
-- the retention batch lookup) and DELETE (14-day retention, in batches of
-- 500 from the flush). anon / authenticated / public hold nothing.
--
-- ADDITIVE; NO DATA LOSS; touches no other table, policy or function.
--
-- ROLLBACK: supabase/rollbacks/20261023190000_ops_runtime_samples_v1.down.sql
--   drop table if exists public.ops_runtime_samples;
-- (evidence only; nothing references it; the sampler drops failed inserts.)

create table if not exists public.ops_runtime_samples (
  id                        bigint generated always as identity primary key,
  sampled_at                timestamptz not null,
  inserted_at               timestamptz not null default now(),
  process_id                text not null check (process_id ~ '^[0-9a-f]{8,32}$'),
  build_sha                 text check (build_sha is null or build_sha ~ '^[0-9a-f]{7,40}$'),
  uptime_s                  integer,
  -- Monotonic / wall gap since the previous sample (expected ~15000).
  interval_ms               integer,
  wall_interval_ms          integer,
  -- perf_hooks.monitorEventLoopDelay over the window, reset per sample;
  -- delay BEYOND the 20 ms sampling timer (an idle loop reads ~0).
  eld_p50_ms                real,
  eld_p99_ms                real,
  eld_max_ms                real,
  -- performance.eventLoopUtilization() over the window (0..1).
  elu                       real,
  -- process.cpuUsage() spent in the window.
  cpu_user_ms               integer,
  cpu_system_ms             integer,
  rss_bytes                 bigint,
  heap_used_bytes           bigint,
  external_bytes            bigint,
  -- Open TCP handles in this process (incoming keep-alive + outgoing).
  active_tcp_handles        integer,
  -- TCP connect to this process's own listener on 127.0.0.1 (no request).
  self_connect_ms           real,
  self_connect_failed       boolean,
  -- cgroup v2 (this container): cpu.stat deltas over the window.
  cg_usage_usec             bigint,
  cg_nr_periods             integer,
  cg_nr_throttled           integer,
  cg_throttled_usec         bigint,
  cg_memory_current_bytes   bigint,
  cg_memory_max_bytes       bigint,
  -- memory.events deltas over the window.
  cg_mem_events_high        integer,
  cg_mem_events_max         integer,
  cg_mem_events_oom         integer,
  cg_mem_events_oom_kill    integer,
  -- cgroup PSI avg10 (percent).
  cg_cpu_some_avg10         real,
  cg_cpu_full_avg10         real,
  cg_mem_some_avg10         real,
  cg_mem_full_avg10         real,
  cg_io_some_avg10          real,
  cg_io_full_avg10          real,
  -- HOST-WIDE (/proc inside docker without lxcfs = the whole VPS).
  host_load1                real,
  host_load5                real,
  host_runnable             integer,
  host_mem_available_bytes  bigint,
  host_swap_free_bytes      bigint,
  host_cpu_steal_pct        real,
  host_cpu_iowait_pct       real,
  host_cpu_idle_pct         real,
  host_pswpin               bigint,
  host_pswpout              bigint,
  host_pgmajfault           bigint,
  host_cpu_some_avg10       real,
  host_mem_some_avg10       real,
  host_mem_full_avg10       real,
  host_io_some_avg10        real
);

create index if not exists ops_runtime_samples_sampled_at_idx
  on public.ops_runtime_samples (sampled_at);

comment on table public.ops_runtime_samples is
  'Runtime stall evidence (P0 2026-10-23): one row per 15 s per server process, numbers only. cg_* = this container''s cgroup v2; host_* = whole VPS (/proc without lxcfs). Deltas are over the window since the previous row of the same process_id; NULL = unreadable or first sample, never zero. 14-day retention by the sampler. service_role only.';

alter table public.ops_runtime_samples enable row level security;

revoke all on table public.ops_runtime_samples from public, anon, authenticated;
revoke all on table public.ops_runtime_samples from service_role;
grant insert, select, delete on table public.ops_runtime_samples to service_role;
