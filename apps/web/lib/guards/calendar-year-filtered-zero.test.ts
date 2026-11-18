import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE = readFileSync(
  join(__dirname, "..", "..", "app", "[locale]", "dashboard", "planning", "page.tsx"),
  "utf8",
);
const YEAR = PAGE.slice(PAGE.indexOf("YEAR ----"), PAGE.indexOf("AGENDA ----"));

describe("the year overview never says 'no records' where a filter merely hides them", () => {
  it("a zero under an active source filter names the TYPE that is absent", () => {
    // Owner walk 2026-10-01: ?source=<type> made every year tile read "no
    // records" while the month it opens still drew the journal's hours and
    // marks from the full model.
    expect(YEAR).toMatch(/m\.count === 0 && sourceFilter/);
    expect(YEAR).toMatch(/t\("emptyFiltered"\)/);
  });

  it("an unfiltered zero keeps the plain count line", () => {
    expect(YEAR).toMatch(/t\("year\.count", \{ count: m\.count \}\)/);
  });

  it("an active filter is announced with both counts and a way out", () => {
    expect(PAGE).toMatch(/data-testid="planning-filter-active"/);
    expect(PAGE).toMatch(/t\("filterActive", \{/);
    expect(PAGE).toMatch(/itemsInRange\(result\.items\)/);
    expect(PAGE).toMatch(/itemsInRange\(visibleItems\)/);
    expect(PAGE).toMatch(/data-testid="planning-filter-clear"/);
  });
});
