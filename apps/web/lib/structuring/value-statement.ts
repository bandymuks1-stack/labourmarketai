/**
 * Value-statement structurer (V9 value-intent foundation) — PURE.
 *
 * The "grandmother's cucumbers" architecture test: a person states VALUE in
 * their own words — capacity ("kitą savaitę turiu dvi laisvas dienas"),
 * goods ("turiu 30 kg agurkų ir noriu parduoti"), or a shortage ("trūks
 * keturių suvirintojų") — and the platform must READ it before it can route
 * it. This module is only the reading: axis (offer/seek), subject, the
 * honest free-text echo of the thing, quantity, headcount, work type,
 * skills, country, coarse window, and an explicit list of what is missing.
 *
 * HONESTY RULES:
 *  - NO commodity taxonomy: `subjectLabel` is a bounded echo of the person's
 *    own noun phrase, never a classified product category.
 *  - NEVER guesses the user's type or intent — ambiguity yields nulls plus
 *    `missing`, not a default.
 *  - Reuses the platform's ONE vocabulary per fact: WORK_TYPE_RULES /
 *    COUNTRY_RULES (structure-need), recognizeSkills, extractQuantities,
 *    parseTimeWindow, word numbers — no second rule set to drift.
 */
import { detectNeedProfession } from "@/lib/market/need-skills";
import { PROFESSION_HINTS_LT } from "./keywords";
import { foldText } from "./normalize";
import { readsSingularOccupation, readsVagueHeadcount } from "./need-headcount";
import { readRoleLabel } from "./role-label";
import {
  workTypeRulesFor,
  isCountUnitWord,
  readTeamComposition,
  type TeamClarification,
  maskServiceNoun,
  resolveCountryAndCity,
} from "./structure-need";
import { recognizeSkills, type RecognizedSkill } from "./skill-recognition";
import { parseTimeWindow, type TimeWindow } from "./time-window";
import { extractQuantities } from "./universal-recognition";
import { findWordNumbers } from "./word-numbers";
import { looksSwedish } from "./looks-swedish";

export type ValueAxis = "offer" | "seek";
export type ValueSubject = "work_capacity" | "workforce" | "goods" | "service";
/** How the goods offer is shaped (V10): sale, an explicit rental, or a
 *  stated AVAILABILITY of equipment ("ekskavatorius laisvas") — the honest
 *  rental-shaped reading without inventing a price model. */
export type ValueOfferMode = "sale" | "rental" | "availability";

/** A stated amount. `unit: null` = the person named a bare count ("500
 *  medinių palečių") — no unit is ever invented. */
export interface ValueQuantity {
  readonly value: number;
  readonly unit: string | null;
  readonly raw: string;
}

export interface ValueStatement {
  readonly axis: ValueAxis | null;
  readonly subject: ValueSubject | null;
  /** Honest free-text echo of the THING (≤60 chars) — never a taxonomy. */
  readonly subjectLabel: string | null;
  readonly quantity: ValueQuantity | null;
  /** goods only — null for every other subject. */
  readonly offerMode: ValueOfferMode | null;
  /** How many people — for teams of a stated size, the TOTAL (3 × 4 = 12). */
  readonly headcount: number | null;
  /** Teams of a stated size (present only when the sentence states teams). */
  readonly teamCount?: number | null;
  readonly perTeamSize?: number | null;
  /** Teams named without a size or as a range — asked, never guessed. */
  readonly teamClarification?: TeamClarification;
  /** work-categories slug via the shared WORK_TYPE_RULES. */
  readonly workType: string | null;
  /** Canonical PROFESSION (the 49-row lexicon matching and the profile
   *  extractor already share) when the closed work-type set misses —
   *  "reikia 2 mechanikų" → `auto_mechanic`. Null when a work type was read
   *  (the work type keeps precedence) or nothing matched. A suggestion the
   *  person confirms in the form, never a persisted fact by itself. */
  readonly professionSlug: string | null;
  /** The occupation the person NAMED, in their own words and in the
   *  nominative ("Reikia buhalterio" → "Buhalteris", "projektų vadovo" →
   *  "Projektų vadovas") — carried whenever a seek sentence names an
   *  occupation noun, so a profession OUTSIDE both closed catalogues still
   *  reaches the need form's role field as an honest free-text label
   *  (`workType` and `professionSlug` stay null: no pretended match).
   *  Production 2026-09-06: six of eleven employer sentences lost their
   *  role this way. */
  readonly roleLabel: string | null;
  readonly skills: RecognizedSkill[];
  /** ISO-2 market code via the shared COUNTRY_RULES. */
  readonly country: string | null;
  /** The CITY the person named, when the country was resolved from a city
   *  needle ("Roterdame" → Rotterdam); `null` when only a country was named.
   *  Kept beside the country so the intake never collapses a site into its
   *  market (owner contract 2026-09-04 §9). */
  readonly city: string | null;
  readonly window: TimeWindow | null;
  readonly confidence: "high" | "medium" | "low";
  readonly reasons: string[];
  /** What would make the statement actionable: "location", "window", … */
  readonly missing: string[];
}

