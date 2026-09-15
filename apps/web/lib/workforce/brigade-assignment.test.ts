import { describe, expect, it } from "vitest";
import {
  planBrigadeAssignment,
  type BrigadeMemberInput,
} from "@/lib/workforce/brigade-assignment";
import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";

const CLEAR: ReservationVerdict = { state: "clear", collisions: [], gaps: [] };
const UNKNOWN_TIME: ReservationVerdict = {
  state: "unknown",
  collisions: [],
  gaps: [{ reason: "source_unreadable", source: "booking" }],
};
const COLLIDES: ReservationVerdict = {
  state: "collides",
  collisions: [
    {
      source: "project",
      sourceId: "p1",
      label: "Site A",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      overlapStart: "2026-10-01",
      overlapEnd: "2026-10-05",
    },
  ],
  gaps: [],
};

const ok = (id: string): BrigadeMemberInput => ({
  workerId: id,
  authority: "permitted",
  consent: "recorded",
  time: CLEAR,
});

describe("a brigade resolves to people, and every person answers for themselves", () => {
  it("all clear → every member eligible and the unit is eligible", () => {
    const p = planBrigadeAssignment({ brigadeId: "b1", members: [ok("w1"), ok("w2")] });
    expect(p.eligibleWorkerIds).toEqual(["w1", "w2"]);
    expect(p.wholeBrigadeEligible).toBe(true);
  });

  it("one collision makes that member not-eligible and the unit not eligible", () => {
    const p = planBrigadeAssignment({
      brigadeId: "b1",
      members: [ok("w1"), { ...ok("w2"), time: COLLIDES }],
    });
    expect(p.eligibleWorkerIds).toEqual(["w1"]);
    expect(p.notEligibleWorkerIds).toEqual(["w2"]);
    expect(p.wholeBrigadeEligible).toBe(false);
  });
});

describe("UNKNOWN never becomes available, and never becomes refused", () => {
  it("an unreadable calendar is unknown — not eligible, and not not-eligible", () => {
    const p = planBrigadeAssignment({
      brigadeId: "b1",
      members: [ok("w1"), { ...ok("w2"), time: UNKNOWN_TIME }],
    });
    expect(p.unknownWorkerIds).toEqual(["w2"]);
    expect(p.eligibleWorkerIds).not.toContain("w2");
    expect(p.notEligibleWorkerIds).not.toContain("w2");
  });

  it("ONE unknown member is enough to deny the whole-brigade answer", () => {
    const p = planBrigadeAssignment({
      brigadeId: "b1",
      members: [ok("w1"), ok("w2"), { ...ok("w3"), time: UNKNOWN_TIME }],
    });
    expect(p.eligibleWorkerIds).toHaveLength(2);
    expect(p.wholeBrigadeEligible).toBe(false);
  });

  it("unknown authority is not a refusal", () => {
    const p = planBrigadeAssignment({
      brigadeId: "b1",
      members: [{ ...ok("w1"), authority: "unknown" }],
    });
    expect(p.unknownWorkerIds).toEqual(["w1"]);
    expect(p.members[0].reasons).toContain("authority_unknown");
    expect(p.members[0].reasons).not.toContain("authority_refused");
  });

  it("unknown consent is not consent, and is not refusal either", () => {
    const p = planBrigadeAssignment({
      brigadeId: "b1",
      members: [{ ...ok("w1"), consent: "unknown" }],
    });
    expect(p.members[0].eligibility).toBe("unknown");
    expect(p.eligibleWorkerIds).toHaveLength(0);
  });
});

describe("consent is never manufactured", () => {
  it("a membership with no recorded acceptance is NOT eligible", () => {
    const p = planBrigadeAssignment({
      brigadeId: "b1",
      members: [{ ...ok("w1"), consent: "not_recorded" }],
    });
    expect(p.members[0].eligibility).toBe("not_eligible");
    expect(p.members[0].reasons).toContain("consent_not_recorded");
  });

  it("no input shape can produce an eligible member without recorded consent", () => {
    for (const consent of ["not_recorded", "unknown"] as const) {
      const p = planBrigadeAssignment({
        brigadeId: "b1",
        members: [{ ...ok("w1"), consent }],
      });
      expect(p.eligibleWorkerIds).toHaveLength(0);
    }
  });
});

describe("a definite no outranks an unknown", () => {
  it("refused authority with an unreadable calendar is not_eligible, not unknown", () => {
    const p = planBrigadeAssignment({
      brigadeId: "b1",
      members: [{ ...ok("w1"), authority: "refused", time: UNKNOWN_TIME }],
    });
    expect(p.members[0].eligibility).toBe("not_eligible");
    expect(p.members[0].reasons[0]).toBe("authority_refused");
    // The unknown is still REPORTED — outranked is not erased.
    expect(p.members[0].reasons).toContain("time_unknown");
  });
});

describe("the empty brigade", () => {
  it("is not eligible — assigning nobody is not success", () => {
    const p = planBrigadeAssignment({ brigadeId: "b1", members: [] });
    expect(p.wholeBrigadeEligible).toBe(false);
    expect(p.eligibleWorkerIds).toHaveLength(0);
  });
});
