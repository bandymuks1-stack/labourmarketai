import { describe, expect, it } from "vitest";

import {
  countTaskTree,
  deriveProjectProgress,
} from "@/lib/projects/progress-model";
import { suggestStageStatus } from "@/lib/projects/stage-rollup";

const t = (
  id: string,
  status: string,
  parentTaskId: string | null = null,
) => ({ id, status, parentTaskId });

describe("subtask counting rule (derived only)", () => {
  it("flat status lists behave exactly as before (back-compat)", () => {
    const p = deriveProjectProgress(["done", "todo", "cancelled"], ["done"]);
    expect(p.taskDone).toBe(1);
    expect(p.taskTotal).toBe(2);
    expect(p.percent).toBe(50); // 1 of 2 countable tasks; the stage is not counted in
  });

  it("a parent with open children is a container: not counted, never done by itself", () => {
    const c = countTaskTree([
      t("p", "done"),
      t("a", "done", "p"),
      t("b", "todo", "p"),
    ]);
    expect(c).toEqual({ done: 1, total: 2, doneParentsWithOpenChildren: 1 });
  });

  it("does not double-count: parent + 2 subtasks = 2 units of work, not 3", () => {
    const c = countTaskTree([
      t("p", "in_progress"),
      t("a", "done", "p"),
      t("b", "done", "p"),
    ]);
    expect(c.total).toBe(2);
    expect(c.done).toBe(2);
  });

  it("a parent whose children are all cancelled counts as a leaf by its own status", () => {
    const c = countTaskTree([t("p", "done"), t("a", "cancelled", "p")]);
    expect(c).toEqual({ done: 1, total: 1, doneParentsWithOpenChildren: 0 });
  });

  it("a cancelled parent excludes its whole subtree", () => {
    const c = countTaskTree([
      t("p", "cancelled"),
      t("a", "done", "p"),
      t("b", "todo", "p"),
    ]);
    expect(c.total).toBe(0);
  });

  it("an orphan subtask (parent not visible) counts as a leaf", () => {
    const c = countTaskTree([t("a", "done", "hidden")]);
    expect(c).toEqual({ done: 1, total: 1, doneParentsWithOpenChildren: 0 });
  });

  it("feeds deriveProjectProgress: percent is over leaf tasks only", () => {
    const p = deriveProjectProgress(
      [t("p", "done"), t("a", "done", "p"), t("b", "todo", "p")],
      ["planned"],
    );
    expect(p.taskTotal).toBe(2);
    expect(p.taskDone).toBe(1);
    expect(p.percent).toBe(50); // stages are NOT in the percent
  });
});

describe("suggestStageStatus — derived, read-only", () => {
  it("suggests nothing for a stage with no countable tasks", () => {
    expect(suggestStageStatus("planned", [])).toBeNull();
    expect(suggestStageStatus("planned", [t("a", "cancelled")])).toBeNull();
  });

  it("never suggests for a cancelled stage", () => {
    expect(suggestStageStatus("cancelled", [t("a", "done")])).toBeNull();
  });

  it("all leaves done → suggest done", () => {
    expect(
      suggestStageStatus("in_progress", [t("a", "done"), t("b", "done")]),
    ).toEqual({ suggested: "done", reason: "all_done" });
  });

  it("a done stage with open work → suggest in_progress", () => {
    expect(
      suggestStageStatus("done", [t("a", "done"), t("b", "todo")]),
    ).toEqual({ suggested: "in_progress", reason: "open_work_in_done_stage" });
  });

  it("a blocked leaf → suggest blocked (unless already blocked)", () => {
    expect(
      suggestStageStatus("in_progress", [t("a", "blocked"), t("b", "todo")]),
    ).toEqual({ suggested: "blocked", reason: "has_blocked" });
    expect(suggestStageStatus("blocked", [t("a", "blocked")])).toBeNull();
  });

  it("started work in a planned stage → suggest in_progress", () => {
    expect(
      suggestStageStatus("planned", [t("a", "in_progress"), t("b", "todo")]),
    ).toEqual({ suggested: "in_progress", reason: "work_started" });
    expect(suggestStageStatus("planned", [t("a", "todo")])).toBeNull();
  });

  it("a parent marked done with an open child does not complete the stage", () => {
    expect(
      suggestStageStatus("in_progress", [
        t("p", "done"),
        t("a", "todo", "p"),
      ]),
    ).toBeNull();
  });
});

describe("leaf-derived percent (no double count, no fabrication)", () => {
  it("a done stage does not lift the percent of its own open tasks", () => {
    const p = deriveProjectProgress(["todo", "todo"], ["done"]);
    expect(p.percent).toBe(0);
    expect(p.basis).toBe("tasks");
  });

  it("no tasks + stages: NO percent, a declared count only", () => {
    const p = deriveProjectProgress([], ["done", "planned", "cancelled"]);
    expect(p).toMatchObject({ percent: null, basis: "stages", stageDone: 1, stageTotal: 2 });
  });

  it("nothing countable: omitted", () => {
    expect(deriveProjectProgress(["cancelled"], ["cancelled"])).toMatchObject({
      percent: null,
      basis: "none",
    });
  });

  it("an incomplete task read (failed/truncated) is unknown, even with stages", () => {
    const p = deriveProjectProgress(["done"], ["done"], { tasksComplete: false });
    expect(p).toMatchObject({ percent: null, basis: "none", taskTotal: 0, stageTotal: 0 });
  });

  it("an incomplete stage read never invents stage counts", () => {
    const p = deriveProjectProgress([], ["done"], { stagesComplete: false });
    expect(p.basis).toBe("none");
    const q = deriveProjectProgress(["done", "todo"], ["done"], { stagesComplete: false });
    expect(q.percent).toBe(50);
  });
});
