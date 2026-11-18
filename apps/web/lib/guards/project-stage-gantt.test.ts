import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildActivityTimeline,
  buildStageGantt,
  personTimelineHref,
  stageTimelineHref,
  taskTimelineHref,
  type TimelineTaskInput,
} from "@/lib/projects/stage-gantt";
import {
  actualDateParams,
  localIsoDay,
  type ProjectStage,
  type StageStatus,
} from "@/lib/projects/stages-model";
import { hrefForSource } from "@/lib/planning/planning-model";

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

const P = "11111111-1111-4111-8111-111111111111";

function task(p: Partial<TimelineTaskInput> & { id: string }): TimelineTaskInput {
  return {
    id: p.id,
    title: p.title ?? p.id,
    status: p.status ?? "todo",
    dueAt: p.dueAt ?? null,
    assigneeProfileId: p.assigneeProfileId ?? null,
    stageId: p.stageId ?? null,
  };
}

function timeline(
  stages: ProjectStage[],
  tasks: TimelineTaskInput[],
  extra: Partial<Parameters<typeof buildActivityTimeline>[0]> = {},
) {
  return buildActivityTimeline({
    projectId: P,
    stages,
    tasks,
    waitingOnByTask: {},
    meProfileId: "me",
    people: [],
    memberNameByProfileId: new Map(),
    todayIso: "2026-08-10",
    ...extra,
  });
}

describe("buildActivityTimeline", () => {
  it("lists undated stages with hasDates=false instead of dropping them", () => {
    const tl = timeline(
      [
        stage({ id: "dated", plannedStart: "2026-08-01", plannedEnd: "2026-08-11" }),
        stage({ id: "undated" }),
      ],
      [],
    );
    expect(tl.stages.map((s) => s.id)).toEqual(["dated", "undated"]);
    expect(tl.stages[0].hasDates).toBe(true);
    expect(tl.stages[1].hasDates).toBe(false);
    expect(tl.stages[1].widthPct).toBe(0);
  });

  it("has no window but still lists rows when nothing is dated", () => {
    const tl = timeline([stage({ id: "a" })], [task({ id: "t" })]);
    expect(tl.window).toBeNull();
    expect(tl.stages).toHaveLength(1);
    expect(tl.unstagedTasks).toHaveLength(1);
    expect(tl.unstagedTasks[0].hasDates).toBe(false);
  });

  it("places a task marker at its due day without inventing a start", () => {
    const tl = timeline(
      [stage({ id: "s", plannedStart: "2026-08-01", plannedEnd: "2026-08-21" })],
      [task({ id: "t", dueAt: "2026-08-11T09:30:00Z" })],
    );
    const t = tl.unstagedTasks[0];
    expect(t.hasDates).toBe(true);
    expect(t.start).toBe("2026-08-11");
    expect(t.end).toBe("2026-08-11");
    expect(t.offsetPct).toBeCloseTo(50, 3);
  });

  it("widens the window to include a task due outside the stage dates", () => {
    const tl = timeline(
      [stage({ id: "s", plannedStart: "2026-08-01", plannedEnd: "2026-08-11" })],
      [task({ id: "t", dueAt: "2026-08-21" })],
    );
    expect(tl.window?.end).toBe("2026-08-21");
  });

  it("puts stage-less tasks in the explicit unstaged group; honours a stageId when present", () => {
    const tl = timeline(
      [stage({ id: "s1" })],
      [task({ id: "loose" }), task({ id: "nested", stageId: "s1" })],
    );
    expect(tl.unstagedTasks.map((t) => t.id)).toEqual(["loose"]);
    expect(tl.stages[0].tasks.map((t) => t.id)).toEqual(["nested"]);
  });

  it("flags task overdue only when open and past due; carries waiting-on counts", () => {
    const tl = timeline(
      [],
      [
        task({ id: "late", dueAt: "2026-08-01", status: "in_progress" }),
        task({ id: "fin", dueAt: "2026-08-01", status: "done" }),
      ],
      { waitingOnByTask: { late: 2 } },
    );
    const by = Object.fromEntries(tl.unstagedTasks.map((t) => [t.id, t]));
    expect(by.late.overdue).toBe(true);
    expect(by.late.waitingOn).toBe(2);
    expect(by.fin.overdue).toBe(false);
    expect(by.fin.waitingOn).toBe(0);
  });

  it("resolves the responsible: none / you / project worker (linked) / org member (text) / unknown", () => {
    const tl = timeline(
      [],
      [
        task({ id: "n" }),
        task({ id: "me", assigneeProfileId: "me" }),
        task({ id: "w", assigneeProfileId: "pw" }),
        task({ id: "m", assigneeProfileId: "pm" }),
        task({ id: "x", assigneeProfileId: "px" }),
      ],
      {
        people: [{ profileId: "pw", name: "Worker W", workerId: "wid-1" }],
        memberNameByProfileId: new Map([["pm", "Member M"]]),
      },
    );
    const r = Object.fromEntries(tl.unstagedTasks.map((t) => [t.id, t.responsible]));
    expect(r.n).toEqual({ kind: "none" });
    expect(r.me).toEqual({ kind: "you" });
    expect(r.w).toEqual({ kind: "named", name: "Worker W", href: "/dashboard/people/wid-1" });
    expect(r.m).toEqual({ kind: "named", name: "Member M", href: null });
    expect(r.x).toEqual({ kind: "member" });
  });

  it("stages carry no responsible and every row has a real href + anchor", () => {
    const tl = timeline([stage({ id: "s" })], [task({ id: "t" })]);
    expect(tl.stages[0].responsible).toBeNull();
    expect(tl.stages[0].href).toBe(`/dashboard/projects/${P}/operations#stage-s`);
    expect(tl.stages[0].anchorId).toBe("stage-s");
    expect(tl.unstagedTasks[0].href).toBe(`/dashboard/tasks?project=${P}&task=t#task-t`);
    expect(tl.unstagedTasks[0].anchorId).toBe("task-t");
  });
});

