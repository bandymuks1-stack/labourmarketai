/**
 * RUNTIME STALL SAMPLER — pure core (P0 origin stalls, 2026-10-23).
 *
 * WHY THIS EXISTS. Production had origin stalls (Cloudflare 522 / ~20 s with
 * no first byte) while Supabase was healthy, the container never restarted and
 * the in-container healthcheck kept passing. Host metrics are behind an
 * owner-only shell. This records, from INSIDE the server process, the numbers
 * that tell three causes apart:
 *
 *   (a) the whole host is frozen or starved — long tick gaps WITH ~zero process
 *       CPU in the gap, host CPU steal / iowait, host swap-in / major faults,
 *       memory PSI, falling MemAvailable;
 *   (b) the Node process is blocked or throttled — long event-loop delay and
 *       ELU ~1 with process CPU burning (blocked), or cgroup nr_throttled /
 *       throttled_usec climbing (the `--cpus=0.5` quota), cgroup memory near
 *       memory.max, memory.events high/max/oom;
 *   (c) the network path (nginx / docker-proxy / firewall) — ticks on time,
 *       low event-loop delay, idle ELU and a fast self-connect to the listener
 *       DURING the window: Node was fine, the request never reached it.
 *
 * THIS FILE IS PURE: parsers, delta maths and the scheduler logic, all driven
 * through injected dependencies so the tests use a fake fs and a fake clock.
 * The real wiring (fs, perf_hooks, the service-role insert) lives in
 * `runtime-sampler-node.ts`, started once from `instrumentation.ts`.
 *
 * WHAT IS RECORDED: numbers only. No user id, no IP, no URL or path, no
 * header, no env value. The only two strings are a random per-process hex id
 * (so blue/green overlap is visible) and the build sha (hex). The guard
 * `lib/guards/runtime-sampler-no-identifiers.test.ts` pins this and keeps the
 * row shape equal to the migration's column list.
 *
 * HOST-WIDE vs CONTAINER. Inside docker without lxcfs, /proc/loadavg,
 * /proc/meminfo, /proc/stat, /proc/vmstat and /proc/pressure/* describe the
 * WHOLE VPS (shared with another product), not this container. Those columns
 * are prefixed `host_`. Columns prefixed `cg_` come from this container's
 * cgroup v2 files.
 */

export const SAMPLE_INTERVAL_MS = 15_000;
/** One insert per this many ticks (4 x 15 s = once per minute). */
export const TICKS_PER_FLUSH = 4;
/** Evidence kept in memory while inserts fail (10 minutes of samples). */
export const MAX_BUFFERED_SAMPLES = 40;
/** At most one console line per this window. */
export const LOG_EVERY_MS = 10 * 60_000;
/** Retention horizon, enforced by the flush in small batches. */
export const RETENTION_DAYS = 14;
/** Prune once per this many flush opportunities (15 = every 15 minutes). */
export const FLUSHES_PER_PRUNE = 15;
export const PRUNE_BATCH = 500;

export const CGROUP_ROOT = "/sys/fs/cgroup";

// ─── The row ────────────────────────────────────────────────────────────────

/** One sample = one row of `public.ops_runtime_samples`. Numbers only. */
export interface RuntimeSampleRow {
  sampled_at: string;
  process_id: string;
  build_sha: string | null;
  uptime_s: number | null;
  interval_ms: number | null;
  wall_interval_ms: number | null;
  eld_p50_ms: number | null;
  eld_p99_ms: number | null;
  eld_max_ms: number | null;
  elu: number | null;
  cpu_user_ms: number | null;
  cpu_system_ms: number | null;
  rss_bytes: number | null;
  heap_used_bytes: number | null;
  external_bytes: number | null;
  active_tcp_handles: number | null;
  self_connect_ms: number | null;
  self_connect_failed: boolean | null;
  cg_usage_usec: number | null;
  cg_nr_periods: number | null;
  cg_nr_throttled: number | null;
  cg_throttled_usec: number | null;
  cg_memory_current_bytes: number | null;
  cg_memory_max_bytes: number | null;
  cg_mem_events_high: number | null;
  cg_mem_events_max: number | null;
  cg_mem_events_oom: number | null;
  cg_mem_events_oom_kill: number | null;
  cg_cpu_some_avg10: number | null;
  cg_cpu_full_avg10: number | null;
  cg_mem_some_avg10: number | null;
  cg_mem_full_avg10: number | null;
  cg_io_some_avg10: number | null;
  cg_io_full_avg10: number | null;
  host_load1: number | null;
  host_load5: number | null;
  host_runnable: number | null;
  host_mem_available_bytes: number | null;
  host_swap_free_bytes: number | null;
  host_cpu_steal_pct: number | null;
  host_cpu_iowait_pct: number | null;
  host_cpu_idle_pct: number | null;
  host_pswpin: number | null;
  host_pswpout: number | null;
  host_pgmajfault: number | null;
  host_cpu_some_avg10: number | null;
  host_mem_some_avg10: number | null;
  host_mem_full_avg10: number | null;
  host_io_some_avg10: number | null;
}

