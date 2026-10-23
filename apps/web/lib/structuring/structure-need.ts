/**
 * Deterministic need-structuring engine (§7 — no fake AI, no external provider).
 *
 * Turns an employer's free-text need (role / description / location / notes)
 * into SUGGESTED structured, worker-board-safe fields by rule-based keyword and
 * regex matching only. It NEVER invents a confident answer: when the text is
 * unclear it returns `needsReview: true` and leaves fields null so a human
 * picks. Every output is a CLOSED-SET value (a work-categories slug, a market
 * ISO-2 country, an accommodation enum, an urgency enum, a small integer) — so
 * a suggestion can be applied to the structured columns the worker board reads
 * without ever exposing free text.
 */
import { ALL_WORK_TYPE_SLUGS } from "@/lib/taxonomy/work-categories";
import { isIsoCountry } from "@/lib/location/country-model";

export type StartPeriod = "flexible" | "this_week" | "urgent";
export type AccommodationOffer =
  | "provided_free"
  | "provided_paid"
  | "provided_deducted"
  | "not_provided";

export interface NeedStructureInput {
  readonly role?: string | null;
  readonly description?: string | null;
  readonly location?: string | null;
  readonly notes?: string | null;
}

export interface NeedStructureSuggestion {
  readonly workType: string | null;
  readonly country: string | null;
  readonly teamSize: number | null;
  readonly startPeriod: StartPeriod | null;
  readonly accommodation: AccommodationOffer | null;
  readonly confidence: "high" | "medium" | "low";
  /** Short reason codes, e.g. "work_type:welder", "country:DE", "team_size:5". */
  readonly reasons: readonly string[];
  readonly needsReview: boolean;
}

/** Work-type needles → slug. Order matters: more specific rows sit first so a
 *  "truck driver" matches transport before a bare "driver", etc. Slugs are
 *  validated against the taxonomy at module load. */
