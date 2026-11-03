import { describe, expect, it } from "vitest";

import { canRequest, toJoinableCohorts } from "./cohort-join-model";
import { splitCohortMembers } from "./programs";

/**
 * J-12 (owner decision 2026-11-02): a learner asks to join a learning group;
 * the institution's authorised person decides. The request is the same
 * membership row in an earlier state (migration 20261102160000), so two pure
 * readings must keep the states apart: the institution's roster never counts a
 * request as a member, and the learner always sees where their request stands.
 */

const row = (over: Record<string, unknown> = {}) => ({
  cohort_id: "c1",
  cohort_name: "Group A",
  program_name: "Tiling programme",
  institution_name: "QA Institution",
  target_profession_slug: null,
  starts_on: "2026-11-10",
  ends_on: null,
  join_requests_open: true,
  my_status: null,
  ...over,
});

describe("learner finder", () => {
  it("maps an open group with no request of the caller", () => {
    const [c] = toJoinableCohorts([row()]);
    expect(c).toMatchObject({ cohortId: "c1", open: true, myStatus: "none", institutionName: "QA Institution" });
    expect(canRequest(c!)).toBe(true);
  });

  it("a pending request cannot be sent twice; a declined one can be sent again only while open", () => {
    const [pending] = toJoinableCohorts([row({ my_status: "requested" })]);
    expect(canRequest(pending!)).toBe(false);
    const [declinedOpen, declinedClosed] = toJoinableCohorts([
      row({ my_status: "declined" }),
      row({ cohort_id: "c2", my_status: "declined", join_requests_open: false }),
    ]);
    expect(canRequest(declinedOpen!)).toBe(true);
    expect(canRequest(declinedClosed!)).toBe(false);
    expect(declinedClosed!.myStatus).toBe("declined");
  });

  it("drops a row in an unexpected state instead of guessing (a member's group belongs to the compass)", () => {
    expect(toJoinableCohorts([row({ my_status: "active" }), row({ cohort_id: "" })])).toEqual([]);
  });
});

describe("institution roster vs requests", () => {
  const labels = new Map([["p-invited", "Invited Name"]]);

  it("only active / left rows are members; requested rows are requests; declined / withdrawn are neither", () => {
    const { members, requests } = splitCohortMembers(
      [
        { profile_id: "p-invited", status: "active" },
        { profile_id: "p-left", status: "left" },
        { profile_id: "p-req", status: "requested", request_label: " Jonas J. ", request_note: "Second year", requested_at: "2026-11-02T10:00:00Z" },
        { profile_id: "p-dec", status: "declined", request_label: "Ona" },
        { profile_id: "p-wd", status: "withdrawn", request_label: "Petras" },
      ],
      labels,
    );
    expect(members.map((m) => [m.profileId, m.status])).toEqual([
      ["p-invited", "active"],
      ["p-left", "left"],
    ]);
    expect(requests).toEqual([{ profileId: "p-req", label: "Jonas J.", note: "Second year", requestedAt: "2026-11-02T10:00:00Z" }]);
  });

  it("names a member by the institution's own invitation first, then by what the learner typed — never by the profile", () => {
    const { members } = splitCohortMembers(
      [
        { profile_id: "p-invited", status: "active", request_label: "Typed" },
        { profile_id: "p-joined-by-request", status: "active", request_label: "Typed Name" },
        { profile_id: "p-unknown-0000", status: "active" },
      ],
      labels,
    );
    expect(members.map((m) => m.label)).toEqual(["Invited Name", "Typed Name", "p-unknow"]);
  });
});
