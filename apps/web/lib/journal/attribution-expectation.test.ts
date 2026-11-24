import { describe, expect, it } from "vitest";
import { deriveAttributionExpectation } from "./attribution-expectation";

/**
 * The owner's matrix column `skillTimeAttribution`, read by the analytics
 * layer (#1689): which attribution the person's KIND OF WORK can support,
 * said only when the figures show the pattern. Never a default reading.
 */
const hours = (attributed: number, unclaimed: number) => ({
  attributedHours: attributed,
  sharedHours: unclaimed,
  multiActivityHours: 0,
  unattributedHours: 0,
});

describe("deriveAttributionExpectation", () => {
  it("shift-type work (cleaner, ISCO 91) with mostly unclaimed hours → involvement is expected", () => {
    const r = deriveAttributionExpectation(["91"], hours(2, 30));
    expect(r).toMatchObject({ attribution: "involvement", reason: "involvement_expected" });
  });

  it("driving (ISCO 83) with mostly unclaimed hours → precise attribution is possible, the person can give the time", () => {
    const r = deriveAttributionExpectation(["83"], hours(1, 12));
    expect(r).toMatchObject({ attribution: "precise", timeModel: "driving_duty_rest", reason: "precise_possible" });
  });

  it("a trade (ISCO 71, `activity`) says nothing either way — the middle ground has no sentence", () => {
    expect(deriveAttributionExpectation(["71"], hours(1, 30))?.reason).toBeNull();
  });

  it("when most hours ARE attributed, no sentence — whatever the kind of work", () => {
    expect(deriveAttributionExpectation(["91"], hours(20, 5))?.reason).toBeNull();
    expect(deriveAttributionExpectation(["83"], hours(20, 5))?.reason).toBeNull();
  });

  it("no archetype (unknown or empty occupation path) → null, never a default; nothing recorded → null", () => {
    expect(deriveAttributionExpectation([], hours(0, 30))).toBeNull();
    expect(deriveAttributionExpectation(["00"], hours(0, 30))).toBeNull();
    expect(deriveAttributionExpectation(["91"], hours(0, 0))).toBeNull();
  });

  it("several groups compose to the most cautious attribution (driver + shift → involvement)", () => {
    const r = deriveAttributionExpectation(["83", "91"], hours(1, 12));
    expect(r?.attribution).toBe("involvement");
    expect(r?.reason).toBe("involvement_expected");
  });

  it("unclaimed = shared + multi-activity + unattributed", () => {
    const r = deriveAttributionExpectation(["91"], {
      attributedHours: 4,
      sharedHours: 2,
      multiActivityHours: 2,
      unattributedHours: 1,
    });
    expect(r?.unclaimedHours).toBe(5);
    expect(r?.reason).toBe("involvement_expected");
  });
});
