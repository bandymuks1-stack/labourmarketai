import { describe, expect, it } from "vitest";

import { derivePeopleTeamState } from "@/lib/company/people-team-state";
import type { CapacityChatResult } from "@/lib/conversation/capacity-contract";

const row = (
  workerId: string,
  state: "free" | "committed" | "unavailable",
  extra: Record<string, unknown> = {},
) => ({
  workerId,
  label: workerId,
  state,
  constraint: "none" as const,
  overridable: true,
  unavailableUntil: null,
  committedTo: null,
  ...extra,
});

const ok = (over: Partial<Extract<CapacityChatResult, { kind: "ok" }>> = {}): CapacityChatResult => ({
  kind: "ok",
  from: "2026-10-01",
  to: "2026-10-01",
  rows: [
    row("a", "free"),
    row("b", "committed", { committedTo: "Namas A", unavailableUntil: "2026-10-20" }),
    row("c", "unavailable", { unavailableUntil: "2026-10-05" }),
  ],
  rosterTotal: 3,
  absencesKnown: true,
  commitmentsKnown: true,
  counts: { free: 1, committed: 1, unavailable: 1 },
  ...over,
});

describe("derivePeopleTeamState", () => {
  it("projects the capacity read per person and for the team", () => {
    const s = derivePeopleTeamState(ok());
    expect(s.byWorker.a.state).toBe("free");
    expect(s.byWorker.b).toEqual({ state: "working", until: "2026-10-20", project: "Namas A" });
    expect(s.byWorker.c.state).toBe("away");
    expect(s.counts).toEqual({ free: 1, working: 1, away: 1 });
  });

  it("a failed read is unknown, not zero", () => {
    expect(derivePeopleTeamState({ kind: "error" })).toEqual({ byWorker: {}, counts: null });
  });

  it("never calls anyone free (or counts the team) when an input did not answer", () => {
    const s = derivePeopleTeamState(ok({ commitmentsKnown: false }));
    expect(s.byWorker.a).toBeUndefined();
    expect(s.byWorker.b).toBeUndefined();
    expect(s.byWorker.c.state).toBe("away");
    expect(s.counts).toBeNull();
  });
});
