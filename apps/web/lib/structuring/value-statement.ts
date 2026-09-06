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
import {
  WORK_TYPE_RULES,
  maskServiceNoun,
  resolveCountryAndCity,
} from "./structure-need";
import { recognizeSkills, type RecognizedSkill } from "./skill-recognition";
import { parseTimeWindow, type TimeWindow } from "./time-window";
import { extractQuantities } from "./universal-recognition";
import { findWordNumbers } from "./word-numbers";

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
  readonly headcount: number | null;
  /** work-categories slug via the shared WORK_TYPE_RULES. */
  readonly workType: string | null;
  /** Canonical PROFESSION (the 49-row lexicon matching and the profile
   *  extractor already share) when the closed work-type set misses —
   *  "reikia 2 mechanikų" → `auto_mechanic`. Null when a work type was read
   *  (the work type keeps precedence) or nothing matched. A suggestion the
   *  person confirms in the form, never a persisted fact by itself. */
  readonly professionSlug: string | null;
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
];

const SEEK_RES: RegExp[] = [
  /reikia|reiki(a|u)/u,
  /truks(ta)?\b|truks\b/u, // trūksta / trūks (folded)
  /iesk(au|om|ome)/u,
  /\bneed(s|ed)?\b/u,
  /looking\s+for/u,
  /нужн|ищ(у|ем)|требу/u,
  /\bbrauch|\bsuche\b/u, // de (opportunistic)
  /\bzoek/u, // nl (opportunistic)
];

/** Goods-shaped units — a thing you weigh/count, not a surface you worked. */
const GOODS_UNITS = new Set(["kg", "t", "vnt", "ha", "m2", "m3"]);

/** A STRONG sell verb — enough for goods even without a unit quantity. */
const STRONG_SELL_RE = /parduo|продам|прода(ю|ем)|\bsell(ing)?\b|verkoop|verkaufe/u;

/** Person/occupation nouns that make a number a HEADCOUNT. */
const PERSON_NOUN_RES: RegExp[] = [
  /darbuotoj/u,
  /zmon(es|iu|ems)/u,
  /asmen/u,
  /\bworkers?\b|\bpeople\b|\bmen\b/u,
  /работник|человек|сотрудник/u,
  /brigad/u,
];

const SERVICE_RE = /paslaug|\bservices?\b|услуг|dienst(en)?\b/u;

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
/** …unless the sentence is about the OPERATOR of it (a person). */
const OPERATOR_RE = /inink|operat|vairuotoj|driver|masinist|машинист/u;
/** Explicit rental verbs vs plain stated availability. */
const RENTAL_MODE_RE =
  /nuomo|isnuomo|\brent(al|ing)?\b|\bhire\b|аренд|сда(м|ю|ем)|verhuur|vermiete/u;
const AVAILABILITY_RE = /laisv|\bavailable\b|\bfree\b|свободн/u;

