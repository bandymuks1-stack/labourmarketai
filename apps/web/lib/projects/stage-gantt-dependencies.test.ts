import { describe, expect, it } from "vitest";

import { buildActivityTimeline, type TimelineTaskInput } from "@/lib/projects/stage-gantt";
import type { TaskBlocker } from "@/lib/tasks/task-model";

const PID = "p1";
const task = (id: string, over: Partial<TimelineTaskInput> = {}): TimelineTaskInput => ({
  id,
  title: `Task ${id}`,
  status: "todo",
  dueAt: null,
  assigneeProfileId: null,
  ...over,
});
const edge = (id: string, over: Partial<TaskBlocker> = {}): TaskBlocker => ({
  blockerTaskId: id,
  title: `Task ${id}`,
  status: "todo",
  dueAt: null,
  ...over,
});

function build(tasks: TimelineTaskInput[], blockersByTask: Record<string, TaskBlocker[]>) {
  const t = buildActivityTimeline({
    projectId: PID,
    stages: [],
    tasks,
    waitingOnByTask: {},
    blockersByTask,
    meProfileId: null,
    people: [],
    memberNameByProfileId: new Map(),
    todayIso: "2026-10-03",
  });
  return new Map(t.unstagedTasks.map((r) => [r.id, r] as const));
}

describe("timeline dependency edges", () => {
  it("blocked-by links to the blocker row, and the blocker lists what it blocks", () => {
    const rows = build([task("a"), task("b")], { b: [edge("a")] });
    const b = rows.get("b")!;
    expect(b.blockedBy).toHaveLength(1);
    expect(b.blockedBy[0]!.href).toContain("task=a");
    expect(b.blockedBy[0]!.open).toBe(true);
    const a = rows.get("a")!;
    expect(a.blocks.map((r) => r.taskId)).toEqual(["b"]);
    expect(a.blocks[0]!.href).toContain("task=b");
    expect(a.blockedBy).toEqual([]);
  });

  it("a blocker outside the timeline is plain text; an unreadable one is unknown, never named", () => {
    const rows = build([task("b")], {
      b: [edge("outside", { title: "Elsewhere" }), edge("hidden", { title: null, status: null })],
    });
    const refs = rows.get("b")!.blockedBy;
    expect(refs[0]).toMatchObject({ title: "Elsewhere", href: null, open: true });
    expect(refs[1]).toMatchObject({ title: null, status: null, href: null, open: false });
    // an unreadable blocker is not an open blocker, so no violation is invented
    expect(rows.get("b")!.dependencyConflict).toBeNull();
  });

  it("the reverse side comes only from edges that were read", () => {
    const rows = build([task("a"), task("b")], {});
    expect(rows.get("a")!.blocks).toEqual([]);
  });

  it("marks a task started while its blocker is open", () => {
    const rows = build([task("a"), task("b", { status: "in_progress" })], { b: [edge("a")] });
    expect(rows.get("b")!.dependencyConflict).toMatchObject({
      startedBeforeBlockers: true,
      openBlockers: 1,
    });
  });

  it("marks a task due before its blocker is due", () => {
    const rows = build(
      [task("a", { dueAt: "2026-10-10T00:00:00Z" }), task("b", { dueAt: "2026-10-05T00:00:00Z" })],
      { b: [edge("a", { dueAt: "2026-10-10T00:00:00Z" })] },
    );
    expect(rows.get("b")!.dependencyConflict?.dueBeforeBlockerDue).toBe(true);
  });

  it("no violation for a finished blocker", () => {
    const rows = build([task("a", { status: "done" }), task("b", { status: "in_progress" })], {
      b: [edge("a", { status: "done" })],
    });
    expect(rows.get("b")!.dependencyConflict).toBeNull();
  });

  it("tasks with no edges carry empty dependency fields", () => {
    const r = build([task("a")], {}).get("a")!;
    expect(r.blockedBy).toEqual([]);
    expect(r.blocks).toEqual([]);
    expect(r.dependencyConflict).toBeNull();
  });
});