/** The exact column set, in table order — the guard compares it to the migration. */
export const RUNTIME_SAMPLE_COLUMNS = [
  "sampled_at",
  "process_id",
  "build_sha",
  "uptime_s",
  "interval_ms",
  "wall_interval_ms",
  "eld_p50_ms",
  "eld_p99_ms",
  "eld_max_ms",
  "elu",
  "cpu_user_ms",
  "cpu_system_ms",
  "rss_bytes",
  "heap_used_bytes",
  "external_bytes",
  "active_tcp_handles",
  "self_connect_ms",
  "self_connect_failed",
  "cg_usage_usec",
  "cg_nr_periods",
  "cg_nr_throttled",
  "cg_throttled_usec",
  "cg_memory_current_bytes",
  "cg_memory_max_bytes",
  "cg_mem_events_high",
  "cg_mem_events_max",
  "cg_mem_events_oom",
  "cg_mem_events_oom_kill",
  "cg_cpu_some_avg10",
  "cg_cpu_full_avg10",
  "cg_mem_some_avg10",
  "cg_mem_full_avg10",
  "cg_io_some_avg10",
  "cg_io_full_avg10",
  "host_load1",
  "host_load5",
  "host_runnable",
  "host_mem_available_bytes",
  "host_swap_free_bytes",
  "host_cpu_steal_pct",
  "host_cpu_iowait_pct",
  "host_cpu_idle_pct",
  "host_pswpin",
  "host_pswpout",
  "host_pgmajfault",
  "host_cpu_some_avg10",
  "host_mem_some_avg10",
  "host_mem_full_avg10",
  "host_io_some_avg10",
] as const satisfies readonly (keyof RuntimeSampleRow)[];

// ─── Parsers (every one total: bad / missing input → null, never a throw) ─────

const num = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** `key value` lines (cpu.stat, memory.events, /proc/vmstat). */
export function parseKeyValueLines(text: string | null): Record<string, number> | null {
  if (text === null) return null;
  const out: Record<string, number> = {};
  for (const line of text.split("\n")) {
    const [k, v] = line.trim().split(/\s+/);
    const n = num(v);
    if (k && n !== null) out[k] = n;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** A single integer file (memory.current); `max` (memory.max unlimited) → null. */
export function parseSingleNumber(text: string | null): number | null {
  if (text === null) return null;
  const t = text.trim();
  if (t === "" || t === "max") return null;
  return num(t);
}

export interface Pressure {
  someAvg10: number | null;
  fullAvg10: number | null;
}

/** PSI: `some avg10=0.00 avg60=0.00 avg300=0.00 total=0` (+ optional `full …`). */
export function parsePressure(text: string | null): Pressure | null {
  if (text === null) return null;
  const pick = (kind: "some" | "full") => {
    const line = text.split("\n").find((l) => l.trim().startsWith(kind + " "));
    const m = line ? /avg10=([0-9.]+)/.exec(line) : null;
    return m ? num(m[1]) : null;
  };
  const p = { someAvg10: pick("some"), fullAvg10: pick("full") };
  return p.someAvg10 === null && p.fullAvg10 === null ? null : p;
}

/** /proc/loadavg: `0.52 0.58 0.59 2/1234 5678` — load1, load5, running. */
export function parseLoadavg(text: string | null): { load1: number | null; load5: number | null; runnable: number | null } | null {
  if (text === null) return null;
  const parts = text.trim().split(/\s+/);
  if (parts.length < 4) return null;
  return { load1: num(parts[0]), load5: num(parts[1]), runnable: num(parts[3]?.split("/")[0]) };
}

/** /proc/meminfo `MemAvailable:  123456 kB` → bytes. */
export function parseMeminfo(text: string | null): { memAvailableBytes: number | null; swapFreeBytes: number | null } | null {
  if (text === null) return null;
  const kb = (key: string): number | null => {
    const m = new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, "m").exec(text);
    return m ? Number(m[1]) * 1024 : null;
  };
  return { memAvailableBytes: kb("MemAvailable"), swapFreeBytes: kb("SwapFree") };
}

/** /proc/stat aggregate `cpu` line → jiffy counters. */
export interface CpuTimes {
  total: number;
  idle: number;
  iowait: number;
  steal: number;
}
export function parseProcStatCpu(text: string | null): CpuTimes | null {
  if (text === null) return null;
  const line = text.split("\n").find((l) => /^cpu\s/.test(l));
  if (!line) return null;
  const f = line.trim().split(/\s+/).slice(1).map(Number);
  if (f.length < 4 || f.some((x) => !Number.isFinite(x))) return null;
  // user nice system idle iowait irq softirq steal guest guest_nice — guest
  // time is already included in user/nice, so it is not added to the total.
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = f;
  return { total: user + nice + system + idle + iowait + irq + softirq + steal, idle, iowait, steal };
}

// ─── Delta maths ─────────────────────────────────────────────────────────────

/**
 * A monotonic counter's increase. No previous reading, a missing current one,
 * or a counter that went BACKWARDS (cgroup recreated, wrap) → null: an unknown
 * is never reported as zero.
 */
export function counterDelta(prev: number | null | undefined, cur: number | null | undefined): number | null {
  if (prev === null || prev === undefined || cur === null || cur === undefined) return null;
  if (!Number.isFinite(prev) || !Number.isFinite(cur) || cur < prev) return null;
  return cur - prev;
}

function pct(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  return round2((part / whole) * 100);
}

export function round2(n: number | null | undefined): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

const intOrNull = (n: number | null | undefined): number | null =>
  n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n);

