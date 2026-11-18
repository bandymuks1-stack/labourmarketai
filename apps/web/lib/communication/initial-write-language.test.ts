import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { initialWriteLanguage } from "./initial-write-language";

/** Chat audit 2026-11-11, defect 2: the composer's starting language. */
describe("initialWriteLanguage", () => {
  it("what the person wrote last in this thread wins", () => {
    expect(initialWriteLanguage({ ownLastLanguage: "sv", acceptLanguage: "pl", uiLocale: "en" })).toBe("sv");
  });

  it("a Swede reading the English page starts in Swedish", () => {
    expect(
      initialWriteLanguage({ ownLastLanguage: null, acceptLanguage: "sv-SE,sv;q=0.9,en;q=0.8", uiLocale: "en" }),
    ).toBe("sv");
  });

  it("browser languages are tried in order; unsupported ones are skipped", () => {
    expect(initialWriteLanguage({ ownLastLanguage: null, acceptLanguage: "zh-CN, pl;q=0.8", uiLocale: "en" })).toBe("pl");
  });

  it("nothing usable: the page's UI locale, as before", () => {
    expect(initialWriteLanguage({ ownLastLanguage: "xx", acceptLanguage: "zh-CN", uiLocale: "lt" })).toBe("lt");
    expect(initialWriteLanguage({ ownLastLanguage: undefined, acceptLanguage: null, uiLocale: "en" })).toBe("en");
  });
});

describe("wiring", () => {
  const APP = join(__dirname, "..", "..");
  it("the thread page passes its choice and the composer starts from it", () => {
    const page = readFileSync(join(APP, "app/[locale]/dashboard/communication/[conversationId]/page.tsx"), "utf8");
    expect(page).toContain("initialWriteLanguage({");
    expect(page).toContain('get("accept-language")');
    expect(page).toContain("defaultWriteLanguage={defaultWriteLanguage}");
    const composer = readFileSync(join(APP, "components/app/communication-composer.tsx"), "utf8");
    expect(composer).toContain("useState<string>(startLang)");
    // A choice saved in this browser still overrides it.
    expect(composer).toContain("window.localStorage.getItem(WRITE_LANG_STORAGE_KEY)");
    // Every explicit choice is saved, including the page's own locale.
    const onChange = composer.slice(composer.indexOf("function onWriteLangChange"));
    expect(onChange.slice(0, 600)).toContain("if (next) window.localStorage.setItem(WRITE_LANG_STORAGE_KEY, next)");
    expect(onChange.slice(0, 600)).not.toContain("next === locale");
  });
});