export const WORK_TYPE_RULES: { slug: string; needles: string[] }[] = [
  // Construction trades added 2026-09-04 (owner contract §9). PERSON stems
  // only — "pastolinink" (the scaffolder), never "pastol" (the scaffold): a
  // sentence about equipment must not become a workforce need.
  { slug: "scaffolder", needles: ["scaffolder", "pastolinink", "монтажник строительных лесов", "монтажник лесов", "gerustbauer", "steigerbouwer", "rusztowaniow"] },
  { slug: "concrete_worker", needles: ["concrete worker", "concreter", "betonuotoj", "бетонщик", "betonbauer", "betonwerker", "betoniarz"] },
  { slug: "plasterer", needles: ["plasterer", "tinkuotoj", "штукатур", "stuckateur", "stukadoor", "tynkarz"] },
  { slug: "steel_fixer", needles: ["steel fixer", "rebar", "armaturinink", "арматурщик", "eisenflechter", "betonstaalvlechter", "zbrojarz"] },
  { slug: "insulation_worker", needles: ["insulation worker", "insulator", "izoliuotoj", "изолировщик", "isolierer", "isolatiemonteur"] },
  { slug: "welder", needles: ["welder", "weld", "suvirin", "сварщик", "сварк", "lassers", "schweisser", "spawacz"] },
  { slug: "electrician", needles: ["electrician", "elektrik", "электрик", "elektricien", "elektryk"] },
  { slug: "plumber", needles: ["plumber", "santechnik", "сантехник", "loodgieter", "klempner", "hydraulik"] },
  { slug: "carpenter", needles: ["carpenter", "stalius", "столяр", "плотник", "timmerman", "timmerlieden", "timmerlui", "zimmerer", "zimmermann", "tischler", "schreiner", "stolarz", "ciesl"] },
  { slug: "mason", needles: ["mason", "bricklayer", "mūrinink", "murinink", "каменщик", "metselaar", "maurer", "murarz", "murarzy"] },
  { slug: "painter", needles: ["painter", "dažytoj", "dazytoj", "маляр", "schilders", "malarz", "malarzy"] },
  { slug: "tiler", needles: ["tiler", "plytel", "плиточник", "tegelzetter", "fliesenleger", "glazurnik", "plytkarz"] },
  { slug: "roofer", needles: ["roofer", "stogden", "кровельщик", "dakdekker", "dachdecker", "dekarz", "dekarzy"] },
  { slug: "crane_operator", needles: ["crane operator", "crane", "krano operat", "крановщик", "kraanmachinist", "kranfuhrer", "operator zurawia"] },
  { slug: "excavator_operator", needles: ["excavator", "ekskavator", "экскаватор"] },
  { slug: "heavy_equipment_operator", needles: ["heavy equipment", "heavy machine", "sunkiosios technik", "спецтехник"] },
  { slug: "forklift_operator", needles: ["forklift", "krautuv", "погрузчик", "heftruckchauffeur", "heftruck", "staplerfahrer", "wozek widlowy", "operator wozka"] },
  { slug: "truck_driver_ce", needles: ["ce driver", "driver ce", "vilkik", "фуры", "фура"] },
  { slug: "truck_driver_c", needles: ["truck driver", "lorry", "sunkvežim", "sunkvezim", "грузовик", "vrachtwagenchauffeur", "lkw-fahrer", "lkw fahrer", "berufskraftfahrer"] },
  { slug: "delivery_driver", needles: ["delivery driver", "delivery", "pristatym", "доставк"] },
  { slug: "courier", needles: ["courier", "kurjer", "курьер"] },
  { slug: "order_picker", needles: ["order picker", "picker", "rinkėj", "rinkej", "комплектов"] },
  { slug: "packer", needles: ["packer", "packing", "pakuotoj", "упаковщик"] },
  { slug: "warehouse_worker", needles: ["warehouse", "sandėl", "sandel", "склад", "magazijnmedewerker", "lagerist", "lagermitarbeiter", "lagerhelfer", "magazynier"] },
  { slug: "assembler", needles: ["assembler", "assembly", "surink", "сборщик", "сборк"] },
  { slug: "machine_operator", needles: ["machine operator", "cnc", "staklių operat", "stakliu operat", "оператор станк"] },
  { slug: "quality_control", needles: ["quality control", "quality inspector", "kokybės kontrol", "kokybes kontrol", "контролёр качества", "контролер качества"] },
  { slug: "production_worker", needles: ["production worker", "factory worker", "gamybos darbinink", "производственн", "productiemedewerker", "produktionsmitarbeiter", "pracownik produkcj", "pracownikow produkcj"] },
  { slug: "cook", needles: ["cook", "chef", "virėj", "virej", "повар", "kucharz", "kucharzy"] },
  { slug: "kitchen_helper", needles: ["kitchen helper", "kitchen porter", "virtuvės pagalb", "virtuves pagalb", "помощник повара"] },
  { slug: "dishwasher", needles: ["dishwasher", "indų plov", "indu plov", "посудомой"] },
  { slug: "waiter", needles: ["waiter", "waitress", "padavėj", "padavej", "официант", "kellner", "kelner"] },
  { slug: "housekeeper", needles: ["housekeeper", "housekeeping", "room attendant", "kambarin", "горничн"] },
  { slug: "elderly_carer", needles: ["elderly care", "elderly carer", "senior care", "pagyvenusi", "сиделк"] },
  { slug: "care_assistant", needles: ["care assistant", "caregiver", "nurse", "nursing", "slaug", "уход", "сиделк", "verzorgende", "verzorger", "pflegekraft", "pflegekrafte", "altenpfleger", "pfleger", "opiekun"] },
  { slug: "support_worker", needles: ["support worker", "pagalbos darbuotoj", "социальн"] },
  { slug: "industrial_cleaner", needles: ["industrial clean", "pramoninis valytoj", "промышленн уборщ"] },
  { slug: "cleaner", needles: ["cleaner", "cleaning", "valytoj", "valymas", "уборщик", "уборк", "schoonmaker", "reinigungskraft", "sprzatacz"] },
  { slug: "facility_worker", needles: ["facility", "patalpų prižiūr", "patalpu priziur", "обслуживан"] },
  { slug: "harvest_worker", needles: ["harvest", "picking fruit", "derliaus", "сбор урожая", "сборщик урожая"] },
  { slug: "greenhouse_worker", needles: ["greenhouse", "šiltnam", "siltnam", "теплич"] },
  { slug: "farm_worker", needles: ["farm", "agricultur", "žemės ūki", "zemes uki", "сельхоз", "ферм"] },
  { slug: "general_laborer", needles: ["laborer", "labourer", "general worker", "helper", "pagalbinis darbinink", "разнорабоч", "подсобн", "bauhelfer", "pomocnik", "pomocnikow"] },
];

