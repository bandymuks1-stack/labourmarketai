/**
 * Multilingual realistic-phrase recognition guard (owner mandate 2026-07-04).
 *
 * Fixtures are REAL worker sentences — the owner's mandatory LT phrase pack
 * plus EN and RU equivalents for the same labour-market families. Every
 * expectation below was MEASURED against the recognizer (probe run
 * 2026-07-04), then pinned. This guard is the proof line between:
 *   - "locale translated"        → messages/{locale}/skill-names.json only
 *   - "recognized from real text" → what THIS file proves (LT/EN/RU only)
 *   - "installed in DB"           → seed migrations / installation-chain guard
 *   - "usable as evidence"        → journal/profile flows + worker_skills
 *
 * KNOWN-GAP cases are pinned as recognising NOTHING on purpose: when someone
 * adds coverage, the pin fails and the coverage audit
 * (runtime/audits/skill-recognition-language-coverage-audit-2026-07-04.md)
 * must be updated. Do NOT delete a GAP pin to make a test pass — implement the
 * catalogue row + needles instead.
 */
import { describe, expect, it } from "vitest";
import { recognizeSkills } from "../structuring/skill-recognition";

const slugsOf = (text: string): string[] =>
  recognizeSkills(text, 10).map((s) => s.slug);

interface PhraseCase {
  text: string;
  /** Slugs that MUST be recognised. */
  expects: string[];
  /** Slugs that must NOT be recognised (measured false positives, fixed). */
  forbids?: string[];
}

