import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { duplicateKeyOf, findRecentDuplicateEntry } from "./journal-write-core";

/** G-8 / G-12 — journal create idempotency + RPC-missing fallback precision. */

const root = join(__dirname, "..", "..");
const src = readFileSync(join(root, "lib/journal/journal-write-core.ts"), "utf8");
const tasks = readFileSync(join(root, "app/[locale]/dashboard/tasks/page.tsx"), "utf8");

describe("G-12 legacy two-step fallback only for a genuinely absent RPC", () => {
  it("is keyed on PGRST202 / 42883 and never on message text", () => {
    expect(src).toMatch(/MISSING_RPC_CODES = new Set\(\["PGRST202", "42883"\]\)/);
    const at = src.indexOf("const isMissingRpc");
    const block = src.slice(at, at + 200);
    expect(block).toMatch(/MISSING_RPC_CODES\.has/);
    expect(block).not.toMatch(/includes\("function"\)|create_journal_entry_full/);
  });
});

describe("G-8 journal create is idempotent within a short window", () => {
  type Row = { id: string; project_id?: string | null; journal_entry_metrics?: unknown[] };
  function sb(result: { data: Row[] | null; error: unknown } | "throw") {
    const calls: string[] = [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "gte", "order"]) {
      b[m] = (...args: unknown[]) => (calls.push(m === "is" ? `is:${String(args[0])}` : m), b);
    }
    b.limit = async () => {
      if (result === "throw") throw new Error("x");
      return result;
    };
    return { client: { from: () => b } as never, calls };
  }
  const monday = [
    { metric_slug: "work_date", value_text: "2026-10-19" },
    { metric_slug: "quantity", value_numeric: 8, unit_slug: "hours" },
  ];
  const tuesday = [
    { metric_slug: "work_date", value_text: "2026-10-20" },
    { metric_slug: "quantity", value_numeric: 8, unit_slug: "hours" },
  ];
  const q = { workerId: "w", engagementId: "e", originalText: "Plytelės 8 val.", metrics: monday };

  it("returns the id of the same submission (double click / retry)", async () => {
    const { client, calls } = sb({ data: [{ id: "entry-1", journal_entry_metrics: monday }], error: null });
    expect(await findRecentDuplicateEntry(client, q)).toBe("entry-1");
    expect(calls).toContain("gte");
    // only LIVE entries can be the same submission
    expect(calls).toContain("is:deleted_at");
    expect(calls).toContain("is:superseded_by");
  });
  it("the same words for ANOTHER day are new work, not a duplicate", async () => {
    const { client } = sb({ data: [{ id: "entry-1", journal_entry_metrics: monday }], error: null });
    expect(await findRecentDuplicateEntry(client, { ...q, metrics: tuesday })).toBeNull();
  });
  it("other hours, or another explicit project, are new work", async () => {
    const tenHours = [monday[0], { metric_slug: "quantity", value_numeric: 10, unit_slug: "hours" }];
    const { client } = sb({ data: [{ id: "entry-1", project_id: "p1", journal_entry_metrics: monday }], error: null });
    expect(await findRecentDuplicateEntry(client, { ...q, metrics: tenHours })).toBeNull();
    expect(await findRecentDuplicateEntry(client, { ...q, explicitProjectId: "p2" })).toBeNull();
    expect(await findRecentDuplicateEntry(client, { ...q, explicitProjectId: "p1" })).toBe("entry-1");
  });
  it("metric rows that are not day or time facts do not split a duplicate", () => {
    expect(duplicateKeyOf([...monday, { metric_slug: "site_name", value_text: "A" }])).toBe(duplicateKeyOf(monday));
  });
  it("returns null when nothing matches, on a read error, and on a throw", async () => {
    expect(await findRecentDuplicateEntry(sb({ data: [], error: null }).client, q)).toBeNull();
    expect(await findRecentDuplicateEntry(sb({ data: null, error: { message: "e" } }).client, q)).toBeNull();
    expect(await findRecentDuplicateEntry(sb("throw").client, q)).toBeNull();
  });
  it("the create path consults it before the RPC, with the day facts and the project choice", () => {
    const at = src.indexOf("findRecentDuplicateEntry(supabase");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(src.indexOf('"create_journal_entry_full", rpcParams'));
    expect(src.slice(at, at + 300)).toMatch(/metrics,\s*\.\.\.\(projectParams\.p_project_explicit/);
  });
});

describe("G-8 tasks page forms cannot double-submit", () => {
  it("no bare submit button remains on the page (all use the pending wrappers)", () => {
    expect(tasks).not.toMatch(/<Button[^>]*type="submit"/);
    expect(tasks).not.toMatch(/<button\s[^>]*type="submit"/);
    expect(tasks).toMatch(/PendingButton/);
    expect(tasks).toMatch(/PendingNativeButton/);
  });
});
