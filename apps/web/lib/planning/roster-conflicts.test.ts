import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/workforce/workforce", () => ({ getWorkforce: vi.fn() }));
vi.mock("@/lib/planning/roster-commitments", () => ({ getRosterCommitments: vi.fn() }));
vi.mock("@/lib/planning/employer-availability", () => ({ getEmployerWorkerAvailability: vi.fn() }));
vi.mock("@/lib/time/viewer-day", () => ({ viewerWorkToday: vi.fn() }));

import { countPeopleWithConflicts } from "./roster-conflicts";
import { buildRosterTimeline } from "./roster-timeline-model";

const row = (overlaps: number, workerId = `w${overlaps}`, commitments: { kind: "project" | "plan"; sourceId: string; label: string | null; startDate: string | null; endDate: string | null; conflict: boolean }[] = []) =>
  ({ workerId, workerName: null, commitments, overlaps, undatedProjects: [] });

describe("the company home's conflict count is the planning page's flagged people", () => {
  it("counts people with at least one overlapping pair, not pairs", () => {
    expect(countPeopleWithConflicts({ status: "ok", rows: [row(0), row(1), row(3)], withoutCommitment: 2 }, null)).toBe(2);
    expect(countPeopleWithConflicts({ status: "ok", rows: [], withoutCommitment: 5 }, null)).toBe(0);
  });
  it("a plan on a day of approved leave counts (the calendar walk's collision), once per person", () => {
    const plan = { kind: "plan" as const, sourceId: "p1", label: "Objektas", startDate: "2026-10-14", endDate: "2026-10-14", conflict: false };
    const rows = [row(0, "w-leave", [plan])];
    const timeline = buildRosterTimeline({
      rows,
      absences: [{ workerId: "w-leave", workerName: null, sourceId: "a1", startDate: "2026-10-14", endDate: "2026-10-14" }],
      from: "2026-10-12",
      days: 28,
      today: "2026-10-13",
    });
    expect(countPeopleWithConflicts({ status: "ok", rows, withoutCommitment: 0 }, timeline)).toBe(1);
    // Leave on another day: no conflict.
    const calm = buildRosterTimeline({
      rows,
      absences: [{ workerId: "w-leave", workerName: null, sourceId: "a1", startDate: "2026-10-20", endDate: "2026-10-20" }],
      from: "2026-10-12",
      days: 28,
      today: "2026-10-13",
    });
    expect(countPeopleWithConflicts({ status: "ok", rows, withoutCommitment: 0 }, calm)).toBe(0);
  });
  it("an unreadable view is unknown, never zero", () => {
    expect(countPeopleWithConflicts({ status: "error" } as never, null)).toBeNull();
  });
});

describe("the home links straight to the flagged list", () => {
  const root = join(__dirname, "..", "..");
  it("decision `conflicts` → planning#roster-timeline, and the timeline carries that id", () => {
    const home = readFileSync(join(root, "app/[locale]/dashboard/company/page.tsx"), "utf8");
    expect(home).toContain('key: "conflicts"');
    expect(home).toContain("/dashboard/company/planning#roster-timeline");
    const planning = readFileSync(join(root, "app/[locale]/dashboard/company/planning/page.tsx"), "utf8");
    expect(planning).toContain('id="roster-timeline"');
  });
  it("the label exists in every active locale", () => {
    for (const loc of ["en", "lt", "de", "nl", "pl", "ru"]) {
      const m = JSON.parse(readFileSync(join(root, `messages/${loc}.json`), "utf8"));
      expect(m.roleDashboards.company.decisions.conflicts, loc).toBeTruthy();
    }
  });
});
