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
import { ALL_WORK_TYPE_SLUGS, MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";

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
  { slug: "welder", needles: ["welder", "weld", "suvirin", "сварщик", "сварк"] },
  { slug: "electrician", needles: ["electrician", "elektrik", "электрик"] },
  { slug: "plumber", needles: ["plumber", "santechnik", "сантехник"] },
  { slug: "carpenter", needles: ["carpenter", "stalius", "столяр", "плотник"] },
  { slug: "mason", needles: ["mason", "bricklayer", "mūrinink", "murinink", "каменщик"] },
  { slug: "painter", needles: ["painter", "dažytoj", "dazytoj", "маляр"] },
  { slug: "tiler", needles: ["tiler", "plytel", "плиточник"] },
  { slug: "roofer", needles: ["roofer", "stogden", "кровельщик"] },
  { slug: "crane_operator", needles: ["crane operator", "crane", "krano operat", "крановщик"] },
  { slug: "excavator_operator", needles: ["excavator", "ekskavator", "экскаватор"] },
  { slug: "heavy_equipment_operator", needles: ["heavy equipment", "heavy machine", "sunkiosios technik", "спецтехник"] },
  { slug: "forklift_operator", needles: ["forklift", "krautuv", "погрузчик"] },
  { slug: "truck_driver_ce", needles: ["ce driver", "driver ce", "vilkik", "фуры", "фура"] },
  { slug: "truck_driver_c", needles: ["truck driver", "lorry", "sunkvežim", "sunkvezim", "грузовик"] },
  { slug: "delivery_driver", needles: ["delivery driver", "delivery", "pristatym", "доставк"] },
  { slug: "courier", needles: ["courier", "kurjer", "курьер"] },
  { slug: "order_picker", needles: ["order picker", "picker", "rinkėj", "rinkej", "комплектов"] },
  { slug: "packer", needles: ["packer", "packing", "pakuotoj", "упаковщик"] },
  { slug: "warehouse_worker", needles: ["warehouse", "sandėl", "sandel", "склад"] },
  { slug: "assembler", needles: ["assembler", "assembly", "surink", "сборщик", "сборк"] },
  { slug: "machine_operator", needles: ["machine operator", "cnc", "staklių operat", "stakliu operat", "оператор станк"] },
  { slug: "quality_control", needles: ["quality control", "quality inspector", "kokybės kontrol", "kokybes kontrol", "контролёр качества", "контролер качества"] },
  { slug: "production_worker", needles: ["production worker", "factory worker", "gamybos darbinink", "производственн"] },
  { slug: "cook", needles: ["cook", "chef", "virėj", "virej", "повар"] },
  { slug: "kitchen_helper", needles: ["kitchen helper", "kitchen porter", "virtuvės pagalb", "virtuves pagalb", "помощник повара"] },
  { slug: "dishwasher", needles: ["dishwasher", "indų plov", "indu plov", "посудомой"] },
  { slug: "waiter", needles: ["waiter", "waitress", "padavėj", "padavej", "официант"] },
  { slug: "housekeeper", needles: ["housekeeper", "housekeeping", "room attendant", "kambarin", "горничн"] },
  { slug: "elderly_carer", needles: ["elderly care", "elderly carer", "senior care", "pagyvenusi", "сиделк"] },
  { slug: "care_assistant", needles: ["care assistant", "caregiver", "nurse", "nursing", "slaug", "уход", "сиделк"] },
  { slug: "support_worker", needles: ["support worker", "pagalbos darbuotoj", "социальн"] },
  { slug: "industrial_cleaner", needles: ["industrial clean", "pramoninis valytoj", "промышленн уборщ"] },
  { slug: "cleaner", needles: ["cleaner", "cleaning", "valytoj", "valymas", "уборщик", "уборк"] },
  { slug: "facility_worker", needles: ["facility", "patalpų prižiūr", "patalpu priziur", "обслуживан"] },
  { slug: "harvest_worker", needles: ["harvest", "picking fruit", "derliaus", "сбор урожая", "сборщик урожая"] },
  { slug: "greenhouse_worker", needles: ["greenhouse", "šiltnam", "siltnam", "теплич"] },
  { slug: "farm_worker", needles: ["farm", "agricultur", "žemės ūki", "zemes uki", "сельхоз", "ферм"] },
  { slug: "general_laborer", needles: ["laborer", "labourer", "general worker", "helper", "pagalbinis darbinink", "разнорабоч", "подсобн"] },
];

