import { describe, expect, it, vi } from "vitest";

import {
  buildSample,
  counterDelta,
  createRuntimeSampler,
  FLUSHES_PER_PRUNE,
  LOG_EVERY_MS,
  MAX_BUFFERED_SAMPLES,
  parseKeyValueLines,
  parseLoadavg,
  parseMeminfo,
  parsePressure,
  parseProcStatCpu,
  parseSingleNumber,
  readSystemFiles,
  RETENTION_DAYS,
  RUNTIME_SAMPLE_COLUMNS,
  SAMPLE_INTERVAL_MS,
  TICKS_PER_FLUSH,
  type InsertResult,
  type RawReading,
  type ReadText,
  type RuntimeSampleRow,
} from "./runtime-sampler";
import { buildShaFrom, classifyInsert, eldBeyondTimer, samplerEnabled } from "./runtime-sampler-node";

// ─── Fake fs: a cgroup v2 container on a Linux host ──────────────────────────

function fakeFs(files: Record<string, string>): ReadText {
  return (p) => (p in files ? files[p] : null);
}

function hostFiles(o: {
  usage: number;
  periods: number;
  throttled: number;
  throttledUs: number;
  high?: number;
  oomKill?: number;
  steal?: number;
  idle?: number;
  total?: number;
  pswpin?: number;
  majflt?: number;
}): Record<string, string> {
  const steal = o.steal ?? 0;
  const idle = o.idle ?? 0;
  // user nice system idle iowait irq softirq steal
  const user = (o.total ?? 1000) - idle - steal - 10;
  return {
    "/sys/fs/cgroup/cpu.stat": `usage_usec ${o.usage}\nuser_usec 1\nsystem_usec 1\nnr_periods ${o.periods}\nnr_throttled ${o.throttled}\nthrottled_usec ${o.throttledUs}\n`,
    "/sys/fs/cgroup/memory.current": "402653184\n",
    "/sys/fs/cgroup/memory.max": "805306368\n",
    "/sys/fs/cgroup/memory.events": `low 0\nhigh ${o.high ?? 0}\nmax 0\noom 0\noom_kill ${o.oomKill ?? 0}\n`,
    "/sys/fs/cgroup/cpu.pressure": "some avg10=12.50 avg60=3.00 avg300=1.00 total=123\nfull avg10=4.25 avg60=1.00 avg300=0.50 total=45\n",
    "/proc/loadavg": "3.10 2.05 1.50 4/812 99821\n",
    "/proc/meminfo": "MemTotal:        4000000 kB\nMemAvailable:     250000 kB\nSwapFree:          10240 kB\n",
    "/proc/stat": `cpu  ${user} 0 0 ${idle} 10 0 0 ${steal} 0 0\ncpu0 1 2 3 4 5 6 7 8 0 0\n`,
    "/proc/vmstat": `pgmajfault ${o.majflt ?? 0}\npswpin ${o.pswpin ?? 0}\npswpout 0\n`,
  };
}

function reading(files: ReadText, extra: Partial<RawReading> = {}): RawReading {
  return {
    monoMs: 0,
    wallMs: Date.UTC(2026, 9, 23, 17, 1, 0),
    uptimeS: 100,
    eld: { p50Ms: 10.2, p99Ms: 21.004, maxMs: 30.555 },
    elu: 0.123456,
    cpuUserUs: 1_500_000,
    cpuSystemUs: 250_000,
    rss: 300_000_000,
    heapUsed: 120_000_000,
    external: 5_000_000,
    activeTcpHandles: 7,
    selfConnect: { ms: 0.4, failed: false },
    ...readSystemFiles(files),
    ...extra,
  };
}

const IDS = { processId: "0123456789abcdef", buildSha: "392850c8d" };

// ─── Parsers ─────────────────────────────────────────────────────────────────

