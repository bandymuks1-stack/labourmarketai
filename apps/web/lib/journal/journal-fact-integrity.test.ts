import { describe, expect, it } from "vitest";
import { parseClockTime, resolveEntryLanguage } from "./journal-write-core";

/**
 * Audit 2026-10-16 — journal FACT integrity (J-3, J-4).
 *
 * The entry's `original_language` is validated against the communication
 * locales the DB CHECK admits, so a stale or tampered form value never
 * surfaces as a raw `entry_insert_failed`; and the clock times a chat intake
 * parses are accepted only in a strict HH:MM shape.
 */
describe("resolveEntryLanguage", () => {
  it("accepts every communication locale, case-insensitively, trimming a region tag", () => {
    expect(resolveEntryLanguage("lt")).toBe("lt");
    expect(resolveEntryLanguage("EN")).toBe("en");
    expect(resolveEntryLanguage("ru-RU")).toBe("ru");
    expect(resolveEntryLanguage("uk")).toBe("uk");
    expect(resolveEntryLanguage("ka")).toBe("ka");
  });
  it("falls back to the platform default for anything the CHECK would refuse", () => {
    expect(resolveEntryLanguage("xx")).toBe("lt");
    expect(resolveEntryLanguage("")).toBe("lt");
    expect(resolveEntryLanguage(null)).toBe("lt");
    expect(resolveEntryLanguage("<script>")).toBe("lt");
  });
});

describe("parseClockTime", () => {
  it("normalises a 24-hour HH:MM", () => {
    expect(parseClockTime("8:05")).toBe("08:05");
    expect(parseClockTime("17:00")).toBe("17:00");
    expect(parseClockTime(" 00:00 ")).toBe("00:00");
  });
  it("refuses anything that is not a clock time", () => {
    for (const bad of ["24:00", "8", "8.30", "17:60", "abc", "", "0830"]) {
      expect(parseClockTime(bad)).toBeNull();
    }
  });
});
