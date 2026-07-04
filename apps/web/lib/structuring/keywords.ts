/**
 * Keyword dictionaries for the rule-based structuring parser. This is NOT AI
 * extraction — it is honest pattern matching. Every suggestion produced by the
 * parsers in this folder must be confirmed by the user before it becomes a
 * persisted fact (PLATFORM_DOCTRINE §7 — no fake AI claim).
 *
 * Slugs match the taxonomy in `messages/{locale}/skill-names.json` and
 * `messages/{locale}/professions.json` so the UI can render localized names
 * without duplicating copy.
 *
 * Sector awareness: every skill-hint row carries an explicit `sector`
 * (see ./sectors). Construction is one sector among many — NOT the default.
 *
 * Universal promotion (2026-07-04, owner mandate): the first-class catalogue
 * used to be construction-only — every SKILL_HINTS_LT slug was a construction
 * trade, so ONLY construction text could ever produce a catalogue skill
 * suggestion; all other professions were fenced into label-only paths. The
 * rows below now cover the whole labour market with first-class slugs
 * (transport/logistics, manufacturing, cleaning, office, IT, sales,
 * hospitality, agriculture, care, education, events), mirrored in
 * skill-names.json (all 11 locales) and the catalogue seed migration
 * 20260704120000. Construction rows are unchanged — one family among many.
 */

import type { SectorKey } from "./sectors";

export interface SkillHintRow {
  readonly slug: string;
  /** The labour-market sector this SKILL belongs to. Explicit on every row —
   *  there is no construction default. Cross-sector transferable abilities
   *  (team coordination, scheduling, QC) are tagged "other". */
  readonly sector: SectorKey;
  readonly needles: string[];
}

const asSector = (
  sector: SectorKey,
  rows: { slug: string; needles: string[] }[],
): SkillHintRow[] => rows.map((r) => ({ ...r, sector }));

/** Lowercase substrings that map a free-text mention to a canonical skill slug.
 *
 *  RU (2026-06-12): Russian needles live in the SAME rows — the matcher
 *  lowercases the haystack and does substring containment, so Cyrillic
 *  needles ride the existing mechanism (one detection path, same canonical
 *  slugs — no parallel RU table, mirroring how EN needles were added). RU
 *  needles use stems of the inflected forms a worker actually writes
 *  («укладывал плитку», «штукатурил») and avoid stems that collide with
 *  unrelated common words (e.g. «кран» also means a water tap — the crane
 *  needle is «крановщик»). */
