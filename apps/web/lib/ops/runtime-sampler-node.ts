/**
 * RUNTIME STALL SAMPLER — Node wiring. Started ONCE per server process from
 * `instrumentation.ts` `register()` (Node runtime only). The maths and the
 * scheduling live in `runtime-sampler.ts`; this file only connects them to
 * the real fs, perf_hooks, process counters and the service-role insert.
 *
 * Safety properties (each one deliberate):
 *  - Timers are `unref()`'d: the sampler never keeps the process alive.
 *  - Nothing here throws to the caller: start failure = no sampler, silently.
 *  - Never in `next build`, never under vitest / NODE_ENV=test, never in edge.
 *    Outside NODE_ENV=production it runs only with LM_RUNTIME_SAMPLER=on;
 *    LM_RUNTIME_SAMPLER=off disables it everywhere.
 *  - Load: 4 tiny pseudo-file reads + counters every 15 s, ONE insert per
 *    minute, one bounded retention delete per 15 minutes.
 *  - The service-role key comes from `requireSupabaseServiceEnv()`, which
 *    also refuses a non-local target under acceptance mode.
 */

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { connect } from "node:net";
import { monitorEventLoopDelay, performance, type EventLoopUtilization } from "node:perf_hooks";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createRuntimeSampler,
  readSystemFiles,
  SAMPLE_INTERVAL_MS,
  type InsertResult,
  type RawReading,
  type RuntimeSampleRow,
  type RuntimeSampler,
} from "./runtime-sampler";

export const RUNTIME_SAMPLES_TABLE = "ops_runtime_samples";
const INSERT_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 5_000;
const SINGLETON = Symbol.for("lm.ops.runtimeSampler");
/**
 * monitorEventLoopDelay samples with a timer of this interval and records the
 * WHOLE interval between fires, so an idle loop reads ~20 ms. The stored
 * eld_* columns are the delay BEYOND the timer (idle loop ≈ 0 ms).
 */
export const ELD_RESOLUTION_MS = 20;

/** Histogram nanoseconds → milliseconds of delay beyond the sampling timer. */
export function eldBeyondTimer(ns: number): number | null {
  if (!Number.isFinite(ns)) return null;
  return Math.max(0, ns / 1e6 - ELD_RESOLUTION_MS);
}

type Env = Record<string, string | undefined>;

/** Whether this process should sample at all. Pure, so it is unit-tested. */
export function samplerEnabled(env: Env): boolean {
  const flag = (env.LM_RUNTIME_SAMPLER ?? "").trim().toLowerCase();
  if (flag === "off" || flag === "0" || flag === "false") return false;
  if (env.NEXT_RUNTIME && env.NEXT_RUNTIME !== "nodejs") return false;
  if (env.NEXT_PHASE === "phase-production-build") return false;
  if (env.VITEST || env.NODE_ENV === "test") return false;
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return false;
  return flag === "on" || flag === "1" || flag === "true" || env.NODE_ENV === "production";
}

/** The build sha, only if it is plain hex — never an arbitrary env string. */
export function buildShaFrom(env: Env): string | null {
  const sha = (env.VERCEL_GIT_COMMIT_SHA ?? "").trim().toLowerCase();
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha : null;
}

const readText = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

/** Map a PostgREST answer to keep-or-drop. No status = the DB never answered. */
export function classifyInsert(status: number | undefined, hasError: boolean): InsertResult {
  if (!hasError) return { ok: true };
  const retry = !status || status >= 500 || status === 408 || status === 429;
  return { ok: false, retry };
}

function timeoutFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(INSERT_TIMEOUT_MS) });
}

