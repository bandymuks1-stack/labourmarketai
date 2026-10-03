import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  deriveDependencyConflict,
  isTaskReservationAdvisory,
  statusChangeAdvisory,
  type TaskBlocker,
} from "@/lib/tasks/task-model";
import { evidenceHoursLabelValue } from "@/lib/journal/task-evidence-model";

const blocker = (p: Partial<TaskBlocker>): TaskBlocker => ({
  blockerTaskId: "b",
  title: "t",
  status: "todo",
  dueAt: null,
  ...p,
});

describe("deriveDependencyConflict (advisory)", () => {
  it("flags a task in progress or done while a blocker is open", () => {
    for (const status of ["in_progress", "done"] as const) {
      const c = deriveDependencyConflict({ status, dueAt: null }, [blocker({})]);
      expect(c.startedBeforeBlockers).toBe(true);
      expect(c.openBlockers).toBe(1);
      expect(c.hasConflict).toBe(true);
    }
  });

  it("does not flag a todo/blocked task or a finished blocker", () => {
    expect(deriveDependencyConflict({ status: "todo", dueAt: null }, [blocker({})]).hasConflict).toBe(false);
    expect(deriveDependencyConflict({ status: "blocked", dueAt: null }, [blocker({})]).hasConflict).toBe(false);
    expect(
      deriveDependencyConflict({ status: "in_progress", dueAt: null }, [blocker({ status: "done" })]).hasConflict,
    ).toBe(false);
  });

  it("a blocker the caller cannot read is unknown, never an open blocker", () => {
    const c = deriveDependencyConflict({ status: "in_progress", dueAt: null }, [
      blocker({ status: null, title: null }),
    ]);
    expect(c.openBlockers).toBe(0);
    expect(c.hasConflict).toBe(false);
  });

  it("flags a task due before an open blocker is due (day compare, open tasks only)", () => {
    const early = "2026-10-01T10:00:00Z";
    const late = "2026-10-05T10:00:00Z";
    expect(
      deriveDependencyConflict({ status: "todo", dueAt: early }, [blocker({ dueAt: late })]).dueBeforeBlockerDue,
    ).toBe(true);
    expect(
      deriveDependencyConflict({ status: "todo", dueAt: late }, [blocker({ dueAt: early })]).dueBeforeBlockerDue,
    ).toBe(false);
    // same day is not "before"
    expect(
      deriveDependencyConflict({ status: "todo", dueAt: early }, [blocker({ dueAt: "2026-10-01T23:00:00Z" })])
        .dueBeforeBlockerDue,
    ).toBe(false);
    // no due date on either side says nothing
    expect(deriveDependencyConflict({ status: "todo", dueAt: early }, [blocker({})]).dueBeforeBlockerDue).toBe(false);
    // a finished task is not "due before" anything
    expect(
      deriveDependencyConflict({ status: "done", dueAt: early }, [blocker({ dueAt: late, status: "done" })])
        .dueBeforeBlockerDue,
    ).toBe(false);
  });
});

describe("statusChangeAdvisory", () => {
  it("speaks only for in_progress / done with open blockers", () => {
    expect(statusChangeAdvisory("in_progress", [{ status: "todo" }, { status: "done" }])).toEqual({
      kind: "blockers_open",
      openBlockers: 1,
    });
    expect(statusChangeAdvisory("done", [{ status: "blocked" }])?.openBlockers).toBe(1);
    expect(statusChangeAdvisory("todo", [{ status: "todo" }])).toBeNull();
    expect(statusChangeAdvisory("cancelled", [{ status: "todo" }])).toBeNull();
    expect(statusChangeAdvisory("done", [{ status: "done" }, { status: null }])).toBeNull();
    expect(statusChangeAdvisory("done", [])).toBeNull();
  });
});

describe("reservation advisory codes", () => {
  it("surfaces collides and unknown; clear says nothing", () => {
    expect(isTaskReservationAdvisory("collides")).toBe(true);
    expect(isTaskReservationAdvisory("unknown")).toBe(true);
    expect(isTaskReservationAdvisory("clear")).toBe(false);
    expect(isTaskReservationAdvisory(undefined)).toBe(false);
  });
});

describe("evidence hours honesty", () => {
  it("missing, zero or non-finite hours are not shown", () => {
    expect(evidenceHoursLabelValue(null)).toBeNull();
    expect(evidenceHoursLabelValue(0)).toBeNull();
    expect(evidenceHoursLabelValue(Number.NaN)).toBeNull();
    expect(evidenceHoursLabelValue(7.5)).toBe("7.5");
  });
});

/** Structural pins — source text, and honest about it. */
describe("task conflicts + evidence detail wiring", () => {
  const root = join(__dirname, "..", "..");
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

  it("the assign action asks the ONE reservation composition, after the write, with no refusal path", () => {
    const rsv = read("lib/tasks/task-reservation.ts");
    expect(rsv).toContain("checkWorkerReservation");
    expect(rsv).not.toMatch(/from\("(project_worker_assignments|booking_requests|worker_absences)"\)/);
    const actions = read("lib/tasks/task-actions.ts");
    const assign = actions.slice(actions.indexOf("export async function assignWorkTaskAction"));
    expect(assign.indexOf('rpc("assign_work_task_v1"')).toBeLessThan(
      assign.indexOf("checkTaskAssignmentReservation"),
    );
    // the reservation file can express no refusal and records nothing
    expect(rsv).not.toMatch(/\.(insert|update|upsert|delete)\(|\.rpc\(/);
  });

  it("the status action never blocks on blockers", () => {
    const actions = read("lib/tasks/task-actions.ts");
    const status = actions.slice(
      actions.indexOf("export async function setWorkTaskStatusAction"),
      actions.indexOf("function noticeForCoreOutcome"),
    );
    expect(status.indexOf("setWorkTaskStatusCore")).toBeLessThan(status.indexOf("statusChangeAdvisory"));
  });

  it("evidence hours come from the canonical derivation, not a second computation", () => {
    const src = read("lib/journal/task-evidence.ts");
    expect(src).toContain("deriveEntryWorkTime");
    expect(src).toContain("JOURNAL_ENTRY_METRICS_EMBED");
    expect(src).toContain("resolveWorkerName");
  });

  it("the new strings exist in every locale that ships the tasks namespace", () => {
    const keys = [
      ["advisory", "blockersOpen"],
      ["advisory", "reservationLead"],
      ["dependencies", "startedBeforeBlocker"],
      ["dependencies", "dueBeforeBlocker"],
      ["evidence", "by"],
      ["evidence", "hours"],
    ];
    for (const loc of ["en", "lt", "de", "nl", "pl", "ru"]) {
      const tasks = JSON.parse(read(`messages/${loc}.json`)).tasks;
      for (const [a, b] of keys) {
        const v = tasks?.[a]?.[b];
        expect(typeof v, `${loc} tasks.${a}.${b}`).toBe("string");
        expect(v).not.toMatch(/demo/i);
      }
      expect(tasks.advisory.blockersOpen).toContain("{n}");
      expect(tasks.evidence.by).toContain("{name}");
      expect(tasks.evidence.hours).toContain("{hours}");
    }
  });
});
