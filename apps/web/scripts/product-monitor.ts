/**
 * PRODUCT MONITOR runner — invoked hourly by `.github/workflows/product-monitor.yml`.
 *
 *   MONITOR_SUPABASE_URL, MONITOR_SERVICE_ROLE_KEY   read-only use of the service key
 *   MONITOR_SITE_ORIGIN                              default https://labourmarket.ai
 *   GITHUB_TOKEN, GITHUB_REPOSITORY                  issue open/comment/close
 *   MONITOR_FORCE_BREACH=<signal id>                 alert drill: report that signal as BREACH
 *   MONITOR_DRY_RUN=1                                evaluate and print, touch no issue
 *
 * It WRITES nothing to the database. Its only side effect is GitHub issues
 * labelled `monitor` + `monitor:<signal>` + `sev:<P1|P2|P3>`. The repository
 * is public, so the issue text carries the signal, its condition and aggregate
 * numbers only — never an id, address, name or free text.
 */
import { createClient } from "@supabase/supabase-js";

import { computeProductMetrics } from "../lib/ops/product-metrics";
import { SIGNALS, evaluateSignals, type MonitorProbes, type SignalResult } from "../lib/ops/product-monitor";

const DAY = 86_400_000;

async function searchMedianMs(origin: string): Promise<number | null> {
  const times: number[] = [];
  for (const q of ["welder", "suvirintojas", "sandėlio darbuotojas"]) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${origin}/lt/jobs?q=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "labourmarket-product-monitor" },
      });
      await res.arrayBuffer();
      if (!res.ok) return null;
      times.push(performance.now() - t0);
    } catch {
      return null;
    }
  }
  times.sort((a, b) => a - b);
  return times[1] ?? null;
}


async function gh(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path} → ${res.status}`);
  return res.status === 204 ? null : res.json();
}

function issueBody(s: SignalResult, computedAt: string): string {
  return [
    `**Signal:** \`${s.id}\` · **Severity:** ${s.severity} · **State:** ${s.state}`,
    `**Condition:** ${s.condition}`,
    `**Observed:** ${s.observed}`,
    `**Evaluated:** ${computedAt} · **Interval:** ${s.interval}`,
    `**Responder:** ${s.responder}`,
    "",
    "Aggregate numbers only. Rules: `apps/web/lib/ops/product-monitor.ts`; metrics: `/dashboard/admin/metrics`.",
    "This issue closes itself on the first OK evaluation.",
  ].join("\n");
}

async function syncIssues(results: SignalResult[], computedAt: string): Promise<void> {
  const open: any[] = await gh(`/issues?state=open&labels=monitor&per_page=100`);
  for (const s of results) {
    const label = `monitor:${s.id}`;
    const existing = open.find((i) => (i.labels as { name: string }[]).some((l) => l.name === label));
    if (s.state === "BREACH") {
      if (!existing) {
        await gh(`/issues`, {
          method: "POST",
          body: JSON.stringify({
            title: `[monitor ${s.severity}] ${s.id}`,
            body: issueBody(s, computedAt),
            labels: ["monitor", label, `sev:${s.severity}`],
          }),
        });
        console.info(`[monitor] OPENED ${s.id}`);
      } else {
        // At most one comment a day while the breach lasts.
        const last = Date.parse(existing.updated_at);
        if (Date.now() - last > DAY - 15 * 60_000) {
          await gh(`/issues/${existing.number}/comments`, { method: "POST", body: JSON.stringify({ body: `Still breaching. ${s.observed} (${computedAt})` }) });
        }
        console.info(`[monitor] STILL ${s.id} #${existing.number}`);
      }
    } else if (s.state === "OK" && existing) {
      await gh(`/issues/${existing.number}/comments`, { method: "POST", body: JSON.stringify({ body: `Recovered: ${s.observed} (${computedAt}).` }) });
      await gh(`/issues/${existing.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) });
      console.info(`[monitor] CLOSED ${s.id} #${existing.number}`);
    }
  }
}

async function main(): Promise<void> {
  const url = process.env.MONITOR_SUPABASE_URL;
  const key = process.env.MONITOR_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[monitor] MONITOR_SUPABASE_URL and MONITOR_SERVICE_ROLE_KEY are required");
    process.exit(2);
  }
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const origin = process.env.MONITOR_SITE_ORIGIN ?? "https://labourmarket.ai";

  const snapshot = await computeProductMetrics(client);
  const probes: MonitorProbes = { searchMedianMs: await searchMedianMs(origin) };

  let results = evaluateSignals(snapshot, probes);
  const drill = process.env.MONITOR_FORCE_BREACH;
  if (drill) {
    if (!SIGNALS.some((s) => s.id === drill)) {
      console.error(`[monitor] unknown drill signal ${drill}`);
      process.exit(2);
    }
    results = results.map((r) => (r.id === drill ? { ...r, state: "BREACH" as const, observed: `ALERT DRILL (forced) — real reading: ${r.observed}` } : r));
  }

  for (const r of results) console.info(`[monitor] ${r.state.padEnd(7)} ${r.severity} ${r.id} — ${r.observed}`);

  if (process.env.MONITOR_DRY_RUN === "1") return;
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY) {
    console.error("[monitor] GITHUB_TOKEN / GITHUB_REPOSITORY missing — cannot alert");
    process.exit(2);
  }
  await syncIssues(results, snapshot.computedAt);
  // A P1 breach also turns the run red, so GitHub's own failure e-mail fires.
  if (results.some((r) => r.state === "BREACH" && r.severity === "P1")) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[monitor] FAILED:", (err as Error).message);
  process.exit(1);
});