// ─── Raw readings ────────────────────────────────────────────────────────────

/** Everything read at one tick, before any delta. */
export interface RawReading {
  monoMs: number;
  wallMs: number;
  uptimeS: number | null;
  eld: { p50Ms: number | null; p99Ms: number | null; maxMs: number | null } | null;
  /** Event-loop utilization over the window since the previous tick (0..1). */
  elu: number | null;
  /** Process CPU since the previous tick, µs. */
  cpuUserUs: number | null;
  cpuSystemUs: number | null;
  rss: number | null;
  heapUsed: number | null;
  external: number | null;
  activeTcpHandles: number | null;
  selfConnect: { ms: number | null; failed: boolean } | null;
  cgCpuStat: Record<string, number> | null;
  cgMemoryCurrent: number | null;
  cgMemoryMax: number | null;
  cgMemoryEvents: Record<string, number> | null;
  cgCpuPressure: Pressure | null;
  cgMemPressure: Pressure | null;
  cgIoPressure: Pressure | null;
  loadavg: ReturnType<typeof parseLoadavg>;
  meminfo: ReturnType<typeof parseMeminfo>;
  procStatCpu: CpuTimes | null;
  vmstat: Record<string, number> | null;
  hostCpuPressure: Pressure | null;
  hostMemPressure: Pressure | null;
  hostIoPressure: Pressure | null;
}

/** File reader: returns the file text, or null when absent / unreadable. */
export type ReadText = (path: string) => string | null;

/** Read every best-effort file. A missing file is a null field, never an error. */
export function readSystemFiles(read: ReadText, cgroupRoot = CGROUP_ROOT) {
  const safe = (p: string): string | null => {
    try {
      return read(p);
    } catch {
      return null;
    }
  };
  return {
    cgCpuStat: parseKeyValueLines(safe(`${cgroupRoot}/cpu.stat`)),
    cgMemoryCurrent: parseSingleNumber(safe(`${cgroupRoot}/memory.current`)),
    cgMemoryMax: parseSingleNumber(safe(`${cgroupRoot}/memory.max`)),
    cgMemoryEvents: parseKeyValueLines(safe(`${cgroupRoot}/memory.events`)),
    cgCpuPressure: parsePressure(safe(`${cgroupRoot}/cpu.pressure`)),
    cgMemPressure: parsePressure(safe(`${cgroupRoot}/memory.pressure`)),
    cgIoPressure: parsePressure(safe(`${cgroupRoot}/io.pressure`)),
    loadavg: parseLoadavg(safe("/proc/loadavg")),
    meminfo: parseMeminfo(safe("/proc/meminfo")),
    procStatCpu: parseProcStatCpu(safe("/proc/stat")),
    vmstat: parseKeyValueLines(safe("/proc/vmstat")),
    hostCpuPressure: parsePressure(safe("/proc/pressure/cpu")),
    hostMemPressure: parsePressure(safe("/proc/pressure/memory")),
    hostIoPressure: parsePressure(safe("/proc/pressure/io")),
  };
}

