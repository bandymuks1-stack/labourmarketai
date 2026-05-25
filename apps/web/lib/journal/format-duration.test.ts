import { describe, expect, it } from "vitest";
import { formatDuration } from "./format-duration";

describe("formatDuration — LT", () => {
  it("formats 195 minutes as '3 val. 15 min.'", () => {
    expect(formatDuration(195, "minutes", "lt")).toBe("3 val. 15 min.");
  });

  it("formats compound LT-canonical 80 minutes (= 1h20) as '1 val. 20 min.'", () => {
    expect(formatDuration(80, "minutes", "lt")).toBe("1 val. 20 min.");
  });

  it("formats sub-hour minutes as just minutes", () => {
    expect(formatDuration(45, "minutes", "lt")).toBe("45 min.");
    expect(formatDuration(15, "minutes", "lt")).toBe("15 min.");
  });

  it("formats whole hours without a stray '0 min.'", () => {
    expect(formatDuration(5, "hours", "lt")).toBe("5 val.");
    expect(formatDuration(2, "hours", "lt")).toBe("2 val.");
  });

  it("splits 1.5h as '1 val. 30 min.'", () => {
    expect(formatDuration(1.5, "hours", "lt")).toBe("1 val. 30 min.");
  });

  it("rounds float noise from compound idioms (90 min exactly)", () => {
    expect(formatDuration(89.999, "minutes", "lt")).toBe("1 val. 30 min.");
  });

  it("keeps days as days (no half-day split)", () => {
    expect(formatDuration(2, "days", "lt")).toBe("2 d.");
  });

  it("respects splitFractions:false (no mixed split)", () => {
    expect(formatDuration(5, "hours", "lt", { splitFractions: false })).toBe(
      "5 val.",
    );
    expect(
      formatDuration(195, "minutes", "lt", { splitFractions: false }),
    ).toBe("195 min.");
  });

  it("returns a labelled fallback for unknown unit slugs", () => {
    expect(formatDuration(3, "weeks", "lt")).toBe("3 weeks");
  });
});

describe("formatDuration — EN", () => {
  it("formats 195 minutes as '3 h 15 min'", () => {
    expect(formatDuration(195, "minutes", "en")).toBe("3 h 15 min");
  });

  it("formats 80 minutes as '1 h 20 min'", () => {
    expect(formatDuration(80, "minutes", "en")).toBe("1 h 20 min");
  });

  it("formats whole hours without stray '0 min'", () => {
    expect(formatDuration(5, "hours", "en")).toBe("5 h");
  });

  it("formats days as days", () => {
    expect(formatDuration(2, "days", "en")).toBe("2 d");
  });
});

describe("formatDuration — edge cases", () => {
  it("rejects negative input gracefully", () => {
    expect(formatDuration(-3, "minutes", "lt")).toMatch(/-3/);
  });

  it("rejects NaN gracefully", () => {
    expect(formatDuration(NaN, "minutes", "lt")).toMatch(/NaN/);
  });
});
