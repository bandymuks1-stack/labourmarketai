import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE CALENDAR IS A CLEAN TEMPORAL VIEW OF CANONICAL FACTS (owner production
 * walk 2026-09-28: "a previous Calendar was reasonably good, the current one
 * is unacceptable" — the page narrated its own backlog, e.g. „Darbuotojo
 * projektų grafikas atsiras, kai toks vaizdas bus sukurtas.").
 *
 * What made it bad was never its data: every source stays. It was copy about
 * how the page is built, competing controls, and a timesheet screen appended
 * underneath. This guard pins the human contract so the page cannot drift
 * back into an explanation page while every test stays green:
 *
 *   1. it opens on the month grid (the "good calendar" the owner remembered
 *      was the journal's month grid — hours on the date);
 *   2. it says nothing about sources that are not built / not switched on /
 *      manager-only, and no explanatory paragraph sits over the grid;
 *   3. journal work is still projected onto its day (one fact, two views —
 *      the 9 h entry on 2026-09-27 appears on the 27th, no second record);
 *   4. timesheets are folded, not removed.
 */
const web = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(web, p), "utf8");
const PAGE = read("app/[locale]/dashboard/planning/page.tsx");
const LOADER = read("lib/planning/planning.ts");

describe("the calendar opens on the month grid", () => {
  it("month is the default view; the agenda stays one tap away", () => {
    expect(PAGE).toMatch(/isPlanningView\(rawView\) \? rawView : "month"/);
    expect(PAGE).toContain("planning-view-${v}");
  });
});

describe("no backlog, no explanation over the grid", () => {
  it("no intro paragraph, no eyebrow, no 'how this is built' hints", () => {
    for (const key of ['t("intro")', 't("eyebrow")', 't("month.hint")', 't("undated.hint")', 't("workload.note")']) {
      expect(PAGE, key).not.toContain(key);
    }
  });

  it("no future-feature / not-switched-on / managers-only notes, in the page or in any catalogue", () => {
    expect(PAGE).not.toMatch(/Unavailable"|projectManagersOnly/);
    for (const locale of ["lt", "en", "de", "nl", "pl", "ru"]) {
      const notes = (
        JSON.parse(read(`messages/${locale}.json`)) as {
          planning: { sourceNotes: Record<string, string> };
        }
      ).planning.sourceNotes;
      // Only failure notes remain in the calendar's catalogue.
      for (const key of Object.keys(notes)) expect(key, `${locale}: ${key}`).toMatch(/Error$/);
    }
    expect(read("messages/lt.json")).not.toContain("kai toks vaizdas bus sukurtas");
  });

  it("a failed read is still stated — honesty is kept, only backlog went", () => {
    expect(PAGE).toContain("planning-source-note-journal-error");
  });

  it("a worker whose own project read succeeded is never told projects are managers-only", () => {
    expect(LOADER).toMatch(
      /managed\.state\.status === "managers-only" &&\s*assigned\.state\.status !== "ok"\s*\?/,
    );
  });
});

describe("journal work stays on its day — one fact, two views", () => {
  it("the calendar composes the journal projection, never a second hour store", () => {
    expect(LOADER).toMatch(/readJournalItems/);
    expect(LOADER).toMatch(/\.\.\.journal\.items/);
  });
});

describe("timesheets are folded, not removed", () => {
  it("the timesheet section is still mounted, inside a fold", () => {
    expect(PAGE).toMatch(/<details[\s\S]{0,300}id="timesheets"[\s\S]{0,800}<TimesheetsSection/);
  });
});