describe("parsers are total: missing or garbage input is null, never a throw", () => {
  it("returns null for absent files", () => {
    expect(parseKeyValueLines(null)).toBeNull();
    expect(parseSingleNumber(null)).toBeNull();
    expect(parsePressure(null)).toBeNull();
    expect(parseLoadavg(null)).toBeNull();
    expect(parseMeminfo(null)).toBeNull();
    expect(parseProcStatCpu(null)).toBeNull();
  });

  it("returns null for garbage", () => {
    expect(parseKeyValueLines("garbage")).toBeNull();
    expect(parseSingleNumber("not-a-number")).toBeNull();
    expect(parsePressure("nonsense")).toBeNull();
    expect(parseLoadavg("1.0")).toBeNull();
    expect(parseProcStatCpu("intr 1 2 3")).toBeNull();
  });

  it("memory.max `max` (unlimited) is null, a number is a number", () => {
    expect(parseSingleNumber("max\n")).toBeNull();
    expect(parseSingleNumber("805306368\n")).toBe(805306368);
  });

  it("parses PSI some/full avg10, and some-only files (host cpu on older kernels)", () => {
    expect(parsePressure("some avg10=1.50 avg60=0 avg300=0 total=1\nfull avg10=0.25 avg60=0 avg300=0 total=1")).toEqual({
      someAvg10: 1.5,
      fullAvg10: 0.25,
    });
    expect(parsePressure("some avg10=2.00 avg60=0 avg300=0 total=1")).toEqual({ someAvg10: 2, fullAvg10: null });
  });

  it("parses loadavg, meminfo (kB → bytes) and the aggregate /proc/stat line", () => {
    expect(parseLoadavg("0.52 0.58 0.59 2/1234 5678")).toEqual({ load1: 0.52, load5: 0.58, runnable: 2 });
    expect(parseMeminfo("MemAvailable:  1000 kB\nSwapFree: 2 kB\n")).toEqual({ memAvailableBytes: 1_024_000, swapFreeBytes: 2048 });
    expect(parseProcStatCpu("cpu  10 0 5 80 3 0 0 2 1 0\n")).toEqual({ total: 100, idle: 80, iowait: 3, steal: 2 });
  });

  it("a reader that throws is treated as a missing file", () => {
    const throwing: ReadText = () => {
      throw new Error("EACCES");
    };
    const files = readSystemFiles(throwing);
    expect(Object.values(files).every((v) => v === null)).toBe(true);
  });
});

// ─── Delta maths ─────────────────────────────────────────────────────────────

describe("counter deltas", () => {
  it("is the increase between two readings", () => {
    expect(counterDelta(100, 175)).toBe(75);
    expect(counterDelta(5, 5)).toBe(0);
  });
  it("is null without a previous reading, without a current one, or when the counter went backwards", () => {
    expect(counterDelta(null, 10)).toBeNull();
    expect(counterDelta(undefined, 10)).toBeNull();
    expect(counterDelta(10, null)).toBeNull();
    expect(counterDelta(10, 3)).toBeNull();
    expect(counterDelta(Number.NaN, 3)).toBeNull();
  });
});

describe("buildSample", () => {
  const a = reading(fakeFs(hostFiles({ usage: 1_000_000, periods: 100, throttled: 2, throttledUs: 5_000, total: 1000, idle: 600, steal: 10, pswpin: 5, majflt: 50 })));
  const b = reading(
    fakeFs(hostFiles({ usage: 8_500_000, periods: 250, throttled: 140, throttledUs: 9_005_000, high: 3, oomKill: 0, total: 2000, idle: 1100, steal: 210, pswpin: 905, majflt: 1050 })),
    { monoMs: 15_020, wallMs: a.wallMs + 15_020 },
  );

  it("the first sample of a process has every delta null (unknown, never zero)", () => {
    const row = buildSample(null, a, IDS);
    expect(row.interval_ms).toBeNull();
    expect(row.wall_interval_ms).toBeNull();
    expect(row.cpu_user_ms).toBeNull();
    expect(row.cg_nr_throttled).toBeNull();
    expect(row.cg_throttled_usec).toBeNull();
    expect(row.host_cpu_steal_pct).toBeNull();
    expect(row.host_pswpin).toBeNull();
    // Gauges are present from the first sample.
    expect(row.cg_memory_current_bytes).toBe(402653184);
    expect(row.cg_memory_max_bytes).toBe(805306368);
    expect(row.host_mem_available_bytes).toBe(250_000 * 1024);
    expect(row.host_load1).toBe(3.1);
    expect(row.host_runnable).toBe(4);
    expect(row.cg_cpu_some_avg10).toBe(12.5);
    expect(row.cg_cpu_full_avg10).toBe(4.25);
  });

  it("computes cgroup, memory.events, host CPU and vmstat deltas over the window", () => {
    const row = buildSample(a, b, IDS);
    expect(row.interval_ms).toBe(15_020);
    expect(row.wall_interval_ms).toBe(15_020);
    expect(row.cg_usage_usec).toBe(7_500_000);
    expect(row.cg_nr_periods).toBe(150);
    expect(row.cg_nr_throttled).toBe(138);
    expect(row.cg_throttled_usec).toBe(9_000_000);
    expect(row.cg_mem_events_high).toBe(3);
    expect(row.cg_mem_events_oom_kill).toBe(0);
    // /proc/stat window: total +1000, idle +500, steal +200.
    expect(row.host_cpu_steal_pct).toBe(20);
    expect(row.host_cpu_idle_pct).toBe(50);
    expect(row.host_pswpin).toBe(900);
    expect(row.host_pgmajfault).toBe(1000);
    expect(row.cpu_user_ms).toBe(1500);
    expect(row.cpu_system_ms).toBe(250);
  });

  it("rounds ELD to 0.01 ms and ELU to 4 places", () => {
    const row = buildSample(a, b, IDS);
    expect(row.eld_p99_ms).toBe(21);
    expect(row.eld_max_ms).toBe(30.56);
    expect(row.elu).toBe(0.1235);
  });

  it("a long gap is visible: interval far above the 15 s schedule", () => {
    const frozen = reading(fakeFs({}), { monoMs: 15_000 + 312_000, wallMs: a.wallMs + 327_000, cpuUserUs: 3_000, cpuSystemUs: 1_000 });
    const row = buildSample(a, frozen, IDS);
    expect(row.interval_ms).toBe(327_000);
    expect(row.interval_ms! > 2 * SAMPLE_INTERVAL_MS).toBe(true);
    // ~zero process CPU across the gap = the process was not running (host
    // freeze / starvation), not a busy event loop.
    expect(row.cpu_user_ms).toBe(3);
  });

  it("an empty container (no /sys, no /proc) yields a row of nulls, not an error", () => {
    const empty = reading(fakeFs({}), { eld: null, elu: null, selfConnect: null, activeTcpHandles: null });
    const row = buildSample(empty, { ...empty, monoMs: 15_000, wallMs: empty.wallMs + 15_000 }, IDS);
    for (const k of RUNTIME_SAMPLE_COLUMNS) {
      if (["sampled_at", "process_id", "build_sha", "uptime_s", "interval_ms", "wall_interval_ms", "cpu_user_ms", "cpu_system_ms", "rss_bytes", "heap_used_bytes", "external_bytes"].includes(k)) continue;
      expect(row[k], k).toBeNull();
    }
  });

  it("emits exactly the declared column set", () => {
    expect(Object.keys(buildSample(a, b, IDS)).sort()).toEqual([...RUNTIME_SAMPLE_COLUMNS].sort());
  });
});

