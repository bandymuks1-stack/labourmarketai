import { describe, expect, it } from "vitest";

import {
  groupMembers,
  membersNeedingNotice,
  parseAssignResult,
  refusalOf,
  scopeOf,
} from "@/lib/projects/team-assignment-model";
import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";

const clear = { state: "clear", collisions: [], gaps: [] } as unknown as ReservationVerdict;
const unknown = { state: "unknown", collisions: [], gaps: [] } as unknown as ReservationVerdict;
const collides = {
  state: "collides",
  collisions: [{ source: "project", sourceId: "x", label: null, overlapStart: "2026-10-01", overlapEnd: "2026-10-03" }],
} as unknown as ReservationVerdict;

describe("scopeOf — one relationship, three levels", () => {
  it("a row with no object and no task is project-level", () => {
    expect(scopeOf({ workObjectId: null, taskId: null })).toBe("project");
  });
  it("a task wins, an object is its own level", () => {
    expect(scopeOf({ workObjectId: null, taskId: "t" })).toBe("task");
    expect(scopeOf({ workObjectId: "o", taskId: null })).toBe("work_object");
  });
});

describe("refusalOf — the database's own words, never guessed", () => {
  it("42501 names authority, or the missing session", () => {
    expect(refusalOf({ code: "42501", message: "Not authorized to assign this team to this project" })).toBe("not_authorized");
    expect(refusalOf({ code: "42501", message: "Not authenticated" })).toBe("not_authed");
  });
  it("the stable 22023 words map to themselves", () => {
    for (const w of [
      "not_a_team",
      "team_has_no_members",
      "project_completed",
      "task_not_assignable",
      "object_not_assignable",
      "one_scope_only",
      "replace_target_not_active",
    ]) {
      expect(refusalOf({ code: "22023", message: w })).toBe(w);
    }
  });
  it("a missing function or relation is needs_migration, anything else is error", () => {
    expect(refusalOf({ code: "42883", message: "x" })).toBe("needs_migration");
    expect(refusalOf({ code: "PGRST202", message: "x" })).toBe("needs_migration");
    expect(refusalOf({ code: "XX000", message: "boom" })).toBe("error");
  });
});

describe("parseAssignResult", () => {
  it("accepts only the three outcomes with an id", () => {
    expect(parseAssignResult({ outcome: "created", assignment_id: "a" })).toEqual({ outcome: "created", assignmentId: "a" });
    expect(parseAssignResult({ outcome: "already_assigned", assignment_id: "a" })?.outcome).toBe("already_assigned");
    expect(parseAssignResult({ outcome: "replaced", assignment_id: "a" })?.outcome).toBe("replaced");
  });
  it("anything else is null — never a guessed success", () => {
    expect(parseAssignResult(null)).toBeNull();
    expect(parseAssignResult({ outcome: "created" })).toBeNull();
    expect(parseAssignResult({ outcome: "weird", assignment_id: "a" })).toBeNull();
  });
});

describe("membersNeedingNotice — unknown is not clear", () => {
  const m = (profileId: string, verdict: ReservationVerdict) => ({ profileId, name: profileId, verdict });
  it("clear members are silent; conflicts and unknowns are kept apart", () => {
    const r = membersNeedingNotice([m("a", clear), m("b", collides), m("c", unknown)]);
    expect(r.conflicts.map((x) => x.profileId)).toEqual(["b"]);
    expect(r.unknown.map((x) => x.profileId)).toEqual(["c"]);
  });
});

describe("groupMembers", () => {
  it("groups by assignment and keeps the worker id so hours stay per person", () => {
    const g = groupMembers([
      { assignment_id: "a1", profile_id: "p1", worker_id: "w1", full_name: "One" },
      { assignment_id: "a1", profile_id: "p2", worker_id: null, full_name: null },
      { assignment_id: "a2", profile_id: "p1", worker_id: "w1", full_name: "One" },
    ]);
    expect(g.get("a1")).toEqual([
      { profileId: "p1", workerId: "w1", name: "One" },
      { profileId: "p2", workerId: null, name: null },
    ]);
    expect(g.get("a2")?.length).toBe(1);
  });
});
