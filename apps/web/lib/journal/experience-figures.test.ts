import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { experienceFiguresOf } from "@/lib/journal/experience-figures";
import { buildIdentityFacts } from "@/lib/player-card/identity-facts";

describe("experienceFiguresOf", () => {
  it("no reading → both unknown, never 0", () => {
    expect(experienceFiguresOf(null, null)).toEqual({ organizationHistoryHours: null, professionalExperienceHours: null });
    expect(experienceFiguresOf(undefined, [])).toEqual({ organizationHistoryHours: null, professionalExperienceHours: null });
  });

  it("unreadable relationships → the total is unknown, never an unattributed (double-counting) sum", () => {
    const src = readFileSync(join(__dirname, "experience-figures.ts"), "utf8");
    expect(src).toMatch(/relationships == null\s*\?\s*null/);
  });
});

describe("a truncated journal read withholds the experience total (not a reliable lower bound)", () => {
  const t = (k: string) => k;
  const allTime = { hours: 25, confirmedHours: 0, daysWorked: 3 } as never;
  it("no total when the read was truncated", () => {
    const facts = buildIdentityFacts({
      allTime,
      truncated: true,
      locale: "en",
      t,
      organizationHistoryHours: 800,
      professionalExperienceHours: 825,
    });
    expect(facts.find((f) => f.testid === "player-card-fact-experience-total")).toBeUndefined();
  });
  it("an exact total when the read was complete", () => {
    const facts = buildIdentityFacts({
      allTime,
      truncated: false,
      locale: "en",
      t,
      organizationHistoryHours: 800,
      professionalExperienceHours: 825,
    });
    expect(facts.find((f) => f.testid === "player-card-fact-experience-total")?.value).toBe("825");
  });
});
