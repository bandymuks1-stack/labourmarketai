/**
 * BOOKING INERT — permanent CI guard (Step 4B).
 *
 * The booking module is a typed decision-prep only: it must stay PURE and
 * INERT until the owner approves the persistence design. This guard fails the
 * build if it grows IO/DB/network, or if any page/route starts importing it
 * (which would imply a live, un-persisted feature).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const APP = resolve(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

describe("booking module is pure + inert", () => {
  const src = read("lib/booking/booking-state.ts");

  it("imports nothing (no supabase/server/network)", () => {
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/supabase|createClient|server-only|fetch\(|http/i);
  });

  it("performs no DB mutation/query", () => {
    expect(src).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.select\(/);
  });

  it("no migration file ships with this decision-prep", () => {
    const migs = resolve(APP, "..", "..", "supabase", "migrations");
    const hasBooking = readdirSync(migs).some((f) => /booking/i.test(f));
    expect(hasBooking).toBe(false);
  });
});

describe("booking module is not yet wired into any route/page", () => {
  // Walk app/ + components/ and assert nothing imports lib/booking yet.
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p);
    }
    return out;
  }
  it("no app/ or components/ file imports lib/booking", () => {
    const files = [...walk(join(APP, "app")), ...walk(join(APP, "components"))];
    const importers = files.filter((f) => /from\s+["']@\/lib\/booking|from\s+["'][^"']*lib\/booking/.test(readFileSync(f, "utf8")));
    expect(importers, `unexpected importers: ${importers.join(", ")}`).toHaveLength(0);
  });
});
