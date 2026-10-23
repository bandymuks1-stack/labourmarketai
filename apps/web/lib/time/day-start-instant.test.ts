import { describe, expect, it } from "vitest";

import { dayStartInstantIso } from "./local-day";

/** Audit 2026-10-16 (C-3): "today" on the project stadium is the viewer's day. */
describe("dayStartInstantIso", () => {
  it("Vilnius (UTC+3 in summer) midnight is 21:00 UTC the evening before", () => {
    expect(dayStartInstantIso("2026-07-15", "Europe/Vilnius")).toBe("2026-07-14T21:00:00.000Z");
  });
  it("Vilnius (UTC+2 in winter) midnight is 22:00 UTC the evening before", () => {
    expect(dayStartInstantIso("2026-01-15", "Europe/Vilnius")).toBe("2026-01-14T22:00:00.000Z");
  });
  it("a zone west of UTC starts its day after UTC midnight", () => {
    expect(dayStartInstantIso("2026-07-15", "America/New_York")).toBe("2026-07-15T04:00:00.000Z");
  });
  it("an unknown or invalid zone falls back to UTC midnight", () => {
    expect(dayStartInstantIso("2026-07-15", null)).toBe("2026-07-15T00:00:00.000Z");
    expect(dayStartInstantIso("2026-07-15", "Mars/Olympus")).toBe("2026-07-15T00:00:00.000Z");
  });
});