const KNOWN_SLUGS = new Set(ALL_WORK_TYPE_SLUGS);

/** Country needles (codes, names, major cities) → ISO-2 market. */
export const COUNTRY_RULES: { code: string; needles: string[] }[] = [
  // City needles are STEMS, like the country names beside them. They were
  // nominative forms ("vilnius", "kaunas"), and Lithuanian names a place in the
  // locative — an employer writes "Vilniuje", never "Vilnius". So the one
  // country whose own language this product leads in was the one country a bare
  // city name failed to resolve. `lietuv` already caught "Lietuvoje"; the cities
  // now behave the same way. The other county seats and the RU/PL names of
  // Vilnius were absent, so "Šiauliuose", "Panevėžyje" or "в Вильнюсе" still
  // left the location empty (production 2026-10-23). Where a short stem is a
  // prefix of ordinary words ("alyt" in "analytic", "uten" = Norwegian
  // "without"), the needles are the inflected forms themselves.
  { code: "LT", needles: ["lithuania", "lietuv", "литв", "vilni", "вильн", "wiln", "kaun", "klaipėd", "klaiped", "šiaul", "siaul", "panevėž", "panevez", "alytuj", "alytus", "alytaus", "marijampol", "utenoj", "utena", "utenos"] },
  { code: "LV", needles: ["latvia", "latvij", "латв", "riga", "ryga"] },
  { code: "EE", needles: ["estonia", "eston", "estij", "эстон", "tallinn", "talin"] },
  { code: "PL", needles: ["poland", "lenkij", "polska", "польш", "warsaw", "warszaw", "varsuv", "krak", "wroc", "vroclav", "gdansk", "gdańsk"] },
  { code: "DE", needles: ["germany", "vokietij", "deutschland", "герман", "berlin", "berlyn", "hamburg", "munich", "münchen", "munchen", "miunchen", "frankfurt", "cologne", "köln", "koln", "keln", "stuttgart", "stutgart"] },
  { code: "NL", needles: ["netherlands", "holland", "nyderland", "niderland", "нидерланд", "голланд", "amsterdam", "rotterdam", "roterdam", "роттердам", "hague", "haag", "haga", "eindhoven", "utrecht"] },
  { code: "DK", needles: ["denmark", "danij", "дани", "copenhagen", "kopenhag", "копенгаг", "aarhus"] },
  // "osle" is the Lithuanian locative ("Osle" = in Oslo).
  { code: "NO", needles: ["norway", "norveg", "норвег", "oslo", "osle", "осло", "bergen", "берген", "trondheim"] },
  { code: "SE", needles: ["sweden", "švedij", "svedij", "sverige", "швец", "stockholm", "stokholm", "gothenburg", "göteborg", "goteborg", "gioteborg", "malmö", "malmo", "malme"] },
  { code: "FI", needles: ["finland", "suomi", "suomij", "финлянд", "helsinki", "helsink", "espoo", "tampere"] },
  // Open-markets update 2026-07-17 — the six newly opened markets.
  { code: "GE", needles: ["georgia", "gruzij", "sakartvel", "грузия", "грузии", "грузию", "tbilisi", "tbilis", "batumi", "kutaisi", "rustavi"] },
  { code: "BE", needles: ["belgium", "belgij", "бельги", "brussel", "briusel", "antwerp"] },
  { code: "FR", needles: ["france", "prancūz", "prancuz", "франц", "paris", "paryž", "paryz", "lyon", "marseille"] },
  { code: "ES", needles: ["spain", "ispanij", "испани", "españa", "espana", "madrid", "barcelona", "valencia"] },
  { code: "AT", needles: ["austria", "austrij", "австри", "vienna", "wien", "graz", "linz"] },
  { code: "CH", needles: ["switzerland", "šveicar", "sveicar", "швейцар", "zurich", "zürich", "geneva", "genev", "basel"] },
  // PR-G global location model — the USA becomes a first-class market. Country
  // words + major metros only (no 50-state needle list; note "georgia" above
  // maps to the country GE, which sits earlier in this ordered rule list).
  // NB matching is substring-based, so a bare "usa" needle is unsafe
  // ("thousand" contains it) — dotted/full forms only.
  { code: "US", needles: ["u.s.", "united states", "amerik", "америк", "сша", "штаты", "new york", "los angeles", "chicago", "houston", "miami", "dallas", "phoenix", "philadelphia", "atlanta", "seattle", "boston", "denver", "washington"] },
];


