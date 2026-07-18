import { describe, expect, it } from "vitest";

import { buildStageGantt } from "@/lib/projects/stage-gantt";
import type { ProjectStage, StageStatus } from "@/lib/projects/stages-model";

/**
 * Wagon 6 — Gantt projection guard. The Gantt is a PURE projection over
 * project_stages: deterministic bar geometry from real dates, a today marker,
 * an overdue flag, and NO fabricated completion percentage.
 */

function stage(p: Partial<ProjectStage> & { id: string }): ProjectStage {
  return {
    id: p.id,
    name: p.name ?? p.id,
    stageOrder: p.stageOrder ?? 0,
    status: (p.status ?? "planned") as StageStatus,
    plannedStart: p.plannedStart ?? null,
    plannedEnd: p.plannedEnd ?? null,
    actualStart: p.actualStart ?? null,
    actualEnd: p.actualEnd ?? null,
    blockedReason: p.blockedReason ?? null,
    completionCriteria: p.completionCriteria ?? null,
  };
}

describe("buildStageGantt", () => {
  it("returns no timeline when no stage carries a date", () => {
    const g = buildStageGantt([stage({ id: "a" }), stage({ id: "b" })], "2026-08-10");
    expect(g.hasTimeline).toBe(false);
  });

  it("computes a window and bar geometry from real dates", () => {
    const g = buildStageGantt(
      [
        stage({ id: "s1", plannedStart: "2026-08-01", plannedEnd: "2026-08-11" }),
        stage({ id: "s2", plannedStart: "2026-08-11", plannedEnd: "2026-08-21" }),
      ],
      "2026-08-06",
    );
    expect(g.hasTimeline).toBe(true);
    if (!g.hasTimeline) return;
    expect(g.windowStart).toBe("2026-08-01");
    expect(g.windowEnd).toBe("2026-08-21");
    expect(g.bars).toHaveLength(2);
    // s1 starts at the window origin.
    expect(g.bars[0].offsetPct).toBeCloseTo(0, 3);
    // s2 starts halfway (10 of 20 days).
    expect(g.bars[1].offsetPct).toBeCloseTo(50, 3);
    // today (Aug 6) is 5/20 = 25% into the window.
    expect(g.todayPct).toBeCloseTo(25, 3);
  });

  it("flags overdue only for a past end that is not done/cancelled", () => {
    const g = buildStageGantt(
      [
        stage({ id: "late", plannedStart: "2026-08-01", plannedEnd: "2026-08-05", status: "in_progress" }),
        stage({ id: "finished", plannedStart: "2026-08-01", plannedEnd: "2026-08-05", status: "done" }),
        stage({ id: "future", plannedStart: "2026-08-20", plannedEnd: "2026-08-25", status: "planned" }),
      ],
      "2026-08-10",
    );
    if (!g.hasTimeline) throw new Error("expected timeline");
    const byId = Object.fromEntries(g.bars.map((b) => [b.id, b]));
    expect(byId.late.overdue).toBe(true);
    expect(byId.finished.overdue).toBe(false);
    expect(byId.future.overdue).toBe(false);
  });

  it("prefers actual dates over planned and never emits a percentage field", () => {
    const g = buildStageGantt(
      [stage({ id: "s", plannedStart: "2026-08-01", plannedEnd: "2026-08-10", actualStart: "2026-08-03" })],
      "2026-08-15",
    );
    if (!g.hasTimeline) throw new Error("expected timeline");
    expect(g.bars[0].start).toBe("2026-08-03");
    // Geometry keys only — no progress/percent leaks into the bar contract.
    expect(Object.keys(g.bars[0])).not.toContain("progress");
    expect(Object.keys(g.bars[0])).not.toContain("percent");
  });

  it("today outside the window yields a null marker", () => {
    const g = buildStageGantt(
      [stage({ id: "s", plannedStart: "2026-08-01", plannedEnd: "2026-08-05" })],
      "2026-09-01",
    );
    if (!g.hasTimeline) throw new Error("expected timeline");
    expect(g.todayPct).toBeNull();
  });
});
