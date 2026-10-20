import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE SERVER ANSWERS AT MOST 1000 ROWS PER REQUEST.
 *
 * A single `.limit(N)` with N > 1000 is a silent `.limit(1000)`: every row
 * past it disappears, and a "truncated when rows >= N" check never fires.
 * Production 2026-10-20 proved it twice — an organization's 2,944 history
 * records (#2551) and 9,733 telemetry events in 30 days behind the admin
 * activation funnel (#2561). Reads that can exceed 1000 rows PAGE with
 * `.range()` (readAllPages in lib/journal/journal-list-core.ts or
 * lib/organization-evidence/evidence-pagination.ts).
 *
 * This guard resolves every `.limit(<literal or constant>)` (constants
 * resolved in the same file or from any `export const` in the tree) and
 * fails when a file holds MORE such over-cap limits than its frozen baseline.
 * The baseline lists today's latent cases — each measured in production on
 * 2026-10-20 far below 1000 rows (journal entries per worker ≤ 55, workers
 * 122, organization people 43, work objects ≤ 229 per organization, ai_runs
 * 35 per 7 days …). Lower a count when you page a read; never raise one.
 */
const WEB = join(__dirname, "..", "..");
const ROOTS = ["lib", "app", "components"];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      out.push(...files(p));
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const all = ROOTS.flatMap((r) => files(join(WEB, r)));
const exported = new Map<string, number>();
for (const f of all) {
  for (const m of readFileSync(f, "utf8").matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*([0-9_]+)\b/g)) {
    exported.set(m[1]!, Number(m[2]!.replace(/_/g, "")));
  }
}

function overCapLimits(src: string): number {
  const local = new Map<string, number>();
  for (const m of src.matchAll(/const ([A-Z][A-Z0-9_]*)\s*=\s*([0-9_]+)\b/g)) {
    local.set(m[1]!, Number(m[2]!.replace(/_/g, "")));
  }
  let n = 0;
  for (const m of src.matchAll(/\.limit\(\s*([A-Z][A-Z0-9_]*|[0-9_]+)\s*(?:\+\s*1\s*)?\)/g)) {
    const k = m[1]!;
    const v = /^[0-9_]+$/.test(k) ? Number(k.replace(/_/g, "")) : (local.get(k) ?? exported.get(k));
    if (v !== undefined && v > 1000) n += 1;
  }
  return n;
}

/** Frozen 2026-10-20. Lower a count when a read is paged; never raise one. */
const BASELINE: Record<string, number> = {
  "lib/admin/ai-cost.ts": 2,
  // #2561 pages these three (counts drop to 1 / 0 / 0 once it merges).
  "lib/admin/conversion-funnel.ts": 2,
  "lib/admin/pilot-metrics.ts": 1,
  "lib/admin/ttfv-by-actor.ts": 1,
  "lib/admin/pilots.ts": 2,
  "lib/capabilities/marketplace-capabilities.ts": 1,
  "lib/communication/organization-scope.ts": 1,
  "lib/documents/document-centre.ts": 1,
  "lib/education/recognition-evidence.ts": 1,
  "lib/evidence/confirmed-work-read.ts": 3,
  "lib/invitations/network.ts": 1,
  "lib/journal/project-gallery.ts": 1,
  // Matching stage-1 candidate scans; truncation is checked as rows >= cap,
  // which a 1000-row answer never reaches (worker_skills 174, workers 122).
  "lib/market/match-subject.ts": 4,
  "lib/notifications/event-emitters.ts": 2,
  "lib/ops/product-metrics.ts": 1,
  "lib/organization-evidence/evidence-store.ts": 6,
  "lib/organization-evidence/history-quality-read.ts": 1,
  "lib/organization-evidence/worker-evidence-read.ts": 1,
  "lib/organization-people/ingest-service.ts": 1,
  "lib/player-card/player-card.ts": 1,
  "lib/profile/trust-signals.ts": 1,
  "lib/work-hours/allocations.ts": 5,
  "lib/worker/weekly-intelligence.ts": 1,
};

describe("no read asks the server for more than its 1000-row cap without paging", () => {
  it("no file holds more over-cap .limit() reads than its frozen baseline", () => {
    const over: string[] = [];
    for (const f of all) {
      const rel = relative(WEB, f).replace(/\\/g, "/");
      const n = overCapLimits(readFileSync(f, "utf8"));
      if (n > (BASELINE[rel] ?? 0)) over.push(`${rel}: ${n} over-cap .limit() (baseline ${BASELINE[rel] ?? 0}) — page it with .range()`);
    }
    expect(over).toEqual([]);
  });

  it("the resolver sees a literal, a local constant and an exported constant", () => {
    expect(overCapLimits('const A = 5000; q.limit(A); q.limit(2000); q.limit(1000); q.limit(B);')).toBe(2);
  });
});