/**
 * CITY LABELS — which COUNTRY_RULES needles name a city, and how that city is
 * written back to the person (owner contract 2026-09-04 §9: "Rotterdam" must
 * not collapse into "Netherlands"). A needle absent here is a country word.
 * Display form = the city's own name; the person may edit it in the form.
 */
export const CITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  vilni: "Vilnius", "вильн": "Vilnius", wiln: "Vilnius", kaun: "Kaunas", "klaipėd": "Klaipėda", klaiped: "Klaipėda",
  "šiaul": "Šiauliai", siaul: "Šiauliai", "panevėž": "Panevėžys", panevez: "Panevėžys",
  alytuj: "Alytus", alytus: "Alytus", alytaus: "Alytus", marijampol: "Marijampolė",
  utenoj: "Utena", utena: "Utena", utenos: "Utena",
  riga: "Riga", ryga: "Riga", tallinn: "Tallinn", talin: "Tallinn",
  warsaw: "Warszawa", warszaw: "Warszawa", varsuv: "Warszawa", krak: "Kraków", wroc: "Wrocław", vroclav: "Wrocław", gdansk: "Gdańsk", "gdańsk": "Gdańsk",
  berlin: "Berlin", berlyn: "Berlin", hamburg: "Hamburg", munich: "München", "münchen": "München", munchen: "München", miunchen: "München", frankfurt: "Frankfurt", cologne: "Köln", "köln": "Köln", koln: "Köln", keln: "Köln", stuttgart: "Stuttgart", stutgart: "Stuttgart",
  amsterdam: "Amsterdam", rotterdam: "Rotterdam", roterdam: "Rotterdam", "роттердам": "Rotterdam", hague: "Den Haag", haag: "Den Haag", haga: "Den Haag", eindhoven: "Eindhoven", utrecht: "Utrecht",
  copenhagen: "København", kopenhag: "København", "копенгаг": "København", aarhus: "Aarhus",
  oslo: "Oslo", osle: "Oslo", bergen: "Bergen", trondheim: "Trondheim",
  stockholm: "Stockholm", stokholm: "Stockholm", gothenburg: "Göteborg", "göteborg": "Göteborg", goteborg: "Göteborg", gioteborg: "Göteborg", "malmö": "Malmö", malmo: "Malmö", malme: "Malmö",
  helsinki: "Helsinki", helsink: "Helsinki", espoo: "Espoo", tampere: "Tampere",
  tbilisi: "Tbilisi", tbilis: "Tbilisi", batumi: "Batumi", kutaisi: "Kutaisi", rustavi: "Rustavi",
  brussel: "Brussels", briusel: "Brussels", antwerp: "Antwerpen",
  paris: "Paris", "paryž": "Paris", paryz: "Paris", lyon: "Lyon", marseille: "Marseille",
  madrid: "Madrid", barcelona: "Barcelona", valencia: "Valencia",
  vienna: "Wien", wien: "Wien", graz: "Graz", linz: "Linz",
  zurich: "Zürich", "zürich": "Zürich", geneva: "Genève", genev: "Genève", basel: "Basel",
  "new york": "New York", "los angeles": "Los Angeles", chicago: "Chicago", houston: "Houston", miami: "Miami", dallas: "Dallas", phoenix: "Phoenix", philadelphia: "Philadelphia", atlanta: "Atlanta", seattle: "Seattle", boston: "Boston", denver: "Denver", washington: "Washington",
});

