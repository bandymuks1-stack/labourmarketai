import { describe, expect, it } from "vitest";

import { deriveProjectTrace, type ProjectTraceEntry, type ProjectTraceInput } from "./project-trace";
import type { ProjectStage } from "./stages-model";
import type { WorkTask } from "@/lib/tasks/task-model";

const SINCE = "2026-10-01T00:00:00.000Z";
const approve = (by: string, at = "2026-10-05T10:00:00.000Z") => ({
  confirmation_scope: { decision: "approved" },
  created_at: at,
  confirmer_role: "manager",
  confirmer_id: by,
});
const decide = (decision: string, by: string) => ({
  confirmation_scope: { decision },
  created_at: "2026-10-05T10:00:00.000Z",
  confirmer_role: "manager",
  confirmer_id: by,
});
const entry = (id: string, workerId: string, confirmations: unknown[] = [], at = "2026-10-04T08:00:00.000Z"): ProjectTraceEntry => ({
  id,
  workerId,
  createdAt: at,
  originalText: `secret text of ${workerId}`,
  metrics: [],
  confirmations: confirmations as ProjectTraceEntry["confirmations"],
});
const stage = (over: Partial<ProjectStage>): ProjectStage => ({
  id: "s1",
  name: "Pamatai",
  stageOrder: 1,
  status: "planned",
  plannedStart: null,
  plannedEnd: null,
  actualStart: null,
  actualEnd: null,
  blockedReason: null,
  completionCriteria: null,
  ...over,
});
const task = (over: Partial<WorkTask>): WorkTask => ({
  id: "t1",
  projectId: "p",
  objectId: null,
  stageId: null,
  parentTaskId: null,
  title: "x",
  description: null,
  status: "todo",
  priority: "normal" as WorkTask["priority"],
  assigneeProfileId: null,
  createdBy: "m",
  dueAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  resolvedAt: null,
  ...over,
});

const base = (over: Partial<ProjectTraceInput>): ProjectTraceInput => ({
  audience: "member",
  entries: [],
  entriesTruncated: false,
  viewerWorkerId: "w-me",
  viewerProfileId: "p-me",
  workerProfiles: new Map(),
  skillLinks: new Map(),
  confirmedWork: new Map(),
  stages: { applied: true, stages: [], error: null },
  tasks: [],
  sinceIso: SINCE,
  ...over,
});

describe("deriveProjectTrace — privacy", () => {
  it("a member sees ONLY their own chains, never a co-worker's entry", () => {
    const tr = deriveProjectTrace(
      base({ entries: [entry("e1", "w-me"), entry("e2", "w-other"), entry("e3", "w-other")] }),
    );
    expect(tr.kind).toBe("known");
    if (tr.kind !== "known") return;
    expect(tr.mine.map((i) => i.id)).toEqual(["journal:e1"]);
    expect(JSON.stringify(tr)).not.toContain("w-other");
    expect(tr.team).toBeNull();
  });

  it("a member with an unresolved worker id sees no chains at all", () => {
    const tr = deriveProjectTrace(base({ viewerWorkerId: null, entries: [entry("e1", "w-me")] }));
    expect(tr.kind === "known" && tr.mine.length).toBe(0);
  });

  it("a manager sees counts only — no entry text, no worker id, no rows", () => {
    const tr = deriveProjectTrace(
      base({
        audience: "manager",
        entries: [entry("e1", "w1"), entry("e2", "w2", [approve("mgr")]), entry("e3", "w2", [decide("changes_requested", "mgr")])],
        workerProfiles: new Map([
          ["w1", "p1"],
          ["w2", "p2"],
        ]),
      }),
    );
    if (tr.kind !== "known") throw new Error("unknown");
    expect(tr.mine).toEqual([]);
    expect(tr.team).toEqual({ recorded: 3, awaiting: 1, returned: 1, confirmed: 1 });
    const json = JSON.stringify(tr);
    expect(json).not.toContain("secret text");
    expect(json).not.toMatch(/w1|w2|p1|p2/);
  });
});

describe("deriveProjectTrace — honesty", () => {
  it("an approval the worker wrote themselves is never counted as confirmed", () => {
    const tr = deriveProjectTrace(
      base({ audience: "manager", entries: [entry("e1", "w1", [approve("p1")])], workerProfiles: new Map([["w1", "p1"]]) }),
    );
    expect(tr.kind === "known" && tr.team?.confirmed).toBe(0);
  });

  it("unresolvable workers make the confirmed count UNKNOWN, never a guess", () => {
    const tr = deriveProjectTrace(
      base({ audience: "manager", entries: [entry("e1", "w1", [approve("mgr")])], workerProfiles: null }),
    );
    expect(tr.kind === "known" && tr.team?.confirmed).toBeNull();
  });

  it("a waiting entry is pending, never confirmed", () => {
    const tr = deriveProjectTrace(base({ audience: "manager", entries: [entry("e1", "w1")], workerProfiles: new Map([["w1", "p1"]]) }));
    expect(tr.kind === "known" && tr.team).toEqual({ recorded: 1, awaiting: 1, returned: 0, confirmed: 0 });
  });

  it("entries, stages and tasks older than the window are left out", () => {
    const tr = deriveProjectTrace(
      base({
        entries: [entry("e1", "w-me", [], "2026-09-20T08:00:00.000Z")],
        stages: { applied: true, error: null, stages: [stage({ status: "done", actualEnd: "2026-09-20" })] },
        tasks: [task({ status: "done", resolvedAt: "2026-09-20T00:00:00.000Z" })],
      }),
    );
    if (tr.kind !== "known") throw new Error("unknown");
    expect(tr.mine).toEqual([]);
    expect(tr.stagesDone).toEqual([]);
    expect(tr.tasksDone).toBe(0);
    expect(tr.quiet).toBe(true);
  });

  it("finished stages and closed tasks in the window are the project's facts", () => {
    const tr = deriveProjectTrace(
      base({
        stages: { applied: true, error: null, stages: [stage({ status: "done", actualEnd: "2026-10-03" }), stage({ id: "s2", status: "in_progress" })] },
        tasks: [task({ status: "done", resolvedAt: "2026-10-02T00:00:00.000Z" }), task({ id: "t2", status: "cancelled", resolvedAt: "2026-10-02T00:00:00.000Z" })],
      }),
    );
    if (tr.kind !== "known") throw new Error("unknown");
    expect(tr.stagesDone).toEqual([{ id: "s1", name: "Pamatai", day: "2026-10-03" }]);
    expect(tr.tasksDone).toBe(1);
    expect(tr.quiet).toBe(false);
  });

  it("a failed read is named, never quiet; all failed is UNKNOWN", () => {
    const partial = deriveProjectTrace(base({ entries: null }));
    expect(partial.kind === "known" && partial.journalUnknown && !partial.quiet).toBe(true);
    expect(deriveProjectTrace(base({ entries: null, stages: null, tasks: null })).kind).toBe("unknown");
  });
});
