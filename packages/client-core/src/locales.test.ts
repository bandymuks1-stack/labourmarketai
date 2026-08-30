import { describe, expect, it } from "vitest";

import {
  ACTIVE_LOCALES,
  DEFAULT_LOCALE,
  LOCALES,
  isActiveLocale,
  isPreviewTranslation,
  resolveDeviceLocale,
} from "./locales";

describe("the doctrine set", () => {
  it("holds all eleven locales and never shrinks", () => {
    expect(LOCALES).toHaveLength(11);
    expect([...ACTIVE_LOCALES].every((l) => (LOCALES as readonly string[]).includes(l))).toBe(
      true,
    );
  });

  it("the default is one of the active locales", () => {
    expect(isActiveLocale(DEFAULT_LOCALE)).toBe(true);
  });

  it("an inactive locale is not offered, even though its catalogue exists", () => {
    // Offering it would promise a translation nobody has verified.
    expect(isActiveLocale("sv")).toBe(false);
    expect(isActiveLocale("klingon")).toBe(false);
  });
});

describe("preview labelling", () => {
  it("marks AI-seeded languages as preview and human-verified ones as not", () => {
    expect(isPreviewTranslation("ru")).toBe(true);
    expect(isPreviewTranslation("nl")).toBe(true);
    expect(isPreviewTranslation("de")).toBe(true);
    expect(isPreviewTranslation("lt")).toBe(false);
    expect(isPreviewTranslation("en")).toBe(false);
  });
});

describe("resolving the device language", () => {
  it("matches on language and ignores region", () => {
    // Refusing de-AT because it is not de-DE would show an Austrian a
    // Lithuanian interface, which is worse than showing German.
    expect(resolveDeviceLocale(["de-AT"])).toBe("de");
    expect(resolveDeviceLocale(["ru_RU"])).toBe("ru");
    expect(resolveDeviceLocale(["lt-LT"])).toBe("lt");
  });

  it("takes the first supported language in the device's own order", () => {
    expect(resolveDeviceLocale(["pl-PL", "en-GB", "lt"])).toBe("en");
  });

  it("falls back to the default when nothing matches", () => {
    expect(resolveDeviceLocale(["ja-JP"])).toBe("lt");
    expect(resolveDeviceLocale([])).toBe("lt");
  });
});
