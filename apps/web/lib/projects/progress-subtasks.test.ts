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
    expect(p.percent).toBe(67);
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

  it("feeds deriveProjectProgress: percent is over leaves + stages", () => {
    const p = deriveProjectProgress(
      [t("p", "done"), t("a", "done", "p"), t("b", "todo", "p")],
      ["planned"],
    );
    expect(p.taskTotal).toBe(2);
    expect(p.taskDone).toBe(1);
    expect(p.percent).toBe(33);
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