/**
 * A PRESENT-TENSE TRADE ACTIVITY in the first person — "remontuoju
 * automobilius", "kerpu plaukus", "dažau butus", "mokau matematikos",
 * "I repair cars", "ремонтирую машины", "ich repariere Autos", "ik repareer
 * auto's". Company-context walk 2026-09-06 (lane G): "remontuoju
 * automobilius" was answered "I am not sure whether you are offering
 * something or looking for something" — the sentence is a stated SERVICE
 * (an action somebody can order), in any context. Whole-word forms only, so
 * "montuoju" cannot fire inside "sumontuojame"; the LT list holds the
 * 1st-person singular AND plural of the everyday trades. Folded (no
 * diacritics), Cyrillic kept. EXPORTED so the intent router composes its
 * offer-value pattern from this ONE list (wrap with a word boundary).
 */
export const PRESENT_ACTIVITY_VERB_SOURCE =
  "remontuoju|remontuojame|taisau|taisome|kerpu|kerpame|dazau|dazome|valau|valome|montuoju|montuojame|mokau|mokome|siuvu|siuvame|vezu|vezame|vezioju|programuoju|programuojame|konsultuoju|konsultuojame|tvarkau|tvarkome|priziuriu|priziurime|pjaunu|pjauname|statau|statome|muriju|tinkuoju|klijuoju|verciu|verciame|projektuoju|projektuojame|fotografuoju|gaminu|gaminame|kepu|kepame|virinu|suvirinu|masazuoju|treniruoju|slaugau|" +
  "i\\s+(?:repair|fix|paint|clean|install|teach|tutor|mow|sew|weld|build|design|translate|babysit|cut\\s+hair)|" +
  "ремонтирую|чиню|крашу|убираю|монтирую|обучаю|шью|вожу|программирую|перевожу|стригу|строю|консультирую|" +
  "ich\\s+(?:repariere|streiche|putze|montiere|unterrichte|nahe|schweisse|baue|ubersetze)|" +
  "ik\\s+(?:repareer|schilder|monteer|naai|las|bouw|vertaal)";
/** sv — "jag reparerar cyklar", "jag målar hus" (folded). Apart from the
 *  shared source: read only in a sentence `looksSwedish` reads as Swedish. */
export const SV_PRESENT_ACTIVITY_VERB_SOURCE =
  "jag\\s+(?:reparerar|lagar|malar|stadar|installerar|monterar|undervisar|syr|svetsar|bygger|oversatter|klipper)";
const PRESENT_ACTIVITY_RE = new RegExp(
  `(?<![\\p{L}])(?:${PRESENT_ACTIVITY_VERB_SOURCE})(?![\\p{L}])`,
  "u",
);
const SV_PRESENT_ACTIVITY_RE = new RegExp(
  `(?<![\\p{L}])(?:${PRESENT_ACTIVITY_VERB_SOURCE}|${SV_PRESENT_ACTIVITY_VERB_SOURCE})(?![\\p{L}])`,
  "u",
);

