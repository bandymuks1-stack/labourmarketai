import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The authenticated navigation chrome names itself in the reader's language.
 *
 * Found on the 390 px audit of the worker path: the phone's primary
 * navigation (`BottomNav`) announced its landmark as "Dashboard sections" and
 * every tab tap announced "Loading" — in English, on /lt, /ru, /pl, /nl and
 * /de alike. A screen-reader user on a phone heard English on every screen of
 * the product while the visible text was translated. The desktop tabs already
 * used `common.dashboardSections`; the phone bar did not.
 *
 * The rule pinned here: no chrome component that renders on every
 * authenticated page carries a literal English accessible name. Accessible
 * names come from the message catalogue like visible copy does.
 */

const ROOT = resolve(__dirname, "../..");

/** Rendered on every authenticated page (or on every nav tap). */
const CHROME = [
  "components/app/bottom-nav.tsx",
  "components/app/nav-link-pending.tsx",
  "components/app/dashboard-tabs.tsx",
  "components/app/dashboard-chrome.tsx",
  "components/app/account-menu.tsx",
  "components/app/header-search.tsx",
  "components/app/page-quick-nav.tsx",
];

/** A literal accessible name written as a word, e.g. aria-label="Loading". */
const LITERAL_NAME = /\baria-label="[A-Za-z][^"]*"/g;

describe("authenticated nav chrome — accessible names are translated", () => {
  for (const file of CHROME) {
    it(`${file} has no literal English aria-label`, () => {
      const src = readFileSync(resolve(ROOT, file), "utf8");
      expect(src.match(LITERAL_NAME) ?? []).toEqual([]);
    });
  }

  it("the phone bar uses the same landmark name as the desktop tabs", () => {
    const bottom = readFileSync(resolve(ROOT, "components/app/bottom-nav.tsx"), "utf8");
    const tabs = readFileSync(resolve(ROOT, "components/app/dashboard-tabs.tsx"), "utf8");
    expect(tabs).toContain('t("common.dashboardSections")');
    expect(bottom).toContain('t("common.dashboardSections")');
  });

  it("the pending-navigation status reads common.loading in every active locale", () => {
    const src = readFileSync(resolve(ROOT, "components/app/nav-link-pending.tsx"), "utf8");
    expect(src).toContain('t("loading")');
    const en = JSON.parse(readFileSync(resolve(ROOT, "messages/en.json"), "utf8"));
    for (const locale of ["lt", "ru", "nl", "de", "pl"]) {
      const cat = JSON.parse(readFileSync(resolve(ROOT, `messages/${locale}.json`), "utf8"));
      expect(cat.common?.loading, `${locale} common.loading`).toBeTruthy();
      expect(cat.common.loading, `${locale} common.loading is not English`).not.toBe(en.common.loading);
    }
  });
});
