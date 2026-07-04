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
    // "mūr" used to be the bare folded stem "mur" — it substring-matched
    // NL "muren" (walls), DA "muren" (the wall) and EN "murmur…" once the
    // offline packs made those languages first-class (PR3C audit). The
    // explicit LT stems below cover every real masonry form (mūrijau,
    // mūryti, mūrininkas, mūro siena) without the cross-language bleed.
    { slug: "bricklaying", needles: ["mūrij", "mūryt", "mūrinink", "mūro", "кладк", "кирпич"] },
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
  // ══ Wave-2 catalogue expansion (2026-07-04) — class-E gaps from the
  //    language-coverage audit. Every slug below is seeded by migration
  //    20260704150000 and named in all 11 locales (installation-chain guard
  //    enforces the full chain). LT/EN/RU needles only — other languages stay
  //    honestly RED until their own needle pass (audit §5 PR3). ═══════════════
  // ── Office & administration (wave 2) ──────────────────────────────────────
  ...asSector("office_admin", [
    // The measured "Dirbau su Excel" gap: needles are preposition-anchored so
    // "excel" never fires from EN "excellent".
    { slug: "office-software", needles: ["su excel", "with excel", "с excel", "в excel", "excel lentel", "spreadsheet", "skaiciuokl", "skaičiuokl", "экселе", "эксель", "электронн таблиц"] },
    { slug: "data-entry", needles: ["suvedziau duomen", "suvedžiau duomen", "duomenu suved", "duomenų suved", "vedziau duomen", "vedžiau duomen", "data entry", "entered data", "вводил данные", "ввод данных"] },
    { slug: "reception", needles: ["registratur", "registratūr", "reception", "priemiau lankytoj", "priėmiau lankytoj", "ресепшн", "регистратур", "принимал посетител"] },
  ]),
  // ── Warehouse & logistics (wave 2) ─────────────────────────────────────────
  ...asSector("transport_logistics", [
    // Anchored on goods/codes so office document scanning never fires this.
    { slug: "barcode-scanning", needles: ["skenavau prek", "prekiu skenav", "prekių skenav", "skenavau kod", "barcode", "scanned goods", "scanned items", "сканировал товар", "сканировал штрих", "штрихкод", "штрих-код"] },
    { slug: "pallet-handling", needles: ["palet", "pallet", "паллет", "поддон"] },
    { slug: "stock-taking", needles: ["inventoriz", "stock taking", "stocktak", "stock count", "инвентаризац"] },
  ]),
  // ── Hospitality & food (wave 2) ────────────────────────────────────────────
  ...asSector("hospitality_food", [
    { slug: "kitchen-help", needles: ["virtuves pagalb", "virtuvės pagalb", "padejau virtuv", "padėjau virtuv", "kitchen help", "kitchen porter", "kitchen assistant", "помогал на кухне", "помощник на кухне", "помощник повара"] },
    { slug: "dishwashing", needles: ["ploviau ind", "indu plovim", "indų plovim", "indaplov", "washed dishes", "washing dishes", "dishwash", "мыл посуду", "мытье посуды", "мытьё посуды", "посудомой"] },
    { slug: "baking", needles: ["kepykl", "kepiau duon", "kepiau pyrag", "kepiau band", "baked", "baking", "пекарн", "выпек", "пек хлеб", "пёк хлеб"] },
    { slug: "barista-work", needles: ["barist", "ruosiau kav", "ruošiau kav", "dariau kav", "made coffee", "prepared coffee", "барист", "варил кофе", "готовил кофе"] },
  ]),
  // ── Customer service & retail (wave 2) ─────────────────────────────────────
  ...asSector("retail_sales", [
    { slug: "call-centre", needles: ["skambuciu centr", "skambučių centr", "call centr", "call center", "atsakinejau i skambu", "atsakinėjau į skambu", "priemiau skambu", "priėmiau skambu", "колл-центр", "call-центр", "отвечал на звонк", "принимал звонк"] },
    { slug: "merchandising", needles: ["prekes i lentyn", "prekes į lentyn", "deliojau prek", "dėliojau prek", "isdeliojau prek", "išdėliojau prek", "merchandis", "stocked shelves", "shelf stocking", "выкладывал товар", "выкладк товар", "расставлял товар"] },
  ]),
  // ── Repair & maintenance (wave 2) ──────────────────────────────────────────
  ...asSector("repair_maintenance", [
    { slug: "auto-repair", needles: ["automobiliu remont", "automobilių remont", "remontavau automobil", "remontavau masin", "remontavau mašin", "taisiau automobil", "taisiau masin", "taisiau mašin", "autoserv", "car repair", "repaired cars", "repaired the car", "fixed cars", "auto repair", "ремонтировал автомобил", "ремонтировал машин", "ремонт автомобил", "чинил машин", "автосервис", "автослесар", "автомехан"] },
    { slug: "appliance-repair", needles: ["buitine technik", "buitines technik", "technikos remont", "taisiau technik", "taisiau saldytuv", "taisiau šaldytuv", "skalbimo masin remont", "skalbimo mašin remont", "appliance repair", "repaired appliance", "бытовой техник", "бытовую техник", "чинил холодильник", "ремонт стиральн"] },
    { slug: "handyman-work", needles: ["smulkus remont", "smulkūs remont", "smulkius remont", "smulkaus remont", "handyman", "odd jobs", "minor repairs", "мелкий ремонт", "мелкие ремонт", "мастер на час"] },
  ]),
  // ── Beauty & personal services (wave 2) ────────────────────────────────────
  ...asSector("beauty_services", [
    // RU: "стриг волос/клиент" is hair; bare "стриг" stays with gardening's
    // anchored "стриг газон" — no cross-family bleed.
    { slug: "hairdressing", needles: ["kirpau plauk", "kirpau klient", "kirpykl", "sukuosen", "šukuosen", "haircut", "hairdress", "cut hair", "стрижк", "стриг волос", "стриг клиент", "укладк волос", "парикмахер"] },
    { slug: "barbering", needles: ["barzdaskut", "skutau barzd", "barzdos kirpim", "barber", "барбер", "брил бород", "стрижка бород"] },
    { slug: "nail-care", needles: ["manikiur", "manikiūr", "pedikiur", "pedikiūr", "nagu prieziur", "nagų priežiūr", "manicure", "pedicure", "маникюр", "педикюр", "ногтев"] },
  ]),
  // ── HR & recruitment (wave 2) ──────────────────────────────────────────────
  ...asSector("hr_recruitment", [
    // Recruiter-side anchors only: a WORKER attending an interview ("buvau
    // darbo pokalbyje") must never read as recruitment work.
    { slug: "recruitment", needles: ["darbuotoju atrank", "darbuotojų atrank", "ieskojau darbuotoj", "ieškojau darbuotoj", "vedziau darbo pokalb", "vedžiau darbo pokalb", "kandidatu atrank", "kandidatų atrank", "recruit", "interviewed candidate", "hiring", "подбор персонал", "подбирал персонал", "проводил собеседован", "искал сотрудник", "рекрут"] },
    { slug: "personnel-admin", needles: ["personalo dokument", "personalo administrav", "personalo apskait", "personnel", "кадров", "оформлял сотрудник"] },
  ]),
  // ── Cleaning & facilities (wave 2) ─────────────────────────────────────────
  ...asSector("cleaning_facility", [
    { slug: "laundry", needles: ["skalbiau", "skalbykl", "lyginau drabuz", "lyginau drabuž", "lyginau skalbin", "laundry", "ironed", "ironing", "washed clothes", "стирал", "стирк", "гладил бель", "гладил одежд", "прачечн"] },
  ]),
  // ══ Class-B needle wave (2026-07-04 PR3D, offline-recognition audit §11) —
  //    installed catalogue skills that had NO needles in ANY language. Only
  //    the low-risk, obvious ones get needles (LT/EN/RU base tier); the rest
  //    stay classified "deferred" with notes in
  //    language-packs/recognition-status.ts. Construction depth per PACK
  //    language remains deferred — this wave makes the slugs recognisable at
  //    all, it does not claim 12-language coverage for them. ════════════════
  ...asSector("construction", [
    // welding sub-processes (workers name the process, not the blueprint)
    { slug: "arc-welding", needles: ["arc weld", "elektrodu suvirin", "elektrodais suvirin", "дуговая сварк", "дуговой сварк", "варил электрод"] },
    { slug: "mig-mag-welding", needles: ["mig weld", "mig/mag", "suvirinimas pusautomat", "pusautomatinis suvirin", "сварка полуавтомат", "варил полуавтомат"] },
    { slug: "tig-welding", needles: ["tig weld", "argonu suvirin", "argono suvirin", "аргонная сварк", "варил аргоном", "аргонодуговая"] },
    { slug: "gas-cutting", needles: ["gas cutting", "dujinis pjov", "dujinis pjaust", "газорез"] },
    // construction plant / machinery operation
    { slug: "crane-operator", needles: ["crane operator", "kraninink", "valdziau kran", "valdžiau kran", "крановщик"] },
    { slug: "tower-crane", needles: ["tower crane", "bokstin kran", "bokštin kran", "башенн кран"] },
    { slug: "mobile-crane", needles: ["mobile crane", "autokran", "автокран"] },
    { slug: "excavator-operator", needles: ["excavator", "ekskavator", "экскаватор"] },
    { slug: "bulldozer-operator", needles: ["bulldozer", "buldozer", "бульдозер"] },
    { slug: "grader-operator", needles: ["grader operat", "greider", "грейдер"] },
    { slug: "loader-operator", needles: ["wheel loader", "frontalin krautuv", "ratin krautuv", "фронтальн погрузчик"] },
    { slug: "compactor-operator", needles: ["plate compactor", "vibroplokst", "vibroplokšt", "виброплит"] },
    // masonry & tiling depth
    { slug: "blockwork", needles: ["blockwork", "block laying", "blokeli", "газоблок", "пеноблок", "клал блок"] },
    { slug: "stone-masonry", needles: ["stone masonry", "akmens mur", "akmens mūr", "каменная кладк", "каменной кладк"] },
    { slug: "grouting", needles: ["grouting", "fugav", "затирка швов", "затирал швы"] },
    { slug: "mosaic-tiling", needles: ["mosaic", "mozaik", "мозаик"] },
    { slug: "large-format-tiling", needles: ["large format til", "stambiaformat", "didziaformat", "didžiaformat", "крупноформат"] },
    // plaster & paint depth
    { slug: "decorative-plaster", needles: ["decorative plaster", "dekoratyvin tink", "декоративн штукатурк", "венецианк"] },
    { slug: "facade-plaster", needles: ["facade plaster", "fasado tink", "фасадн штукатурк"] },
    { slug: "spray-painting", needles: ["spray paint", "purškiam", "purskiam", "краскопульт", "покраска распылител"] },
    // openings / envelope
    { slug: "door-window-install", needles: ["door install", "window install", "fitted doors", "fitted windows", "duru montavim", "durų montavim", "langu montavim", "langų montavim", "установка дверей", "установка окон"] },
    { slug: "glazing", needles: ["glazing", "stiklinim", "istiklin", "įstiklin", "остеклен"] },
    { slug: "gutter-install", needles: ["gutter", "lietvamzd", "latak", "водосточн", "желоб"] },
    { slug: "roof-tiling", needles: ["roof tile", "cerpi", "čerpi", "черепиц"] },
    { slug: "flat-roofing", needles: ["flat roof", "ruberoid", "sutapdint stog", "рубероид", "наплавляем"] },
    { slug: "roof-insulation", needles: ["roof insulation", "stogo siltinim", "stogo šiltinim", "утепление кровли", "утепление крыши"] },
    // concrete & steel depth
    { slug: "mortar-prep", needles: ["mixed mortar", "mortar mixing", "skiedinio ruos", "maisiau skiedin", "maišiau skiedin", "готовил раствор", "замешивал раствор", "мешал раствор"] },
    { slug: "concrete-finishing", needles: ["concrete finishing", "betono lyginim", "затирка бетон", "затирал бетон"] },
    { slug: "concrete-vibration", needles: ["concrete vibrat", "betono vibr", "вибрирование бетон", "вибрировал бетон", "уплотнение бетон"] },
    { slug: "steel-fixing", needles: ["steel fixing", "risau armatur", "rišau armatūr", "вязал арматур", "вязка арматур"] },
    { slug: "structural-steel", needles: ["structural steel", "metalo konstrukcij", "металлоконструкц"] },
    { slug: "precast-install", needles: ["precast", "gelzbeton", "gelžbeton", "жби"] },
    // electrical depth (all anchored — never a bare "elektr" stem)
    { slug: "cable-pulling", needles: ["cable pulling", "cable laying", "kabeliu klojim", "kabelių klojim", "traukiau kabel", "прокладка кабел", "тянул кабел"] },
    { slug: "lighting-install", needles: ["lighting install", "sviestuvu montav", "šviestuvų montav", "montavau sviestuv", "montavau šviestuv", "установка светильник", "монтаж освещен"] },
    { slug: "panel-install", needles: ["distribution board", "elektros skyd", "электрощит", "распределительн щит"] },
    { slug: "electrical-testing", needles: ["electrical test", "elektros matavim", "varzu matavim", "varžų matavim", "электроизмерен", "замеры сопротивлен"] },
    { slug: "low-voltage", needles: ["low voltage", "low-voltage", "silpnu srov", "silpnų srov", "слаботочн"] },
    { slug: "industrial-electric", needles: ["industrial electric", "pramonin elektr", "pramones elektr", "pramonės elektr", "электрик на производстве"] },
    // site engineering & supervision
    { slug: "rigging", needles: ["rigging", "stropav", "stropuotoj", "стропальщик", "строповк"] },
    { slug: "setting-out", needles: ["setting out", "nuzymej", "nužymėj", "разметк", "разбивка осей"] },
    { slug: "surveying", needles: ["site survey", "land survey", "geodez", "nivelyr", "геодез", "нивелир"] },
    // NB: never the bare stem "sąmat"→"samat" — that is the common Finnish
    // word "samat" (the same); only the fuller inflections are needles.
    { slug: "quantity-takeoff", needles: ["quantity takeoff", "quantity take-off", "samata", "samatu", "sąmata", "sąmatų", "сметчик", "составлял сметы"] },
    { slug: "site-supervision", needles: ["site supervision", "technine prieziur", "techninė priežiūr", "технадзор", "техническ надзор"] },
  ]),
  ...asSector("transport_logistics", [
    { slug: "manual-handling", needles: ["manual handling", "krovos darb", "krovej", "iskroviau", "iškroviau", "pakroviau", "разгружал", "погрузочно-разгрузочн"] },
    { slug: "material-transport", needles: ["material transport", "medziagu transport", "medžiagų transport", "medziagu nesiojim", "medžiagų nešiojim", "подноска материал", "разносил материал"] },
  ]),
  ...asSector("other", [
    { slug: "hand-tools", needles: ["hand tools", "rankiniai irank", "rankiniais irank", "rankinius irank", "ручной инструмент", "ручным инструментом"] },
    { slug: "materials-management", needles: ["materials management", "medziagu apskait", "medžiagų apskait", "учет материал", "учёт материал"] },
    { slug: "safety-officer", needles: ["safety officer", "darbu saug", "darbų saug", "saugos ir sveikatos", "охрана труда", "охране труда"] },
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
  { slug: "mason", needles: ["mūrij", "mūryt", "mūrinink", "mūro", "каменщик", "кладк", "кирпич", "bricklay"] },
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
  // ── Wave-2 professions (2026-07-04 catalogue expansion) ──────────────────
  { slug: "receptionist", needles: ["registrator", "receptionist", "ресепшн", "регистратор"] },
  { slug: "kitchen_helper", needles: ["virtuves pagalbinink", "virtuvės pagalbinink", "kitchen helper", "kitchen porter", "помощник повара", "помощник на кухне"] },
  { slug: "barista", needles: ["barist", "барист"] },
  { slug: "baker", needles: ["kepej", "kepėj", "baker", "пекар"] },
  { slug: "call_centre_agent", needles: ["skambuciu centro operator", "skambučių centro operator", "call centre agent", "call center agent", "оператор колл", "оператор call"] },
  { slug: "merchandiser", needles: ["merchandiser", "мерчандайзер", "мерчендайзер"] },
  { slug: "auto_mechanic", needles: ["automechanik", "autosaltkalv", "autošaltkalv", "auto mechanic", "car mechanic", "автомеханик", "автослесар"] },
  { slug: "handyman", needles: ["handyman", "мастер на час", "smulkaus remonto meistr"] },
  { slug: "hairdresser", needles: ["kirpej", "kirpėj", "hairdresser", "парикмахер"] },
  { slug: "barber", needles: ["barzdaskut", "barber", "барбер"] },
  { slug: "nail_technician", needles: ["manikiurinink", "manikiūrinink", "nail technician", "мастер маникюр"] },
  { slug: "recruiter", needles: ["personalo atrankos specialist", "recruiter", "рекрутер"] },
  { slug: "laundry_worker", needles: ["skalbej", "skalbėj", "skalbyklos darbuotoj", "laundry worker", "работник прачечн"] },
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
  // ── Wave-2 specific activities (2026-07-04) — placed in the specific-
  //    before-generic zone so e.g. "padėjau virtuvėje" resolves to the
  //    kitchen HELPER, not the cook, and car repair never falls into
  //    construction "remont" ambiguity. ────────────────────────────────────
  {
    slug: "auto_mechanic",
    sector: "repair_maintenance",
    label: "Automobilių remontas",
    needles: [
      "remontavau automobil", "taisiau automobil", "automobiliu remont",
      "automobilių remont", "autoserv", "car repair", "repaired cars",
      "ремонтировал машин", "ремонтировал автомобил", "ремонт автомобил", "автосервис",
    ],
  },
  {
    slug: "hairdresser",
    sector: "beauty_services",
    label: "Kirpėjo darbas",
    needles: [
      "kirpau plauk", "kirpykl", "haircut", "hairdress",
      "стрижк", "стриг волос", "парикмахер",
    ],
  },
  {
    slug: "kitchen_helper",
    sector: "hospitality_food",
    label: "Virtuvės pagalbininko darbas",
    needles: [
      "padejau virtuv", "padėjau virtuv", "ploviau ind", "indu plovim",
      "indų plovim", "washed dishes", "kitchen help", "kitchen porter",
      "мыл посуду", "помощник на кухне",
    ],
  },
  {
    slug: "laundry_worker",
    sector: "cleaning_facility",
    label: "Skalbimas ir lyginimas",
    needles: [
      "skalbiau", "skalbykl", "lyginau drabuz", "lyginau drabuž",
      "laundry", "стирал", "гладил бель",
    ],
  },
  {
    slug: "receptionist",
    sector: "office_admin",
    label: "Registratūros darbas",
    needles: ["registratur", "registratūr", "reception desk", "ресепшн", "регистратур"],
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
  { slug: "mason", label: "Mūrijimas", needles: ["mūrij", "mūryt", "mūrinink", "mūro", "кладк", "кирпич", "каменщик"] },
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
