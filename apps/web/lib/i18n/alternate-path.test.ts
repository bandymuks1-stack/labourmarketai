import { describe, it, expect } from "vitest";
import { alternatePathFor } from "./alternate-path";

// An answer's slug is translated, so "the same page in English" is NOT the same
// path with another prefix: production served 404 for /en/questions/<lt slug>.
const ANSWER = [
  { hreflang: "lt", href: "https://labourmarket.ai/lt/questions/kaip-pradeti-ieskoti-darbo" },
  { hreflang: "en", href: "https://labourmarket.ai/en/questions/how-to-start-looking-for-work" },
  { hreflang: "x-default", href: "https://labourmarket.ai/en/questions/how-to-start-looking-for-work" },
];

describe("locale switcher follows the page's own hreflang alternates", () => {
  it("an answer switches to the translated slug, not the current one", () => {
    expect(alternatePathFor("en", ANSWER)).toBe("/questions/how-to-start-looking-for-work");
    expect(alternatePathFor("lt", ANSWER)).toBe("/questions/kaip-pradeti-ieskoti-darbo");
  });

  it("no alternate for that locale keeps the current path (null)", () => {
    expect(alternatePathFor("de", ANSWER)).toBeNull();
    expect(alternatePathFor("en", [])).toBeNull();
  });

  it("the locale home maps to /, and an alternate for another prefix is ignored", () => {
    expect(alternatePathFor("en", [{ hreflang: "en", href: "https://labourmarket.ai/en" }])).toBe("/");
    expect(alternatePathFor("en", [{ hreflang: "en", href: "https://labourmarket.ai/lt/x" }])).toBeNull();
    expect(alternatePathFor("en", [{ hreflang: "en", href: "https://labourmarket.ai/english" }])).toBeNull();
  });
});
