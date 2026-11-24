import { describe, expect, it } from "vitest";
import { deriveJournalRecognition } from "./journal-recognition";

/**
 * Universal Journal Recall — CROSS-SECTOR corpus.
 *
 * ≥2 sentences per sector × LT/EN/RU across construction, cleaning, vehicle
 * care, programming, AI tools, logistics, manufacturing, hospitality, care,
 * agriculture and office work. Contract per row:
 *   • "covered"    — the lexicon plausibly covers it → ≥1 NON-unresolved
 *     outcome (recognised skill, candidate or claim);
 *   • "unresolved" — the lexicon genuinely lacks coverage → the fragment
 *     MUST surface as unresolved (that IS the honest universal behavior).
 * And in EVERY case: silentlyLostFragmentCount === 0.
 */

type Expectation = "covered" | "unresolved";
type Row = { sector: string; lang: "lt" | "en" | "ru"; text: string; expect: Expectation };

const CORPUS: Row[] = [
  // ── construction ────────────────────────────────────────────────────────
  { sector: "construction", lang: "lt", text: "Klijavau plyteles vonioje", expect: "covered" },
  { sector: "construction", lang: "lt", text: "Tinkavau sienas naujame name", expect: "covered" },
  { sector: "construction", lang: "en", text: "Laid laminate flooring in the kitchen", expect: "covered" },
  { sector: "construction", lang: "en", text: "Assembled furniture for the client", expect: "covered" },
  { sector: "construction", lang: "ru", text: "Укладывал плитку в ванной", expect: "covered" },
  { sector: "construction", lang: "ru", text: "Штукатурил стены на объекте", expect: "covered" },
  // ── cleaning ────────────────────────────────────────────────────────────
  { sector: "cleaning", lang: "lt", text: "Valiau langus ofise", expect: "covered" },
  { sector: "cleaning", lang: "lt", text: "Valiau patalpas po remonto", expect: "covered" },
  { sector: "cleaning", lang: "en", text: "Cleaned the house for a client", expect: "covered" },
  { sector: "cleaning", lang: "en", text: "Mopped the floors at the clinic", expect: "covered" },
  { sector: "cleaning", lang: "ru", text: "Убирал дом весь день", expect: "covered" },
  { sector: "cleaning", lang: "ru", text: "Мыл окна в офисе", expect: "covered" },
  // ── vehicle care ────────────────────────────────────────────────────────
  { sector: "vehicle-care", lang: "lt", text: "Ploviau automobilį klientui", expect: "covered" },
  { sector: "vehicle-care", lang: "lt", text: "Ploviau mašiną kieme", expect: "covered" },
  { sector: "vehicle-care", lang: "en", text: "Did a car wash shift", expect: "covered" },
  { sector: "vehicle-care", lang: "en", text: "Washed the car and vacuumed the seats", expect: "covered" },
  { sector: "vehicle-care", lang: "ru", text: "Помыл машину клиента", expect: "covered" },
  { sector: "vehicle-care", lang: "ru", text: "Ремонтировал машину соседа", expect: "covered" },
  // ── programming ─────────────────────────────────────────────────────────
  { sector: "programming", lang: "lt", text: "Programavau naują funkciją", expect: "covered" },
  { sector: "programming", lang: "lt", text: "Kodavau programą visą dieną", expect: "covered" },
  { sector: "programming", lang: "en", text: "Fixed bugs and wrote code", expect: "covered" },
  { sector: "programming", lang: "en", text: "Spent the day programming the dashboard", expect: "covered" },
  { sector: "programming", lang: "ru", text: "Писал код для сайта", expect: "covered" },
  { sector: "programming", lang: "ru", text: "Программировал весь вечер", expect: "covered" },
  // ── AI tools ────────────────────────────────────────────────────────────
  { sector: "ai-tools", lang: "lt", text: "Dirbau su ChatGPT dokumentacija", expect: "covered" },
  { sector: "ai-tools", lang: "lt", text: "Naudojau Claude kodui gerinti", expect: "covered" },
  { sector: "ai-tools", lang: "en", text: "Worked with ChatGPT on the drafts", expect: "covered" },
  { sector: "ai-tools", lang: "en", text: "Used Claude for the report", expect: "covered" },
  { sector: "ai-tools", lang: "ru", text: "Использовал ChatGPT для текстов", expect: "covered" },
  { sector: "ai-tools", lang: "ru", text: "Работал с Claude над кодом", expect: "covered" },
  // ── logistics ───────────────────────────────────────────────────────────
  { sector: "logistics", lang: "lt", text: "Dirbau sandėlyje, rinkau užsakymus", expect: "covered" },
  { sector: "logistics", lang: "lt", text: "Kroviau paletes visą pamainą", expect: "covered" },
  { sector: "logistics", lang: "en", text: "Picked orders in the warehouse", expect: "covered" },
  { sector: "logistics", lang: "en", text: "Loaded pallets all shift", expect: "covered" },
  { sector: "logistics", lang: "ru", text: "Работал на складе", expect: "covered" },
  { sector: "logistics", lang: "ru", text: "Сборка заказов на складе", expect: "covered" },
  // ── manufacturing ───────────────────────────────────────────────────────
  { sector: "manufacturing", lang: "lt", text: "Dirbau prie konvejerio gamykloje", expect: "covered" },
  { sector: "manufacturing", lang: "lt", text: "Pakavau prekes fabrike", expect: "covered" },
  { sector: "manufacturing", lang: "en", text: "Worked on the production line", expect: "covered" },
  { sector: "manufacturing", lang: "en", text: "Packaged goods at the factory", expect: "covered" },
  { sector: "manufacturing", lang: "ru", text: "Работал на конвейере в цеху", expect: "covered" },
  { sector: "manufacturing", lang: "ru", text: "Упаковывал товар на производстве", expect: "covered" },
  // ── hospitality ─────────────────────────────────────────────────────────
  { sector: "hospitality", lang: "lt", text: "Gaminau maistą virtuvėje", expect: "covered" },
  { sector: "hospitality", lang: "lt", text: "Ploviau indus restorane", expect: "covered" },
  { sector: "hospitality", lang: "en", text: "Cooked in the kitchen all evening", expect: "covered" },
  { sector: "hospitality", lang: "en", text: "Washed dishes at the restaurant", expect: "covered" },
  { sector: "hospitality", lang: "ru", text: "Готовил на кухне", expect: "covered" },
  { sector: "hospitality", lang: "ru", text: "Мыл посуду в ресторане", expect: "covered" },
  // ── care ────────────────────────────────────────────────────────────────
  { sector: "care", lang: "lt", text: "Slaugiau senelį namuose", expect: "covered" },
  { sector: "care", lang: "lt", text: "Prižiūrėjau vaikus darželyje", expect: "covered" },
  { sector: "care", lang: "en", text: "Looked after a child", expect: "covered" },
  { sector: "care", lang: "en", text: "Did an elderly care shift", expect: "covered" },
  { sector: "care", lang: "ru", text: "Присматривал за детьми", expect: "covered" },
  { sector: "care", lang: "ru", text: "Ухаживал за пожилым человеком", expect: "covered" },
  // ── agriculture ─────────────────────────────────────────────────────────
  { sector: "agriculture", lang: "lt", text: "Pjoviau žolę sode", expect: "covered" },
  { sector: "agriculture", lang: "lt", text: "Šėriau žirgus arklidėje", expect: "covered" },
  { sector: "agriculture", lang: "en", text: "Mowed the lawn and trimmed the hedge", expect: "covered" },
  { sector: "agriculture", lang: "en", text: "Did farm work all week", expect: "covered" },
  { sector: "agriculture", lang: "ru", text: "Работал в саду", expect: "covered" },
  { sector: "agriculture", lang: "ru", text: "Собирал урожай на ферме", expect: "covered" },
  // ── office ──────────────────────────────────────────────────────────────
  { sector: "office", lang: "lt", text: "Tvarkiau dokumentus biure", expect: "covered" },
  { sector: "office", lang: "lt", text: "Suvedžiau duomenis į sistemą", expect: "covered" },
  { sector: "office", lang: "en", text: "Handled paperwork and documents", expect: "covered" },
  { sector: "office", lang: "en", text: "Entered data into the system", expect: "covered" },
  { sector: "office", lang: "ru", text: "Оформлял документы", expect: "covered" },
  { sector: "office", lang: "ru", text: "Вводил данные в систему", expect: "covered" },
  // ── genuinely OUTSIDE the lexicon — honest unresolved, never lost ──────
  { sector: "out-of-lexicon", lang: "lt", text: "Žaidžiau šachmatais turnyre", expect: "unresolved" },
  { sector: "out-of-lexicon", lang: "lt", text: "Skridau parasparniu virš marių", expect: "unresolved" },
  { sector: "out-of-lexicon", lang: "en", text: "Practised origami folding", expect: "unresolved" },
  { sector: "out-of-lexicon", lang: "ru", text: "Играл на скрипке", expect: "unresolved" },
];

