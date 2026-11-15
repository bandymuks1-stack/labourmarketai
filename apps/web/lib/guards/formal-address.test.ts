import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ONE FORM OF ADDRESS — FORMAL (owner decision 2026-11-15).
 *
 * "Jūs" is the default professional form of address in Lithuanian and "u" in
 * Dutch; every language keeps a natural, respectful tone. Russian therefore
 * speaks "вы" throughout, as it already did almost everywhere.
 *
 * This guard exists because a mixed register kept coming back: real-user
 * walks recorded "kreipinys šokinėja" (the address jumps between "tu" and
 * "jūs") on sign-up, onboarding and the profile hub, and a surface-by-surface
 * fix never held. So it reads every catalog the web app loads — the main
 * `messages/<locale>.json` and the per-namespace `messages/<locale>/*.json` —
 * and refuses the unambiguous informal markers: the pronouns, the 2nd-person
 * singular imperatives and conditionals.
 *
 * NOT covered, on purpose: the USER'S OWN WORDS. A chat bubble the user sends
 * ("Parodyk mano profilį") or a message a worker sends to a manager word for
 * word is not the product addressing anyone; those keys are listed below by
 * name, so a new informal product string can never hide behind them.
 */

const MESSAGES = join(__dirname, "..", "..", "messages");

function flat(node: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) flat(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (typeof node === "string") {
    out[prefix] = node;
  }
  return out;
}

/** Every string the web app loads for a locale, keyed `<file>::<key>`. */
function catalog(locale: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat(JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), "utf8"))))) {
    out[`${locale}.json::${k}`] = v;
  }
  for (const file of readdirSync(join(MESSAGES, locale)).filter((f) => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(join(MESSAGES, locale, file), "utf8"));
    for (const [k, v] of Object.entries(flat(data))) out[`${file}::${k}`] = v;
  }
  return out;
}

const LT_LETTER = "a-ząčęėįšųūž";
const LT_WORD = (words: string) => new RegExp(`(?<![${LT_LETTER}])(${words})(?![${LT_LETTER}])`, "i");

/** Lithuanian: pronouns, 2sg imperatives (incl. reflexive), 2sg conditionals. */
const LT_INFORMAL = [
  LT_WORD("tu|tavo|tau|tave|tavimi|tavęs|tavyje"),
  LT_WORD(
    "pasirink|pridėk|įrašyk|patvirtink|sukurk|atidaryk|spausk|paspausk|užpildyk|pakviesk|peržiūrėk|įkelk|nurodyk|pažymėk|pradėk|grįžk|žiūrėk|susisiek|palik|naudok|patikrink|rašyk|parašyk|išsaugok|pasakyk|papasakok|ieškok|rask|gauk|siųsk|nusiųsk|atšauk|pakeisk|redaguok|ištrink|perkrauk|bandyk|pabandyk|palauk|prisijunk|užsiregistruok|registruokis|rinkis|pasirūpink|įsitikink|prisimink|eik|būk|įjunk|išjunk|aprašyk|atsiųsk|įvesk|tęsk|priskirk|atsakyk|patikslink",
  ),
  new RegExp(`(?<![${LT_LETTER}])[${LT_LETTER}]{3,}tum(?![${LT_LETTER}])`, "i"),
  // Second-person forms the sign-in screen still used ("Pamiršai slaptažodį?",
  // "Tęsi"), folded in from #3362. Unambiguous: the third person is "pamiršo",
  // "tęsia". ("Neturi" is not listed: it is also the third person.)
  LT_WORD("pamiršai|tęsi"),
];
const NL_INFORMAL = [/(?<![\wÀ-ÿ'])(je|jij|jou|jouw|jouwe|jezelf|jullie)(?![\wÀ-ÿ'])/i];
const RU_INFORMAL = [/(?<![а-яё])(ты|тебя|тебе|тобой|твой|твоя|твоё|твое|твои|твоего|твоей|твоих|твоим|твоими|твоему|твою)(?![а-яё])/i];

/** The user's own words — listed by key, nothing else is exempt. */
const USER_VOICE: Record<string, readonly string[]> = {
  lt: [
    "lt.json::conversation.chat.userProfile",
    "lt.json::conversation.chat.userAgenda",
    "lt.json::conversation.chat.userCandidates",
    "lt.json::conversation.chat.userProjects",
    "lt.json::conversation.chat.userClientDemand",
  ],
  // Text the product writes for someone to SEND (a worker's note to a manager,
  // a reviewer's ready message) is product copy and is formal too.
  nl: [],
  ru: [
    "ru.json::conversation.chat.userProfile",
    "ru.json::conversation.chat.userAgenda",
    "ru.json::conversation.chat.userCandidates",
    "ru.json::conversation.chat.userProjects",
    "ru.json::conversation.chat.userClientDemand",
  ],
};

const CASES = [
  { locale: "lt", rules: LT_INFORMAL },
  { locale: "nl", rules: NL_INFORMAL },
  { locale: "ru", rules: RU_INFORMAL },
] as const;

describe("one form of address — formal, in every catalog the web app loads (owner 2026-11-15)", () => {
  for (const { locale, rules } of CASES) {
    it(`${locale}: no informal second person outside the user's own words`, () => {
      const strings = catalog(locale);
      const exempt = new Set(USER_VOICE[locale]);
      const informal = Object.entries(strings)
        .filter(([k]) => !exempt.has(k))
        .filter(([, v]) => rules.some((rule) => rule.test(v)))
        .map(([k, v]) => `${k}: ${v}`);
      expect(informal, informal.join("\n")).toEqual([]);
    });

    it(`${locale}: every exempt key still exists and is still the user's own words`, () => {
      const strings = catalog(locale);
      for (const key of USER_VOICE[locale]) {
        expect(typeof strings[key], `${key} must exist`).toBe("string");
      }
    });
  }

  it("the rules catch the old wording (positive controls)", () => {
    expect(LT_INFORMAL.some((r) => r.test("Pasirink kalbą ir lygį, tada išsaugok."))).toBe(true);
    expect(LT_INFORMAL.some((r) => r.test("Kad tęstum, patvirtink el. paštą."))).toBe(true);
    expect(LT_INFORMAL.some((r) => r.test("Tavo diena"))).toBe(true);
    expect(NL_INFORMAL.some((r) => r.test("Heb je hulp nodig?"))).toBe(true);
    expect(RU_INFORMAL.some((r) => r.test("Твой запрос подан."))).toBe(true);
    // …and leave the formal wording and third person alone.
    expect(LT_INFORMAL.some((r) => r.test("Pasirinkite kalbą ir lygį, tada išsaugokite."))).toBe(false);
    expect(LT_INFORMAL.some((r) => r.test("Administratorius gali prisijungti prie pokalbio."))).toBe(false);
    expect(NL_INFORMAL.some((r) => r.test("Heeft u hulp nodig?"))).toBe(false);
    expect(RU_INFORMAL.some((r) => r.test("Ваш запрос подан."))).toBe(false);
  });
});