/** Folded axis needles. Order-independent; both sides scored. */
const OFFER_RES: RegExp[] = [
  /parduo/u, // parduodu / parduoti / noriu parduoti
  /siul(au|om|ome|yti|ysiu|ysim)/u, // siūlau / siūlome / noriu siūlyti
  /\bteiki(u|ame)\b/u, // teikiu / teikiame paslaugas
  /\bsell(ing)?\b/u,
  /\boffer(ing)?\b/u,
  /продам|прода(ю|ем)|предлага/u,
  /\bturiu\b/u, // "I have …" — weak alone, decisive with a thing
  /\bgaliu\b/u,
  /laisv[\p{L}]*/u, // laisvas / laisvos dienos — free capacity
  /свободн/u,
  /\bavailable\b/u,
  /\bbied\b|\bverkoop/u, // nl (opportunistic)
  /\bbiete\b|verkaufe/u, // de (opportunistic)
  // "remontuoju automobilius" — stating what one DOES is an offer of it.
  PRESENT_ACTIVITY_RE,
];
// sv (2026-11-12): "Jag vill sälja 500 träpallar" / "Vi erbjuder …" / "Vi har
// 20 svetsare tillgängliga" / "hyr ut" routed to the offer intents and arrived
// here with no axis at all. Every SV_ list below is read ONLY for a sentence
// `looksSwedish` reads as Swedish: "ledig" is the German "unmarried" and made
// "Ich bin ledig" an availability offer (review finding 11).
const SV_OFFER_RES: RegExp[] = [
  ...OFFER_RES,
  /\bsalj(?:er|a|es)\b|till\s+salu|\berbjud(?:er|a)\b|\bhyr(?:a|s)?\s+ut\b|\buthyr/u,
  /\bledig(?:a|t)?\b|tillganglig/u,
  SV_PRESENT_ACTIVITY_RE,
];

const SEEK_RES: RegExp[] = [
  /reikia|reiki(a|u)/u,
  /truks(ta)?\b|truks\b/u, // trūksta / trūks (folded)
  /iesk(au|om|ome)/u,
  /\bneed(s|ed)?\b/u,
  /looking\s+for/u,
  /нужн|ищ(у|ем)|требу/u,
  /\bbrauch|\bsuche\b|\bsuchen\b|benotig|gesucht/u, // de
  /\bzoek|\bnodig\b|gezocht/u, // nl
  /potrzeb|szuka(m|my)\b|poszukuj/u, // pl
];
const SV_SEEK_RES: RegExp[] = [...SEEK_RES, /\bbehov(?:er|s)\b|\bsok(?:er|es)\b|\bletar\s+efter\b|\befterlys/u];

/** Goods-shaped units — a thing you weigh/count, not a surface you worked. */
const GOODS_UNITS = new Set(["kg", "t", "vnt", "ha", "m2", "m3"]);

/** A STRONG sell verb — enough for goods even without a unit quantity. */
const STRONG_SELL_RE = /parduo|продам|прода(ю|ем)|\bsell(ing)?\b|verkoop|verkaufe/u;
const SV_STRONG_SELL_RE = /parduo|продам|прода(ю|ем)|\bsell(ing)?\b|verkoop|verkaufe|\bsalj(?:er|a|es)\b|till\s+salu/u;

/** Person/occupation nouns that make a number a HEADCOUNT. */
const PERSON_NOUN_RES: RegExp[] = [
  /darbuotoj/u,
  /zmon(es|iu|ems)/u,
  /asmen/u,
  /\bworkers?\b|\bpeople\b|\bmen\b/u,
  /работник|человек|сотрудник/u,
  /brigad/u,
  /\bwerknemers?\b|\bmedewerkers?\b|\bmensen\b/u, // nl
  /\bmitarbeiter|\barbeiter|\barbeitskraft|\bleute\b/u, // de
  /pracownik|\bosob\b|\bludzi\b/u, // pl
];
// sv — never `personal` (the English adjective) or `folk`.
const SV_PERSON_NOUN_RES: RegExp[] = [...PERSON_NOUN_RES, /\bpersoner\b|\bmedarbetare\b|arbetare\b|\banstallda\b/u];

const SERVICE_RE = /paslaug|\bservices?\b|услуг|dienst(en)?\b/u;
const SV_SERVICE_RE = /paslaug|\bservices?\b|услуг|dienst(en)?\b|\btjanst(?:er|en|erna)?\b/u;

/** Service VERBS (V10): "galiu versti / suremontuoti" states a service even
 *  without the word "paslauga". Folded needles, LT/EN/RU. */
const SERVICE_VERB_RE =
  /\bvers(ti|iu|ciau)\b|isvers|remontuoj|suremontuo|taisau|taisyti|sutaisy|projektuoj|suprojektuo|can\s+(translate|repair|design|fix)|могу\s+(перевести|отремонтировать|спроектировать|починить)|перевожу|ремонтирую/u;