/** The market a folded sentence names, plus the CITY when the matching needle
 *  was a city — `null` city when the person named only the country. */
export function resolveCountryAndCity(folded: string): {
  country: string | null;
  city: string | null;
} {
  const hit = firstMatchWithNeedle(COUNTRY_RULES, folded);
  if (!hit) return { country: null, city: null };
  return { country: hit.rule.code, city: CITY_LABELS[hit.needle] ?? null };
}

function firstMatch<T extends { needles: string[] }>(
  rules: T[],
  hay: string,
): T | null {
  return firstMatchWithNeedle(rules, hay)?.rule ?? null;
}

/** Same scan, but it also reports WHICH needle matched. The count detector
 *  needs the needle itself: it is the occupation word the employer actually
 *  typed, in their own language, and a number sitting immediately before it is
 *  that occupation's headcount. */
/**
 * The SERVICE NOUN is never an occupation. Folded "paslaugas" contains the
 * care-assistant needle "slaug", and on production (2026-09-06) "noriu
 * siūlyti buhalterijos paslaugas" was echoed back as "Jūsų teigimu: Slaugos
 * pagalbininkas" — a claim the person never made. Every occupation match
 * over free text runs on the masked hay; the honest reading is the service.
 */
const SERVICE_NOUN_RE = /\bpaslaug\S*/gu;
export function maskServiceNoun(hay: string): string {
  return hay.replace(SERVICE_NOUN_RE, " ");
}

function firstMatchWithNeedle<T extends { needles: string[] }>(
  rules: T[],
  hay: string,
): { rule: T; needle: string } | null {
  for (const r of rules) {
    for (const n of r.needles) {
      if (hay.includes(n)) return { rule: r, needle: n };
    }
  }
  return null;
}

/** Regex-escape a needle before it is spliced into a pattern. The work-type
 *  needles are letters and spaces today, so this changes nothing — it exists so
 *  that a future needle containing a metacharacter cannot silently corrupt the
 *  count pattern into matching something else. */
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * How many people the need is for.
 *
 * THE BUG THIS SHAPE FIXES. The count used to be recognised in two ways, and
 * both were hand-written lists in one language:
 *
 *   - a number before an occupation noun — but the nouns were English
 *     (`welders? drivers? cleaners? cooks? pickers?`) plus four generic
 *     person-words. So "4 welders" counted and "4 suvirintojų" did not, in a
 *     Lithuanian-first product;
 *   - a number after a demand verb — but the verb list held the Russian
 *     "ищем" and not its Lithuanian equivalent "ieškome". So
 *     "Нужны 5 сварщиков" kept its 5 and "Ieškome 6 betonuotojų" lost its 6.
 *     Measured, not hypothetical: that exact asymmetry is what sent an
 *     employer to a form with the headcount silently blank.
 *
 * The engine already knows every occupation it supports, in every language it
 * supports — that is what `WORK_TYPE_RULES` is. So the multilingual case is not
 * another list to maintain: a number sitting immediately before the needle that
 * IDENTIFIED this need's occupation is that occupation's headcount, whatever
 * language the employer wrote it in. Adding an occupation or a language to the
 * taxonomy now improves counting for free, instead of requiring a matching edit
 * here that nobody remembers to make.
 *
 * It stays deliberately narrow. The derived pattern fires ONLY for the needle
 * that produced the recognised work type — not for every needle in the table —
 * so an unrelated noun that happens to be countable ("we have 3 warehouses")
 * cannot become a headcount unless the need is actually about that occupation.
 * And nothing here is asserted: `structureNeed` returns a SUGGESTION the
 * employer reviews, and the form only ever pre-fills a field the employer left
 * empty.
 */
