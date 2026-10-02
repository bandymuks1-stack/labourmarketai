import { describe, expect, it } from "vitest";

import {
  deriveStageEvidenceRollup,
  hasAttributionConflict,
  isLinkableForTask,
} from "@/lib/journal/task-evidence-model";

describe("attribution conflict (legacy rows)", () => {
  it("flags an entry whose project differs from the task's", () => {
    expect(hasAttributionConflict({ entryProjectId: "pB" }, "pA")).toBe(true);
    expect(hasAttributionConflict({ entryProjectId: "pB" }, null)).toBe(true);
  });
  it("an entry with no project or the same project is not a conflict", () => {
    expect(hasAttributionConflict({ entryProjectId: null }, "pA")).toBe(false);
    expect(hasAttributionConflict({}, "pA")).toBe(false);
    expect(hasAttributionConflict({ entryProjectId: "pA" }, "pA")).toBe(false);
  });
});

describe("stage evidence roll-up — derived, never guessed", () => {
  const tasks = [
    { id: "t1", projectId: "p", stageId: "s1" },
    { id: "t2", projectId: "p", stageId: "s1" },
    { id: "t3", projectId: "p", stageId: null },
  ];
  it("counts only entries with exactly one live task link and no conflict", () => {
    const r = deriveStageEvidenceRollup(tasks, {
      t1: [
        { entryId: "e1", entryProjectId: "p" },
        { entryId: "e2", entryProjectId: "p" }, // also on t2 → ambiguous
        { entryId: "e3", entryProjectId: "other" }, // conflict
      ],
      t2: [{ entryId: "e2", entryProjectId: "p" }],
    });
    expect(r.s1).toEqual({ entries: 1, conflicts: 1, ambiguous: 1 });
  });
  it("unstaged tasks contribute to no stage", () => {
    const r = deriveStageEvidenceRollup(tasks, {
      t3: [{ entryId: "e9", entryProjectId: "p" }],
    });
    expect(r.s1).toEqual({ entries: 0, conflicts: 0, ambiguous: 0 });
  });
});

describe("picker mirrors the server refusals", () => {
  it("offers an entry only for its own project's tasks", () => {
    const task = { projectId: "pA", organizationId: "o1" };
    expect(isLinkableForTask({ projectId: "pA", organizationId: "o1" }, task)).toBe(true);
    expect(isLinkableForTask({ projectId: "pB", organizationId: "o1" }, task)).toBe(false);
    expect(isLinkableForTask({ projectId: null, organizationId: "o1" }, task)).toBe(true);
  });
  it("a project entry is not offered for a personal task", () => {
    expect(
      isLinkableForTask(
        { projectId: "pA", organizationId: null },
        { projectId: null, organizationId: null },
      ),
    ).toBe(false);
  });
  it("rejects a different organization", () => {
    expect(
      isLinkableForTask(
        { projectId: null, organizationId: "o2" },
        { projectId: "pA", organizationId: "o1" },
      ),
    ).toBe(false);
  });
});
