import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * JOURNAL ↔ CALENDAR ↔ PLAYER CARD ↔ LIVING CV — ONE SYSTEM (owner
 * decision 2026-09-29 item 5). One fact, one source, several projections,
 * and a door from each projection to the surface that owns the fact.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const CARD = read("components/app/worker-player-card.tsx");
const CV = read("app/[locale]/cv/page.tsx");
const WEEK = read("components/app/planning/work-week.tsx");
const DAY = read("components/app/planning/work-day.tsx");
const JOURNAL = read("app/[locale]/dashboard/journal/page.tsx");

describe("every projection has a door to the surface that owns its facts", () => {
  it("card: WORK → calendar week, RECORDS → journal, HISTORY → Living CV, NEXT → opportunities", () => {
    expect(CARD).toContain('door("/dashboard/planning?view=week", "player-card-work-calendar"');
    expect(CARD).toContain('door("/dashboard/journal#journal-entries", "player-card-records-journal"');
    expect(CARD).toContain('door("/cv#cv-work-history", "player-card-history-cv"');
    expect(CARD).toContain("player-card-next-opportunities");
    // the public sample card never leads into /dashboard
    expect(CARD).toMatch(/const door = \(href: string, testid: string, text: string\) =>\s*sample \? null/);
  });

  it("Living CV: a confirmation leads to the day of the work it confirms", () => {
    expect(CV).toContain("/dashboard/journal?date=${c.entryDate.slice(0, 10)}#journal-entries");
  });

  it("calendar week and day lead to the same day in the journal; the journal leads back to the calendar day", () => {
    expect(WEEK).toContain("/dashboard/journal?date=${d.day}#journal-entries");
    expect(DAY).toContain("/dashboard/journal?date=${day.day}#journal-entries");
    expect(JOURNAL).toContain("/dashboard/planning?view=day&date=${selectedDate}");
  });
});
