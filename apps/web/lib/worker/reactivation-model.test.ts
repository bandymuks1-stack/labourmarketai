import { describe, expect, it } from "vitest";

import { deriveReactivationSignal } from "./reactivation-model";
import type {
  WeeklyIntelligenceSignal,
  WeeklyPersonalIntelligence,
} from "./weekly-intelligence-model";

/**
 * Reactivation candidate deriver — the honesty rules that keep a reactivation
 * nudge factual and spam-free.
 *
 * The SUT reads ONLY `intelligence.signals`, so these fixtures build a focused
 * WeeklyPersonalIntelligence carrying just the signal list under test (the full
 * shape is covered by weekly-intelligence-model.test.ts).
 */
const intel = (signals: WeeklyIntelligenceSignal[]): WeeklyPersonalIntelligence =>
  ({ signals } as unknown as WeeklyPersonalIntelligence);

const OPP = (count: number): WeeklyIntelligenceSignal => ({
  code: "matching_opportunities",
  count,
  exemplar: { requestId: "req-1", roleSlug: "welder", basis: {} as never },
});

describe("deriveReactivationSignal", () => {
  it("never nudges an active profile — that is the weekly digest's job", () => {
    const r = deriveReactivationSignal("active", intel([OPP(9)]));
    expect(r.code).toBe("not_a_candidate");
    if (r.code === "not_a_candidate") expect(r.decline).toBe("profile_active");
  });

  it("a dormant worker with real matches is a candidate; the count is copied, not invented", () => {
    const r = deriveReactivationSignal("dormant", intel([OPP(7)]));
    expect(r.code).toBe("reactivation_candidate");
    if (r.code === "reactivation_candidate") {
      expect(r.reasons).toContain("opportunities_waiting");
      expect(r.opportunityCount).toBe(7); // exactly the signal's count
      expect(r.exemplar?.requestId).toBe("req-1");
      expect(r.bucket).toBe("dormant");
    }
  });

  it("a recent worker with fresh-market activity is a gentle candidate (count stays 0)", () => {
    const r = deriveReactivationSignal(
      "recent",
      intel([{ code: "appeared_this_week", count: 4 }]),
    );
    expect(r.code).toBe("reactivation_candidate");
    if (r.code === "reactivation_candidate") {
      expect(r.reasons).toEqual(["fresh_market_activity"]);
      expect(r.opportunityCount).toBe(0); // no matching_opportunities signal → never a fake number
      expect(r.bucket).toBe("recent");
    }
  });

  it("missing-evidence alone qualifies (recent work could fill the gap)", () => {
    const r = deriveReactivationSignal(
      "dormant",
      intel([{ code: "missing_evidence", skillSlugs: ["scaffolding"] }]),
    );
    expect(r.code).toBe("reactivation_candidate");
    if (r.code === "reactivation_candidate") {
      expect(r.reasons).toEqual(["evidence_to_add"]);
    }
  });

  it("away but nothing real to say → not a candidate (no spam)", () => {
    const r = deriveReactivationSignal(
      "dormant",
      intel([{ code: "no_matching_opportunities" }, { code: "journal_inactive" }]),
    );
    expect(r.code).toBe("not_a_candidate");
    if (r.code === "not_a_candidate") expect(r.decline).toBe("no_real_pull");
  });

  it("board read unavailable → declines with that reason, never claims a count", () => {
    const r = deriveReactivationSignal(
      "dormant",
      intel([{ code: "opportunities_unavailable" }]),
    );
    expect(r.code).toBe("not_a_candidate");
    if (r.code === "not_a_candidate")
      expect(r.decline).toBe("opportunities_unavailable");
  });

  it("a zero-count matching signal is not a pull on its own", () => {
    // count === 0 must not create an opportunities_waiting reason.
    const r = deriveReactivationSignal("dormant", intel([OPP(0)]));
    expect(r.code).toBe("not_a_candidate");
  });

  it("every candidate carries at least one reason", () => {
    const r = deriveReactivationSignal(
      "dormant",
      intel([OPP(3), { code: "appeared_this_week", count: 2 }, { code: "missing_evidence", skillSlugs: ["x"] }]),
    );
    expect(r.code).toBe("reactivation_candidate");
    if (r.code === "reactivation_candidate") {
      expect(r.reasons.length).toBeGreaterThanOrEqual(1);
      expect(r.reasons).toEqual([
        "opportunities_waiting",
        "fresh_market_activity",
        "evidence_to_add",
      ]);
      expect(r.opportunityCount).toBe(3);
    }
  });
});
