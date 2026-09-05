import { describe, expect, it } from "vitest";

import type { WorkTask } from "@/lib/tasks/task-model";
import type { ProjectStage } from "@/lib/projects/stages-model";
import type { WorkerOps } from "@/lib/projects/operations-derive";
import type { CapacityChatResult } from "@/lib/conversation/capacity-contract";
import {
  FIELD_LANE_MAX,
  FIELD_OBJECT_MAX,
  FIELD_READY_MAX,
  FIELD_SLOT_MAX,
  buildProjectField,
  laneEdge,
  laneTime,
  tokenState,
} from "@/lib/projects/field-model";

const TODAY = "2026-09-05";

function stage(p: Partial<ProjectStage> & { id: string }): ProjectStage {
  return {
    name: p.id,
    stageOrder: 0,
    status: "planned",
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    blockedReason: null,
    completionCriteria: null,
    ...p,
  };
}

function worker(p: Partial<WorkerOps> & { workerId: string }): WorkerOps {
  return {
    workerProfileId: `${p.workerId}-profile`,
    name: p.workerId,
    assignedAt: "2026-09-01T00:00:00Z",
    journalEntries: 0,
    declaredSkills: 0,
    confirmedSkills: 0,
    openReviewItems: 0,
    lastActivity: null,
    ready: false,
    missing: [],
    needsFollowUp: false,
    operationalStatus: null,
    readinessItems: [],
    docsMissing: 0,
    docsReceived: 0,
    docsChecked: 0,
    docsBlocked: 0,
    ...p,
  };
}

function task(p: Partial<WorkTask> & { id: string }): WorkTask {
  return {
    projectId: "p1",
    objectId: null,
    title: p.id,
    description: null,
    status: "todo",
    priority: "normal",
    assigneeProfileId: null,
    createdBy: "u1",
    dueAt: null,
    createdAt: "2026-09-01T00:00:00Z",
    resolvedAt: null,
    ...p,
  };
}

const capacity: CapacityChatResult = {
  kind: "ok",
  from: "2026-09-05",
  to: "2026-09-11",
  rows: [
    { workerId: "w1", label: "On project", state: "free", unavailableUntil: null },
    { workerId: "w9", label: "Free one", state: "free", unavailableUntil: null },
    { workerId: "w8", label: "Away", state: "unavailable", unavailableUntil: "2026-09-10" },
  ],
  rosterTotal: 3,
  absencesKnown: true,
};

describe("lane edge and time are from real status and real dates only", () => {
  it("edge follows the stored status; overdue planned/in-progress becomes risk", () => {
    expect(laneEdge("done", false)).toBe("done");
    expect(laneEdge("done", true)).toBe("done");
    expect(laneEdge("cancelled", true)).toBe("cancelled");
    expect(laneEdge("blocked", false)).toBe("blocked");
    expect(laneEdge("in_progress", false)).toBe("now");
    expect(laneEdge("in_progress", true)).toBe("risk");
    expect(laneEdge("planned", false)).toBe("planned");
    expect(laneEdge("planned", true)).toBe("risk");
  });

  it("time is past / now / next / undated from dates against today", () => {
    expect(laneTime("2026-08-01", "2026-08-20", TODAY)).toBe("past");
    expect(laneTime("2026-09-01", "2026-09-10", TODAY)).toBe("now");
    expect(laneTime("2026-09-05", null, TODAY)).toBe("now");
    expect(laneTime("2026-09-10", "2026-09-20", TODAY)).toBe("next");
    expect(laneTime(null, null, TODAY)).toBe("undated");
  });
});

describe("token state from the manager-kept checklist rows", () => {
  it("blocked > needs > untracked > clear", () => {
    expect(tokenState(worker({ workerId: "a", docsBlocked: 1, docsMissing: 3 }))).toBe("blocked");
    expect(
      tokenState(worker({ workerId: "a", operationalStatus: "documents_needed" })),
    ).toBe("blocked");
    expect(tokenState(worker({ workerId: "a", docsMissing: 2 }))).toBe("needs");
    expect(tokenState(worker({ workerId: "a" }))).toBe("untracked");
    expect(
      tokenState(
        worker({
          workerId: "a",
          readinessItems: [{ itemKey: "k", label: "K", status: "checked", note: null }],
        }),
      ),
    ).toBe("clear");
  });
});