const KNOWN_SLUGS = new Set(ALL_WORK_TYPE_SLUGS);

/** Country needles (codes, names, major cities) → ISO-2 market. */
export const COUNTRY_RULES: { code: string; needles: string[] }[] = [
  { code: "LT", needles: ["lithuania", "lietuv", "литв", "vilnius", "kaunas", "klaipėd", "klaiped"] },
  { code: "LV", needles: ["latvia", "latvij", "латв", "riga", "ryga"] },
  { code: "EE", needles: ["estonia", "eston", "эстон", "tallinn", "talin"] },
  { code: "PL", needles: ["poland", "lenkij", "polska", "польш", "warsaw", "warszaw", "krak", "wroc", "gdansk", "gdańsk"] },
  { code: "DE", needles: ["germany", "vokietij", "deutschland", "герман", "berlin", "hamburg", "munich", "münchen", "munchen", "frankfurt", "cologne", "köln", "koln", "stuttgart"] },
  { code: "NL", needles: ["netherlands", "holland", "niderland", "нидерланд", "голланд", "amsterdam", "rotterdam", "hague", "haag", "eindhoven", "utrecht"] },
  { code: "DK", needles: ["denmark", "danij", "дани", "copenhagen", "kopenhag", "копенгаг", "aarhus"] },
  { code: "NO", needles: ["norway", "norveg", "норвег", "oslo", "bergen", "trondheim"] },
  { code: "SE", needles: ["sweden", "švedij", "svedij", "sverige", "швец", "stockholm", "gothenburg", "göteborg", "malmö", "malmo"] },
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

const KNOWN_COUNTRIES = new Set<string>(MARKET_COUNTRIES);

function firstMatch<T extends { needles: string[] }>(
  rules: T[],
  hay: string,
): T | null {
  for (const r of rules) {
    for (const n of r.needles) {
      if (hay.includes(n)) return r;
    }
  }
  return null;
}

function detectTeamSize(hay: string): number | null {
  // A number directly tied to people/workers, OR right after a "need" verb.
  const patterns = [
    /\b(\d{1,4})\s*(?:x\s*)?(?:workers?|people|staff|persons?|men|crew|welders?|drivers?|cleaners?|cooks?|pickers?|laborers?|labourers?|darbuotoj\w*|žmon\w*|zmon\w*|asmen\w*|работник\w*|человек)/i,
    /(?:need|require|looking for|reikia|нужно|требуется|ищем)\s+(?:about\s+|apie\s+)?(\d{1,4})\b/i,
  ];
  for (const re of patterns) {
    const m = hay.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 1000) return n;
    }
  }
  return null;
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

export function structureNeed(input: NeedStructureInput): NeedStructureSuggestion {
  const reasons: string[] = [];
  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();
  // Role + description + notes drive the work type; location is weighted first
  // for the country. Free text is read here ONLY to derive closed-set values —
  // none of it is ever returned.
  const roleHay = `${norm(input.role)} ${norm(input.description)} ${norm(input.notes)}`.trim();
  const locHay = `${norm(input.location)} ${roleHay}`.trim();

  const wt = firstMatch(WORK_TYPE_RULES, roleHay);
  const workType = wt && KNOWN_SLUGS.has(wt.slug) ? wt.slug : null;
  if (workType) reasons.push(`work_type:${workType}`);

  const cc = firstMatch(COUNTRY_RULES, locHay);
  const country = cc && KNOWN_COUNTRIES.has(cc.code) ? cc.code : null;
  if (country) reasons.push(`country:${country}`);

  const teamSize = detectTeamSize(roleHay);
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