/** A number directly followed by a word for PEOPLE. */
const PEOPLE_COUNT_RE =
  /\b(\d{1,4})\s*(?:x\s*)?(?:workers?|people|staff|persons?|men|crew|welders?|drivers?|cleaners?|cooks?|pickers?|laborers?|labourers?|darbuotoj\w*|žmon\w*|zmon\w*|asmen\w*|работник\w*|человек)/i;

/** Demand verbs. "ieškau/ieškome" (LT) and "ищу" (RU) were the missing
 *  halves of pairs whose other half was already here. */
const DEMAND_VERB_COUNT_RE =
  /(?:need|require|looking for|we are looking for|reikia|reikalinga|reikalingi|ieškome|ieskome|ieškau|ieskau|нужно|нужны|требуется|требуются|ищем|ищу)\s+(?:about\s+|apie\s+|около\s+)?(\d{1,4})\b/i;

/** What a number right after a demand verb is measuring when it is NOT a
 *  headcount: "Need 3 years experience", "Reikia 3 metų patirties",
 *  "reikia 2 mėn.", "reikia 40 val.", "reikia 15 eur". */
const UNIT_AFTER_COUNT_RE =
  /^\s*(?:\+\s*)?(?:years?|yrs?|metų|metu|metai|metus|metams|met\b|m\.|months?|mėn|men\b|menes|mėnes|weeks?|savait|days?|dien|d\.|hours?|h\b|val|eur|€|%|km|nok|sek|dkk|pln|usd|лет|год|месяц|недел|дн|час|евро)/i;

function adjacentOccupationCountRe(occupationNeedle: string): RegExp {
  // Immediately adjacent only (one optional space, one optional "x"), so the
  // number has to be counting THIS occupation rather than merely appearing
  // somewhere in the same sentence as it.
  return new RegExp(`\\b(\\d{1,4})\\s*(?:x\\s*)?${escapeForRegex(occupationNeedle)}`, "i");
}

function countFrom(m: RegExpMatchArray | null): number | null {
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : null;
}

/** A number that provably counts PEOPLE: followed by a person word or by the
 *  recognised occupation's own noun ("2 mūrininkų", "3 darbuotojų"). */
function detectPeopleCount(hay: string, occupationNeedle: string | null): number | null {
  return (
    countFrom(hay.match(PEOPLE_COUNT_RE)) ??
    (occupationNeedle ? countFrom(hay.match(adjacentOccupationCountRe(occupationNeedle))) : null)
  );
}

function detectTeamSize(hay: string, occupationNeedle: string | null): number | null {
  // A number directly tied to people/workers, OR right after a "need" verb —
  // unless what follows it is a unit (years, months, hours, money): "Need 3
  // years experience" is not three people.
  const people = countFrom(hay.match(PEOPLE_COUNT_RE));
  if (people !== null) return people;
  const verb = hay.match(DEMAND_VERB_COUNT_RE);
  if (verb && verb.index !== undefined) {
    const rest = hay.slice(verb.index + verb[0].length);
    const n = UNIT_AFTER_COUNT_RE.test(rest) ? null : countFrom(verb);
    if (n !== null) return n;
  }
  return occupationNeedle ? countFrom(hay.match(adjacentOccupationCountRe(occupationNeedle))) : null;
}

function detectStartPeriod(hay: string): StartPeriod | null {
  if (/\b(urgent|urgently|asap|immediately|right away|skub\w*|nedels\w*|срочн\w*|как можно скор)/i.test(hay))
    return "urgent";
  if (/\b(this week|within days|next week|šią savait|sia savait|kitą savait|kita savait|на этой недел|на следующей недел)/i.test(hay))
    return "this_week";
  if (/\b(next month|in a month|flexible|any time|anytime|lankst\w*|kitą mėn|kita men|через месяц|гибк\w*|со следующего месяца)/i.test(hay))
    return "flexible";
  return null;
}

