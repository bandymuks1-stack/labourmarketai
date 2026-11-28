import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ONE EMPTY STATE ON AN EMPTY JOURNAL (owner P0 2026-11-23). A journal with
 * no entry at all said so three times in a row: under the calendar ("no
 * entries in this period"), in the list's empty state, and in the numbers
 * card ("no recorded work yet"). The list's empty state carries the action
 * and speaks alone; the other two return with the first entry. The signal is
 * the model's own (`dominantAnswer(...).kind === "no_entries"`), not a second
 * count.
 */
const web = join(__dirname, "..", "..");
const page = readFileSync(join(web, "app/[locale]/dashboard/journal/page.tsx"), "utf8");
const calendar = readFileSync(join(web, "components/app/journal/journal-calendar.tsx"), "utf8");

describe("an empty journal says it is empty once", () => {
  it("the page reads 'no entries at all' from the numbers model", () => {
    expect(page).toMatch(/const journalHasNoEntries = dominantAnswer\(workIntelligence, \[\]\)\.kind === "no_entries";/);
  });
  it("the numbers card is left out when there is no entry at all", () => {
    expect(page).toMatch(/if \(answer\.kind === "no_entries"\) return null;/);
  });
  it("the calendar is told, and stays quiet only when it has nothing recorded or reported", () => {
    expect(page).toMatch(/quietWhenEmpty=\{journalHasNoEntries\}/);
    expect(calendar).toMatch(/quietWhenEmpty && grid\.recordedDays === 0 && grid\.reportedDays === 0 \? null : \(/);
  });
  it("the list's empty state, with its action, stays", () => {
    expect(page).toContain('testId="journal-empty-state"');
    expect(page).toContain('data-testid="journal-day-empty"');
  });
});