// ─── Scheduler: flush cadence, bounded buffer, quiet failure, retention ─────

function harness(insertImpl: (rows: readonly RuntimeSampleRow[]) => Promise<InsertResult>) {
  let mono = 0;
  let wall = Date.UTC(2026, 9, 23, 17, 0, 0);
  const inserted: RuntimeSampleRow[][] = [];
  const logs: string[] = [];
  const prune = vi.fn(async () => {});
  const sampler = createRuntimeSampler({
    read: () => reading(fakeFs({}), { monoMs: mono, wallMs: wall }),
    insert: async (rows) => {
      inserted.push([...rows]);
      return insertImpl(rows);
    },
    prune,
    log: (l) => logs.push(l),
    processId: IDS.processId,
    buildSha: IDS.buildSha,
    nowWallMs: () => wall,
  });
  const advance = async (n: number) => {
    for (let i = 0; i < n; i++) {
      mono += SAMPLE_INTERVAL_MS;
      wall += SAMPLE_INTERVAL_MS;
      await sampler.tick();
    }
  };
  return { sampler, inserted, logs, prune, advance, now: () => wall };
}

describe("createRuntimeSampler", () => {
  it("inserts one batch of TICKS_PER_FLUSH rows per minute", async () => {
    const h = harness(async () => ({ ok: true }));
    await h.advance(TICKS_PER_FLUSH - 1);
    expect(h.inserted).toHaveLength(0);
    await h.advance(1);
    expect(h.inserted).toHaveLength(1);
    expect(h.inserted[0]).toHaveLength(TICKS_PER_FLUSH);
    await h.advance(TICKS_PER_FLUSH * 3);
    expect(h.inserted).toHaveLength(4);
    expect(h.sampler.buffered()).toBe(0);
  });

  it("a database that answered with an error drops the batch (no resend)", async () => {
    const h = harness(async () => ({ ok: false, retry: false }));
    await h.advance(TICKS_PER_FLUSH);
    expect(h.sampler.buffered()).toBe(0);
    await h.advance(TICKS_PER_FLUSH);
    expect(h.inserted.map((b) => b.length)).toEqual([TICKS_PER_FLUSH, TICKS_PER_FLUSH]);
  });

  it("a network failure keeps the batch for the NEXT scheduled flush only — bounded, no retry storm", async () => {
    const h = harness(async () => ({ ok: false, retry: true }));
    await h.advance(TICKS_PER_FLUSH * 30);
    // Exactly one insert attempt per minute, never more.
    expect(h.inserted).toHaveLength(30);
    expect(h.sampler.buffered()).toBeLessThanOrEqual(MAX_BUFFERED_SAMPLES);
    expect(Math.max(...h.inserted.map((b) => b.length))).toBeLessThanOrEqual(MAX_BUFFERED_SAMPLES);
  });

  it("an insert that throws is a quiet network failure", async () => {
    const h = harness(async () => {
      throw new Error("fetch failed");
    });
    await expect(h.advance(TICKS_PER_FLUSH)).resolves.toBeUndefined();
    expect(h.sampler.buffered()).toBe(TICKS_PER_FLUSH);
  });

  it("logs at most one line per 10 minutes while inserts keep failing", async () => {
    const h = harness(async () => ({ ok: false, retry: false }));
    const ticksPer10Min = LOG_EVERY_MS / SAMPLE_INTERVAL_MS;
    await h.advance(ticksPer10Min * 3);
    expect(h.logs.length).toBeGreaterThanOrEqual(2);
    expect(h.logs.length).toBeLessThanOrEqual(3);
    // The line carries no error text, no URL, no key.
    for (const l of h.logs) expect(l).toMatch(/^\[runtime-sampler\] insert failed \((kept for next flush|dropped)\)/);
  });

  it("prunes rows older than the retention horizon on the first and then every FLUSHES_PER_PRUNE-th successful flush", async () => {
    const h = harness(async () => ({ ok: true }));
    await h.advance(TICKS_PER_FLUSH);
    expect(h.prune).toHaveBeenCalledTimes(1);
    const [cutoff, limit] = h.prune.mock.calls[0] as unknown as [string, number];
    expect(h.now() - Date.parse(cutoff)).toBe(RETENTION_DAYS * 86_400_000);
    expect(limit).toBe(500);
    await h.advance(TICKS_PER_FLUSH * (FLUSHES_PER_PRUNE - 1));
    expect(h.prune).toHaveBeenCalledTimes(1);
    await h.advance(TICKS_PER_FLUSH);
    expect(h.prune).toHaveBeenCalledTimes(2);
  });

  it("a read that throws never escapes tick()", async () => {
    const sampler = createRuntimeSampler({
      read: () => {
        throw new Error("boom");
      },
      insert: async () => ({ ok: true }),
      log: () => {},
      processId: IDS.processId,
      buildSha: null,
      nowWallMs: () => 0,
    });
    await expect(sampler.tick()).resolves.toBeUndefined();
    expect(sampler.buffered()).toBe(0);
  });
});