/**
 * An OFFER VERB bound to an everyday service activity (real-user fitness walk
 * 2026-09-06): "galiu kirpti plaukus namuose", "galiu mokyti matematikos",
 * "siūlau valyti butus". The verb is what makes it a service somebody can
 * ORDER; a bare activity stem ("reikia 2 valytojų") must stay employer
 * demand, so the offer verb is required in the same regex. `mokyt[iu]\b`
 * deliberately excludes "mokytis" (to learn). Folded needles, LT/EN/RU/DE/NL.
 */
const OFFER_ACTIVITY_RE =
  /\b(galiu|siulau|siulyti|teikiu|can|могу|biete|bied)\b\s+(?:\S+\s+){0,2}?(kirp|dazy|valy|mokyt[iu]\b|tvarky|siuv|montuo|pjau|priziur|programuo|konsultuo|apskait|vez[tu]|remont|taisy|paint|clean|teach|tutor|mow|install|sew|babysit|garden|\bfix\b)/u;

/** V10 equipment-capacity reading: the MACHINE is free, not a person. */
const EQUIPMENT_RE =
  /ekskavator|krautuv|traktor|kran(as|a|o|u)\b|buldozer|stakl|pastoli|betonmais|betono\s*mais|generator|kompresor|perforator|priekab|excavator|forklift|\bcranes?\b|scaffold|bulldozer|compressor|экскаватор|погрузчик|трактор|кран\b|станок|компрессор|генератор/u;
const SV_EQUIPMENT_RE =
  /ekskavator|krautuv|traktor|kran(as|a|o|u)\b|buldozer|stakl|pastoli|betonmais|betono\s*mais|generator|kompresor|perforator|priekab|excavator|forklift|\bcranes?\b|scaffold|bulldozer|compressor|экскаватор|погрузчик|трактор|кран\b|станок|компрессор|генератор|gravmaskin|lyftkran|byggkran|byggstallning|hjullastar|kompressor|slapvagn/u;
/** …unless the sentence is about the OPERATOR of it (a person). */
const OPERATOR_RE = /inink|operat|vairuotoj|driver|masinist|машинист/u;
const SV_OPERATOR_RE = /inink|operat|vairuotoj|driver|masinist|машинист|forare\b|chauffor/u;
/** Explicit rental verbs vs plain stated availability. */
const RENTAL_MODE_RE =
  /nuomo|isnuomo|\brent(al|ing)?\b|\bhire\b|аренд|сда(м|ю|ем)|verhuur|vermiete/u;
const SV_RENTAL_MODE_RE =
  /nuomo|isnuomo|\brent(al|ing)?\b|\bhire\b|аренд|сда(м|ю|ем)|verhuur|vermiete|\bhyr(?:a|s)?\s+ut\b|\buthyr/u;
const AVAILABILITY_RE = /laisv|\bavailable\b|\bfree\b|свободн/u;
const SV_AVAILABILITY_RE = /laisv|\bavailable\b|\bfree\b|свободн|\bledig(?:a|t)?\b|tillganglig/u;

/** Words that end a subject-label echo (connectives / new clauses). */
const LABEL_STOP_RE =
  /\s+(?:ir|bei|kad|nes|and|или|и|kuriuos|kurias)\s+|[,.;!?]/u;
const SV_LABEL_STOP_RE =
  /\s+(?:ir|bei|kad|nes|and|или|и|kuriuos|kurias|och|eller)\s+|[,.;!?]/u;

const LABEL_MAX = 60;

function firstRuleMatch<T extends { needles: string[] }>(
  rules: readonly T[],
  folded: string,
): T | null {
  for (const r of rules) {
    for (const n of r.needles) if (folded.includes(n)) return r;
  }
  return null;
}

/** The ORIGINAL token naming the equipment ("ekskavatorius") — the honest
 *  one-word echo when the statement is about a machine's availability. */
function equipmentToken(text: string, V: Vocab): string | null {
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const tok of tokens) {
    if (V.EQUIPMENT_RE.test(foldText(tok))) return tok;
  }
  return null;
}

/** Extend an index to the end of the word it sits in — a stem match
 *  ("parduo" inside "Parduodu") must never cut the echo mid-word. */
function endOfWord(text: string, index: number): number {
  let i = index;
  while (i < text.length && /[\p{L}\p{N}]/u.test(text[i])) i++;
  return i;
}

/** The noun phrase following an anchor (a quantity or a sell verb) in the
 *  ORIGINAL text — trimmed at connectives, bounded, honestly raw. */