const derive = (text: string) =>
  deriveJournalRecognition(text, {
    declaredSlugs: new Set(),
    entryRejections: { slugs: new Set(), claimLabels: new Set() },
  });

describe("cross-sector corpus — universal recall with honest degradation", () => {
  it.each(CORPUS.map((r) => [`${r.sector}/${r.lang}: ${r.text}`, r] as const))(
    "%s",
    (_name, row) => {
      const r = derive(row.text);
      // Never lost — the hard invariant.
      expect(r.coverage.silentlyLostFragmentCount).toBe(0);
      const nonUnresolvedOutcomes =
        r.recognizedSkills.length + r.candidates.length + r.claims.length;
      if (row.expect === "covered") {
        expect(
          nonUnresolvedOutcomes,
          `expected lexicon coverage for: ${row.text}`,
        ).toBeGreaterThan(0);
      } else {
        expect(
          r.unresolvedFragments.length,
          `expected honest unresolved for: ${row.text}`,
        ).toBeGreaterThan(0);
      }
    },
  );

  it("the corpus spans ≥11 sectors × 3 languages with ≥2 rows each", () => {
    const sectors = new Set(CORPUS.map((r) => r.sector));
    expect(sectors.size).toBeGreaterThanOrEqual(12);
    for (const sector of sectors) {
      if (sector === "out-of-lexicon") continue;
      for (const lang of ["lt", "en", "ru"] as const) {
        const rows = CORPUS.filter(
          (r) => r.sector === sector && r.lang === lang,
        );
        expect(rows.length, `${sector}/${lang}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
