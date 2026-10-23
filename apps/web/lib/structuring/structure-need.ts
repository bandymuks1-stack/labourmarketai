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
import { foldText } from "./normalize";
import { parseWordNumber } from "./word-numbers";

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
  /** How many workers — for teams of a stated size, the TOTAL (3 × 4 = 12). */
  readonly teamSize: number | null;
  /** Teams of a stated size: how many teams ("3 brigados po 4" → 3). Present
   *  only when the sentence states teams; absent for an ordinary count. */
  readonly teamCount?: number | null;
  /** …and how many people in each (→ 4). Present only with `teamCount`. */
  readonly perTeamSize?: number | null;
  /** Teams the sentence names but does not size, or sizes as a range — the
   *  headcount stays null and the person is ASKED, never guessed. */
  readonly teamClarification?: TeamClarification;
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
  // NL needles are SINGULAR stems ("lasser" also reads "lassers"): a plural-
  // only needle left "Lasser gezocht" with no occupation at all.
  { slug: "welder", needles: ["welder", "weld", "suvirin", "сварщик", "сварк", "lasser", "schweisser", "spawacz"] },
  { slug: "electrician", needles: ["electrician", "elektrik", "электрик", "elektricien", "elektryk"] },
  { slug: "plumber", needles: ["plumber", "santechnik", "сантехник", "loodgieter", "klempner", "hydraulik"] },
  { slug: "carpenter", needles: ["carpenter", "stalius", "столяр", "плотник", "timmerman", "timmerlieden", "timmerlui", "zimmerer", "zimmermann", "tischler", "schreiner", "stolarz", "ciesl"] },
  { slug: "mason", needles: ["mason", "bricklayer", "mūrinink", "murinink", "каменщик", "metselaar", "maurer", "murarz", "murarzy"] },
  { slug: "painter", needles: ["painter", "dažytoj", "dazytoj", "маляр", "schilder", "malarz", "malarzy"] },
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
  // "^riga" / "^ryg": a word START — "riga" is inside "brigada" / "brigade",
  // "ryga" inside the Polish "brygada". "^ryg" also reads the Lithuanian
  // locative "Rygoje", which the old nominative needle "ryga" never did.
  { code: "LV", needles: ["latvia", "latvij", "латв", "^riga", "^ryg"] },
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
  "^riga": "Riga", "^ryg": "Riga", tallinn: "Tallinn", talin: "Tallinn",
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

/**
 * Does the hay contain this needle? Needles are substrings ("lietuv" reads
 * "Lietuvoje"). A needle written "^riga" must START a word: "riga" sits
 * inside "brigada" / "brigade", so every brigade sentence used to resolve to
 * Latvia.
 */