export const SKILL_HINTS_LT: SkillHintRow[] = [
  // ── Construction trades (the original catalogue — unchanged needles) ─────
  ...asSector("construction", [
    // "klijav" (gluing) removed — too generic; it false-matched wallpapering /
    // general gluing as tiling. Tiling stays anchored on the unambiguous stems.
    { slug: "tiling", needles: ["plytel", "плитк", "плиточ"] },
    { slug: "drywall", needles: ["gipso", "gipskart", "гипсокартон", "гкл"] },
    { slug: "ceiling-systems", needles: ["lub", "потолок", "потолк"] },
    { slug: "partition-walls", needles: ["pertvar", "перегородк"] },
    { slug: "plastering", needles: ["tinkav", "tinkov", "штукатур"] },
    { slug: "skim-coating", needles: ["glaist", "шпаклев", "шпаклёв", "шпатлев"] },
    { slug: "painting", needles: ["daž", "dazym", "красил", "покраск", "маляр", "окраш"] },
    // "grind" is the ambiguous floor noun (laying vs washing) — a cleaning-context
    // guard in skill-recognition drops it for washed-floor phrases. "laminat" /
    // "parket" are unambiguous flooring MATERIALS (LT laminatas/parketas, EN
    // laminate, via substring) so "klojau parketą" / "dėjau laminatą" recognise
    // deterministically, not via fuzzy.
    { slug: "flooring", needles: ["grind", "laminat", "parket", "ламинат", "паркет", "напольн"] },
    { slug: "floor-screeding", needles: ["išlygin", "isl ygin", "стяжк"] },
    { slug: "plumbing", needles: ["santechn", "сантехник"] },
    { slug: "electrical-install", needles: ["elektr", "электр"] },
    { slug: "carpentry", needles: ["stali", "medien", "столярн", "плотник", "плотниц"] },
    { slug: "insulation", needles: ["šiltin", "siltin", "утепл", "теплоизоляц"] },
    { slug: "waterproofing", needles: ["hidroizoli", "гидроизоляц"] },
    { slug: "bricklaying", needles: ["mūr", "mur ", "кладк", "кирпич"] },
    { slug: "concrete-pouring", needles: ["bet liej", "betonav", "бетонир", "заливал бетон", "заливка бетон"] },
    { slug: "rebar-cutting", needles: ["armatūr", "armatur", "арматур"] },
    { slug: "welding-blueprint", needles: ["suvirin", "сварк", "сварщик", "сваривал"] },
    { slug: "scaffolding", needles: ["pastol", "подмост", "строительные леса", "строительных лесов"] },
    { slug: "demolition", needles: ["griovi", "ardym", "демонтаж", "снос "] },
    // Universal correction: "valym"/"уборк" used to live HERE on site-cleaning,
    // which routed EVERY generic cleaning sentence into a construction skill.
    // Generic cleaning now maps to cleaning-services (cleaning_facility below);
    // site-cleaning only fires on explicit construction-site wording.
    { slug: "site-cleaning", needles: ["statybviet valym", "statybvietes valym", "valiau statybviet", "уборка стройплощад", "уборка объекта", "site cleaning"] },
    { slug: "site-management", needles: ["statyb vadov", "objekt vadov", "прораб"] },
    // v1 construction work recognition — additional real-journal phrases,
    // mapped to existing skill-names.json slugs (no new taxonomy).
    { slug: "earthworks", needles: ["kasiau", "kasim", "iškas", "kasė", "smėl", "smel", "копал", "котлован", "транше", "землян"] },
    { slug: "wallpapering", needles: ["tapet", "обои", "обоев", "поклейк"] },
    { slug: "timber-framing", needles: ["karkas", "sij", "gegn", "apkal", "каркас", "стропил"] },
    { slug: "formwork", needles: ["klojin", "опалубк"] },
    { slug: "concrete-pouring", needles: ["sąram", "saram"] },
    { slug: "blueprint-reading", needles: ["brėžin", "brezin", "pagal projekt", "projekto skaitym", "чертеж", "чертёж", "по проекту"] },
    { slug: "general-labour", needles: ["darbo paruoš", "darbo pasiruoš", "подсобн", "разнорабоч"] },
    // systemic-ux-skills-v1 — coverage gaps the recognition audit found.
    // These slugs already exist in skill-names.json but had NO needle, so a
    // worker who wrote them in the journal got nothing recognised. Needles use
    // diacritic + diacritic-free stems (the matcher folds both) and avoid
    // collisions (e.g. "šildym" heating ≠ "šiltin" insulation).
    { slug: "drainage", needles: ["nuotek", "nuotekų", "kanalizac", "lietaus vanden", "канализац", "ливнев", "дренаж"] },
    { slug: "pipefitting", needles: ["vamzd", "vamzdyn", "трубопровод", "трубоукладч", "монтаж труб"] },
    { slug: "ventilation", needles: ["vėdin", "vedin", "ventiliac", "вентиляц", "вентиляцион"] },
    { slug: "hvac-install", needles: ["šildymo ir vėdinim", "klimat", "kondicion", "климат", "кондицион"] },
    { slug: "heating-install", needles: ["šildym", "sildym", "šildymo sistem", "отоплен", "отопительн"] },
    { slug: "roofing", needles: ["stog", "dengė stog", "dengėm stog", "perdeng stog", "крыш", "кровл", "кровел"] },
    { slug: "sanitary-install", needles: ["santechnik prietais", "santechnik įreng", "santechnikos prietais", "сантехприбор", "санприбор"] },
    // Furniture assembly is the carpentry-adjacent case the owner named:
    // "Montavau baldus" must resolve to furniture-fitting (assembly/carpentry),
    // never to a wall/масонry trade. Verb+noun anchored.
    { slug: "furniture-fitting", needles: ["bald montav", "montav bald", "montavau bald", "baldu montav", "baldų montav", "baldu surinkim", "surinkau bald", "surinkome bald", "сборка мебел", "собирал мебел", "furniture assembl", "assembled furniture"] },
  ]),
  // ── Cross-sector transferable abilities (not construction-specific) ──────
  ...asSector("other", [
    { slug: "team-coordination", needles: ["komand", "brigad", "vadovav", "бригад"] },
    { slug: "quality-control", needles: ["kokyb", "качеств"] },
    { slug: "work-scheduling", needles: ["grafik", "derin grafik", "tvarkarašt", "darbų eiliškum", "график", "расписан", "планир график"] },
  ]),
  // ── Transport & logistics ─────────────────────────────────────────────────
  ...asSector("transport_logistics", [
    { slug: "driving", needles: ["vairav", "vairuoj", "vairuotoj", "водител", "за рулем", "за рулём", "driver", "driving"] },
    { slug: "delivery-driving", needles: ["pristatym", "kurjer", "pristaciau siunt", "siuntu pristat", "courier", "delivery", "доставк", "курьер", "развозил"] },
    { slug: "cargo-transport", needles: ["veziau krovin", "vežiau krovin", "krovinio pervez", "kroviniu pervez", "krovinių pervez", "перевозил груз", "вез груз", "возил груз", "cargo"] },
    { slug: "forklift-operation", needles: ["krautuv", "autokrautuv", "forklift", "погрузчик", "штабел"] },
    { slug: "warehouse-operations", needles: ["sandėl", "sandel", "warehouse", "складск", "склад", "комплектовщик"] },
    { slug: "order-picking", needles: ["rinkau uzsakym", "rinkau užsakym", "uzsakymu rink", "užsakymų rink", "surinkau uzsakym", "surinkau užsakym", "prekiu surink", "prekių surink", "uzsakymu komplekt", "užsakymų komplekt", "komplektav", "order pick", "pakavau ir etiket", "сборка заказ", "комплектац заказ"] },
  ]),
  // ── Manufacturing & assembly ──────────────────────────────────────────────
  ...asSector("manufacturing", [
    { slug: "assembly-work", needles: ["surinkim", "surinkinėj", "surinkinej", "montavom detal", "detalių surink", "detaliu surink", "сборк", "assembly"] },
    { slug: "production-line", needles: ["konvejer", "gamybos linij", "gamykl", "fabrik", "конвейер", "производствен", "цех", "завод", "production line", "factory"] },
    { slug: "packaging", needles: ["pakav", "pakuoj", "упаков", "фасов", "packag", "packed", "etiketav"] },
    { slug: "equipment-operation", needles: ["stakl", "станк", "станок", "mechanizm", "оборудован", "equipment operat"] },
  ]),
  // ── Cleaning & facilities ─────────────────────────────────────────────────
  ...asSector("cleaning_facility", [
    // Generic cleaning is a first-class cleaning_facility skill — it used to
    // be swallowed by the construction site-cleaning slug (see above).
    { slug: "cleaning-services", needles: ["valym", "valiau", "valau", "valytoj", "siurbiau", "tvarkiau ofis", "tvarkiau biur", "ofiso tvark", "biuro tvark", "уборк", "убира", "убрал", "уборщ", "клинин", "мыл пол", "помыл пол", "cleaning", "cleaned", "cleaner", "mopped"] },
    { slug: "window-cleaning", needles: ["valiau lang", "valau lang", "ploviau lang", "langu valym", "langų valym", "мыл окн", "мытье окон", "мытьё окон", "window clean", "cleaned windows"] },
    { slug: "housekeeping", needles: ["kambari viesbut", "kambarius viesbut", "viesbut kambar", "kambarines", "patalyne", "patalynes keit", "housekeep", "room attendant", "горничн", "уборка номер", "смена белья"] },
    { slug: "winter-service", needles: ["valiau snieg", "sniego valym", "snieg nuo tak", "kasiau snieg", "barst drusk", "druska nuo led", "led barst", "snow remov", "snow clear", "gritting", "уборка снег", "чистил снег", "посыпал реагент"] },
  ]),
  // ── Office & administration ───────────────────────────────────────────────
  ...asSector("office_admin", [
    { slug: "administration", needles: ["administrav", "administrac", "rastved", "raštved", "делопроизвод", "администрир", "office admin"] },
    // EN "document(s)" only fuzzy-matched the LT "dokument" stem before —
    // exact needle makes it high confidence (phrase-pack audit 2026-07-04).
    { slug: "document-handling", needles: ["dokument", "document", "документ", "paperwork"] },
    { slug: "bookkeeping", needles: ["apskait", "buhalter", "saskait", "sąskait", "бухгалтер", "bookkeep", "accounting", "invoice", "заполнял счета", "выставлял счета"] },
  ]),
  // ── IT & software / creative ──────────────────────────────────────────────
  ...asSector("it_software", [
    // EN past-tense forms measured missing: "programmed a website and fixed
    // bugs" recognised NOTHING (phrase-pack audit 2026-07-04).
    { slug: "programming", needles: ["programav", "programuoj", "kodav", "kodo pataisym", "bug fix", "fixed bug", "wrote code", "programmed", "programming", "coding", "программир", "писал код", "разработчик"] },
    { slug: "qa-testing", needles: ["programos testav", "programeles testav", "programėlės testav", "aplikacijos testav", "qa test", "software testing", "test case", "тестировщик", "тестирование приложен", "тестирование по"] },
    { slug: "it-support", needles: ["it pagalb", "sistem administr", "it support", "helpdesk", "техподдержк"] },
    { slug: "web-design", needles: ["puslapio dizain", "web dizain", "web design", "interneto svetain", "internetin svetain", "tinklap", "веб-дизайн", "дизайн сайт"] },
    { slug: "graphic-design", needles: ["logotip", "maketav", "grafik dizain", "grafin dizain", "bukleto dizain", "plakato dizain", "graphic design", "logo design", "photoshop", "illustrator", "логотип", "макет", "графическ дизайн"] },
  ]),
  // ── Customer service & sales ──────────────────────────────────────────────
  ...asSector("retail_sales", [
    // 2026-07-04 phrase-pack audit: inflected LT "bendravAU su klientais" and
    // EN "served customers" / "communicated with clients" produced NO match —
    // the old needles assumed truncated stems. Measured gaps, not guesses
    // (runtime/audits/skill-recognition-language-coverage-audit-2026-07-04.md).
    { slug: "customer-service", needles: ["klient aptarnav", "klientų aptarnav", "aptarnavau klient", "kalbejau su klient", "kalbėjau su klient", "bendrav su klient", "bendravau su klient", "konsultavau klient", "klientu konsult", "klientų konsult", "customer service", "served customer", "communicated with client", "обслуживал клиент", "общался с клиент", "консультировал клиент"] },
    // RU "на кассе"/"в кассе" and EN "at the till" are the forms workers write.
    { slug: "cashier", needles: ["kasinink", "prie kasos", "kasoje", "cashier", "at the till", "кассир", "за кассой", "на кассе", "в кассе"] },
    { slug: "sales-assistant", needles: ["pardavej", "pardavėj", "pardavimo konsult", "sales assistant", "shop assistant", "продавец"] },
  ]),
  // ── Hospitality & food ────────────────────────────────────────────────────
  ...asSector("hospitality_food", [
    { slug: "cooking", needles: ["gaminau maist", "maisto gamin", "virtuv", "virej", "virėj", "kepiau", "viriau", "sriub", "cook", "chef", "kitchen", "повар", "кухн", "готовил"] },
    { slug: "waiting-tables", needles: ["padavej", "padavėj", "aptarnavau stal", "waiter", "waitress", "официант"] },
    { slug: "bartending", needles: ["barmen", "bartend", "бармен"] },
  ]),
  // ── Agriculture & gardening ───────────────────────────────────────────────
  ...asSector("agriculture", [
    { slug: "gardening", needles: ["priziurejau sod", "prižiūrėjau sod", "sodo prieziur", "sodo priežiūr", "sodininkyst", "sodin", "ravej", "ravėj", "vejapjov", "vejos pjov", "pjoviau zol", "pjoviau žol", "geliu prieziur", "gyvatvor", "garden", "lawn", "сад", "газон", "саженц"] },
    { slug: "farm-work", needles: ["zemes uki", "žemės ūki", "ukio darb", "ūkio darb", "derliaus", "farm work", "сельхоз", "ферм", "урожай"] },
    { slug: "animal-care", needles: ["gyvun prieziur", "gyvūnų priežiūr", "gyvuliu prieziur", "gyvulių priežiūr", "zirgu prieziur", "žirgų priežiūr", "priziurejau zirg", "prižiūrėjau žirg", "seriau zirg", "šėriau žirg", "arklid", "augintin", "animal care", "за животн", "лошад", "конюшн"] },
  ]),
  // ── Care & assistance / safety ────────────────────────────────────────────
  ...asSector("care_health", [
    // Phrase-pack audit 2026-07-04: EN "looked after an elderly man" and RU
    // "присматривал за ребёнком" (singular; the old needle only covered the
    // plural "за детьми") recognised nothing. "elderly" alone is specific.
    { slug: "elderly-care", needles: ["senjor", "senel", "senol", "slaug", "slaugiau", "elderly", "caregiver", "сиделк", "уход за пожил", "ухаживал за пожил", "за пожилым"] },
    { slug: "childcare", needles: ["vaiku prieziur", "vaikų priežiūr", "prizurejau vaik", "prižiūrėjau vaik", "aukle", "auklėjau", "darzel", "daržel", "childcare", "child care", "looked after a child", "nanny", "няня", "уход за детьми", "присматривал за дет", "за ребенк", "за ребёнк"] },
    { slug: "first-aid", needles: ["pirmoji pagalb", "pirmaja pagalb", "pirmąja pagalb", "pirmosios pagalbos", "first aid", "первая помощь", "первой помощи"] },
  ]),
  // ── Education & languages ─────────────────────────────────────────────────
  ...asSector("education", [
    { slug: "teaching", needles: ["paskait", "seminar", "mokym", "desciau", "dėsčiau", "vedziau mokym", "vedžiau mokym", "lekci", "teaching", "преподав", "лекци"] },
    { slug: "translation", needles: ["vertim", "verciau", "verčiau", "vert tekst", "subtitr", "translat", "перевод"] },
  ]),
  // ── Events ────────────────────────────────────────────────────────────────
  ...asSector("other", [
    // Phrase-pack audit 2026-07-04: LT "Organizavau renginio pasiruošimą"
    // (pasiruošimas, not paruošimas) and EN "organized the preparation of an
    // event" recognised nothing — both are common real forms.
    { slug: "event-setup", needles: ["renginiui", "sventei", "šventei", "renginio paruos", "renginio paruoš", "renginio pasiruoš", "renginio pasiruos", "organizavau rengin", "renginiu paruos", "renginių paruoš", "ruosiau rengin", "ruošiau rengin", "ruoseme rengin", "ruošėme rengin", "inventoriaus paruos", "inventoriaus paruoš", "rinkome inventori", "rinkau inventori", "event prep", "event setup", "event organis", "event organiz", "organized an event", "preparation of an event", "мероприят", "инвентарь для"] },
  ]),
];

