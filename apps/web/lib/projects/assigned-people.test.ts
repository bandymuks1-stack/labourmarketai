import { describe, expect, it } from "vitest";

import {
  assignedCountsByProject,
  countAssignedPeople,
  mergeAssignedPeople,
  readTeamAssignedPeople,
  type TeamAssignedPersonRow,
} from "@/lib/projects/assigned-people";

const person = (projectId: string, profileId: string | null, workerId: string | null) => ({
  projectId,
  profileId,
  workerId,
});
const team = (
  projectId: string,
  profileId: string | null,
  workerId: string | null,
  assignmentId = "ta1",
): TeamAssignedPersonRow => ({
  projectId,
  profileId,
  workerId,
  assignmentId,
  teamOrgId: "team-1",
  assignedAt: "2026-10-01T00:00:00Z",
  name: "Member",
});

describe("mergeAssignedPeople / countAssignedPeople - the ONE meaning of 'assigned'", () => {
  it("team only: a project with one 3-person team reads 3, not 0", () => {
    const m = mergeAssignedPeople([], [team("p", "u1", "w1"), team("p", "u2", "w2"), team("p", "u3", "w3")]);
    expect(countAssignedPeople(m, "p")).toEqual({ total: 3, viaTeam: 3, individual: 0 });
    expect(m.every((r) => r.viaTeam)).toBe(true);
  });
  it("person only: unchanged", () => {
    const m = mergeAssignedPeople([person("p", "u1", "w1"), person("p", "u2", "w2")], []);
    expect(countAssignedPeople(m, "p")).toEqual({ total: 2, viaTeam: 0, individual: 2 });
  });
  it("both ways: a person assigned individually AND via a team counts ONCE and stays individual", () => {
    const m = mergeAssignedPeople([person("p", "u1", "w1")], [team("p", "u1", "w1"), team("p", "u2", "w2")]);
    expect(countAssignedPeople(m, "p")).toEqual({ total: 2, viaTeam: 1, individual: 1 });
    expect(m.find((r) => r.profileId === "u1")?.viaTeam).toBe(false);
  });
  it("dedupes when the person row carries only a worker id and the team row both", () => {
    const m = mergeAssignedPeople([person("p", null, "w1")], [team("p", "u1", "w1")]);
    expect(m).toHaveLength(1);
    expect(m[0]?.viaTeam).toBe(false);
  });
  it("two teams on one project, or one person in two teams, count once", () => {
    const m = mergeAssignedPeople([], [team("p", "u1", "w1", "ta1"), team("p", "u1", "w1", "ta2"), team("p", "u2", "w2", "ta2")]);
    expect(countAssignedPeople(m, "p").total).toBe(2);
  });
  it("the same person on two projects is two assignments, one per project", () => {
    const m = mergeAssignedPeople([person("p1", "u1", "w1")], [team("p2", "u1", "w1")]);
    expect(assignedCountsByProject(m).get("p1")).toEqual({ total: 1, viaTeam: 0 });
    expect(assignedCountsByProject(m).get("p2")).toEqual({ total: 1, viaTeam: 1 });
  });
  it("a row with no identity is dropped, never counted", () => {
    expect(mergeAssignedPeople([person("p", null, null)], [team("p", null, null)])).toEqual([]);
  });
});

/** A fake client that behaves like the database: `team_assignments` returns ONLY
 *  assignments that are not ended (the reader asks `ended_at is null`), and the
 *  members RPC returns ONLY current members as of now (a member who left, or an
 *  ended/replaced team, contributes nobody). */