// ─── Node wiring: pure decisions ─────────────────────────────────────────────

describe("node wiring decisions", () => {
  const prod = { NODE_ENV: "production", NEXT_RUNTIME: "nodejs", SUPABASE_SERVICE_ROLE_KEY: "x" };
  it("runs in a production Node server", () => {
    expect(samplerEnabled(prod)).toBe(true);
  });
  it("never runs in build, tests, edge, without a key, or when switched off", () => {
    expect(samplerEnabled({ ...prod, NEXT_PHASE: "phase-production-build" })).toBe(false);
    expect(samplerEnabled({ ...prod, VITEST: "true" })).toBe(false);
    expect(samplerEnabled({ ...prod, NODE_ENV: "test" })).toBe(false);
    expect(samplerEnabled({ ...prod, NEXT_RUNTIME: "edge" })).toBe(false);
    expect(samplerEnabled({ ...prod, SUPABASE_SERVICE_ROLE_KEY: undefined })).toBe(false);
    expect(samplerEnabled({ ...prod, LM_RUNTIME_SAMPLER: "off" })).toBe(false);
  });
  it("outside production it runs only when explicitly switched on", () => {
    expect(samplerEnabled({ ...prod, NODE_ENV: "development" })).toBe(false);
    expect(samplerEnabled({ ...prod, NODE_ENV: "development", LM_RUNTIME_SAMPLER: "on" })).toBe(true);
  });
  it("the build sha is kept only when it is plain hex", () => {
    expect(buildShaFrom({ VERCEL_GIT_COMMIT_SHA: "392850C8D" })).toBe("392850c8d");
    expect(buildShaFrom({ VERCEL_GIT_COMMIT_SHA: "main; drop table x" })).toBeNull();
    expect(buildShaFrom({})).toBeNull();
  });
  it("event-loop delay is stored as the delay beyond the 20 ms sampling timer", () => {
    expect(eldBeyondTimer(20_100_000)).toBeCloseTo(0.1, 5);
    expect(eldBeyondTimer(19_000_000)).toBe(0);
    expect(eldBeyondTimer(20_020_000_000)).toBe(20_000);
    expect(eldBeyondTimer(Number.NaN)).toBeNull();
  });
  it("keeps a batch only when the database never answered", () => {
    expect(classifyInsert(201, false)).toEqual({ ok: true });
    expect(classifyInsert(undefined, true)).toEqual({ ok: false, retry: true });
    expect(classifyInsert(0, true)).toEqual({ ok: false, retry: true });
    expect(classifyInsert(503, true)).toEqual({ ok: false, retry: true });
    expect(classifyInsert(404, true)).toEqual({ ok: false, retry: false });
    expect(classifyInsert(402, true)).toEqual({ ok: false, retry: false });
  });
});