/** slug → sector for every first-class recognisable skill. When a slug appears
 *  in multiple rows they must agree (guarded by tests). */
export const SKILL_HINT_SECTORS: ReadonlyMap<string, SectorKey> = (() => {
  const m = new Map<string, SectorKey>();
  for (const row of SKILL_HINTS_LT) {
    const prev = m.get(row.slug);
    if (prev && prev !== row.sector) {
      throw new Error(`SKILL_HINTS_LT sector conflict for '${row.slug}': ${prev} vs ${row.sector}`);
    }
    m.set(row.slug, row.sector);
  }
  return m;
})();

/** The construction-trade slug set, derived from the explicit sector tags.
 *  Tests use this (NOT "everything in SKILL_HINTS_LT") to assert that
 *  non-construction text never yields a construction skill. */
export const CONSTRUCTION_SKILL_HINT_SLUGS: ReadonlySet<string> = new Set(
  SKILL_HINTS_LT.filter((r) => r.sector === "construction").map((r) => r.slug),
);

/** Lowercase substrings that map a free-text mention to a profession slug.
 *  RU needles ride the same rows (see SKILL_HINTS_LT note). Construction
 *  professions are one family among many — universal rows sit below them. */
export const PROFESSION_HINTS_LT: { slug: string; needles: string[] }[] = [
  { slug: "tiler", needles: ["plytel", "плитк", "плиточ"] },
  { slug: "drywaller", needles: ["gipso", "gipskart", "гипсокартон", "гкл"] },
  { slug: "painter", needles: ["daž", "dazym", "красил", "покраск", "маляр"] },
  { slug: "plumber", needles: ["santechn", "сантехник"] },
  { slug: "electrician", needles: ["elektr", "электр"] },
  { slug: "carpenter", needles: ["stali", "medien", "плотник", "столяр"] },
  // EN "bricklayer" maps to the CANONICAL mason slug (LT "Mūrininkas" IS the
  // bricklayer trade) — deliberately not a second profession slug (§2).
  { slug: "mason", needles: ["mūr", "mur ", "каменщик", "кладк", "кирпич", "bricklay"] },
  { slug: "concrete_worker", needles: ["beton", "бетон"] },
  { slug: "welder", needles: ["suvirin", "сварк", "сварщик", "сваривал"] },
  { slug: "rebar_worker", needles: ["armatūr", "armatur", "арматур"] },
  { slug: "roofer", needles: ["stog", "крыш", "кровл", "кровел"] },
  { slug: "foreman", needles: ["brigadin", "vadovav", "бригадир"] },
  { slug: "site_manager", needles: ["statyb vadov", "objekt vadov", "прораб"] },
  { slug: "general_laborer", needles: ["bendr darb", "pagalbin", "разнорабоч", "подсобн"] },
  // RU: «кран» alone also means a water tap (plumbing) — only the
  // unambiguous operator/profession forms are needles.
  { slug: "crane_operator", needles: ["kran", "крановщик", "башенный кран", "башенного крана"] },
  { slug: "heavy_equipment_operator", needles: ["ekskavator", "buldoz", "krautuv", "экскаватор", "бульдозер", "погрузчик"] },
  // ── Universal professions (2026-07-04 promotion) ─────────────────────────
  { slug: "driver", needles: ["vairuotoj", "vairav", "водител", "driver"] },
  { slug: "cleaner", needles: ["valytoj", "уборщи", "cleaner"] },
  { slug: "cook", needles: ["virej", "virėj", "повар", "chef"] },
  { slug: "waiter", needles: ["padavej", "padavėj", "официант", "waiter"] },
  { slug: "warehouse_worker", needles: ["sandelinink", "sandėlinink", "комплектовщик", "складск"] },
  { slug: "software_developer", needles: ["programuotoj", "разработчик", "программист", "developer"] },
  { slug: "office_administrator", needles: ["administrator", "администратор"] },
  { slug: "gardener", needles: ["sodinink", "садовник", "gardener"] },
  { slug: "translator", needles: ["vertej", "vertėj", "переводчик", "translator"] },
  { slug: "teacher", needles: ["mokytoj", "destytoj", "dėstytoj", "преподавател", "учител", "teacher"] },
  { slug: "caregiver", needles: ["slaugytoj", "сиделк", "caregiver"] },
  { slug: "furniture_assembler", needles: ["baldu montuotoj", "baldų montuotoj", "baldu surinkėj", "baldu surinkej", "сборщик мебел", "furniture assembler"] },
];