function echoAfter(text: string, anchorEnd: number, V: Vocab): string | null {
  const rest = text.slice(anchorEnd).replace(/^[\s:—-]+/u, "");
  if (!rest) return null;
  const stop = rest.search(V.LABEL_STOP_RE);
  const cut = (stop === -1 ? rest : rest.slice(0, stop)).trim();
  if (!cut) return null;
  return cut.length > LABEL_MAX ? `${cut.slice(0, LABEL_MAX).trim()}…` : cut;
}

/** Digits OR word-numbers adjacent to a person/occupation noun → headcount. */
function detectHeadcount(text: string, folded: string, V: Vocab): number | null {
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const foldedTokens = tokens.map(foldText);
  // A counted PROFESSION noun is a headcount too ("2 mechanikų", "dviejų
  // programuotojų") — the same lexicon the profession fallback reads.
  const isPersonish = (tok: string): boolean =>
    V.PERSON_NOUN_RES.some((re) => re.test(tok)) ||
    (!/^paslaug/u.test(tok) &&
      (workTypeRulesFor(V.swedish).some((r) => r.needles.some((n) => tok.includes(n))) ||
        PROFESSION_HINTS_LT.some((r) =>
          r.needles.some((n) => n.length >= 4 && tok.includes(foldText(n))),
        )));

  const numberAt = (i: number): number | null => {
    if (/^\d{1,4}$/.test(tokens[i])) {
      const n = Number.parseInt(tokens[i], 10);
      return n >= 1 && n <= 1000 ? n : null;
    }
    const words = findWordNumbers(tokens[i], V.swedish);
    return words.length === 1 ? words[0].value : null;
  };

  for (let i = 0; i < foldedTokens.length; i++) {
    const value = numberAt(i);
    if (value === null) continue;
    // The counted noun sits within the next two tokens ("keturių suvirintojų",
    // "4 patyrusių suvirintojų") — but a UNIT between them ends the search:
    // "dvejiems metams suvirintojo" is a welder for two years, "3 metų
    // patirties suvirintojo" three years of experience — neither is a count.
    for (let ahead = 1; ahead <= 2 && i + ahead < foldedTokens.length; ahead++) {
      if (isCountUnitWord(tokens[i + ahead], V.swedish)) break;
      if (isPersonish(foldedTokens[i + ahead])) return value;
    }
  }
  // "reikia 4" / "need 4" with the occupation elsewhere in the sentence —
  // unless a unit follows the number ("reikia 3 metų patirties").
  const m = folded.match(V.DEMAND_COUNT_RE);
  if (m && !isCountUnitWord(m[2], V.swedish)) {
    const n = Number.parseInt(m[1], 10);
    if (n >= 1 && n <= 1000) return n;
  }
  return null;
}

/** Time-ish counted nouns a bare count must never read as goods amounts. */
const TIME_NOUN_RE =
  /^(dien|day|дн|день|дня|дней|savait|week|недел|men(es)?|month|месяц|val\b|valand|hour|час|met(u|ai)|year|лет|год)/u;
const SV_TIME_NOUN_RE =
  /^(dien|day|дн|день|дня|дней|savait|week|недел|men(es)?|month|месяц|val\b|valand|hour|час|met(u|ai)|year|лет|год|dag(?:ar|ars)?$|veck|manad|timm)/u;

/**
 * The vocabulary one sentence is read with. `VOCAB` is the shared one — every
 * language except Swedish, exactly as before 2026-11-12. `SV_VOCAB` adds the
 * Swedish words and is used ONLY for a sentence `looksSwedish` reads as
 * Swedish, so a Swedish word can never change how another language's sentence
 * is read (independent review of PR 3261, findings 5, 6 and 11).
 */
