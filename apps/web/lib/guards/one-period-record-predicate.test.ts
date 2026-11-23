import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ONE "IS THIS A PERIOD RECORD?" PREDICATE (owner P0 2026-11-23, #3679;
 * SIMPLIFICATION_PLAN M9, DUPLICATION_AUDIT CV-20).
 *
 * A period record states a start and an end, but no single work day. Its hours
 * never join day hours (`lib/organization-evidence/person-hours.ts`). The rule
 * lives in one place, `isPeriodRecord` in
 * `lib/organization-evidence/company-work-history.ts`. Every reader imports it,
 * so no copy can drift.
 */

const WEB = join(__dirname, "..", "..");
const CANONICAL = "lib/organization-evidence/company-work-history.ts";
const PREDICATE = /activityDate\s*===\s*null\s*&&\s*\w+\.periodStart\s*!==\s*null\s*&&\s*\w+\.periodEnd\s*!==\s*null/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const SOURCES = ["app", "lib", "components"].flatMap((d) => walk(join(WEB, d)));

describe("one period-record predicate (CV-20)", () => {
  it("the predicate is written only in company-work-history.ts", () => {
    const copies = SOURCES.map((p) => relative(WEB, p)).filter(
      (rel) => rel !== CANONICAL && !rel.includes("/guards/") && PREDICATE.test(readFileSync(join(WEB, rel), "utf8")),
    );
    expect(copies, "Import isPeriodRecord from company-work-history.ts instead of writing the check again.").toEqual([]);
    expect(PREDICATE.test(readFileSync(join(WEB, CANONICAL), "utf8")), "the canonical predicate is found").toBe(true);
  });

  it("the person-history summary uses the shared predicate", () => {
    const src = readFileSync(join(WEB, "lib/organization-evidence/person-history-summary.ts"), "utf8");
    expect(src).toMatch(/import\s*\{[^}]*\bisPeriodRecord\b[^}]*\}\s*from\s*"\.\/company-work-history"/);
  });
});
