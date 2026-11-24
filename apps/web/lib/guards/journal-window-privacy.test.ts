import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Privacy floor of the V8 employer daily-loop reads (GAP 2 + GAP 4).
 *
 * Two modules, two rules — both enforced at the SOURCE, because "we fetch it
 * and don't render it" leaks the moment any component changes and puts the
 * value in a server payload regardless:
 *
 *  1. `lib/journal/journal-window-report.ts` is an AGGREGATE report — counts
 *     and timestamps only. It must never select the entry text
 *     (`original_text`), and it must not reach for the pending-review RPC:
 *     that RPC answers "what waits on me NOW" (a queue), not "what happened
 *     in this window" (history) — using it here would silently undercount
 *     every already-reviewed entry.
 *
 *  2. `lib/planning/organization-today.ts` composes the minimised
 *     availability read. The absence reason (`note`, free text) and the type
 *     (`absence_type`, which includes sickness — health information) must
 *     never be named, so no later convenience read can widen the panel.
 */

const APP = resolve(__dirname, "..", "..");
const read = (rel: string): string =>
  readFileSync(resolve(APP, ...rel.split("/")), "utf8");
/** Strip comments so the scans pin CODE, not the docstrings that honestly
 *  name the forbidden patterns (the universal-search guard's own rule). */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("journal-window-report — aggregate only, right tool for history", () => {
  const src = code(read("lib/journal/journal-window-report.ts"));

  it("never selects or names the entry text", () => {
    expect(src).not.toContain("original_text");
  });

  it("does not use the pending-review queue RPC for a historical window", () => {
    expect(src).not.toContain("reviewable_journal_entry_ids");
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it("touches no absence table and no absence column", () => {
    expect(src).not.toContain("worker_absences");
    expect(src).not.toContain("absence_type");
  });

  it("stays an ordinary authenticated read — no privileged client", () => {
    expect(src).not.toMatch(/service_role|createAdminClient|supabase\/admin/);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });
});

describe("organization-today — composes minimised reads, never widens them", () => {
  const src = code(read("lib/planning/organization-today.ts"));

  it("never names the private absence columns", () => {
    expect(src).not.toMatch(/["']absence_type["']/);
    expect(src).not.toMatch(/\bnote\b\s*:/);
  });

  it("issues no table read of its own — reuse only", () => {
    // Every fact arrives through an existing minimised helper; a direct
    // `.from(...)` here would be a second, unguarded query path.
    expect(src).not.toMatch(/\.from\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });

  it("stays an ordinary authenticated read — no privileged client", () => {
    expect(src).not.toMatch(/service_role|createAdminClient|supabase\/admin/);
  });
});
