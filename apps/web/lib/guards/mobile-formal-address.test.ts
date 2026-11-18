/**
 * ONE FORM OF ADDRESS ON THE PHONE TOO (owner decision 2026-11-15, the web's
 * `formal-address.test.ts`): "Jūs" in Lithuanian, "u" in Dutch, the polite
 * "Państwo" in Polish. The native app's catalogue (`apps/mobile/src/i18n/
 * messages.ts`) is held to the same unambiguous informal markers as the web
 * catalogue, so the register does not jump when a person moves between the
 * site and the app.
 *
 * NOT covered: the legal sign-up sentence (`auth.register.legal`), which keeps
 * its exact wording, and the person's own label beside their own message
 * (`messages.fromMe`, "Ty"), a name for the reader rather than an address —
 * the web exempts the same label (`conversation.chat.speakerYou`).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../../..");
const messages = readFileSync(resolve(REPO, "apps/mobile/src/i18n/messages.ts"), "utf8");

const EXEMPT: readonly string[] = ["auth.register.legal", "messages.fromMe"];

const LT_LETTER = "a-ząčęėįšųūž";
const LT_WORD = (words: string) => new RegExp(`(?<![${LT_LETTER}])(${words})(?![${LT_LETTER}])`, "i");

/** The web guard's markers (`formal-address.test.ts`), the same words. */
const RULES: Record<"lt" | "nl" | "pl", readonly RegExp[]> = {
  lt: [
    LT_WORD("tu|tavo|tau|tave|tavimi|tavęs|tavyje"),
    LT_WORD(
      "pasirink|pridėk|įrašyk|patvirtink|sukurk|atidaryk|spausk|paspausk|užpildyk|pakviesk|peržiūrėk|įkelk|nurodyk|pažymėk|pradėk|grįžk|žiūrėk|susisiek|palik|naudok|patikrink|rašyk|parašyk|išsaugok|pasakyk|papasakok|ieškok|rask|gauk|siųsk|nusiųsk|atšauk|pakeisk|redaguok|ištrink|perkrauk|bandyk|pabandyk|palauk|prisijunk|užsiregistruok|registruokis|rinkis|pasirūpink|įsitikink|prisimink|eik|būk|įjunk|išjunk|aprašyk|atsiųsk|įvesk|tęsk|priskirk|atsakyk|patikslink",
    ),
    new RegExp(`(?<![${LT_LETTER}])[${LT_LETTER}]{3,}tum(?![${LT_LETTER}])`, "i"),
    LT_WORD("pamiršai|tęsi"),
  ],
  nl: [/(?<![\wÀ-ÿ'])(je|jij|jou|jouw|jouwe|jezelf|jullie)(?![\wÀ-ÿ'])/i],
  pl: [
    /(?<![\p{L}])(ty|ciebie|tobie|cię|twój|twoja|twoje|twojego|twojej|twojemu|twoim|twoich|twoimi|twoją|jesteś|masz|możesz|chcesz)(?![\p{L}])/iu,
    /(?<![\p{L}])\p{L}{2,}(łeś|łaś)(?![\p{L}])/iu,
  ],
};

/** One locale's `"key": "value"` pairs (a value may sit on the next line). */
function catalogue(locale: string): [string, string][] {
  const start = messages.indexOf(`const ${locale}: Catalogue = {`);
  expect(start, locale).toBeGreaterThan(-1);
  const block = messages.slice(start, messages.indexOf("\n};", start));
  return [...block.matchAll(/^\s*"([^"]+)":\s*\n?\s*"((?:[^"\\]|\\.)*)"/gm)].map((m) => [m[1]!, m[2]!]);
}

describe("mobile catalogue speaks one polite register", () => {
  for (const locale of ["lt", "nl", "pl"] as const) {
    it(`${locale}: no informal address outside the exempt keys`, () => {
      const rows = catalogue(locale);
      expect(rows.length).toBeGreaterThan(400);
      const informal = rows
        .filter(([k]) => !EXEMPT.includes(k))
        .filter(([, v]) => RULES[locale].some((r) => r.test(v)))
        .map(([k, v]) => `${k}: ${v}`);
      expect(informal).toEqual([]);
    });
  }

  it("the Polish markers catch the informal form and pass the polite one", () => {
    expect(RULES.pl.some((r) => r.test("Twoja odpowiedź została zapisana"))).toBe(true);
    expect(RULES.pl.some((r) => r.test("Nie masz powiadomień."))).toBe(true);
    expect(RULES.pl.some((r) => r.test("Otrzymałeś propozycję rezerwacji"))).toBe(true);
    expect(RULES.pl.some((r) => r.test("Nie mogą Państwo pisać w tej rozmowie."))).toBe(false);
    expect(RULES.pl.some((r) => r.test("Zapisz"))).toBe(false);
  });
});