export function startRuntimeSampler(env: Env = process.env): RuntimeSampler | null {
  try {
    const g = globalThis as unknown as Record<symbol, RuntimeSampler | undefined>;
    if (g[SINGLETON]) return g[SINGLETON] ?? null;
    if (!samplerEnabled(env)) return null;

    const eld = monitorEventLoopDelay({ resolution: ELD_RESOLUTION_MS });
    eld.enable();
    let lastElu: EventLoopUtilization = performance.eventLoopUtilization();
    let lastCpu = process.cpuUsage();
    let probeResult: RawReading["selfConnect"] = null;
    let probing = false;
    const port = Number(env.PORT ?? 3000);
    const probeOn = (env.LM_RUNTIME_SAMPLER_PROBE ?? "").toLowerCase() !== "off" && Number.isInteger(port) && port > 0;

    const read = (): RawReading => {
      const files = readSystemFiles(readText);
      let eldOut: RawReading["eld"] = null;
      if (eld.count > 0) {
        eldOut = { p50Ms: eldBeyondTimer(eld.percentile(50)), p99Ms: eldBeyondTimer(eld.percentile(99)), maxMs: eldBeyondTimer(eld.max) };
      }
      eld.reset();
      const elu = performance.eventLoopUtilization(lastElu);
      lastElu = performance.eventLoopUtilization();
      const cpu = process.cpuUsage(lastCpu);
      lastCpu = process.cpuUsage();
      const mem = process.memoryUsage();
      let tcp: number | null = null;
      try {
        tcp = process.getActiveResourcesInfo().filter((r) => r === "TCPSocketWrap").length;
      } catch {
        tcp = null;
      }
      const selfConnect = probeResult;
      probeResult = null;
      return {
        monoMs: performance.now(),
        wallMs: Date.now(),
        uptimeS: process.uptime(),
        eld: eldOut,
        elu: Number.isFinite(elu.utilization) ? elu.utilization : null,
        cpuUserUs: cpu.user,
        cpuSystemUs: cpu.system,
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        external: mem.external,
        activeTcpHandles: tcp,
        selfConnect,
        ...files,
      };
    };

    // Self-connect to this process's own listener: a TCP accept, no request.
    // Fast here while users see 522 = the request never reached Node.
    const probe = () => {
      if (!probeOn || probing) return;
      probing = true;
      const started = performance.now();
      const done = (failed: boolean) => {
        if (!probing) return;
        probing = false;
        probeResult = { ms: performance.now() - started, failed };
        socket.destroy();
      };
      const socket = connect({ host: "127.0.0.1", port });
      socket.unref();
      socket.setTimeout(PROBE_TIMEOUT_MS, () => done(true));
      socket.once("connect", () => done(false));
      socket.once("error", () => done(true));
    };

    let client: SupabaseClient | null = null;
    const getClient = async (): Promise<SupabaseClient> => {
      if (client) return client;
      const [{ createClient }, { requireSupabaseServiceEnv }] = await Promise.all([
        import("@supabase/supabase-js"),
        import("@/lib/env"),
      ]);
      const { url, serviceRoleKey } = requireSupabaseServiceEnv();
      client = createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: timeoutFetch },
      });
      return client;
    };

    const insert = async (rows: readonly RuntimeSampleRow[]): Promise<InsertResult> => {
      try {
        const c = await getClient();
        const { error, status } = await c.from(RUNTIME_SAMPLES_TABLE).insert(rows as RuntimeSampleRow[]);
        return classifyInsert(status, Boolean(error));
      } catch {
        return { ok: false, retry: true };
      }
    };

    const prune = async (cutoffIso: string, limit: number) => {
      const c = await getClient();
      const { data } = await c
        .from(RUNTIME_SAMPLES_TABLE)
        .select("id")
        .lt("sampled_at", cutoffIso)
        .order("sampled_at", { ascending: true })
        .limit(limit);
      const ids = (data ?? []).map((r: { id: number }) => r.id);
      if (ids.length > 0) await c.from(RUNTIME_SAMPLES_TABLE).delete().in("id", ids);
    };

    const sampler = createRuntimeSampler({
      read,
      insert,
      prune,
      probe,
      log: (line) => console.warn(line),
      processId: randomBytes(8).toString("hex"),
      buildSha: buildShaFrom(env),
      nowWallMs: () => Date.now(),
    });

    const timer = setInterval(() => {
      sampler.tick().catch(() => {});
    }, SAMPLE_INTERVAL_MS);
    timer.unref();
    // Prime the first probe so the first full window carries a self-connect.
    probe();

    g[SINGLETON] = sampler;
    return sampler;
  } catch {
    return null;
  }
}
