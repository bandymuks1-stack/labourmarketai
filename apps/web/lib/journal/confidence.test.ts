import { describe, expect, it } from "vitest";
import { binFor, computeConfidence, recencyBoost } from "./confidence";

const NOW = new Date("2026-05-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe("binFor", () => {
  it("maps the bin boundaries (0 → red, <30 → green, ≥30 → yellow)", () => {
    expect(binFor(0)).toBe("red");
    expect(binFor(1)).toBe("green");
    expect(binFor(29)).toBe("green");
    expect(binFor(30)).toBe("yellow");
    expect(binFor(100)).toBe("yellow");
  });
});

describe("recencyBoost", () => {
  it("is 0 with no confirmation", () => {
    expect(recencyBoost(null, NOW)).toBe(0);
  });
  it("is +5 within 30 days (inclusive), +2 within 90, else 0", () => {
    expect(recencyBoost(daysAgo(0), NOW)).toBe(5);
    expect(recencyBoost(daysAgo(30), NOW)).toBe(5);
    expect(recencyBoost(daysAgo(31), NOW)).toBe(2);
    expect(recencyBoost(daysAgo(90), NOW)).toBe(2);
    expect(recencyBoost(daysAgo(91), NOW)).toBe(0);
  });
});

describe("computeConfidence", () => {
  it("is 0/red for a worker with no entries at all", () => {
    expect(
      computeConfidence(
        {
          managerConfirmedEntries: 0,
          selfLoggedEntries: 0,
          uniqueConfirmers: 0,
          lastConfirmationAt: null,
        },
        NOW,
      ),
    ).toEqual({ score: 0, bin: "red" });
  });

  it("stays green for self-logged-only entries (no confirmation)", () => {
    // 5 self-logged × 1 = 5, no confirmer, no recency → 5 → green
    expect(
      computeConfidence(
        {
          managerConfirmedEntries: 0,
          selfLoggedEntries: 5,
          uniqueConfirmers: 0,
          lastConfirmationAt: null,
        },
        NOW,
      ),
    ).toEqual({ score: 5, bin: "green" });
  });

  it("flips red → green after the first manager confirmation (closed loop)", () => {
    // 1 confirmed×3 + 1 self×1 + 1 confirmer×5 + recency 5 = 14 → green
    expect(
      computeConfidence(
        {
          managerConfirmedEntries: 1,
          selfLoggedEntries: 1,
          uniqueConfirmers: 1,
          lastConfirmationAt: daysAgo(0),
        },
        NOW,
      ),
    ).toEqual({ score: 14, bin: "green" });
  });

  it("lands exactly on the 30 boundary → yellow", () => {
    // 5 confirmed×3 (15) + 5 self×1 (5) + 1 confirmer×5 (5) + recency 5 = 30
    expect(
      computeConfidence(
        {
          managerConfirmedEntries: 5,
          selfLoggedEntries: 5,
          uniqueConfirmers: 1,
          lastConfirmationAt: daysAgo(10),
        },
        NOW,
      ),
    ).toEqual({ score: 30, bin: "yellow" });
  });

  it("clamps to 100", () => {
    const { score, bin } = computeConfidence(
      {
        managerConfirmedEntries: 100,
        selfLoggedEntries: 100,
        uniqueConfirmers: 100,
        lastConfirmationAt: daysAgo(0),
      },
      NOW,
    );
    expect(score).toBe(100);
    expect(bin).toBe("yellow");
  });
});
