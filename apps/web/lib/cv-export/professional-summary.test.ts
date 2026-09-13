import { describe, expect, it } from "vitest";
import type { WorkIntelligence } from "@/lib/journal/work-intelligence";
import { deriveProfessionalFacts, percentOf, roundHours } from "./professional-summary";

/** Only the fields the derivation reads — the real reader fills the rest. */
function wi(over: Partial<WorkIntelligence>): WorkIntelligence {
  const base = {
    focus: "all",
    periods: [
      { key: "all", startIso: null, endIso: "2026-09-13", hours: 128.25, confirmedHours: 40, entries: 14 },
    ],
    skills: [],
    activities: [],
    contexts: [],
    months: [],
    outputs: [],
    totalHours: 128.25,
    totalEntries: 14,
  };
  return { ...base, ...over } as unknown as WorkIntelligence;
}

describe("professional facts — derived only from the canonical reading", () => {
  it("unreadable journal → null (unknown ≠ zero); empty journal → null", () => {
    expect(deriveProfessionalFacts(null)).toBeNull();
    expect(
      deriveProfessionalFacts(
        wi({
          periods: [{ key: "all", startIso: null, endIso: "2026-09-13", hours: 0, confirmedHours: 0, entries: 0 }] as never,
          totalHours: 0,
          totalEntries: 0,
        }),
      ),
    ).toBeNull();
  });

  it("carries hours, confirmed part, entries, span and context count as they are", () => {
    const f = deriveProfessionalFacts(
      wi({
        months: [
          { month: "2025-03", hours: 10, confirmedHours: 0, entries: 2 },
          { month: "2026-09", hours: 8, confirmedHours: 8, entries: 1 },
        ],
        contexts: [
          { engagementContextId: "a", hours: 100, confirmedHours: 40, entries: 10 },
          { engagementContextId: null, hours: 28.25, confirmedHours: 0, entries: 4 },
          { engagementContextId: "b", hours: 0, confirmedHours: 0, entries: 0 },
        ],
      }),
    )!;
    expect(f.hours).toBe(128.25);
    expect(f.confirmedHours).toBe(40);
    expect(f.entries).toBe(14);
    expect(f.firstMonth).toBe("2025-03");
    expect(f.lastMonth).toBe("2026-09");
    // a context with no entries is not "a place the person worked"
    expect(f.contexts).toBe(2);
  });

  it("top skills are the largest shares above the floor, at most three, desc", () => {
    const skill = (slug: string, share: number, attributedHours: number) =>
      ({ slug, share, attributedHours }) as never;
    const f = deriveProfessionalFacts(
      wi({
        skills: [
          skill("tiling", 0.62, 80),
          skill("plastering", 0.21, 27),
          skill("cleaning", 0.04, 5),
          skill("programming", 0.1, 13),
          skill("welding", 0.06, 8),
          skill("declared-only", 0, 0),
        ],
      }),
    )!;
    expect(f.topSkills.map((s) => s.slug)).toEqual(["tiling", "plastering", "programming"]);
    expect(f.topSkills[0]).toEqual({ slug: "tiling", share: 0.62, hours: 80 });
  });

  it("outputs keep their recorded unit and activity, largest first", () => {
    const f = deriveProfessionalFacts(
      wi({
        outputs: [
          { unit: "pcs", activity: null, value: 12, entries: 2 },
          { unit: "m2", activity: "tiler", value: 240, entries: 6 },
          { unit: "m", activity: "tiler", value: 0, entries: 1 },
        ],
      }),
    )!;
    expect(f.outputs).toEqual([
      { unit: "m2", value: 240, activity: "tiler" },
      { unit: "pcs", value: 12, activity: null },
    ]);
  });

  it("formatting helpers round without inventing precision", () => {
    expect(roundHours(128.25)).toBe(128.3);
    expect(roundHours(8)).toBe(8);
    expect(percentOf(0.62)).toBe(62);
  });
});