function detectAccommodation(hay: string): AccommodationOffer | null {
  const hasAcc = /(accommodation|housing|lodging|apgyvendin\w*|būst\w*|bust\w*|жиль|прожив\w*|общежит)/i.test(hay);
  if (!hasAcc) return null;
  if (/\b(no|without|not provided|be apgyvendin|без жил)\b/i.test(hay)) return "not_provided";
  if (/(deducted|deduct|išskaič|isskaic|удержан)/i.test(hay)) return "provided_deducted";
  if (/(paid accommodation|accommodation.{0,12}paid|mokam\w* apgyvendin|платн\w* жиль)/i.test(hay))
    return "provided_paid";
  // Plain "with accommodation" / "housing provided" → treated as provided (free).
  return "provided_free";
}

const normNeedText = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** Role + description + notes, lowercased — the hay the work type and the
 *  counts are read from. */
function needRoleHay(input: NeedStructureInput): string {
  return `${normNeedText(input.role)} ${normNeedText(input.description)} ${normNeedText(input.notes)}`.trim();
}

/** The recognised work type and the needle that identified it. The service
 *  noun is masked first: "buhalterijos paslaugos" must not read as a care
 *  assistant because "paslaug" contains the needle "slaug". */
function recognisedWorkType(roleHay: string): { workType: string | null; needle: string | null } {
  const wtHit = firstMatchWithNeedle(WORK_TYPE_RULES, maskServiceNoun(roleHay));
  const workType = wtHit && KNOWN_SLUGS.has(wtHit.rule.slug) ? wtHit.rule.slug : null;
  return { workType, needle: workType ? wtHit?.needle ?? null : null };
}

/**
 * How many PEOPLE the need provably counts — a number followed by a person
 * word or by the recognised occupation's noun ("2 mūrininkų", "reikia 3
 * darbuotojų", "4 welders"). Stricter than `teamSize`, which also accepts a
 * bare number after a demand verb ("reikia 3, ..."): a reader that turns the
 * count into a claim (the recognizer's "scope" field) needs the noun.
 */
export function countPeopleInNeed(input: NeedStructureInput): number | null {
  const roleHay = needRoleHay(input);
  return detectPeopleCount(roleHay, recognisedWorkType(roleHay).needle);
}

export function structureNeed(input: NeedStructureInput): NeedStructureSuggestion {
  const reasons: string[] = [];
  // Role + description + notes drive the work type; location is weighted first
  // for the country. Free text is read here ONLY to derive closed-set values —
  // none of it is ever returned.
  const roleHay = needRoleHay(input);
  const locHay = `${normNeedText(input.location)} ${roleHay}`.trim();

  const { workType, needle: occupationNeedle } = recognisedWorkType(roleHay);
  if (workType) reasons.push(`work_type:${workType}`);

  const cc = firstMatch(COUNTRY_RULES, locHay);
  const country = cc && isIsoCountry(cc.code) ? cc.code : null;
  if (country) reasons.push(`country:${country}`);

  // Only the needle of a RECOGNISED work type is handed to the counter — an
  // unrecognised occupation must not silently lend its noun to a headcount.
  const teamSize = detectTeamSize(roleHay, occupationNeedle);
  if (teamSize != null) reasons.push(`team_size:${teamSize}`);

  const startPeriod = detectStartPeriod(roleHay);
  if (startPeriod) reasons.push(`start_period:${startPeriod}`);

  const accommodation = detectAccommodation(roleHay);
  if (accommodation) reasons.push(`accommodation:${accommodation}`);

  // Confidence is driven by the two identity fields (work type + country).
  let confidence: NeedStructureSuggestion["confidence"];
  if (workType && country) confidence = "high";
  else if (workType || country) confidence = "medium";
  else confidence = "low";

  // Never guess boldly: if we couldn't even identify the work type, or nothing
  // confident matched, flag it for human review.
  const needsReview = workType === null || confidence === "low";

  return {
    workType,
    country,
    teamSize,
    startPeriod,
    accommodation,
    confidence,
    reasons,
    needsReview,
  };
}