const WORD_START_NEEDLES = new Map<string, RegExp>();
export function hayHasNeedle(hay: string, needle: string): boolean {
  if (!needle.startsWith("^")) return hay.includes(needle);
  let re = WORD_START_NEEDLES.get(needle);
  if (!re) {
    re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeForRegex(needle.slice(1))}`, "u");
    WORD_START_NEEDLES.set(needle, re);
  }
  return re.test(hay);
}

function firstMatchWithNeedle<T extends { needles: string[] }>(
  rules: T[],
  hay: string,
): { rule: T; needle: string } | null {
  for (const r of rules) {
    for (const n of r.needles) {
      if (hayHasNeedle(hay, n)) return { rule: r, needle: n };
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
  /\b(\d{1,4})\s*(?:x\s*)?(?:workers?|people|staff|persons?|men|crew(?!s)|welders?|drivers?|cleaners?|cooks?|pickers?|laborers?|labourers?|darbuotoj\w*|žmon\w*|zmon\w*|asmen\w*|работник\w*|человек)/i;

/** Demand verbs. "ieškau/ieškome" (LT) and "ищу" (RU) were the missing
 *  halves of pairs whose other half was already here; DE/PL/NL the same
 *  verbs the value-statement reader already knows. */
const DEMAND_VERB_COUNT_RE =
  /(?:need|require|looking for|we are looking for|reikia|reikalinga|reikalingi|ieškome|ieskome|ieškau|ieskau|нужно|нужны|требуется|требуются|ищем|ищу|brauchen|suchen|zoeken|potrzebujemy|szukamy)\s+(?:about\s+|apie\s+|около\s+)?(\d{1,4})\b/i;

/**
 * Words that make the number before them a MEASURE, never a headcount:
 * time (years, months, weeks, days, hours), money and percent, in every
 * active locale. "Need 3 years experience", "Reikia 3 metų patirties",
 * "dvejiems metams suvirintojo", "15 eur/val.", "40 val. per savaitę",
 * "2500 eur bruto", "на 2 года", "für 6 Monate", "na 6 miesięcy", "voor 2
 * jaar". Tested on the lowercased AND the folded token. The bare token "men"
 * is NOT here: in English it counts people ("3 men"); the Lithuanian month
 * abbreviation is matched in its written form "mėn".
 */
const COUNT_UNIT_WORD_RE =
  /^(?:years?|yrs?|metų|metu|metai|metus|metams|met|m|months?|mėn\p{L}*|mėnes\p{L}*|menes\p{L}*|weeks?|savait\p{L}*|days?|dien\p{L}*|d|hours?|hrs?|h|val\p{L}*|eur\p{L}*|euro|€|nok|sek|dkk|pln|usd|zl|zł|лет|год\p{L}*|месяц\p{L}*|мес|недел\p{L}*|дн\p{L}*|день|час\p{L}*|евро|руб\p{L}*|jahre?n?|monate?n?|monat|wochen?|tage?n?|stunden?|std|lata?|rok\p{L}*|miesi\p{L}*|tygodn\p{L}*|dni|godzin\p{L}*|jaar|jaren|maand\p{L}*|weken|dagen|uur|uren|%|km)$/u;

/** Is this one token a unit of time, money or percent (see COUNT_UNIT_WORD_RE)? */
export function isCountUnitWord(token: string | null | undefined): boolean {
  if (!token) return false;
  const lower = token.toLowerCase();
  return COUNT_UNIT_WORD_RE.test(lower) || COUNT_UNIT_WORD_RE.test(foldText(lower));
}

/** The first word of `rest` ("" when none) — what directly follows a number. */
function firstWordOf(rest: string): string {
  return rest.match(/^\s*(?:\+\s*)?([^\s\d.,;:!?()/]+)/u)?.[1] ?? "";
}

/**
 * TEAMS of a stated size — "3 brigadų po 4 žmones", "3 crews of 4 people",
 * "3 бригады по 4 человека", "3 Teams zu 4", "3 brygady po 4 osoby", "3
 * ploegen van 4". The need is 3 teams AND 3 × 4 = 12 workers: the total is
 * the headcount (`teamSize`), and the composition rides beside it
 * (`teamCount`, `perTeamSize`). Neither number alone is ever the headcount.
 */
export interface TeamComposition {
  readonly teams: number;
  readonly perTeam: number;
}

/** Why a team statement cannot be turned into a headcount without asking:
 *  a RANGE of teams ("3–4 brigados"), a range of people per team ("po 3–4"),
 *  or teams with no size at all ("reikia brigados", "2 crews"). */
export type TeamClarification =
  | "team_count_range"
  | "per_team_range"
  | "team_size_missing"
  | "team_count_missing";

export type TeamCompositionReading =
  | { readonly status: "known"; readonly teams: number; readonly perTeam: number; readonly total: number }
  | { readonly status: "unclear"; readonly clarification: TeamClarification; readonly teams: number | null };

// Team nouns, folded, all six locales. The foreman ("brigadininkas",
// "бригадир", "brygadzista") is a PERSON, not a team, and is excluded.
const TEAM_NOUN =
  "(?:brigad(?!inink)\\p{L}*|crews?|brigades?|gangs?|teams?|бригад(?!ир)\\p{L}*|звен\\p{L}*|команд\\p{L}*|kolonnen?|trupps?|brigaden?|brygad(?!zist)\\p{L}*|ekip\\p{L}*|ploeg(?:en)?)";
// The generic "team"/"команда" ("our team", "the command") only counts when a
// number and a size are both stated; a bare mention never asks for a size.
const STRICT_TEAM_NOUN =
  "(?:brigad(?!inink)\\p{L}*|crews?|brigades?|gangs?|бригад(?!ир)\\p{L}*|звен\\p{L}*|kolonnen?|trupps?|brigaden?|brygad(?!zist)\\p{L}*|ekip\\p{L}*|ploeg(?:en)?)";
/** "po" (lt, pl), "of" (en), "по" (ru), "zu/mit/je/à" (de), "van" (nl) —
 *  and "a team OF n": "iš" (lt), "из" (ru), "aus" (de), "z" (pl), "uit" (nl). */
const PER_TEAM_WORD = "(?:po|of|по|zu|mit|je|a|van|is|из|aus|z|uit)";
const EDGE = "(?:^|[^\\p{L}\\p{N}])";
const COUNT = "(\\d{1,3}|\\p{L}+)";
const RANGE = "(\\d{1,3})\\s*[-–—]\\s*(\\d{1,3})";

const TEAM_COUNT_RANGE_RE = new RegExp(`${EDGE}${RANGE}\\s+${TEAM_NOUN}`, "u");
const PER_TEAM_RANGE_RE = new RegExp(`${TEAM_NOUN}\\s+${PER_TEAM_WORD}\\s+${RANGE}`, "u");
const KNOWN_RE = new RegExp(
  `${EDGE}(?:${COUNT}\\s+)?(${TEAM_NOUN})\\s+${PER_TEAM_WORD}\\s+(\\d{1,3})(?!\\d|\\s*[-–—]\\s*\\d)`,
  "u",
);
/** A team noun in the SINGULAR — "brigada iš 4", "бригада из 4", "eine Kolonne
 *  aus 4": one team of that size even with no count word before it. */
const SINGULAR_TEAM_TOKEN = /^(?:brigada|brigados|crew|team|gang|brigade|бригада|бригаду|kolonne|trupp|brygada|brygady|brygade|ekipa|ekipy|ekipe|ploeg)$/u;

const STRICT_TEAM_TOKEN = new RegExp(`^${STRICT_TEAM_NOUN}$`, "u");
/** A verb that REQUESTS what follows it ("reikia brigados", "need a crew"). */
const TEAM_REQUEST_VERB =
  /^(?:reikia|reikalinga|reikalingos|reikalingi|ieskome|ieskau|need|needs|needed|hiring|seeking|require|нужна|нужны|нужен|нужно|требуется|требуются|ищем|ищу|suchen|brauchen|benotigen|szukamy|potrzebujemy|poszukujemy|zatrudnimy|zoeken|zoekt)$/u;
/** …or one that follows the noun ("Kolonne gesucht", "ploeg gezocht"). */
const TEAM_REQUEST_AFTER =
  /^(?:gesucht|gezocht|wanted|needed|nodig|reikalinga|reikalingos|требуется|нужна|potrzebna|potrzebne|poszukiwana)$/u;
/** A team noun after a possessive or determiner is CONTEXT, not a request:
 *  "to join our crew", "į mūsų brigadą", "в нашу бригаду", "in unsere
 *  Kolonne", "do naszej brygady", "in onze ploeg". */
const TEAM_CONTEXT_BEFORE =
  /^(?:our|my|your|their|the|this|musu|mano|jusu|savo|ju|sia|нашу|нашей|наша|наш|нашим|нашу|мою|свою|эту|unsere|unserem|unserer|unser|meine|ihre|die|der|den|nasza|naszej|naszą|moja|swojej|onze|ons|mijn|jullie|de|het)$/u;
// A team LEADER is one person, not a team: "brigados vadovo", "crew leader",
// "kierownika brygady", "руководитель бригады" never ask for a team size.
const LEADER_AFTER = /^(?:vadov\p{L}*|leader|lead|chief|manager|foreman|kierownik\p{L}*)$/u;
const LEADER_BEFORE = /^(?:kierownik\p{L}*|руководител\p{L}*|начальник\p{L}*|leader|lead|manager|vadov\p{L}*)$/u;

/** One team, said with an article or the numeral "one". */
const ONE_TEAM_WORD = /^(?:a|an|one|ein|eine|einen|een|jedna|jedne|jedno|одна|одну|одной|viena|vienos|vieną)$/u;

/**
 * A team REQUESTED without a size — "reikia brigados", "Need 2 crews", "Нужна
 * бригада", "Wir suchen eine Kolonne", "Szukamy brygady", "We zoeken een
 * ploeg". A team noun used as context ("join our crew") is not one, nor is
 * "5 crew" (five crew members — people, not teams).
 */
function requestedTeamWithoutSize(folded: string): { teams: number | null } | null {
  const tokens = folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    if (!STRICT_TEAM_TOKEN.test(tokens[i])) continue;
    const prev = tokens[i - 1];
    const prev2 = tokens[i - 2];
    const next = tokens[i + 1];
    if ((next && LEADER_AFTER.test(next)) || (prev && LEADER_BEFORE.test(prev))) continue;
    if (prev && TEAM_CONTEXT_BEFORE.test(prev)) continue;
    const count = countWord(prev);
    if (tokens[i] === "crew" && count !== null && count > 1) continue;
    const requested =
      count !== null ||
      (prev !== undefined && TEAM_REQUEST_VERB.test(prev)) ||
      (prev2 !== undefined && TEAM_REQUEST_VERB.test(prev2) && count !== null) ||
      (next !== undefined && TEAM_REQUEST_AFTER.test(next));
    if (requested) return { teams: count };
  }
  return null;
}

/** Does the sentence state a count of PEOPLE ("Need 2 welders", "reikia 3
 *  darbuotojų")? Then that count is the headcount, whatever team it joins. */
function statesPeopleCount(text: string): boolean {
  const lower = text.toLowerCase();
  const wt = recognisedWorkType(lower);
  return detectPeopleCount(wt.hay, wt.needle) !== null;
}

/** A digit or a written number ("dvi", "trys", "three", "a") — null otherwise. */
function countWord(token: string | undefined): number | null {
  if (!token) return null;
  if (/^\d{1,3}$/.test(token)) return Number.parseInt(token, 10);
  if (ONE_TEAM_WORD.test(token)) return 1;
  return parseWordNumber(token);
}

/** Teams stated in the sentence — known (teams × size) or needing a question. */
export function readTeamComposition(text: string | null | undefined): TeamCompositionReading | null {
  const folded = foldText(text ?? "");
  if (!folded) return null;
  if (TEAM_COUNT_RANGE_RE.test(folded)) {
    return { status: "unclear", clarification: "team_count_range", teams: null };
  }
  const known = folded.match(KNOWN_RE);
  if (known) {
    const perTeam = Number.parseInt(known[3], 10);
    // No count word, but a SINGULAR team noun: "brigada iš 4" is one team.
    const teams =
      countWord(known[1]) ??
      (SINGULAR_TEAM_TOKEN.test(known[2]) && !/^(?:reikalingos|reikalingi|нужны|требуются|potrzebne)$/u.test(known[1] ?? "")
        ? 1
        : null);
    if (teams !== null && teams >= 1 && teams <= 100 && perTeam >= 1 && perTeam <= 100) {
      return { status: "known", teams, perTeam, total: teams * perTeam };
    }
    // "brigadų po 4": the size is stated, how many teams is not — unless the
    // sentence counts the people itself, OUTSIDE the team phrase (the "4
    // žmones" of "po 4 žmones" is the size per team, not a headcount).
    const outside = `${folded.slice(0, known.index)} ${folded.slice((known.index ?? 0) + known[0].length)}`;
    if (perTeam >= 1 && perTeam <= 100 && teams === null && !statesPeopleCount(outside)) {
      return { status: "unclear", clarification: "team_count_missing", teams: null };
    }
  }
  const perRange = folded.match(PER_TEAM_RANGE_RE);
  if (perRange) {
    // "3 brigados po 3–4": the teams are known, the size per team is not.
    const before = folded.slice(0, perRange.index).trim().split(/[^\p{L}\p{N}]+/u).pop();
    return { status: "unclear", clarification: "per_team_range", teams: countWord(before) };
  }
  // A team requested with no size asks for the size — but an explicit count
  // of people ("Need 2 welders to join a crew") is the headcount already.
  const missing = requestedTeamWithoutSize(folded);
  if (missing && !statesPeopleCount(text ?? "")) {
    return { status: "unclear", clarification: "team_size_missing", teams: missing.teams };
  }
  return null;
}

/** The KNOWN composition only (teams × size), or null. */
export function detectTeamComposition(text: string | null | undefined): TeamComposition | null {
  const r = readTeamComposition(text);
  return r?.status === "known" ? { teams: r.teams, perTeam: r.perTeam } : null;
}

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
    const next = firstWordOf(hay.slice(verb.index + verb[0].length));
    const n = isCountUnitWord(next) ? null : countFrom(verb);
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
function recognisedWorkType(roleHay: string): {
  workType: string | null;
  needle: string | null;
  /** The hay the needle was found in — the counter must read the same one. */
  hay: string;
} {
  // Lowercased first (the needles carry their diacritic spellings), then
  // FOLDED: "Schweißer" only meets the needle "schweisser" once ß is ss.
  const wtHit = firstMatchWithNeedle(WORK_TYPE_RULES, maskServiceNoun(roleHay));
  if (wtHit && KNOWN_SLUGS.has(wtHit.rule.slug)) {
    return { workType: wtHit.rule.slug, needle: wtHit.needle, hay: roleHay };
  }
  const foldedHay = foldText(roleHay);
  const foldedHit = firstMatchWithNeedle(WORK_TYPE_RULES, maskServiceNoun(foldedHay));
  if (foldedHit && KNOWN_SLUGS.has(foldedHit.rule.slug)) {
    return { workType: foldedHit.rule.slug, needle: foldedHit.needle, hay: foldedHay };
  }
  return { workType: null, needle: null, hay: roleHay };
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
  // "3 brigadų po 4 žmones" is 3 × 4 = 12 people — never 3 or 4. Teams the
  // sentence does not size leave the count unknown.
  const teams = readTeamComposition(roleHay);
  if (teams) return teams.status === "known" ? teams.total : null;
  const wt = recognisedWorkType(roleHay);
  return detectPeopleCount(wt.hay, wt.needle);
}

export function structureNeed(input: NeedStructureInput): NeedStructureSuggestion {
  const reasons: string[] = [];
  // Role + description + notes drive the work type; location is weighted first
  // for the country. Free text is read here ONLY to derive closed-set values —
  // none of it is ever returned.
  const roleHay = needRoleHay(input);
  const locHay = `${normNeedText(input.location)} ${roleHay}`.trim();

  const { workType, needle: occupationNeedle, hay: workTypeHay } = recognisedWorkType(roleHay);
  if (workType) reasons.push(`work_type:${workType}`);

  const cc = firstMatch(COUNTRY_RULES, locHay);
  const country = cc && isIsoCountry(cc.code) ? cc.code : null;
  if (country) reasons.push(`country:${country}`);

  // Only the needle of a RECOGNISED work type is handed to the counter — an
  // unrecognised occupation must not silently lend its noun to a headcount.
  // Teams of a stated size ("3 brigadų po 4 žmones") are 3 teams AND 12
  // workers: the total is the team size, the composition rides beside it.
  // Teams with no size, or a range, leave the count null and ASK.
  const teams = readTeamComposition(roleHay);
  if (teams?.status === "known") reasons.push(`team_composition:${teams.teams}x${teams.perTeam}`);
  if (teams?.status === "unclear") reasons.push(`team_clarification:${teams.clarification}`);
  const teamSize = teams
    ? teams.status === "known"
      ? teams.total
      : null
    : detectTeamSize(workTypeHay, occupationNeedle);
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
  const needsReview = workType === null || confidence === "low" || teams?.status === "unclear";

  return {
    workType,
    country,
    teamSize,
    // Optional keys are only PRESENT when teams were stated, so every
    // existing reader (and every exact-shape assertion) sees the same object.
    ...(teams?.status === "known" ? { teamCount: teams.teams, perTeamSize: teams.perTeam } : {}),
    ...(teams?.status === "unclear"
      ? { teamCount: teams.teams, perTeamSize: null, teamClarification: teams.clarification }
      : {}),
    startPeriod,
    accommodation,
    confidence,
    reasons,
    needsReview,
  };
}