/** Words that end a subject-label echo (connectives / new clauses). */
const LABEL_STOP_RE =
  /\s+(?:ir|bei|kad|nes|and|или|и|kuriuos|kurias)\s+|[,.;!?]/u;

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
function equipmentToken(text: string): string | null {
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const tok of tokens) {
    if (EQUIPMENT_RE.test(foldText(tok))) return tok;
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
function echoAfter(text: string, anchorEnd: number): string | null {
  const rest = text.slice(anchorEnd).replace(/^[\s:—-]+/u, "");
  if (!rest) return null;
  const stop = rest.search(LABEL_STOP_RE);
  const cut = (stop === -1 ? rest : rest.slice(0, stop)).trim();
  if (!cut) return null;
  return cut.length > LABEL_MAX ? `${cut.slice(0, LABEL_MAX).trim()}…` : cut;
}

/** Digits OR word-numbers adjacent to a person/occupation noun → headcount. */
function detectHeadcount(text: string, folded: string): number | null {
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const foldedTokens = tokens.map(foldText);
  // A counted PROFESSION noun is a headcount too ("2 mechanikų", "dviejų
  // programuotojų") — the same lexicon the profession fallback reads.
  const isPersonish = (tok: string): boolean =>
    PERSON_NOUN_RES.some((re) => re.test(tok)) ||
    (!/^paslaug/u.test(tok) &&
      (WORK_TYPE_RULES.some((r) => r.needles.some((n) => tok.includes(n))) ||
        PROFESSION_HINTS_LT.some((r) =>
          r.needles.some((n) => n.length >= 4 && tok.includes(foldText(n))),
        )));

  const numberAt = (i: number): number | null => {
    if (/^\d{1,4}$/.test(tokens[i])) {
      const n = Number.parseInt(tokens[i], 10);
      return n >= 1 && n <= 1000 ? n : null;
    }
    const words = findWordNumbers(tokens[i]);
    return words.length === 1 ? words[0].value : null;
  };

  for (let i = 0; i < foldedTokens.length; i++) {
    const value = numberAt(i);
    if (value === null) continue;
    // The counted noun sits within the next two tokens ("keturių suvirintojų",
    // "4 patyrusių suvirintojų").
    for (let ahead = 1; ahead <= 2 && i + ahead < foldedTokens.length; ahead++) {
      if (isPersonish(foldedTokens[i + ahead])) return value;
    }
  }
  // "reikia 4" / "need 4" with the occupation elsewhere in the sentence.
  const m = folded.match(
    /(?:reikia|truks(?:ta)?|need|нужн[\p{L}]*|требуется|ищем)\s+(\d{1,4})\b/u,
  );
  if (m) {
    const n = Number.parseInt(m[1], 10);
    if (n >= 1 && n <= 1000) return n;
  }
  return null;
}

/** Time-ish counted nouns a bare count must never read as goods amounts. */
const TIME_NOUN_RE =
  /^(dien|day|дн|день|дня|дней|savait|week|недел|men(es)?|month|месяц|val\b|valand|hour|час|met(u|ai)|year|лет|год)/u;

/** V10: a BARE count with no unit ("500 medinių palečių") — the amount the
 *  person actually stated. No unit is invented; the counted noun must be a
 *  plain thing-word (not time, not people, not an occupation). */
function detectBareCount(text: string): ValueQuantity | null {
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const foldedTokens = tokens.map(foldText);
  for (let i = 0; i < tokens.length; i++) {
    if (!/^\d{1,5}$/.test(tokens[i])) continue;
    const next = foldedTokens[i + 1];
    if (!next || next.length < 3) continue;
    if (TIME_NOUN_RE.test(next)) continue;
    if (PERSON_NOUN_RES.some((re) => re.test(next))) continue;
    if (WORK_TYPE_RULES.some((r) => r.needles.some((n) => next.includes(n))))
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

  const offerHits = OFFER_RES.filter((re) => re.test(folded));
  const seekHits = SEEK_RES.filter((re) => re.test(folded));
  let axis: ValueAxis | null = null;
  if (offerHits.length > 0 && seekHits.length === 0) axis = "offer";
  else if (seekHits.length > 0 && offerHits.length === 0) axis = "seek";
  else if (offerHits.length > 0 && seekHits.length > 0) {
    // Both sides matched ("turiu…", "reikia…") — a strong SELL verb settles
    // it for offer; otherwise the sentence is genuinely ambiguous.
    axis = STRONG_SELL_RE.test(folded) ? "offer" : null;
  }
  if (axis) reasons.push(`axis:${axis}`);

  const quantities = extractQuantities(raw);
  const goodsQuantity =
    quantities.find((q) => GOODS_UNITS.has(q.unit)) ?? null;
  const wt = firstRuleMatch(WORK_TYPE_RULES, maskServiceNoun(folded));
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
  const headcount = detectHeadcount(raw, folded);
  if (headcount !== null) reasons.push(`headcount:${headcount}`);

  // ── Subject — decided by axis + the facts, never by guessing the user ──
  let subject: ValueSubject | null = null;
  let subjectLabel: string | null = null;
  let quantity: ValueQuantity | null = goodsQuantity;
  const equipmentCapacity =
    EQUIPMENT_RE.test(folded) &&
    !OPERATOR_RE.test(folded) &&
    (AVAILABILITY_RE.test(folded) || RENTAL_MODE_RE.test(folded));
  if (axis === "offer") {
    if (
      SERVICE_RE.test(folded) ||
      SERVICE_VERB_RE.test(folded) ||
      OFFER_ACTIVITY_RE.test(folded)
    ) {
      subject = "service";
      // "galiu versti dokumentus iš lenkų į lietuvių" — the echo carries the
      // person's own description (incl. a language pair when they state one).
      // For an offer verb + activity ("galiu kirpti plaukus") the echo starts
      // after the OFFER VERB, so the activity itself is what is echoed.
      const sv = folded.match(SERVICE_VERB_RE);
      const oa = sv ? null : folded.match(OFFER_ACTIVITY_RE);
      if (sv?.index !== undefined) {
        subjectLabel = echoAfter(raw, endOfWord(raw, sv.index + sv[0].length));
      } else if (oa?.index !== undefined) {
        subjectLabel = echoAfter(raw, endOfWord(raw, oa.index + oa[1].length));
      }
    } else if (equipmentCapacity) {
      // V10: the MACHINE is free — a goods/equipment capacity, not a person's.
      subject = "goods";
      subjectLabel = equipmentToken(raw);
    } else if (goodsQuantity) {
      subject = "goods";
      const at = raw.indexOf(goodsQuantity.raw);
      subjectLabel =
        at >= 0 ? echoAfter(raw, at + goodsQuantity.raw.length) : null;
    } else if (STRONG_SELL_RE.test(folded)) {
      const bare = detectBareCount(raw);
      if (bare) {
        // "Pagaminome 500 medinių palečių ir norime parduoti" — the stated
        // bare count IS the quantity; no unit is invented.
        subject = "goods";
        quantity = bare;
        const at = raw.indexOf(bare.raw);
        subjectLabel = at >= 0 ? echoAfter(raw, at + bare.raw.length) : null;
      } else if (!workType) {
        subject = "goods";
        const m = folded.match(STRONG_SELL_RE);
        subjectLabel = m?.index !== undefined
          ? echoAfter(raw, endOfWord(raw, m.index + m[0].length))
          : null;
      } else if (skills.length > 0 || workType) {
        subject = "work_capacity";
      }
    } else if (workType || skills.length > 0) {
      subject = "work_capacity";
    }
  } else if (axis === "seek") {
    if (workType || headcount !== null) subject = "workforce";
  }
  if (subject) reasons.push(`subject:${subject}`);
  if (quantity) reasons.push(`quantity:${quantity.raw}`);

  // goods offer shape (V10) — explicit rental beats sale beats availability.
  const offerMode: ValueOfferMode | null =
    subject === "goods"
      ? RENTAL_MODE_RE.test(folded)
        ? "rental"
        : STRONG_SELL_RE.test(folded)
          ? "sale"
          : AVAILABILITY_RE.test(folded)
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
    if (subject === "workforce" && headcount === null) missing.push("headcount");
  }

  const identifying =
    workType !== null ||
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
    workType,
    professionSlug,
    skills,
    country,
    city,
    window: window.kind === "none" ? null : window,
    confidence,
    reasons,
    missing,
  };
}
