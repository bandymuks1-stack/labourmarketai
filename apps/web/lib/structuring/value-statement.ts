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
import { foldText } from "./normalize";
import { COUNTRY_RULES, WORK_TYPE_RULES } from "./structure-need";
import { recognizeSkills, type RecognizedSkill } from "./skill-recognition";
import { parseTimeWindow, type TimeWindow } from "./time-window";
import {
  extractQuantities,
  type RecognizedQuantity,
} from "./universal-recognition";
import { findWordNumbers } from "./word-numbers";

export type ValueAxis = "offer" | "seek";
export type ValueSubject = "work_capacity" | "workforce" | "goods" | "service";

export interface ValueStatement {
  readonly axis: ValueAxis | null;
  readonly subject: ValueSubject | null;
  /** Honest free-text echo of the THING (≤60 chars) — never a taxonomy. */
  readonly subjectLabel: string | null;
  readonly quantity: RecognizedQuantity | null;
  readonly headcount: number | null;
  /** work-categories slug via the shared WORK_TYPE_RULES. */
  readonly workType: string | null;
  readonly skills: RecognizedSkill[];
  /** ISO-2 market code via the shared COUNTRY_RULES. */
  readonly country: string | null;
  readonly window: TimeWindow | null;
  readonly confidence: "high" | "medium" | "low";
  readonly reasons: string[];
  /** What would make the statement actionable: "location", "window", … */
  readonly missing: string[];
}

/** Folded axis needles. Order-independent; both sides scored. */
const OFFER_RES: RegExp[] = [
  /parduo/u, // parduodu / parduoti / noriu parduoti
  /siul(au|om|ome)/u, // siūlau / siūlome
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
  const isPersonish = (tok: string): boolean =>
    PERSON_NOUN_RES.some((re) => re.test(tok)) ||
    WORK_TYPE_RULES.some((r) => r.needles.some((n) => tok.includes(n)));

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
  const wt = firstRuleMatch(WORK_TYPE_RULES, folded);
  const workType = wt?.slug ?? null;
  if (workType) reasons.push(`work_type:${workType}`);
  const skills = recognizeSkills(raw);
  const cc = firstRuleMatch(COUNTRY_RULES, folded);
  const country = cc?.code ?? null;
  if (country) reasons.push(`country:${country}`);
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
  if (axis === "offer") {
    if (SERVICE_RE.test(folded)) {
      subject = "service";
    } else if (goodsQuantity) {
      subject = "goods";
      const at = raw.indexOf(goodsQuantity.raw);
      subjectLabel =
        at >= 0 ? echoAfter(raw, at + goodsQuantity.raw.length) : null;
    } else if (STRONG_SELL_RE.test(folded) && !workType) {
      subject = "goods";
      const m = folded.match(STRONG_SELL_RE);
      subjectLabel = m?.index !== undefined
        ? echoAfter(raw, m.index + m[0].length)
        : null;
    } else if (workType || skills.length > 0) {
      subject = "work_capacity";
    }
  } else if (axis === "seek") {
    if (workType || headcount !== null) subject = "workforce";
  }
  if (subject) reasons.push(`subject:${subject}`);
  if (goodsQuantity) reasons.push(`quantity:${goodsQuantity.raw}`);

  // ── What would make it actionable — stated, never guessed ──
  if (axis === null) missing.push("axis");
  if (axis !== null && subject === null) missing.push("subject");
  if (subject !== null) {
    if (!country) missing.push("location");
    if (window.kind === "none") missing.push("window");
    if (subject === "goods" && !goodsQuantity) missing.push("quantity");
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
    quantity: goodsQuantity ?? quantities[0] ?? null,
    headcount,
    workType,
    skills,
    country,
    window: window.kind === "none" ? null : window,
    confidence,
    reasons,
    missing,
  };
}
