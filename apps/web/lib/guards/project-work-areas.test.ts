import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { groupWorkAreas, UNKNOWN_WORK_AREA } from "@/lib/projects/work-areas";

/**
 * PEOPLE AROUND THE WORK (owner command 2026-09-29 §13): the project page
 * groups its team into work areas by each person's PRIMARY profession —
 * the fact the stadium already reads — never a trade guessed onto an
 * assignment, never a score.
 */
const ROOT = join(__dirname, "..", "..");
const PAGE = readFileSync(join(ROOT, "app/[locale]/dashboard/projects/[id]/page.tsx"), "utf8");

const w = (id: string) => ({ workerId: id });
const labels: Record<string, string> = { scaffolder: "Pastolininkas", "concrete-worker": "Betonuotojas", electrician: "Elektrikas" };

describe("groupWorkAreas", () => {
  const positions = new Map<string, string | null>([
    ["a", "scaffolder"], ["b", "scaffolder"], ["c", "scaffolder"],
    ["d", "concrete-worker"], ["e", "concrete-worker"],
    ["f", "electrician"],
    ["g", null],
  ]);
  const areas = groupWorkAreas({
    workers: ["a", "b", "c", "d", "e", "f", "g", "h"].map(w),
    positions,
    labelOf: (s) => labels[s] ?? s,
    unknownLabel: "Profesija nenurodyta",
  });

  it("groups by primary profession, largest first, unknown last", () => {
    expect(areas.map((a) => [a.label, a.workers.length])).toEqual([
      ["Pastolininkas", 3],
      ["Betonuotojas", 2],
      ["Elektrikas", 1],
      ["Profesija nenurodyta", 2],
    ]);
    expect(areas.at(-1)?.key).toBe(UNKNOWN_WORK_AREA);
  });

  it("every person appears exactly once — nobody is dropped or duplicated", () => {
    expect(areas.flatMap((a) => a.workers.map((x) => x.workerId)).sort()).toEqual(
      ["a", "b", "c", "d", "e", "f", "g", "h"],
    );
  });

  it("an empty team is no areas", () => {
    expect(groupWorkAreas({ workers: [], positions, labelOf: String, unknownLabel: "?" })).toEqual([]);
  });
});

describe("the project page", () => {
  it("draws the formation from the grouped areas and says what they are based on", () => {
    expect(PAGE).toMatch(/groupWorkAreas\(\{/);
    expect(PAGE).toContain('data-testid="stadium-formation"');
    expect(PAGE).toMatch(/t\("areaBasis"\)/);
  });

  it("the selected area is URL state, and an unknown ?area= falls back to all", () => {
    expect(PAGE).toMatch(/areas\.some\(\(a\) => a\.key === rawArea\)/);
  });

  it("the field comes before location and communication", () => {
    expect(PAGE.indexOf('data-testid="stadium-field"')).toBeLessThan(PAGE.indexOf('data-testid="project-location"'));
  });
});
