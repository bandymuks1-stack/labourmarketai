import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { findRecentDuplicateEntry } from "./journal-write-core";

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
  function sb(result: { data: unknown; error: unknown } | "throw") {
    const calls: string[] = [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "order", "limit"]) {
      b[m] = () => (calls.push(m), b);
    }
    b.maybeSingle = async () => {
      if (result === "throw") throw new Error("x");
      return result;
    };
    return { client: { from: () => b } as never, calls };
  }
  const q = { workerId: "w", engagementId: "e", originalText: "t" };

  it("returns the id of an identical recent entry", async () => {
    const { client, calls } = sb({ data: { id: "entry-1" }, error: null });
    expect(await findRecentDuplicateEntry(client, q)).toBe("entry-1");
    expect(calls).toContain("gte");
  });
  it("returns null when nothing matches, on a read error, and on a throw", async () => {
    expect(await findRecentDuplicateEntry(sb({ data: null, error: null }).client, q)).toBeNull();
    expect(
      await findRecentDuplicateEntry(sb({ data: null, error: { message: "e" } }).client, q),
    ).toBeNull();
    expect(await findRecentDuplicateEntry(sb("throw").client, q)).toBeNull();
  });
  it("the create path consults it before the RPC", () => {
    const at = src.indexOf("findRecentDuplicateEntry(supabase");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(src.indexOf('"create_journal_entry_full", rpcParams'));
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
