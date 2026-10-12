import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/workforce/workforce", () => ({ getWorkforce: vi.fn() }));
vi.mock("@/lib/planning/roster-commitments", () => ({ getRosterCommitments: vi.fn() }));

import { countPeopleWithConflicts } from "./roster-conflicts";

const row = (overlaps: number) => ({ workerId: `w${overlaps}`, workerName: null, commitments: [], overlaps, undatedProjects: [] });

describe("the company home's conflict count is the planning page's flagged people", () => {
  it("counts people with at least one overlapping pair, not pairs", () => {
    expect(countPeopleWithConflicts({ status: "ok", rows: [row(0), row(1), row(3)], withoutCommitment: 2 })).toBe(2);
    expect(countPeopleWithConflicts({ status: "ok", rows: [], withoutCommitment: 5 })).toBe(0);
  });
  it("an unreadable view is unknown, never zero", () => {
    expect(countPeopleWithConflicts({ status: "error" } as never)).toBeNull();
  });
});

describe("the home links straight to the flagged list", () => {
  const root = join(__dirname, "..", "..");
  it("decision `conflicts` → planning#roster-commitments, and the section carries that id", () => {
    const home = readFileSync(join(root, "app/[locale]/dashboard/company/page.tsx"), "utf8");
    expect(home).toContain('key: "conflicts"');
    expect(home).toContain("/dashboard/company/planning#roster-commitments");
    const planning = readFileSync(join(root, "app/[locale]/dashboard/company/planning/page.tsx"), "utf8");
    expect(planning).toContain('id="roster-commitments"');
  });
  it("the label exists in every active locale", () => {
    for (const loc of ["en", "lt", "de", "nl", "pl", "ru"]) {
      const m = JSON.parse(readFileSync(join(root, `messages/${loc}.json`), "utf8"));
      expect(m.roleDashboards.company.decisions.conflicts, loc).toBeTruthy();
    }
  });
});