describe("buildProjectField — a projection, bounded, derived flagged", () => {
  it("lanes carry positions from the gantt projection and derived lane→work from due dates", () => {
    const field = buildProjectField({
      stages: [
        stage({ id: "s2", name: "Second", stageOrder: 2, status: "planned", plannedStart: "2026-09-10", plannedEnd: "2026-09-20" }),
        stage({ id: "s1", name: "First", stageOrder: 1, status: "done", plannedStart: "2026-08-01", plannedEnd: "2026-08-20" }),
      ],
      stagesApplied: true,
      workers: [worker({ workerId: "w1" })],
      tasks: [
        task({ id: "t-in-s2", dueAt: "2026-09-12T00:00:00Z" }),
        task({ id: "t-undated" }),
        task({ id: "t-done", status: "done", dueAt: "2026-09-12T00:00:00Z" }),
        task({ id: "t-assigned", assigneeProfileId: "w1-profile", dueAt: "2026-08-05T00:00:00Z" }),
      ],
      tasksApplied: true,
      capacity,
      todayIso: TODAY,
    });
    expect(field.lanes.map((l) => l.id)).toEqual(["s1", "s2"]);
    expect(field.lanes[0]).toMatchObject({ edge: "done", time: "past" });
    expect(field.lanes[1]).toMatchObject({ edge: "planned", time: "next", taskIds: ["t-in-s2"] });
    expect(field.lanes[0]!.taskIds).toEqual(["t-assigned"]);
    expect(field.lanes[1]!.offsetPct).not.toBeNull();
    expect(field.window).toEqual({ start: "2026-08-01", end: "2026-09-20" });
    expect(field.todayPct).not.toBeNull();
    // Open work nobody's lane dates cover stays visible (never dropped).
    expect(field.unplacedTaskIds).toEqual(["t-undated"]);
  });

  it("slots = open work without a person + the empty project; done work is never a slot", () => {
    const field = buildProjectField({
      stages: [],
      stagesApplied: true,
      workers: [],
      tasks: [task({ id: "open" }), task({ id: "closed", status: "done" }), task({ id: "taken", assigneeProfileId: "x" })],
      tasksApplied: true,
      capacity: null,
      todayIso: TODAY,
    });
    expect(field.slots.map((s) => s.kind)).toEqual(["no_people", "unassigned_task"]);
    expect(field.slots[1]).toMatchObject({ taskId: "open", title: "open" });
    expect(field.ready.kind).toBe("error");
    expect(field.ready.rows).toEqual([]);
  });

  it("ready edge = the capacity read's FREE rows minus people already on the project", () => {
    const field = buildProjectField({
      stages: [],
      stagesApplied: true,
      workers: [worker({ workerId: "w1" })],
      tasks: [],
      tasksApplied: true,
      capacity,
      todayIso: TODAY,
    });
    expect(field.ready.kind).toBe("ok");
    expect(field.ready.rows).toEqual([{ workerId: "w9", label: "Free one" }]);
    expect(field.ready.from).toBe("2026-09-05");
    expect(field.ready.absencesKnown).toBe(true);
    expect(field.slots).toEqual([]);
  });

  it("degraded capacity kinds pass through by name (no-company / empty / error)", () => {
    for (const kind of ["no-company", "empty", "error"] as const) {
      const field = buildProjectField({
        stages: [],
        stagesApplied: false,
        workers: [],
        tasks: [],
        tasksApplied: false,
        capacity: { kind },
        todayIso: TODAY,
      });
      expect(field.ready.kind).toBe(kind);
      expect(field.stagesApplied).toBe(false);
      expect(field.tasksApplied).toBe(false);
    }
  });

  it("bounds: ≤ 12 lanes, ≤ 12 slots, ≤ 12 ready, ≤ 60 objects; the rest is counted", () => {
    const stages = Array.from({ length: 20 }, (_, i) =>
      stage({ id: `s${i}`, stageOrder: i, plannedStart: "2026-09-01", plannedEnd: "2026-09-30" }),
    );
    const workers = Array.from({ length: 70 }, (_, i) => worker({ workerId: `w${i}` }));
    const tasks = Array.from({ length: 30 }, (_, i) => task({ id: `t${i}` }));
    const rows = Array.from({ length: 40 }, (_, i) => ({
      workerId: `r${i}`,
      label: `R${i}`,
      state: "free" as const,
      unavailableUntil: null,
    }));
    const field = buildProjectField({
      stages,
      stagesApplied: true,
      workers,
      tasks,
      tasksApplied: true,
      capacity: { kind: "ok", from: "a", to: "b", rows, rosterTotal: 40, absencesKnown: true },
      todayIso: TODAY,
    });
    expect(field.lanes).toHaveLength(FIELD_LANE_MAX);
    expect(field.lanesTotal).toBe(20);
    expect(field.slots).toHaveLength(FIELD_SLOT_MAX);
    expect(field.slotsTotal).toBe(30);
    expect(field.ready.rows).toHaveLength(FIELD_READY_MAX);
    expect(field.ready.more).toBe(40 - FIELD_READY_MAX);
    expect(field.objects).toBeLessThanOrEqual(FIELD_OBJECT_MAX);
    expect(field.people.length).toBe(FIELD_OBJECT_MAX - 12 - 12 - 12);
    expect(field.peopleTotal).toBe(70);
  });
});