function fakeClient(opts: {
  assignments: { id: string; project_id: string; team_org_id: string; assigned_at: string }[];
  members: { assignment_id: string; profile_id: string; worker_id: string; full_name: string }[];
  failTeamRead?: boolean;
  failRpc?: boolean;
}) {
  const calls = { isEnded: 0, rpc: [] as string[][] };
  const builder = {
    select: () => builder,
    is: (col: string, val: unknown) => {
      if (col === "ended_at" && val === null) calls.isEnded += 1;
      return builder;
    },
    limit: () => builder,
    in: () => builder,
    then: (resolve: (v: unknown) => void) =>
      resolve(opts.failTeamRead ? { data: null, error: { code: "42P01" } } : { data: opts.assignments, error: null }),
  };
  return {
    calls,
    client: {
      from: () => builder,
      rpc: (_fn: string, args: { p_assignment_ids: string[] }) => {
        calls.rpc.push(args.p_assignment_ids);
        return Promise.resolve(
          opts.failRpc
            ? { data: null, error: { code: "42883" } }
            : { data: opts.members.filter((m) => args.p_assignment_ids.includes(m.assignment_id)), error: null },
        );
      },
    },
  };
}

describe("readTeamAssignedPeople", () => {
  const A = { id: "ta1", project_id: "p", team_org_id: "t1", assigned_at: "2026-10-01T00:00:00Z" };
  const member = (assignment_id: string, n: number) => ({
    assignment_id,
    profile_id: `u${n}`,
    worker_id: `w${n}`,
    full_name: `Member ${n}`,
  });

  it("resolves the current members of an active team assignment, asking only for non-ended rows", async () => {
    const { client, calls } = fakeClient({ assignments: [A], members: [member("ta1", 1), member("ta1", 2), member("ta1", 3)] });
    const rows = await readTeamAssignedPeople(client as never, ["p"]);
    expect(rows.map((r) => r.profileId)).toEqual(["u1", "u2", "u3"]);
    expect(rows[0]).toMatchObject({ projectId: "p", teamOrgId: "t1", assignmentId: "ta1", name: "Member 1" });
    expect(calls.isEnded).toBe(1);
  });
  it("ended or replaced team: the database returns no active assignment, so nobody is counted", async () => {
    const { client } = fakeClient({ assignments: [], members: [member("ta1", 1)] });
    expect(await readTeamAssignedPeople(client as never, ["p"])).toEqual([]);
  });
  it("a member who left: the resolver returns the remaining members only", async () => {
    const { client } = fakeClient({ assignments: [A], members: [member("ta1", 1), member("ta1", 2)] });
    const merged = mergeAssignedPeople([], await readTeamAssignedPeople(client as never, ["p"]));
    expect(countAssignedPeople(merged, "p").total).toBe(2);
  });
  it("replaced team: only the NEW team's assignment is active, its members count", async () => {
    const B = { id: "ta2", project_id: "p", team_org_id: "t2", assigned_at: "2026-10-03T00:00:00Z" };
    const { client } = fakeClient({ assignments: [B], members: [member("ta1", 1), member("ta2", 4)] });
    const merged = mergeAssignedPeople([], await readTeamAssignedPeople(client as never, ["p"]));
    expect(merged.map((r) => r.profileId)).toEqual(["u4"]);
  });
  it("reads the members in chunks of at most 100 assignment ids", async () => {
    const many = Array.from({ length: 230 }, (_, i) => ({ id: `ta${i}`, project_id: "p", team_org_id: "t", assigned_at: "2026-10-01T00:00:00Z" }));
    const { client, calls } = fakeClient({ assignments: many, members: [] });
    await readTeamAssignedPeople(client as never);
    expect(calls.rpc.map((c) => c.length)).toEqual([100, 100, 30]);
  });
  it("empty project list reads nothing; any failure degrades to an empty list (never a fabricated person)", async () => {
    const ok = fakeClient({ assignments: [A], members: [member("ta1", 1)] });
    expect(await readTeamAssignedPeople(ok.client as never, [])).toEqual([]);
    expect(ok.calls.rpc).toEqual([]);
    expect(await readTeamAssignedPeople(fakeClient({ assignments: [A], members: [], failTeamRead: true }).client as never, ["p"])).toEqual([]);
    expect(await readTeamAssignedPeople(fakeClient({ assignments: [A], members: [member("ta1", 1)], failRpc: true }).client as never, ["p"])).toEqual([]);
  });
});