/**
 * Turn the current reading (+ the previous one, for counters) into a row.
 * The first reading of a process has no previous one: every delta is null.
 */
export function buildSample(
  prev: RawReading | null,
  cur: RawReading,
  ids: { processId: string; buildSha: string | null },
): RuntimeSampleRow {
  const cs = (k: string, r: RawReading | null) => r?.cgCpuStat?.[k] ?? null;
  const me = (k: string, r: RawReading | null) => r?.cgMemoryEvents?.[k] ?? null;
  const vm = (k: string, r: RawReading | null) => r?.vmstat?.[k] ?? null;

  const statTotal = counterDelta(prev?.procStatCpu?.total, cur.procStatCpu?.total);

  return {
    sampled_at: new Date(cur.wallMs).toISOString(),
    process_id: ids.processId,
    build_sha: ids.buildSha,
    uptime_s: intOrNull(cur.uptimeS),
    // Monotonic gap since the previous tick. A gap far above
    // SAMPLE_INTERVAL_MS = the process was not scheduled (blocked, throttled
    // or the host froze); the CPU columns say which.
    interval_ms: prev ? intOrNull(cur.monoMs - prev.monoMs) : null,
    // Wall-clock gap; differs from the monotonic gap only if the clock jumped
    // or the VM was suspended.
    wall_interval_ms: prev ? intOrNull(cur.wallMs - prev.wallMs) : null,
    eld_p50_ms: round2(cur.eld?.p50Ms),
    eld_p99_ms: round2(cur.eld?.p99Ms),
    eld_max_ms: round2(cur.eld?.maxMs),
    elu: cur.elu === null ? null : Math.round(cur.elu * 10_000) / 10_000,
    cpu_user_ms: prev && cur.cpuUserUs !== null ? intOrNull(cur.cpuUserUs / 1000) : null,
    cpu_system_ms: prev && cur.cpuSystemUs !== null ? intOrNull(cur.cpuSystemUs / 1000) : null,
    rss_bytes: intOrNull(cur.rss),
    heap_used_bytes: intOrNull(cur.heapUsed),
    external_bytes: intOrNull(cur.external),
    active_tcp_handles: intOrNull(cur.activeTcpHandles),
    self_connect_ms: round2(cur.selfConnect?.ms ?? null),
    self_connect_failed: cur.selfConnect ? cur.selfConnect.failed : null,
    cg_usage_usec: counterDelta(cs("usage_usec", prev), cs("usage_usec", cur)),
    cg_nr_periods: counterDelta(cs("nr_periods", prev), cs("nr_periods", cur)),
    cg_nr_throttled: counterDelta(cs("nr_throttled", prev), cs("nr_throttled", cur)),
    cg_throttled_usec: counterDelta(cs("throttled_usec", prev), cs("throttled_usec", cur)),
    cg_memory_current_bytes: intOrNull(cur.cgMemoryCurrent),
    cg_memory_max_bytes: intOrNull(cur.cgMemoryMax),
    cg_mem_events_high: counterDelta(me("high", prev), me("high", cur)),
    cg_mem_events_max: counterDelta(me("max", prev), me("max", cur)),
    cg_mem_events_oom: counterDelta(me("oom", prev), me("oom", cur)),
    cg_mem_events_oom_kill: counterDelta(me("oom_kill", prev), me("oom_kill", cur)),
    cg_cpu_some_avg10: cur.cgCpuPressure?.someAvg10 ?? null,
    cg_cpu_full_avg10: cur.cgCpuPressure?.fullAvg10 ?? null,
    cg_mem_some_avg10: cur.cgMemPressure?.someAvg10 ?? null,
    cg_mem_full_avg10: cur.cgMemPressure?.fullAvg10 ?? null,
    cg_io_some_avg10: cur.cgIoPressure?.someAvg10 ?? null,
    cg_io_full_avg10: cur.cgIoPressure?.fullAvg10 ?? null,
    host_load1: cur.loadavg?.load1 ?? null,
    host_load5: cur.loadavg?.load5 ?? null,
    host_runnable: intOrNull(cur.loadavg?.runnable),
    host_mem_available_bytes: intOrNull(cur.meminfo?.memAvailableBytes),
    host_swap_free_bytes: intOrNull(cur.meminfo?.swapFreeBytes),
    host_cpu_steal_pct: pct(counterDelta(prev?.procStatCpu?.steal, cur.procStatCpu?.steal), statTotal),
    host_cpu_iowait_pct: pct(counterDelta(prev?.procStatCpu?.iowait, cur.procStatCpu?.iowait), statTotal),
    host_cpu_idle_pct: pct(counterDelta(prev?.procStatCpu?.idle, cur.procStatCpu?.idle), statTotal),
    host_pswpin: counterDelta(vm("pswpin", prev), vm("pswpin", cur)),
    host_pswpout: counterDelta(vm("pswpout", prev), vm("pswpout", cur)),
    host_pgmajfault: counterDelta(vm("pgmajfault", prev), vm("pgmajfault", cur)),
    host_cpu_some_avg10: cur.hostCpuPressure?.someAvg10 ?? null,
    host_mem_some_avg10: cur.hostMemPressure?.someAvg10 ?? null,
    host_mem_full_avg10: cur.hostMemPressure?.fullAvg10 ?? null,
    host_io_some_avg10: cur.hostIoPressure?.someAvg10 ?? null,
  };
}

