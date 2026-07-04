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
  // Wave-2 catalogue expansion (2026-07-04): the former class-E gaps are now
  // installed (migration 20260704150000) and recognised.
  { text: "Dirbau su Excel ir suvedžiau duomenis.", expects: ["office-software", "data-entry"] },
  { text: "Ploviau indus restorane.", expects: ["dishwashing"] },
  { text: "Padėjau virtuvėje ruošti maistą.", expects: ["kitchen-help"] },
  { text: "Skenavau prekes ir kroviau paletes.", expects: ["barcode-scanning", "pallet-handling"] },
  { text: "Atlikau inventorizaciją sandėlyje.", expects: ["stock-taking"] },
  { text: "Remontavau automobilius servise.", expects: ["auto-repair"] },
  { text: "Taisiau buitinę techniką.", expects: ["appliance-repair"] },
  { text: "Smulkūs remonto darbai namuose.", expects: ["handyman-work"] },
  { text: "Kirpau plaukus klientams kirpykloje.", expects: ["hairdressing"] },
  { text: "Skutau barzdas klientams.", expects: ["barbering"] },
  { text: "Dariau manikiūrą ir pedikiūrą.", expects: ["nail-care"] },
  { text: "Atsakinėjau į skambučius skambučių centre.", expects: ["call-centre"] },
  { text: "Dirbau registratūroje ir priėmiau lankytojus.", expects: ["reception"] },
  { text: "Ieškojau darbuotojų ir vedžiau darbo pokalbius.", expects: ["recruitment"] },
  { text: "Tvarkiau personalo dokumentus.", expects: ["personnel-admin"] },
  { text: "Kepiau duoną kepykloje.", expects: ["baking"] },
  { text: "Dėliojau prekes į lentynas parduotuvėje.", expects: ["merchandising"] },
  { text: "Skalbiau ir lyginau drabužius.", expects: ["laundry"] },
  { text: "Dariau kavą klientams kavinėje.", expects: ["barista-work"] },
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
  // Wave-2 catalogue expansion (2026-07-04).
  { text: "I worked with Excel and entered data.", expects: ["office-software", "data-entry"] },
  { text: "I washed dishes in a restaurant.", expects: ["dishwashing"] },
  { text: "I helped in the kitchen as a kitchen porter.", expects: ["kitchen-help"] },
  { text: "I scanned goods and stacked pallets.", expects: ["barcode-scanning", "pallet-handling"] },
  { text: "I did stock taking in the warehouse.", expects: ["stock-taking"] },
  { text: "I repaired cars at a garage.", expects: ["auto-repair"] },
  { text: "I repaired appliances for clients.", expects: ["appliance-repair"] },
  { text: "I did handyman work and minor repairs.", expects: ["handyman-work"] },
  { text: "I cut hair at the salon.", expects: ["hairdressing"] },
  { text: "I worked as a barber trimming beards.", expects: ["barbering"] },
  { text: "I did manicure and pedicure for clients.", expects: ["nail-care"] },
  { text: "I answered calls in a call centre.", expects: ["call-centre"] },
  { text: "I worked at the reception and welcomed visitors.", expects: ["reception"] },
  { text: "I recruited new employees and interviewed candidates.", expects: ["recruitment"] },
  { text: "I handled personnel administration.", expects: ["personnel-admin"] },
  { text: "I baked bread at a bakery.", expects: ["baking"] },
  { text: "I stocked shelves in a supermarket.", expects: ["merchandising"] },
  { text: "I did laundry and ironed clothes.", expects: ["laundry"] },
  { text: "I worked as a barista and made coffee.", expects: ["barista-work"] },
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
  // Wave-2 catalogue expansion (2026-07-04).
  { text: "Работал с Excel и вводил данные.", expects: ["office-software", "data-entry"] },
  { text: "Мыл посуду в ресторане.", expects: ["dishwashing"] },
  { text: "Помогал на кухне как помощник повара.", expects: ["kitchen-help"] },
  { text: "Сканировал товары и складывал паллеты.", expects: ["barcode-scanning", "pallet-handling"] },
  { text: "Проводил инвентаризацию на складе.", expects: ["stock-taking"] },
  { text: "Ремонтировал машины в автосервисе.", expects: ["auto-repair"] },
  { text: "Чинил холодильники и стиральные машины.", expects: ["appliance-repair"] },
  { text: "Мелкий ремонт по дому.", expects: ["handyman-work"] },
  { text: "Стриг волосы клиентам.", expects: ["hairdressing"] },
  { text: "Работал барбером, брил бороды.", expects: ["barbering"] },
  { text: "Делала маникюр и педикюр.", expects: ["nail-care"] },
  { text: "Отвечал на звонки в колл-центре.", expects: ["call-centre"] },
  { text: "Работал на ресепшн и принимал посетителей.", expects: ["reception"] },
  { text: "Подбирал персонал и проводил собеседования.", expects: ["recruitment"] },
  { text: "Вёл кадровое делопроизводство.", expects: ["personnel-admin"] },
  { text: "Пёк хлеб в пекарне.", expects: ["baking"] },
  { text: "Выкладывал товар на полки.", expects: ["merchandising"] },
  { text: "Стирал и гладил бельё.", expects: ["laundry"] },
  { text: "Работал бариста, варил кофе.", expects: ["barista-work"] },
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
  // (2026-07-04 wave 2: the former data-entry/Excel class-E gap is FILLED —
  // migration 20260704150000 + office-software/data-entry needles; the pinned
  // gap cases moved into the LT/EN/RU packs above, per this block's rule.)

  // RED-language canaries: recognition needles exist ONLY for LT/RU/EN.
  // These ordinary work sentences in the other supported UI locales recognise
  // nothing — locale display names are NOT recognition. If a pin fails,
  // real coverage for that language was added: update the audit and replace
  // the canary with a full phrase pack for that language.
  const RED_LANGUAGE_CANARIES: Array<[string, string]> = [
    // NB: the earlier PL warehouse canary said "ładowałem palety" — "palety"
    // is a LT/PL cognate of the wave-2 "palet" needle and started matching by
    // spelling accident (like the SV "packade" case below). Cognate-free
    // sentence keeps the canary honest: PL still has NO real coverage.
    ["PL", "Pracowałem w magazynie i układałem towary na półkach."],
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
