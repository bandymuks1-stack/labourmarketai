import { describe, expect, it } from "vitest";

import {
  WORK_TASK_MAX_DEPTH,
  deriveWbs,
  flattenWbs,
  parentCandidates,
  sortStagesForWbs,
  type WbsTaskInput,
} from "@/lib/projects/wbs";

type T = WbsTaskInput & { projectId: string | null };

const task = (
  id: string,
  stageId: string | null,
  parentTaskId: string | null,
  createdAt: string,
  projectId: string | null = "p1",
): T => ({ id, stageId, parentTaskId, createdAt, projectId });

const STAGES = [
  { id: "s-b", stageOrder: 2, createdAt: "2026-01-02T00:00:00Z" },
  { id: "s-a", stageOrder: 1, createdAt: "2026-01-03T00:00:00Z" },
];

describe("deriveWbs — derived hierarchical numbering", () => {
  it("numbers stages by stage_order and tasks/subtasks by sibling order", () => {
    const tasks = [
      task("t2", "s-a", null, "2026-02-02T00:00:00Z"),
      task("t1", "s-a", null, "2026-02-01T00:00:00Z"),
      task("t1b", "s-a", "t1", "2026-02-04T00:00:00Z"),
      task("t1a", "s-a", "t1", "2026-02-03T00:00:00Z"),
      task("u1", "s-b", null, "2026-02-01T00:00:00Z"),
    ];
    const r = deriveWbs(STAGES, tasks);
    expect(r.stages.map((g) => [g.stageId, g.label])).toEqual([
      ["s-a", "1"],
      ["s-b", "2"],
    ]);
    const labels = Object.fromEntries(
      r.stages.flatMap((g) =>
        flattenWbs(g.roots).map((n) => [n.task.id, n.label] as const),
      ),
    );
    expect(labels).toEqual({
      t1: "1.1",
      t1a: "1.1.1",
      t1b: "1.1.2",
      t2: "1.2",
      u1: "2.1",
    });
  });

  it("is stable: equal created_at ties break by id, input order never matters", () => {
    const same = "2026-02-01T00:00:00Z";
    const a = [task("b", "s-a", null, same), task("a", "s-a", null, same)];
    const r1 = deriveWbs(STAGES, a);
    const r2 = deriveWbs(STAGES, [...a].reverse());
    const lab = (r: ReturnType<typeof deriveWbs<T>>) =>
      flattenWbs(r.stages[0].roots).map((n) => `${n.task.id}=${n.label}`);
    expect(lab(r1)).toEqual(["a=1.1", "b=1.2"]);
    expect(lab(r2)).toEqual(lab(r1));
  });

  it("gives unstaged tasks NO number (explicit group, no fake label)", () => {
    const tasks = [
      task("x", null, null, "2026-02-01T00:00:00Z"),
      task("y", null, "x", "2026-02-02T00:00:00Z"),
    ];
    const r = deriveWbs(STAGES, tasks);
    const flat = flattenWbs(r.unstaged);
    expect(flat.map((n) => n.label)).toEqual([null, null]);
    expect(flat.map((n) => n.depth)).toEqual([1, 2]);
  });

  it("treats a task pointing at an unknown stage as unstaged", () => {
    const r = deriveWbs(STAGES, [task("x", "gone", null, "2026-02-01T00:00:00Z")]);
    expect(r.unstaged).toHaveLength(1);
    expect(r.unstaged[0].label).toBeNull();
  });

  it("an orphan subtask (parent not visible) is unnumbered and never shifts real numbers", () => {
    const tasks = [
      task("o", "s-a", "missing", "2026-02-01T00:00:00Z"),
      task("r", "s-a", null, "2026-02-02T00:00:00Z"),
    ];
    const r = deriveWbs(STAGES, tasks);
    const byId = Object.fromEntries(
      flattenWbs(r.stages[0].roots).map((n) => [n.task.id, n]),
    );
    expect(byId.o.label).toBeNull();
    expect(byId.o.orphan).toBe(true);
    expect(byId.r.label).toBe("1.1");
  });

  it("re-ordering stages renumbers (numbers are derived, not stored)", () => {
    const tasks = [task("t", "s-b", null, "2026-02-01T00:00:00Z")];
    const before = deriveWbs(STAGES, tasks);
    const after = deriveWbs(
      [
        { id: "s-b", stageOrder: 0 },
        { id: "s-a", stageOrder: 1 },
      ],
      tasks,
    );
    expect(flattenWbs(before.stages[1].roots)[0].label).toBe("2.1");
    expect(flattenWbs(after.stages[0].roots)[0].label).toBe("1.1");
  });

  it("survives a corrupt cycle without looping and respects the depth cap", () => {
    const tasks = [
      task("a", "s-a", "b", "2026-02-01T00:00:00Z"),
      task("b", "s-a", "a", "2026-02-02T00:00:00Z"),
      task("d1", "s-a", null, "2026-02-03T00:00:00Z"),
      task("d2", "s-a", "d1", "2026-02-04T00:00:00Z"),
      task("d3", "s-a", "d2", "2026-02-05T00:00:00Z"),
      task("d4", "s-a", "d3", "2026-02-06T00:00:00Z"),
    ];
    const r = deriveWbs(STAGES, tasks);
    const flat = flattenWbs(r.stages[0].roots);
    expect(Math.max(...flat.map((n) => n.depth))).toBeLessThanOrEqual(
      WORK_TASK_MAX_DEPTH,
    );
    expect(flat.find((n) => n.task.id === "d4")).toBeUndefined();
  });
});

describe("sortStagesForWbs", () => {
  it("orders by stage_order, then created_at, then id", () => {
    const s = sortStagesForWbs([
      { id: "c", stageOrder: 1, createdAt: "2026-01-02T00:00:00Z" },
      { id: "b", stageOrder: 1, createdAt: "2026-01-01T00:00:00Z" },
      { id: "a", stageOrder: 0, createdAt: null },
      { id: "d", stageOrder: 1, createdAt: "2026-01-02T00:00:00Z" },
    ]);
    expect(s.map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("parentCandidates", () => {
  const tasks = [
    task("root", "s-a", null, "2026-02-01T00:00:00Z"),
    task("kid", "s-a", "root", "2026-02-02T00:00:00Z"),
    task("grandkid", "s-a", "kid", "2026-02-03T00:00:00Z"),
    task("other", "s-a", null, "2026-02-04T00:00:00Z"),
    task("foreign", null, null, "2026-02-05T00:00:00Z", "p2"),
  ];

  it("excludes self, descendants and other projects", () => {
    const flat = [
      ...tasks.slice(0, 2), // root, kid
      tasks[3], // other
      tasks[4], // foreign project
    ];
    const ids = parentCandidates(flat, { id: "root", projectId: "p1" }).map(
      (t) => t.id,
    );
    expect(ids).toEqual(["other"]);
  });

  it("a task with a deep subtree has no parent that would exceed the cap", () => {
    // root has kid + grandkid (height 2): any parent at depth >=1 breaks depth 3
    expect(parentCandidates(tasks, { id: "root", projectId: "p1" })).toEqual([]);
  });

  it("never offers a parent that would push the subtree past the depth cap", () => {
    const ids = parentCandidates(tasks, { id: "other", projectId: "p1" }).map(
      (t) => t.id,
    );
    // root (depth1) ok, kid (depth2) ok, grandkid (depth3) would make depth 4.
    expect(ids).toEqual(["root", "kid"]);
  });
});
