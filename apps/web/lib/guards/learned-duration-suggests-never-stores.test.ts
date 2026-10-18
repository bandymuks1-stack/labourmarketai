import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CAL-10 — the reading now reaches the next plan, and must not become one.
 *
 * The learned durations were already read and already shown beside each
 * finished stage. Nothing carried them to the moment a planner types the NEXT
 * stage, so the loop stopped at observation and the register said so.
 *
 * The rule: SUGGEST, never prefill. A plan is a commitment the organization
 * is held to, and an auto-filled median becomes a stored forecast the instant
 * the row saves (SEP-1). The planner clicks or ignores; what lands in the
 * record is their decision.
 */
const APP = join(__dirname, "..", "..");
const SRC = readFileSync(
  join(APP, "components/app/project-stages-panel.tsx"),
  "utf8",
);
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ");

describe("1. it suggests and does not fill", () => {
  it("the suggestion is offered, never written into state automatically", () => {
    expect(code).toMatch(/data-testid="project-stage-duration-suggestion"/);
    // setPlannedEnd from the suggestion happens ONLY in an onClick.
    const applies = [...code.matchAll(/setPlannedEnd\(suggestion\.endDate\)/g)];
    expect(applies).toHaveLength(1);
    expect(code).toMatch(/onClick=\{\(\) => setPlannedEnd\(suggestion\.endDate\)\}/);
  });

  it("no effect or initialiser seeds plannedEnd from the reading", () => {
    expect(code).not.toMatch(/useEffect\([^)]*setPlannedEnd/);
    expect(code).not.toMatch(/useState\(\s*suggestion/);
  });
});

describe("2. it only speaks when it actually knows something", () => {
  it("requires a typed name AND a planned start", () => {
    expect(code).toMatch(/typed\.length === 0 \|\| plannedStart === ""/);
  });

  it("requires a real median — never invents one from nothing", () => {
    expect(code).toMatch(/reading\.medianActualDays === null/);
  });

  it("uses the inclusive day span, so a one-day stage ends the day it starts", () => {
    expect(code).toMatch(/reading\.medianActualDays - 1/);
  });
});

describe("3. the copy says what it is", () => {
  it("names the observation count so the planner can weigh it", () => {
    const en = JSON.parse(readFileSync(join(APP, "messages/en.json"), "utf8")) as {
      projectStages?: { learned: Record<string, string> };
      stages?: { learned: Record<string, string> };
    };
    const learned = (en.projectStages ?? en.stages)!.learned;
    expect(learned.suggest).toMatch(/\{observations\}/);
    expect(learned.suggest).toMatch(/\{days\}/);
    // It reports what comparable stages TOOK — past tense, a reading.
    expect(learned.suggest).toMatch(/took/i);
  });
});