describe("timeline link builders", () => {
  it("builds stage, task and person hrefs", () => {
    expect(stageTimelineHref("p", "s")).toBe("/dashboard/projects/p/operations#stage-s");
    expect(taskTimelineHref("p", "t")).toBe("/dashboard/tasks?project=p&task=t#task-t");
    expect(personTimelineHref("w")).toBe("/dashboard/people/w");
    expect(personTimelineHref(null)).toBeNull();
  });

  it("planning task items deep-link the specific task", () => {
    expect(hrefForSource("task", "t", "p")).toBe(taskTimelineHref("p", "t"));
    expect(hrefForSource("task", "t")).toBe("/dashboard/tasks?task=t#task-t");
    expect(hrefForSource("task", "t", null)).toBe("/dashboard/tasks?task=t#task-t");
  });
});

describe("actualDateParams (stage status -> real actual dates)", () => {
  const none = { actualStart: null, actualEnd: null };
  it("sets actual start on in_progress when empty", () => {
    expect(actualDateParams("in_progress", none, "2026-08-10")).toEqual({
      p_actual_start: "2026-08-10",
      p_actual_end: null,
    });
  });
  it("sets actual end on done when empty", () => {
    expect(actualDateParams("done", none, "2026-08-10")).toEqual({
      p_actual_start: null,
      p_actual_end: "2026-08-10",
    });
  });
  it("never overwrites an existing actual date", () => {
    expect(
      actualDateParams("in_progress", { actualStart: "2026-08-01", actualEnd: null }, "2026-08-10"),
    ).toEqual({ p_actual_start: null, p_actual_end: null });
    expect(
      actualDateParams("done", { actualStart: null, actualEnd: "2026-08-05" }, "2026-08-10"),
    ).toEqual({ p_actual_start: null, p_actual_end: null });
  });
  it("sends nothing for reopen/other statuses or a malformed date", () => {
    for (const s of ["planned", "blocked", "cancelled"]) {
      expect(actualDateParams(s, none, "2026-08-10")).toEqual({
        p_actual_start: null,
        p_actual_end: null,
      });
    }
    expect(actualDateParams("done", none, "10/08/2026").p_actual_end).toBeNull();
  });
  it("localIsoDay uses LOCAL calendar parts", () => {
    expect(localIsoDay(new Date(2026, 7, 9, 23, 59))).toBe("2026-08-09");
  });
});

describe("updateStageStatusAction wiring", () => {
  const src = readFileSync(join(process.cwd(), "lib/projects/stages-actions.ts"), "utf8");
  it("reads stored actual dates and passes the computed params to the unchanged RPC", () => {
    expect(src).toMatch(/select\("actual_start, actual_end"\)/);
    expect(src).toMatch(/actualDateParams\(/);
    expect(src).toMatch(/rpc\("update_project_stage_v1"[\s\S]*\.\.\.dates/);
  });
});