// ─── The scheduler ───────────────────────────────────────────────────────────

/**
 * Insert outcome. `retry: true` only when the database never answered (network
 * error, timeout, 5xx) — the batch then stays in the bounded buffer for the
 * NEXT scheduled flush, so the minutes of a stall itself are not lost. A
 * database that answered with an error (4xx: missing table, quota, constraint)
 * drops the batch: resending it would fail the same way.
 */
export type InsertResult = { ok: true } | { ok: false; retry: boolean };

export interface SamplerDeps {
  /** Take one raw reading (the node wiring reads fs, perf_hooks, process). */
  read: () => RawReading;
  insert: (rows: readonly RuntimeSampleRow[]) => Promise<InsertResult>;
  /** Delete up to PRUNE_BATCH rows older than the cutoff. Failure is silent. */
  prune?: (cutoffIso: string, limit: number) => Promise<void>;
  /** Optional async probe whose result lands in the NEXT reading. */
  probe?: () => void;
  log: (line: string) => void;
  processId: string;
  buildSha: string | null;
  nowWallMs: () => number;
}

export interface RuntimeSampler {
  /** Take a sample; every TICKS_PER_FLUSH-th call also flushes. */
  tick: () => Promise<void>;
  flush: () => Promise<void>;
  /** Samples waiting in memory (for tests / diagnostics). */
  buffered: () => number;
}

export function createRuntimeSampler(deps: SamplerDeps): RuntimeSampler {
  let prev: RawReading | null = null;
  let buffer: RuntimeSampleRow[] = [];
  let ticks = 0;
  let flushes = 0;
  let flushing = false;
  let lastLogAt = -Infinity;

  const logOnce = (line: string) => {
    const now = deps.nowWallMs();
    if (now - lastLogAt < LOG_EVERY_MS) return;
    lastLogAt = now;
    try {
      deps.log(line);
    } catch {
      /* logging must never throw */
    }
  };

  const flush = async () => {
    if (flushing || buffer.length === 0) return;
    flushing = true;
    const batch = buffer;
    buffer = [];
    try {
      let result: InsertResult;
      try {
        result = await deps.insert(batch);
      } catch {
        result = { ok: false, retry: true };
      }
      if (!result.ok) {
        if (result.retry) buffer = batch.concat(buffer).slice(-MAX_BUFFERED_SAMPLES);
        logOnce(
          `[runtime-sampler] insert failed (${result.retry ? "kept for next flush" : "dropped"}); next note in >= 10 min`,
        );
        return;
      }
      flushes += 1;
      if (deps.prune && flushes % FLUSHES_PER_PRUNE === 1) {
        const cutoff = new Date(deps.nowWallMs() - RETENTION_DAYS * 86_400_000).toISOString();
        try {
          await deps.prune(cutoff, PRUNE_BATCH);
        } catch {
          /* retention is best-effort; the next prune tries again */
        }
      }
    } finally {
      flushing = false;
    }
  };

  const tick = async () => {
    try {
      const cur = deps.read();
      buffer.push(buildSample(prev, cur, { processId: deps.processId, buildSha: deps.buildSha }));
      if (buffer.length > MAX_BUFFERED_SAMPLES) buffer = buffer.slice(-MAX_BUFFERED_SAMPLES);
      prev = cur;
    } catch {
      logOnce("[runtime-sampler] sample failed; next note in >= 10 min");
    }
    try {
      deps.probe?.();
    } catch {
      /* the probe is optional evidence */
    }
    ticks += 1;
    if (ticks % TICKS_PER_FLUSH === 0) await flush();
  };

  return { tick, flush, buffered: () => buffer.length };
}