/** Higher-level work directions surfaced as a separate suggestion bucket. */
export const WORK_DIRECTION_HINTS_LT: { slug: string; needles: string[] }[] = [
  { slug: "tiler", needles: ["vidaus apdail", "apdail", "отделочн", "отделк"] },
  // Real-world audit: "konstruk" (konstrukcijas = generic structures/components)
  // mislabels crane/steel/timber work as a concrete worker — e.g. "valdžiau
  // kraną, kėliau konstrukcijas" → concrete_worker. Concrete work is named by
  // explicit concreting words, not by "structures". Keep the unambiguous ones.
  { slug: "concrete_worker", needles: ["betonav", "betonuot", "бетонные работ", "монолитн"] },
  { slug: "electrician", needles: ["elektros darb", "instaliac", "электромонтаж"] },
  { slug: "plumber", needles: ["santechnik darb", "сантехнические работ"] },
  { slug: "carpenter", needles: ["medienos darb", "stalystės", "столярные работ"] },
];

/** Cross-domain per-fragment activity lexicon (not just construction).
 *
 *  Each row carries:
 *  - `slug`: maps to professions.json when the activity has a canonical entry
 *    (e.g. roofer, driver, cleaner). May be `null` when the activity is honest
 *    day-work the taxonomy doesn't model yet — the UI shows the LT `label`
 *    directly as a review-only free-text suggestion (no fake taxonomy
 *    invention, no auto-verified skill — see §7 of the doctrine).
 *  - `label`: short LT human-readable name for the work direction.
 *  - `needles`: lowercase substrings that trigger the match per fragment.
 *
 *  Universal promotion (2026-07-04): non-construction activities that used to
 *  be slug-less now resolve to the universal professions seeded in
 *  professions.json / migration 20260704120000 — first-class, same mechanism
 *  as the construction trades.
 *
 *  Ordering matters — earlier entries win for ambiguous fragments. */
