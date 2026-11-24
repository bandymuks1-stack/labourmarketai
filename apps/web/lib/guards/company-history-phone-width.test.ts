import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * P0 2026-11-24 (Living CV run 45401396990): /dashboard/company/history
 * scrolled sideways at 375 / 390 px. Its lists were `grid` with no base
 * column template, so the single track was sized by min-content and a
 * truncated (nowrap) project title or place name widened it to 538-702 px.
 *
 * Every grid in the company history must name its phone column template
 * (`grid-cols-1` = `minmax(0, 1fr)`), and the list items and their links
 * must be allowed to shrink (`min-w-0`). The browser proof is EX-5's
 * "no sideways scrolling" check at 375 px with a long project title.
 */
const SRC = readFileSync(join(__dirname, "../../components/app/organization/company-work-history.tsx"), "utf8");

const PERSON = readFileSync(join(__dirname, "../../components/app/organization/person-history-summary.tsx"), "utf8");

describe("the historical person card fits a 375 px screen (coordinator 2026-11-24)", () => {
  it("every grid names an unprefixed column template", () => {
    const grids = [...PERSON.matchAll(/className="([^"]*\bgrid\b[^"]*)"/g)].map((m) => m[1]!);
    expect(grids.length).toBeGreaterThan(0);
    for (const cls of grids) expect(cls.split(/\s+/).some((t) => /^grid-cols-/.test(t)), cls).toBe(true);
  });
  it("place items and their cards may shrink; descriptions wrap", () => {
    expect(PERSON).toContain('<li key={p.key} className="min-w-0">');
    expect(PERSON).toContain('className="flex min-w-0 flex-col gap-2"');
    expect(PERSON).toMatch(/<li key=\{w\.text\} className="break-words /);
  });
});

describe("company history fits a 375 px screen", () => {
  it("every grid names an unprefixed column template", () => {
    const grids = [...SRC.matchAll(/className="([^"]*\bgrid\b[^"]*)"/g)].map((m) => m[1]!);
    expect(grids.length).toBeGreaterThan(0);
    for (const cls of grids) {
      const toks = cls.split(/\s+/);
      expect(toks.some((t) => /^grid-cols-/.test(t)), cls).toBe(true);
    }
  });

  it("place and project list items, and their links, may shrink", () => {
    expect(SRC).toContain('<li key={p.key} className="min-w-0">');
    expect(SRC).toContain('<li key={p.id} className="min-w-0">');
    expect(SRC).toMatch(/className="flex min-h-11 min-w-0 [^"]*"\s+data-testid="company-work-history-project"/);
    expect(SRC).toMatch(/className="group flex h-full min-w-0 [^"]*"/);
  });

  it("EX-5 keeps a long project title in its 375 px no-sideways-scrolling check", () => {
    const spec = readFileSync(join(__dirname, "../../tests/e2e/experience-integration-isolated.spec.ts"), "utf8");
    expect(spec).toContain('"a-very-long-unbroken-project-title-".repeat(4)');
    expect(spec).toMatch(/no sideways scrolling`\)\.toBeLessThanOrEqual\(1\)/);
  });
});
