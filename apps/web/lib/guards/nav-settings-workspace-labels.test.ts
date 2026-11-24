import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Naming-cleanup guard (product/nav-communication-clarity-v1, PR A).
 *
 * Two owner-named contracts on the authenticated header:
 *   1. The account/settings tab is "Nustatymai" / "Settings" / "Настройки"
 *      — never "Mano paskyra" / "My account" (the page is email / theme /
 *      roles / locale / preferences, so it reads as settings).
 *   2. The WORKSPACE SWITCH labels are "Asmeninė erdvė" / "Įmonės erdvė"
 *      (and their EN/RU equivalents) so the switch never reads as an
 *      account switch.
 *
 * Active-locale only (LT/EN/RU) — the i18n-parity guard already enforces
 * those three are the fully-served set; the 8 partial locales are covered
 * by the i18n-debt ratchet, not here.
 */

const messages = join(__dirname, "..", "..", "messages");
const load = (loc: string) =>
  JSON.parse(readFileSync(join(messages, `${loc}.json`), "utf8")) as Record<string, unknown>;

const dash = (j: Record<string, unknown>) =>
  (((j.auth as Record<string, unknown>).dashboard as Record<string, unknown>).tabs) as Record<string, string>;
const switcher = (j: Record<string, unknown>) =>
  ((j.auth as Record<string, unknown>).roleSwitcher) as Record<string, string>;

describe("Guard: account tab renamed to settings, not 'paskyra/account'", () => {
  const cases: Array<[string, RegExp, RegExp]> = [
    // locale, must-match (new), must-NOT-match (old)
    ["lt", /nustatym/i, /paskyr/i],
    ["en", /setting/i, /\bmy account\b/i],
    ["ru", /настрой/i, /аккаунт/i],
  ];
  for (const [loc, must, mustNot] of cases) {
    it(`${loc}: tabs.account reads as settings`, () => {
      const v = dash(load(loc)).account;
      expect(v, `${loc}.tabs.account`).toMatch(must);
      expect(v, `${loc}.tabs.account must not say account/paskyra`).not.toMatch(mustNot);
    });
  }
});

describe("Guard: workspace switch labels are short identity words (production UX repair v2, F5)", () => {
  // The owner production finding F5: the header pill "ASMENINĖ ERDVĖ" was a
  // shouting sentence for a state the icon already carries. The workspace
  // labels are now ONE short human identity word (Asmuo / Įmonė) — still a
  // workspace, never an account switch — with the icon carrying the rest.
  const cases: Array<[string, string, string]> = [
    // locale, personSpace, companySpace
    ["lt", "Asmuo", "Įmonė"],
    ["en", "Person", "Company"],
    ["ru", "Личный", "Компания"],
  ];
  for (const [loc, person, company] of cases) {
    it(`${loc}: personSpace / companySpace are short identity labels`, () => {
      const s = switcher(load(loc));
      expect(s.personSpace, `${loc}.roleSwitcher.personSpace`).toBe(person);
      expect(s.companySpace, `${loc}.roleSwitcher.companySpace`).toBe(company);
    });
  }
});
