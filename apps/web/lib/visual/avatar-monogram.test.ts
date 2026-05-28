import { describe, expect, it } from "vitest";

import { avatarMonogram } from "./avatar-monogram";

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
