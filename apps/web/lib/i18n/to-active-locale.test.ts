import { describe, expect, it } from "vitest";

import { activeLocales, defaultLocale, toActiveLocale } from "@/lib/i18n/config";

/**
 * `toActiveLocale` is the one clamp for a caller-supplied locale that is
 * about to be interpolated into a redirect or a link (agency bridge, review
 * round 2, 2026-09-24). A forged value must never survive into a path.
 */
describe("toActiveLocale — the closed active set, or the default", () => {
  it("keeps every active locale as it is", () => {
    for (const locale of activeLocales) expect(toActiveLocale(locale)).toBe(locale);
  });

  it("trims whitespace around a real code", () => {
    expect(toActiveLocale(" en ")).toBe("en");
  });

  it("NEGATIVE: a forged path never becomes a locale — `/evil.com` would be a protocol-relative Location", () => {
    for (const forged of [
      "/evil.com",
      "//evil.com",
      "../en",
      "en/../..",
      "lt/evil",
      "https://evil.com",
      "EN",
      "",
      "   ",
      null,
      undefined,
    ]) {
      const clamped = toActiveLocale(forged);
      expect(clamped, String(forged)).toBe(defaultLocale);
      expect(`/${clamped}/dashboard`.startsWith("//"), String(forged)).toBe(false);
    }
  });

  it("NEGATIVE: a real but INACTIVE locale is not routed, so it clamps too", () => {
    for (const inactive of ["lv", "et", "da", "no", "sv"]) {
      expect(toActiveLocale(inactive)).toBe(defaultLocale);
    }
  });
});
