import { describe, expect, it } from "vitest";

import { avatarMonogram, personMonogram } from "./avatar-monogram";

describe("avatarMonogram", () => {
  it("returns '?' when the input is blank", () => {
    expect(avatarMonogram("")).toBe("?");
    expect(avatarMonogram("   ")).toBe("?");
  });

  it("takes the first letter of a single-word name", () => {
    expect(avatarMonogram("Jonas")).toBe("J");
  });

  it("takes the first letter of each of the first two words", () => {
    expect(avatarMonogram("Jonas Petraitis")).toBe("JP");
  });

  it("caps at two characters even when more words exist", () => {
    expect(avatarMonogram("Jonas Petraitis Antrasis")).toBe("JP");
  });

  it("upper-cases the initials even when the input is lower-case", () => {
    expect(avatarMonogram("jonas petraitis")).toBe("JP");
  });

  it("trims surrounding whitespace before splitting", () => {
    expect(avatarMonogram("  Jonas  Petraitis  ")).toBe("JP");
  });

  it("is deterministic — same input always yields the same output", () => {
    expect(avatarMonogram("Marija")).toBe(avatarMonogram("Marija"));
    expect(avatarMonogram("Marija Vilkienė")).toBe(
      avatarMonogram("Marija Vilkienė"),
    );
  });
});

describe("personMonogram (shared person-identity initials)", () => {
  it("matches avatarMonogram's two-letter result for a real name", () => {
    expect(personMonogram("Jonas Petraitis")).toBe("JP");
    expect(personMonogram("Jonas Petraitis")).toBe(avatarMonogram("Jonas Petraitis"));
    expect(personMonogram("Jonas")).toBe("J");
  });

  it("is null-safe and uses a neutral dot fallback (never '?')", () => {
    expect(personMonogram(null)).toBe("•");
    expect(personMonogram(undefined)).toBe("•");
    expect(personMonogram("")).toBe("•");
    expect(personMonogram("   ")).toBe("•");
  });
});