export const ACTIVITY_HINTS_LT: {
  slug: string | null;
  label: string;
  needles: string[];
  /** Sector this activity belongs to. Construction is one sector among many;
   *  there is no construction default. Defaults to "other" when omitted. */
  sector?: SectorKey;
}[] = [
  // ── Specific-before-generic ────────────────────────────────────────────
  // Order matters: the activity matcher picks the FIRST row whose needle
  // appears in the fragment, so narrower carpentry/structural variants of
  // a "stog…" / generic phrase must sit ABOVE the wider entries below.
  {
    // "Stogo karkasas" — roof framing (carpentry-side, not the membrane).
    // Kept distinct from generic "Stogo dengimas" because the worker is
    // building the timber structure, not laying the cover.
    slug: "carpenter",
    label: "Stogo karkaso darbai",
    needles: ["stogo karkas", "stog karkas", "karkas stog", "каркас крыши", "стропильн"],
  },
  {
    // Door + window INSTALLATION. Needles are VERB-ANCHORED on purpose: a bare
    // "langus"/"durų" noun must NOT resolve to installation, because a window
    // is just as often CLEANED ("valiau langus") or replaced in a non-trade
    // context. Installation only fires when an install verb (statyti / dėti /
    // montuoti) sits with the noun. This is the owner's door/window-default fix.
    slug: "carpenter",
    label: "Durų ir langų montavimas",
    needles: [
      "stačiau duris", "stačiau langus", "staciau duris", "staciau langus",
      "dėjau duris", "dėjau langus", "dejau duris", "dejau langus",
      "montav duris", "montav langus", "montavau duris", "montavau langus",
      "durų montav", "langų montav", "duru montav", "langu montav",
      "duris ir langus montav", "duru ir langu montav",
      "ставил двери", "ставил окна", "монтаж дверей", "монтаж окон",
    ],
  },
  {
    // Project preparation / design — not a trade slug; surface as label-only
    // so the worker can confirm it without the platform pretending there's
    // a verified "project_manager" skill behind it.
    slug: null,
    label: "Projekto rengimas",
    needles: [
      "projekt reng",
      "rengiau projekt",
      "projekto rengim",
      "rengiu projekt",
      "projekt parengim", "готовил проект", "разрабатывал проект", "разработка проекта",
    ],
  },
  // ── Non-construction day-work (v3) ────────────────────────────────────
  // Each row uses explicit LT inflected forms — substring matches on short
  // roots like `tikr` / `darb` would false-match dozens of unrelated words.
  {
    // App / software testing. QA is honest software work but NOT the same
    // profession as a developer — label-only until a QA profession exists.
    slug: null,
    sector: "it_software",
    label: "Programėlės / programinės įrangos testavimas",
    needles: [
      "programėlės patikrinim",
      "programėlės testav",
      "programos patikrinim",
      "programos testav",
      "programinės įrangos patikrinim",
      "programinės įrangos testav",
      "atlikau patikrinim",
      "qa testav",
      "app testing", "тестировал приложени", "тестировал программ",
      "software testing",
    ],
  },
  {
    // Programming / software fixes — distinct from testing.
    slug: "software_developer",
    sector: "it_software",
    label: "Programavimas / kodo pataisymai",
    needles: [
      "programavau",
      "programuoju",
      "kodav",
      "programavimo darb",
      "kodo pataisym",
      "pataisymus",
      "pataisymai",
      "bug fix",
      "coding",
      "programming", "программировал", "писал код", "исправлял баг", "правил код",
    ],
  },
  {
    // Wall plastering / smoothing — distinct from generic plastering because
    // the LT verb `glaistyti` (skim-coating) is the common worker form. We
    // also surface a profession slug (`plasterer` is absent, so `skim-coating`
    // skill or null) — null is the safe pick to avoid a fake profession.
    slug: null,
    label: "Sienų glaistymas / lyginimas",
    needles: [
      "glaiščiau sien",
      "glaisčiau sien",
      "glaistau sien",
      "glaistyti sien",
      "glaist sienas",
      "lygin sien",
      "wall plaster",
      "wall smoothing",
      "skim coat", "шпаклевал стен", "шпатлевал стен", "штукатурил стен", "выравнивал стен",
    ],
  },
  {
    // Horse / animal care.
    slug: "farm_worker",
    sector: "agriculture",
    label: "Žirgų / gyvulių priežiūra",
    needles: [
      "prižiūrėjau žirg",
      "žirgų priežiūr",
      "žirg priežiūr",
      "šėriau žirg",
      "valiau arklid",
      "gyvulių priežiūr",
      "horse care", "ухаживал за лошад", "конюшн", "кормил лошад", "за животными",
      "stable",
    ],
  },
  {
    // Lecturing / teaching. Captures `dėsčiau paskaitą`, `vedžiau seminarą`.
    slug: "teacher",
    sector: "education",
    label: "Paskaitos / mokymai",
    needles: [
      "dėsčiau paskait",
      "skaiciau paskait",
      "skaitė paskait",
      "vedžiau paskait",
      "vedžiau seminar",
      "vedžiau mokymus",
      "vedžiau mokymai",
      "paskaitos",
      "paskaitą",
      "lectured",
      "teaching session",
      "workshop facilitation", "читал лекци", "вел семинар", "вёл семинар", "проводил занятия", "лекци",
    ],
  },
  // ── Construction trades ────────────────────────────────────────────────
  {
    slug: "roofer",
    sector: "construction",
    label: "Stogo dengimas",
    needles: ["stog", "dengiau stog", "dengti stog", "крыш", "кровл", "кровел"],
  },
  { slug: "tiler", label: "Plytelių klojimas", needles: ["plytel", "плитк", "плиточ"] },
  {
    slug: "drywaller",
    label: "Gipso kartono montavimas",
    needles: ["gipso", "gipskart", "гипсокартон", "гкл"],
  },
  { slug: "painter", label: "Dažymas", needles: ["daž", "dazym", "красил", "покраск", "маляр"] },
  { slug: "plumber", label: "Santechnika", needles: ["santechn", "сантехник"] },
  { slug: "electrician", label: "Elektra", needles: ["elektr", "электр"] },
  {
    slug: "carpenter",
    label: "Staliaus darbai",
    needles: ["stali", "medien", "столярн", "плотник", "плотниц"],
  },
  { slug: "mason", label: "Mūrijimas", needles: ["mūr", "mur ", "кладк", "кирпич", "каменщик"] },
  {
    slug: "concrete_worker",
    label: "Betonavimas",
    needles: ["beton liej", "betonav", "бетонир", "заливал бетон", "бетонщик"],
  },
  { slug: "welder", label: "Suvirinimas", needles: ["suvirin", "сварк", "сварщик", "сваривал"] },
  {
    slug: "rebar_worker",
    label: "Armatūros darbai",
    needles: ["armatūr", "armatur", "арматур"],
  },
  // Driving / ride-hailing — first-class driver profession since 2026-07-04.
  {
    slug: "driver",
    sector: "transport_logistics",
    label: "Pavežėjimas / vairavimas",
    needles: [
      "pavežėj",
      "pavezej",
      "pavežti",
      "pavezti",
      "vežiau",
      "veziau",
      "vairav",
      "ride-hail",
      "driver",
      "driving", "возил", "отвозил", "развозил", "перевозил", "водител", "таксовал",
    ],
  },
  {
    slug: "sales_assistant",
    sector: "retail_sales",
    label: "Kasininko / parduotuvės darbas",
    needles: [
      "kasinink",
      "kasoje",
      "kasa ",
      "parduotuv",
      "cashier",
      "retail",
      "store ", "кассир", "за кассой", "в кассе", "магазин",
    ],
  },
  {
    slug: "customer_service_specialist",
    sector: "retail_sales",
    label: "Klientų aptarnavimas",
    needles: ["klient aptarn", "aptarnav", "kalbejau su klient", "kalbėjau su klient", "обслуживал клиент", "обслуживание клиент"],
  },
  // ── Further non-construction sectors (v4) — first-class since 2026-07-04. ─
  {
    slug: "cook",
    sector: "hospitality_food",
    label: "Maisto gaminimas / virtuvė",
    needles: [
      "gaminau maist",
      "gaminau piet",
      "gaminau vakar",
      "maisto gamin",
      "virėj",
      "virtuvėj",
      "virtuvej",
      // Real-world audit: bare cooking verbs the dictionary missed (#21
      // "Gaminau pietus, kepiau ir viriau sriubą"). Safe — these stems are
      // cooking-specific (welding is "suvirinau", not "viriau").
      "kepiau",
      "viriau",
      "išviriau",
      "isviriau",
      "sriub",
      "cooking",
      "kitchen",
      "chef", "готовил еду", "готовил обед", "на кухне", "повар",
    ],
  },
  {
    slug: "caregiver",
    sector: "care_health",
    label: "Slauga / vaikų priežiūra",
    needles: [
      "slaug",
      "pacient",
      "prižiūrėjau vaik",
      "prizurejau vaik",
      "vaikų priežiūr",
      "vaiku prieziur",
      "childcare",
      "caregiv",
      "nursing", "ухаживал за", "сиделк", "медсестр", "присматривал за дет", "нянч", "за пациент",
    ],
  },
  {
    slug: "office_administrator",
    sector: "office_admin",
    label: "Biuro / administracinis darbas",
    needles: [
      "dokument tvark",
      "administrac",
      "biuro darb",
      "sąskaitų",
      "saskaitu",
      "buhalter",
      "pildziau dokument",
      "pildžiau dokument",
      "office admin",
      "paperwork", "оформлял документ", "бухгалтер", "офисн", "делопроизводств",
    ],
  },
  {
    slug: "cleaner",
    sector: "cleaning_facility",
    label: "Valymo darbai",
    needles: [
      "valymo darb",
      "valiau patalp",
      "valytoj",
      // Real-world audit: exact floor-WASHING phrases are cleaning work, not
      // floor-laying. Mapping them here gives an honest cleaning signal while
      // the flooring slug is suppressed in skill-recognition. Both diacritic
      // and plain spellings (detectActivity matches raw lowercased text).
      "ploviau grind",
      "išploviau grind",
      "isploviau grind",
      "nuploviau grind",
      "valiau grind",
      "valau grind",
      "šveičiau grind",
      "sveiciau grind",
      "siurbiau grind",
      // Window WASHING is cleaning work (not window installation). Anchored on
      // a cleaning verb + "lang…" so it never collides with the verb-anchored
      // "Durų ir langų montavimas" install row above.
      "valiau lang",
      "valau lang",
      "ploviau lang",
      "išploviau lang",
      "isploviau lang",
      "nuploviau lang",
      "langų valym",
      "langu valym",
      // Office/bureau TIDYING ("tvarkiau ofisą / biurą") is cleaning-side
      // facility upkeep, not admin paperwork — anchored on the office noun so
      // a bare "tvarkiau" never fires (same shape as "tvarkiau kambar" in the
      // capability dictionary and "tvarkiau kiem" for grounds upkeep).
      "tvarkiau ofis",
      "ofiso tvark",
      "ofisą tvark",
      "ofisa tvark",
      "tvarkiau biur",
      "biuro tvark",
      "biurą tvark",
      "biura tvark",
      "washed the floor",
      "mopped the floor",
      "cleaned the floor",
      "washed the window",
      "cleaned the window",
      "cleaned windows",
      "cleaning",
      "cleaner", "убирал", "уборк", "уборщ", "мыл полы", "помыл пол", "вымыл пол",
    ],
  },
  {
    slug: "warehouse_worker",
    sector: "transport_logistics",
    label: "Sandėlio / logistikos darbai",
    needles: [
      "sandėl",
      "sandel",
      "krovini",
      "pakrov",
      "warehouse",
      "logistics", "склад", "грузил", "погрузк", "разгру", "логистик",
    ],
  },
  {
    // Furniture assembly — the owner-named carpentry/manufacturing-adjacent
    // case ("Montavau baldus"). Verb+noun anchored (same shape as the
    // furniture-fitting skill needles) and placed ABOVE the generic
    // production row so "surinkau baldus" resolves to the furniture
    // profession, not the factory one.
    slug: "furniture_assembler",
    sector: "manufacturing",
    label: "Baldų surinkimas / montavimas",
    needles: [
      "montavau bald",
      "montav bald",
      "bald montav",
      "baldu montav",
      "baldų montav",
      "surinkau bald",
      "surinkome bald",
      "baldu surinkim",
      "baldų surinkim",
      "furniture assembl",
      "assembled furniture",
      "сборка мебел",
      "собирал мебел",
    ],
  },
  {
    // Factory / production-line / assembly day-work — first-class
    // production_worker profession since 2026-07-04. Needles use specific
    // stems so they do not collide with cooking ("gaminau maistą") or
    // unrelated words.
    slug: "production_worker",
    sector: "manufacturing",
    label: "Gamybos / surinkimo darbai",
    needles: [
      "surink",
      "konvejer",
      "gamykl",
      "fabrik",
      "gamybos lin",
      "assembly",
      "production line",
      "factory",
      "сборк",
      "конвейер",
      "производств",
      "завод",
      "цех",
    ],
  },
  {
    // Event / inventory preparation day-work — GENERIC, not tied to any one
    // item or event. First-class event_organizer profession since 2026-07-04.
    // Needles are either dative event nouns ("renginiui" / "šventei" = doing
    // work FOR an event) or multi-word prep/inventory anchors — bare "rinkome"
    // (picked/gathered) is deliberately NOT a needle because it also means
    // picking mushrooms, votes, etc. Placed last so trade-specific rows keep
    // winning.
    slug: "event_organizer",
    sector: "other",
    label: "Renginių / inventoriaus paruošimas",
    needles: [
      "renginiui",
      "šventei",
      "sventei",
      "renginio paruoš",
      "renginio paruos",
      "renginių paruoš",
      "renginiu paruos",
      "ruošiau rengin",
      "ruosiau rengin",
      "ruošėme rengin",
      "ruoseme rengin",
      "ruošėmės rengin",
      "ruosemes rengin",
      "šventės paruoš",
      "sventes paruos",
      "inventoriaus paruoš",
      "inventoriaus paruos",
      "rinkome inventori",
      "rinkau inventori",
      "inventorių rink",
      "inventoriu rink",
      "event prep",
      "prepared for the event",
      "подготовка мероприят",
      "готовил к мероприят",
      "к мероприятию",
      "инвентарь для мероприят",
    ],
  },
  // Gardening / grounds upkeep — first-class gardener profession.
  {
    slug: "gardener",
    sector: "agriculture",
    label: "Sodininkystė / aplinkos tvarkymas",
    needles: [
      "prižiūrėjau sod",
      "prizurejau sod",
      "priziurejau sod",
      "sodo priežiūr",
      "sodo prieziur",
      "sodinau",
      "pasodinau",
      "ravėjau",
      "ravejau",
      "pjoviau žol",
      "pjoviau zol",
      "vejapjov",
      "gyvatvor",
      "tvarkiau kiem",
      "garden",
      "lawn", "ухаживал за сад", "стриг газон", "косил трав", "сажал",
    ],
  },
];

/** English aliases for the activity lexicon. The matcher in the extractor
 *  lowercases the haystack so adding EN substrings to `needles` is enough
 *  for bilingual entries — kept here for clarity. */
export const ACTIVITY_HINTS_EN: typeof ACTIVITY_HINTS_LT = [
  {
    slug: "roofer",
    label: "Roofing",
    needles: ["roof", "roofing", "covering roof"],
  },
  {
    slug: "driver",
    label: "Driver / ride-hailing",
    needles: ["driver", "driving", "ride-hail", "transport"],
  },
  {
    slug: "sales_assistant",
    label: "Cashier / retail",
    needles: ["cashier", "store", "retail", "shop"],
  },
];
