import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE SERVER ANSWERS AT MOST 1000 ROWS PER REQUEST.
 *
 * A single `.limit(N)` with N > 1000 is a silent `.limit(1000)`: every row
 * past it disappears, and a "truncated when rows >= N" check never fires.
 * It happened to an organization's history records (#2551) and to the admin
 * activation funnel's telemetry (#2561). Reads that can exceed 1000 rows PAGE
 * with `.range()` (readAllPages in lib/journal/journal-list-core.ts or
 * lib/organization-evidence/evidence-pagination.ts).
 *
 * This guard resolves every `.limit(<literal | CONSTANT>[ + n])` in code
 * (constants resolved in the same file or from any `export const` in the
 * tree; a sentinel `CAP + 1` counts as CAP + 1) and compares each file with
 * its baseline EXACTLY: the baseline lists the latent cases known on
 * 2026-10-20 (tables that are small today). Paging a read lowers its count
 * and the baseline with it; a new over-cap read fails.
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

const num = (x: string) => Number(x.replace(/_/g, ""));
const all = ROOTS.flatMap((r) => files(join(WEB, r)));
const exported = new Map<string, number>();
for (const f of all) {
  for (const m of readFileSync(f, "utf8").matchAll(/export const ([A-Z][A-Z0-9_]*)\s*=\s*([0-9_]+)\b/g)) {
    exported.set(m[1]!, num(m[2]!));
  }
}

function overCapLimits(raw: string): number {
  // Code only: a comment that QUOTES an old `.limit(5000)` is history, not a read.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const local = new Map<string, number>();
  for (const m of src.matchAll(/const ([A-Z][A-Z0-9_]*)\s*=\s*([0-9_]+)\b/g)) {
    local.set(m[1]!, num(m[2]!));
  }
  let n = 0;
  for (const m of src.matchAll(/\.limit\(\s*([A-Z][A-Z0-9_]*|[0-9_]+)\s*(?:\+\s*([0-9]+)\s*)?\)/g)) {
    const k = m[1]!;
    const base = /^[0-9_]+$/.test(k) ? num(k) : (local.get(k) ?? exported.get(k));
    // A sentinel row (`CAP + 1`) is part of the request the server caps.
    const v = base === undefined ? undefined : base + Number(m[2] ?? 0);
    if (v !== undefined && v > 1000) n += 1;
  }
  return n;
}

/** Exact. Paging a read lowers both; a new over-cap read fails. */
const BASELINE: Record<string, number> = {
  "lib/admin/ai-cost.ts": 2,
  "lib/admin/pilots.ts": 2,
  "lib/capabilities/marketplace-capabilities.ts": 1,
  "lib/communication/organization-scope.ts": 1,
  "lib/documents/document-centre.ts": 1,
  // ENTRY_LIMIT (1000) + 1 sentinel and CONFIRMATION_LIMIT: the sentinel's
  // `length > ENTRY_LIMIT` check can never fire on a 1000-row answer.
  "lib/education/recognition-evidence.ts": 2,
  "lib/evidence/confirmed-work-read.ts": 3,
  "lib/invitations/network.ts": 1,
  "lib/journal/project-gallery.ts": 1,
  // Matching stage-1 candidate scans; truncation is checked as rows >= cap,
  // which a 1000-row answer never reaches.
  "lib/market/match-subject.ts": 4,
  "lib/notifications/event-emitters.ts": 2,
  "lib/ops/product-metrics.ts": 1,
  "lib/organization-evidence/evidence-store.ts": 6,
  "lib/organization-evidence/history-quality-read.ts": 1,
  "lib/organization-people/ingest-service.ts": 1,
  "lib/player-card/player-card.ts": 1,
  "lib/profile/trust-signals.ts": 1,
  "lib/work-hours/allocations.ts": 5,
  "lib/worker/weekly-intelligence.ts": 1,
};

describe("no read asks the server for more than its 1000-row cap without paging", () => {
  it("every file's over-cap .limit() count equals its baseline exactly", () => {
    const found = new Map<string, number>();
    for (const f of all) {
      const n = overCapLimits(readFileSync(f, "utf8"));
      if (n > 0) found.set(relative(WEB, f).replace(/\\/g, "/"), n);
    }
    const diff: string[] = [];
    for (const rel of new Set([...found.keys(), ...Object.keys(BASELINE)])) {
      const n = found.get(rel) ?? 0;
      const b = BASELINE[rel] ?? 0;
      if (n > b) diff.push(`${rel}: ${n} over-cap .limit() (baseline ${b}) — page it with .range()`);
      if (n < b) diff.push(`${rel}: ${n} over-cap .limit() but baseline says ${b} — lower the baseline`);
    }
    expect(diff).toEqual([]);
  });

  it("the resolver sees a literal, a local constant, an exported constant and a sentinel", () => {
    expect(
      overCapLimits("const A = 5000; const C = 1000; q.limit(A); q.limit(2000); q.limit(1000); q.limit(C + 1); q.limit(B);"),
    ).toBe(3);
  });
});
