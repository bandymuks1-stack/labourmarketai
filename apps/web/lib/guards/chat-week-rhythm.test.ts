import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAT CONTROLS, WORKSPACE VISUALIZES (owner command 2026-09-29 §20–§21).
 * "Parodyk mano kalendorių" opens the calendar panel; the panel now leads
 * with THIS WEEK's work rhythm — the same `buildWorkRhythm` the calendar
 * week draws, over the same single planning read — so the answer to "what
 * did I work this week" is visual, not a paragraph.
 */
const ROOT = join(__dirname, "..", "..");
const LOADER = readFileSync(join(ROOT, "lib/planning/calendar-result.ts"), "utf8");
const PANEL = readFileSync(join(ROOT, "components/app/workspace/calendar-result.tsx"), "utf8");

describe("chat calendar panel — this week's rhythm", () => {
  it("the loader builds the week with THE rhythm model from its one planning read", () => {
    expect(LOADER).toMatch(/buildWorkRhythm\(\{/);
    expect(LOADER.match(/getPlanning\(/g)?.length).toBe(1);
    expect(LOADER).toMatch(/confirmedIds: planning\.journalConfirmedIds/);
  });

  it("the agenda answer is unchanged: built from the items its old window saw", () => {
    expect(LOADER).toMatch(/\(it\.endDate \?\? it\.startDate\) >= range\.start/);
    expect(LOADER).toMatch(/buildAgenda\(agendaItems,/);
  });

  it("the panel draws the strip in both the ready and the empty state", () => {
    expect(PANEL.match(/<WeekStrip week=\{view\.week\}/g)?.length).toBe(2);
    expect(PANEL).toContain('data-testid="calendar-result-week"');
  });
});