const LT_PACK: PhraseCase[] = [
  { text: "Dirbau sandėlyje, pakavau prekes ir kroviau paletes.", expects: ["warehouse-operations", "packaging"] },
  { text: "Vairavau krovinį į Vokietiją su B kategorija.", expects: ["driving"] },
  { text: "Dirbau kasoje ir aptarnavau klientus.", expects: ["cashier", "customer-service"] },
  { text: "Pildžiau sąskaitas ir dokumentus.", expects: ["document-handling", "bookkeeping"] },
  { text: "Dirbau virtuvėje, ruošiau maistą ir ploviau indus.", expects: ["cooking"] },
  { text: "Prižiūrėjau senolį ir padėjau buityje.", expects: ["elderly-care"] },
  { text: "Prižiūrėjau vaiką po pamokų.", expects: ["childcare"] },
  { text: "Dirbau sode, pjoviau žolę ir sodinau augalus.", expects: ["gardening"] },
  { text: "Programavau svetainę ir taisiau klaidas.", expects: ["programming"] },
  // Power tools are NOT electrical installation (power-tool guard).
  { text: "Montavau baldus ir naudojau elektrinius įrankius.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
  { text: "Valiau biurą ir bendras patalpas.", expects: ["cleaning-services"] },
  { text: "Bendravau su klientais anglų ir vokiečių kalbomis.", expects: ["customer-service"] },
  { text: "Organizavau renginio pasiruošimą.", expects: ["event-setup"] },
  { text: "Dirbau su krautuvu sandėlyje.", expects: ["forklift-operation", "warehouse-operations"] },
  { text: "Mūrijau sieną ir maišiau skiedinį.", expects: ["bricklaying"] },
];

const EN_PACK: PhraseCase[] = [
  { text: "I worked in a warehouse, packed goods and loaded pallets.", expects: ["warehouse-operations", "packaging"] },
  { text: "I drove cargo to Germany with a category B licence.", expects: ["cargo-transport"] },
  { text: "I worked at the till and served customers.", expects: ["cashier", "customer-service"] },
  // "filled" used to fuzzy-hallucinate skim-coating (via "filler") — blocked.
  { text: "I filled in invoices and documents.", expects: ["document-handling", "bookkeeping"], forbids: ["skim-coating"] },
  { text: "I worked in the kitchen, prepared food and washed dishes.", expects: ["cooking"] },
  // "helped" used to fuzzy-hallucinate general-labour (via "helper") — blocked.
  { text: "I looked after an elderly man and helped around the house.", expects: ["elderly-care"], forbids: ["general-labour"] },
  { text: "I looked after a child after school.", expects: ["childcare"] },
  { text: "I worked in the garden, mowed the lawn and planted plants.", expects: ["gardening"] },
  { text: "I programmed a website and fixed bugs.", expects: ["programming"] },
  { text: "I assembled furniture and used power tools.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
  { text: "I cleaned the office and common areas.", expects: ["cleaning-services"] },
  { text: "I communicated with clients in English and German.", expects: ["customer-service"] },
  { text: "I organized the preparation of an event.", expects: ["event-setup"] },
  { text: "I operated a forklift in the warehouse.", expects: ["forklift-operation", "warehouse-operations"] },
  { text: "I laid bricks for a wall and mixed mortar.", expects: ["bricklaying"] },
];

const RU_PACK: PhraseCase[] = [
  { text: "Работал на складе, упаковывал товары и грузил паллеты.", expects: ["warehouse-operations", "packaging"] },
  { text: "Возил груз в Германию с категорией B.", expects: ["cargo-transport"] },
  { text: "Работал на кассе и обслуживал клиентов.", expects: ["cashier", "customer-service"] },
  { text: "Заполнял счета и документы.", expects: ["document-handling", "bookkeeping"] },
  { text: "Работал на кухне, готовил еду и мыл посуду.", expects: ["cooking"] },
  { text: "Ухаживал за пожилым человеком и помогал по дому.", expects: ["elderly-care"] },
  { text: "Присматривал за ребёнком после школы.", expects: ["childcare"] },
  { text: "Работал в саду, косил траву и сажал растения.", expects: ["gardening"] },
  { text: "Программировал сайт и исправлял ошибки.", expects: ["programming"] },
  { text: "Собирал мебель и пользовался электроинструментом.", expects: ["furniture-fitting"], forbids: ["electrical-install"] },
  { text: "Убирал офис и общие помещения.", expects: ["cleaning-services"] },
  { text: "Общался с клиентами на английском и немецком языках.", expects: ["customer-service"] },
  { text: "Организовывал подготовку мероприятия.", expects: ["event-setup"] },
  { text: "Работал на погрузчике на складе.", expects: ["forklift-operation", "warehouse-operations"] },
  { text: "Клал кирпичную стену и мешал раствор.", expects: ["bricklaying"] },
];

function runPack(name: string, pack: PhraseCase[]) {
  describe(name, () => {
    for (const c of pack) {
      it(`recognises: ${c.text}`, () => {
        const got = slugsOf(c.text);
        for (const slug of c.expects) expect(got).toContain(slug);
        for (const slug of c.forbids ?? []) expect(got).not.toContain(slug);
      });
    }
  });
}

runPack("LT phrase pack (owner mandatory list)", LT_PACK);
runPack("EN phrase pack (same families)", EN_PACK);
runPack("RU phrase pack (same families)", RU_PACK);

describe("KNOWN GAPS — pinned so coverage claims stay honest", () => {
  // Class E gap (coverage audit): NO data-entry / office-software skill exists
  // in the catalogue, so these recognise nothing in ANY language. If this pin
  // fails, coverage was added — update the audit and move the case to a pack.
  const DATA_ENTRY_GAP = [
    "Dirbau su Excel ir suvedžiau duomenis.",
    "I worked with Excel and entered data.",
    "Работал с Excel и вводил данные.",
  ];
  for (const text of DATA_ENTRY_GAP) {
    it(`data-entry gap (no catalogue skill yet): ${text}`, () => {
      expect(slugsOf(text)).toEqual([]);
    });
  }

  // RED-language canaries: recognition needles exist ONLY for LT/RU/EN.
  // These ordinary work sentences in the other supported UI locales recognise
  // nothing — locale display names are NOT recognition. If a pin fails,
  // real coverage for that language was added: update the audit and replace
  // the canary with a full phrase pack for that language.
  const RED_LANGUAGE_CANARIES: Array<[string, string]> = [
    ["PL", "Pracowałem w magazynie, pakowałem towary i ładowałem palety."],
    ["PL", "Sprzątałem biuro i części wspólne."],
    ["DE", "Ich habe im Lager gearbeitet und Waren verpackt."],
    ["DE", "Ich habe das Büro gereinigt."],
    ["NL", "Ik heb in het magazijn gewerkt en goederen verpakt."],
    ["LV", "Strādāju noliktavā, iepakoju preces."],
    ["ET", "Töötasin laos ja pakkisin kaupu."],
  ];
  for (const [lang, text] of RED_LANGUAGE_CANARIES) {
    it(`${lang} has no real recognition yet: ${text}`, () => {
      expect(slugsOf(text)).toEqual([]);
    });
  }

  // SV canary: "packade" happens to fuzzy-brush the EN "packag" stem — an
  // ACCIDENT of spelling proximity, not Swedish coverage. Pinned as-is so
  // nobody mistakes one lucky fuzzy hit for a supported language.
  it("SV has no real recognition (one accidental fuzzy brush only)", () => {
    const got = recognizeSkills("Jag arbetade på lagret och packade varor.", 10);
    expect(got.every((s) => s.via === "fuzzy")).toBe(true);
  });
});