interface Vocab {
  readonly swedish: boolean;
  readonly OFFER_RES: RegExp[];
  readonly SEEK_RES: RegExp[];
  readonly PERSON_NOUN_RES: RegExp[];
  readonly PRESENT_ACTIVITY_RE: RegExp;
  readonly STRONG_SELL_RE: RegExp;
  readonly SERVICE_RE: RegExp;
  readonly EQUIPMENT_RE: RegExp;
  readonly OPERATOR_RE: RegExp;
  readonly RENTAL_MODE_RE: RegExp;
  readonly AVAILABILITY_RE: RegExp;
  readonly LABEL_STOP_RE: RegExp;
  readonly TIME_NOUN_RE: RegExp;
  /** "reikia 4" / "need 4" with the occupation elsewhere in the sentence. */
  readonly DEMAND_COUNT_RE: RegExp;
}
const VOCAB: Vocab = {
  swedish: false,
  OFFER_RES,
  SEEK_RES,
  PERSON_NOUN_RES,
  PRESENT_ACTIVITY_RE,
  STRONG_SELL_RE,
  SERVICE_RE,
  EQUIPMENT_RE,
  OPERATOR_RE,
  RENTAL_MODE_RE,
  AVAILABILITY_RE,
  LABEL_STOP_RE,
  TIME_NOUN_RE,
  DEMAND_COUNT_RE:
    /(?:reikia|truks(?:ta)?|need|нужн[\p{L}]*|требуется|ищем|brauchen|suchen|zoeken|potrzebujemy|szukamy)\s+(\d{1,4})(?!\p{N})\s*([^\s\d.,;:!?()/]*)/u,
};
const SV_VOCAB: Vocab = {
  swedish: true,
  OFFER_RES: SV_OFFER_RES,
  SEEK_RES: SV_SEEK_RES,
  PERSON_NOUN_RES: SV_PERSON_NOUN_RES,
  PRESENT_ACTIVITY_RE: SV_PRESENT_ACTIVITY_RE,
  STRONG_SELL_RE: SV_STRONG_SELL_RE,
  SERVICE_RE: SV_SERVICE_RE,
  EQUIPMENT_RE: SV_EQUIPMENT_RE,
  OPERATOR_RE: SV_OPERATOR_RE,
  RENTAL_MODE_RE: SV_RENTAL_MODE_RE,
  AVAILABILITY_RE: SV_AVAILABILITY_RE,
  LABEL_STOP_RE: SV_LABEL_STOP_RE,
  TIME_NOUN_RE: SV_TIME_NOUN_RE,
  DEMAND_COUNT_RE:
    /(?:reikia|truks(?:ta)?|need|нужн[\p{L}]*|требуется|ищем|brauchen|suchen|zoeken|potrzebujemy|szukamy|behover|soker)\s+(\d{1,4})(?!\p{N})\s*([^\s\d.,;:!?()/]*)/u,
};

/** V10: a BARE count with no unit ("500 medinių palečių") — the amount the
 *  person actually stated. No unit is invented; the counted noun must be a
 *  plain thing-word (not time, not people, not an occupation). */
function detectBareCount(text: string, V: Vocab): ValueQuantity | null {
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const foldedTokens = tokens.map(foldText);
  for (let i = 0; i < tokens.length; i++) {
    if (!/^\d{1,5}$/.test(tokens[i])) continue;
    const next = foldedTokens[i + 1];
    if (!next || next.length < 3) continue;
    if (V.TIME_NOUN_RE.test(next)) continue;
    if (V.PERSON_NOUN_RES.some((re) => re.test(next))) continue;
    if (workTypeRulesFor(V.swedish).some((r) => r.needles.some((n) => next.includes(n))))
      continue;
    const value = Number.parseInt(tokens[i], 10);
    if (value >= 1 && value <= 99999) {
      return { value, unit: null, raw: tokens[i] };
    }
  }
  return null;
}

