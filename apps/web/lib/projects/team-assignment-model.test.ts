import { describe, expect, it } from "vitest";

import { memberOutcomeOf, summariseTeamAssignment } from "@/lib/projects/team-assignment-model";
import type { ProjectActionResult } from "@/lib/projects/actions";
import type { ReservationVerdict } from "@/lib/workforce/commitment-reservation";

const assigned = { projectId: "p", workerProfileId: "w" };
const clear = { state: "clear", collisions: [], gaps: [] } as unknown as ReservationVerdict;
const unknown = { state: "unknown", collisions: [], gaps: [] } as unknown as ReservationVerdict;
const collides = {
  state: "collides",
  collisions: [{ source: "project", sourceId: "x", label: null, overlapStart: "2026-10-01", overlapEnd: "2026-10-03" }],
} as unknown as Extract<ProjectActionResult, { ok: true }>["reservation"];

describe("memberOutcomeOf — each member's own explicit outcome", () => {
  it("clear calendar → assigned", () => {
    expect(memberOutcomeOf("a", "A", { ok: true, assigned, reservation: clear }).outcome).toBe("assigned");
  });

  it("unknown calendar → calendar_unknown, never assigned-and-free", () => {
    expect(memberOutcomeOf("a", "A", { ok: true, assigned, reservation: unknown }).outcome).toBe("calendar_unknown");
  });

  it("a check that did not run (no verdict) is unknown, not clear", () => {
    expect(memberOutcomeOf("a", "A", { ok: true, assigned }).outcome).toBe("calendar_unknown");
  });

  it("collision → calendar_conflict, keeps the verdict and the existing alternatives", () => {
    const r = memberOutcomeOf("a", "A", {
      ok: true,
      assigned,
      reservation: collides,
      alternatives: [{ profileId: "b", name: "B" }],
    });
    expect(r.outcome).toBe("calendar_conflict");
    expect(r.reservation?.state).toBe("collides");
    expect(r.alternatives).toEqual([{ profileId: "b", name: "B" }]);
  });

  it("42501 from the database → refused; any other failure → error", () => {
    expect(memberOutcomeOf("a", "A", { ok: false, code: "not_authorized" }).outcome).toBe("refused");
    expect(memberOutcomeOf("a", "A", { ok: false, code: "error" }).outcome).toBe("error");
    expect(memberOutcomeOf("a", "A", { ok: false, code: "no_company" }).outcome).toBe("error");
  });
});

describe("summariseTeamAssignment — a partial result stays partial", () => {
  it("counts each outcome apart; refused and failed are not written", () => {
    const s = summariseTeamAssignment([
      { profileId: "1", name: "1", outcome: "assigned" },
      { profileId: "2", name: "2", outcome: "calendar_conflict" },
      { profileId: "3", name: "3", outcome: "calendar_unknown" },
      { profileId: "4", name: "4", outcome: "refused" },
      { profileId: "5", name: "5", outcome: "error" },
    ]);
    expect(s).toEqual({ written: 3, refused: 1, failed: 1, conflicts: 1, unknown: 1 });
  });

  it("an empty list is zero, not a success", () => {
    expect(summariseTeamAssignment([]).written).toBe(0);
  });
});