export function structureValueStatement(
  text: string,
  todayIso: string = new Date().toISOString().slice(0, 10),
): ValueStatement {
  const raw = (text ?? "").trim();
  const folded = foldText(raw);
  const reasons: string[] = [];
  const missing: string[] = [];
  // Swedish words are read in a Swedish sentence only — see `Vocab`.
  const V = looksSwedish(raw) ? SV_VOCAB : VOCAB;

  const offerHits = V.OFFER_RES.filter((re) => re.test(folded));
  const seekHits = V.SEEK_RES.filter((re) => re.test(folded));
  let axis: ValueAxis | null = null;
  if (offerHits.length > 0 && seekHits.length === 0) axis = "offer";
  else if (seekHits.length > 0 && offerHits.length === 0) axis = "seek";
  else if (offerHits.length > 0 && seekHits.length > 0) {
    // Both sides matched ("turiu…", "reikia…") — a strong SELL verb settles
    // it for offer; otherwise the sentence is genuinely ambiguous.
    axis = V.STRONG_SELL_RE.test(folded) ? "offer" : null;
  }
  if (axis) reasons.push(`axis:${axis}`);

  const quantities = extractQuantities(raw);
  const goodsQuantity =
    quantities.find((q) => GOODS_UNITS.has(q.unit)) ?? null;
  const wt = firstRuleMatch(workTypeRulesFor(V.swedish), maskServiceNoun(folded));
  const workType = wt?.slug ?? null;
  if (workType) reasons.push(`work_type:${workType}`);
  // Real-user walk 2026-09-06: "mano autoservisui reikia 2 mechanikų" opened
  // the need form with the ROLE EMPTY — the closed work-type set is 43 manual
  // trades, while the platform's profession lexicon (49 rows; matching and
  // the profile extractor already read it) knows the mechanic, the cook, the
  // hairdresser, the developer, the teacher. The fallback names the
  // profession the person named; the work type keeps precedence.
  const professionSlug = workType
    ? null
    : detectNeedProfession(maskServiceNoun(folded));
  if (professionSlug) reasons.push(`profession:${professionSlug}`);
  const role = readRoleLabel(raw);
  const roleLabel = role?.label ?? null;
  if (roleLabel) reasons.push(`role_label:${roleLabel}`);
  const skills = recognizeSkills(raw);
  const { country, city } = resolveCountryAndCity(folded);
  if (country) reasons.push(`country:${country}`);
  if (city) reasons.push(`city:${city}`);
  const window = parseTimeWindow(raw, todayIso);
  if (window.kind !== "none") {
    reasons.push(
      `window:${window.kind}${window.days ? `(${window.days}d)` : ""}`,
    );
  }
  // A bare SINGULAR occupation after a seek verb ("restoranui reikia
  // virėjo", "reikia buhalterio") is a need for ONE person — the number the
  // grammar states, offered in the editable headcount field. A plural with
  // no number ("reikia suvirintojų") stays open: the count is not stated.
  // The same singular rule in the other five locales ("We need a welder",
  // "Нужен сварщик", "Wir suchen einen Schweißer", "Szukamy spawacza",
  // "Lasser gezocht") comes from the shared need-headcount reader.
  // Teams of a stated size ("3 brigadų po 4 žmones", "3 crews of 4 people")
  // are 3 teams AND 12 workers: the headcount is the total, the composition
  // rides beside it. Teams with no size or a range ("3–4 brigados") leave
  // the headcount null and ask (`missing` → "team_size") — never 3 or 4.
  const teams = readTeamComposition(raw);
  if (teams?.status === "known") reasons.push(`team_composition:${teams.teams}x${teams.perTeam}`);
  if (teams?.status === "unclear") reasons.push(`team_clarification:${teams.clarification}`);
  // "A few / several / keli …" welders is more than one but not how many:
  // the count is asked (`missing` → "headcount"), never the article's "one".
  const vagueCount = readsVagueHeadcount(raw);
  const headcount = teams
    ? teams.status === "known"
      ? teams.total
      : null
    : detectHeadcount(raw, folded, V) ??
      (vagueCount
        ? null
        : (role?.grammaticalNumber === "singular" && V.SEEK_RES.some((re) => re.test(folded)) ? 1 : null) ??
          (readsSingularOccupation(raw) ? 1 : null));
  if (headcount !== null) reasons.push(`headcount:${headcount}`);
  else if (vagueCount) reasons.push("headcount_unclear:quantifier");

  // ── Subject — decided by axis + the facts, never by guessing the user ──
  let subject: ValueSubject | null = null;
  let subjectLabel: string | null = null;
  let quantity: ValueQuantity | null = goodsQuantity;
  const equipmentCapacity =
    V.EQUIPMENT_RE.test(folded) &&
    !V.OPERATOR_RE.test(folded) &&
    (V.AVAILABILITY_RE.test(folded) || V.RENTAL_MODE_RE.test(folded));
  if (axis === "offer") {
    if (
      V.SERVICE_RE.test(folded) ||
      SERVICE_VERB_RE.test(folded) ||
      OFFER_ACTIVITY_RE.test(folded) ||
      V.PRESENT_ACTIVITY_RE.test(folded)
    ) {
      subject = "service";
      // "galiu versti dokumentus iš lenkų į lietuvių" — the echo carries the
      // person's own description (incl. a language pair when they state one).
      // For an offer verb + activity ("galiu kirpti plaukus") the echo starts
      // after the OFFER VERB, so the activity itself is what is echoed; for a
      // present-tense activity ("kerpu plaukus") after the VERB itself.
      const sv = folded.match(SERVICE_VERB_RE);
      const oa = sv ? null : folded.match(OFFER_ACTIVITY_RE);
      const pa = sv || oa ? null : folded.match(V.PRESENT_ACTIVITY_RE);
      if (sv?.index !== undefined) {
        subjectLabel = echoAfter(raw, endOfWord(raw, sv.index + sv[0].length), V);
      } else if (oa?.index !== undefined) {
        subjectLabel = echoAfter(raw, endOfWord(raw, oa.index + oa[1].length), V);
      } else if (pa?.index !== undefined) {
        subjectLabel = echoAfter(raw, endOfWord(raw, pa.index + pa[0].length), V);
      }
    } else if (equipmentCapacity) {
      // V10: the MACHINE is free — a goods/equipment capacity, not a person's.
      subject = "goods";
      subjectLabel = equipmentToken(raw, V);
    } else if (goodsQuantity) {
      subject = "goods";
      const at = raw.indexOf(goodsQuantity.raw);
      subjectLabel =
        at >= 0 ? echoAfter(raw, at + goodsQuantity.raw.length, V) : null;
    } else if (V.STRONG_SELL_RE.test(folded)) {
      const bare = detectBareCount(raw, V);
      if (bare) {
        // "Pagaminome 500 medinių palečių ir norime parduoti" — the stated
        // bare count IS the quantity; no unit is invented.
        subject = "goods";
        quantity = bare;
        const at = raw.indexOf(bare.raw);
        subjectLabel = at >= 0 ? echoAfter(raw, at + bare.raw.length, V) : null;
      } else if (!workType) {
        subject = "goods";
        const m = folded.match(V.STRONG_SELL_RE);
        subjectLabel = m?.index !== undefined
          ? echoAfter(raw, endOfWord(raw, m.index + m[0].length), V)
          : null;
      } else if (skills.length > 0 || workType) {
        subject = "work_capacity";
      }
    } else if (workType || skills.length > 0) {
      subject = "work_capacity";
    }
  } else if (axis === "seek") {
    // A named occupation — closed-set or the person's own word — is a
    // workforce need even before the count is known.
    if (workType || professionSlug || roleLabel || headcount !== null || teams) subject = "workforce";
  }
  if (subject) reasons.push(`subject:${subject}`);
  if (quantity) reasons.push(`quantity:${quantity.raw}`);

  // goods offer shape (V10) — explicit rental beats sale beats availability.
  const offerMode: ValueOfferMode | null =
    subject === "goods"
      ? V.RENTAL_MODE_RE.test(folded)
        ? "rental"
        : V.STRONG_SELL_RE.test(folded)
          ? "sale"
          : V.AVAILABILITY_RE.test(folded)
            ? "availability"
            : null
      : null;
  if (offerMode) reasons.push(`offer_mode:${offerMode}`);

  // ── What would make it actionable — stated, never guessed ──
  if (axis === null) missing.push("axis");
  if (axis !== null && subject === null) missing.push("subject");
  if (subject !== null) {
    if (!country) missing.push("location");
    if (window.kind === "none") missing.push("window");
    // A rental/availability of equipment has no natural sale quantity.
    if (
      subject === "goods" &&
      !quantity &&
      offerMode !== "rental" &&
      offerMode !== "availability"
    ) {
      missing.push("quantity");
    }
    // Teams named without a size (or as a range) ask about the TEAMS —
    // "how many teams, how many people in each?" — not a bare headcount.
    if (subject === "workforce" && headcount === null) {
      missing.push(teams?.status === "unclear" ? "team_size" : "headcount");
    }
  }

  const identifying =
    workType !== null ||
    professionSlug !== null ||
    roleLabel !== null ||
    goodsQuantity !== null ||
    headcount !== null ||
    skills.length > 0;
  const confidence: ValueStatement["confidence"] =
    axis !== null && subject !== null && identifying
      ? "high"
      : axis !== null && subject !== null
        ? "medium"
        : "low";

  return {
    axis,
    subject,
    subjectLabel,
    quantity: quantity ?? quantities[0] ?? null,
    offerMode,
    headcount,
    // Present only when teams were stated — every existing reader and exact-
    // shape assertion keeps seeing the same object otherwise.
    ...(teams?.status === "known" ? { teamCount: teams.teams, perTeamSize: teams.perTeam } : {}),
    ...(teams?.status === "unclear"
      ? { teamCount: teams.teams, perTeamSize: null, teamClarification: teams.clarification }
      : {}),
    workType,
    professionSlug,
    roleLabel,
    skills,
    country,
    city,
    window: window.kind === "none" ? null : window,
    confidence,
    reasons,
    missing,
  };
}
