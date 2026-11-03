/**
 * How many workers a need states — PURE, deterministic, six locales.
 *
 * The ONE reading both need surfaces show: the market recognizer
 * (/dashboard/market/recognize) and, for the multilingual singular rule, the
 * chat's value statement. In order:
 *
 *   1. TEAMS of a stated size — "3 brigadų po 4 žmones" is 3 teams AND 12
 *      workers. Teams with no size or a range ("3–4 brigados", "reikia
 *      brigados") are NOT guessed: the total stays null and a clarification
 *      code says what to ask.
 *   2. A NUMBER that counts people — followed by a person word or by the
 *      occupation's own noun ("2 mūrininkų", "reikia 3 darbuotojų").
 *      Durations, pay, hours and experience never count (structure-need's
 *      `isCountUnitWord`).
 *   3. ONE singular occupation after a demand verb, with no number — one
 *      worker: "Reikia suvirintojo", "We need a welder", "Нужен сварщик",
 *      "Wir suchen einen Schweißer", "Szukamy spawacza", "Lasser gezocht".
 *
 * Light on purpose: it imports the need structurer, the word numbers and the
 * folding, never the lexicon — the recognizer runs in the browser.
 */
import { foldText } from "./normalize";
import {
  WORK_TYPE_RULES,
  countPeopleInNeed,
  isCountUnitWord,
  maskServiceNoun,
  readTeamComposition,
  type TeamClarification,
} from "./structure-need";
import { withUnicodeBoundaries } from "./unicode-word-boundary";

export type HeadcountBasis = "teams" | "count" | "singular_occupation";

/** What to ask before any total is shown: teams without a size or as a range,
 *  or a vague quantity ("a few welders", "keli suvirintojai"). */
export type HeadcountClarification = TeamClarification | "headcount_unclear";

export interface NeedHeadcount {
  /** Workers in total — null while a clarification is open. */
  readonly total: number | null;
  /** Teams of a stated size: how many teams, and how many people in each. */
  readonly teams: number | null;
  readonly perTeam: number | null;
  readonly basis: HeadcountBasis | null;
  readonly clarification: HeadcountClarification | null;
}

/**
 * Words that state MORE THAN ONE without a number — "a few", "a couple of",
 * "a dozen", "several", "some", "keli / kelis / keletas", "несколько",
 * "einige / mehrere / ein paar", "kilka / kilku", "enkele / een paar". The
 * article in "a few welders" is not "one welder": the count is unresolved and
 * asked, never 1 ("dozen" is no number word here, so it is asked too).
 */
const PLURAL_QUANTIFIER =
  /^(?:few|couple|dozen|dozens|several|some|many|multiple|various|keli|kelis|kelios|keletas|keleta|keliu|keleto|keleriems|daug|nemazai|несколько|нескольких|пару|пара|много|einige|einigen|mehrere|mehreren|paar|viele|kilka|kilku|kilkoro|kilkunastu|paru|wielu|enkele|aantal|meerdere|verschillende|veel)$/u;

type DemandLanguage = "lt" | "en" | "ru" | "de" | "pl" | "nl";

/** Demand verbs per locale, folded. The verb names the language whose
 *  grammar decides whether the occupation is singular. */
const DEMAND_VERBS: ReadonlyArray<{ lang: DemandLanguage; re: RegExp }> = (
  [
  { lang: "lt", re: /\b(reikia|reikalingas|reikalinga|reikalingi|reikalingos|ieskome|ieskau|ieskoma|truksta|samdome|priimsime|priimame)\b/ },
  { lang: "en", re: /\b(need|needs|needed|looking for|hiring|wanted|require|required|seeking)\b/ },
  { lang: "ru", re: /\b(нужен|нужна|нужно|нужны|требуется|требуются|ищем|ищу|ищет)\b/ },
  { lang: "de", re: /\b(suchen|brauchen|gesucht|benotigen|benotigt|stellen ein)\b/ },
  { lang: "pl", re: /\b(szukamy|potrzebujemy|poszukujemy|potrzebny|potrzebna|zatrudnimy|zatrudni)\b/ },
  { lang: "nl", re: /\b(zoeken|gezocht|nodig|gevraagd|zoekt)\b/ },
  ] as const satisfies ReadonlyArray<{ lang: DemandLanguage; re: RegExp }>
).map(({ lang, re }) => ({ lang, re: withUnicodeBoundaries(re) }));

/** A verb that itself states MORE than one ("reikalingi", "нужны"). */
const PLURAL_VERB = withUnicodeBoundaries(/\b(reikalingi|reikalingos|нужны|требуются)\b/);

/** The article / numeral "one" before a noun, per locale (folded tokens). */
const ONE_BEFORE: Record<DemandLanguage, RegExp> = {
  lt: /^(vieno|vienos|viena|vienas)$/u,
  en: /^(a|an|one)$/u,
  ru: /^(один|одна|одного|одну|одной)$/u,
  de: /^(ein|eine|einen|einem|einer)$/u,
  pl: /^(jeden|jedna|jednego)$/u,
  nl: /^een$/u,
};

/** Is this occupation token singular in that language? (folded token) */
function isSingularToken(lang: DemandLanguage, token: string, before: readonly string[]): boolean {
  if (before.some((w) => ONE_BEFORE[lang].test(w))) return true;
  switch (lang) {
    // Genitive singular after "reikia" (suvirintojo, mūrininko, staliaus,
    // virėjos) or a nominative singular (suvirintojas). Plural genitive ends
    // in -ų (folded -u), plural nominative in -ai / -iai.
    case "lt":
      return /(o|aus|os|es|as|is|ys|us)$/u.test(token) && !/(u|ai)$/u.test(token);
    // Without an article English does not mark the number reliably
    // ("need welder" is a headline); with one it is the rule above.
    case "en":
      return false;
    // Nominative or accusative singular (сварщик, сварщика); plural forms
    // end in -и/-ы/-ов/-ев/-ей.
    case "ru":
      return !/(и|ы|ов|ев|ей|ам|ами|ах)$/u.test(token);
    // German -er nouns are the same in the plural ("2 Schweißer"): only the
    // article says one.
    case "de":
      return false;
    // spawacza / murarza / kierowcę (folded kierowce) or the nominative
    // spawacz; plurals end in -y / -i / -ów.
    case "pl":
      return !/(y|i|ow|ami|ach|om)$/u.test(token);
    // Dutch agent nouns form the plural with -s (lassers, metselaars).
    case "nl":
      return !/s$/u.test(token);
  }
}

/**
 * ONE singular occupation after a demand verb, and no number anywhere near
 * it — "Reikia suvirintojo", "We need a welder", "Нужен сварщик", "Wir
 * suchen einen Schweißer", "Szukamy spawacza", "Lasser gezocht".
 */
export function readsSingularOccupation(text: string | null | undefined): boolean {
  return readOccupationNumber(text) === "singular";
}

/** An occupation after a demand verb counted only by a VAGUE quantity —
 *  "We need a few welders", "Reikia kelių suvirintojų", "Нужно несколько
 *  сварщиков". The count is asked, never guessed. */
export function readsVagueHeadcount(text: string | null | undefined): boolean {
  return readOccupationNumber(text) === "vague";
}

/** How the demanded occupation is counted when no number is stated. */
function readOccupationNumber(text: string | null | undefined): "singular" | "vague" | "other" | null {
  const folded = foldText(text ?? "");
  if (!folded) return null;
  const verb = DEMAND_VERBS.find(({ re }) => re.test(folded));
  if (!verb) return null;
  const tokens = folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  // A stated number keeps its own reading — this rule is only for none. A
  // number that MEASURES something ("2 metams", "15 eur", "40 val.", "3 metų
  // patirties") is not a count and does not stand in the way.
  if (tokens.some((t, i) => /^\d+$/.test(t) && !isCountUnitWord(tokens[i + 1]))) return null;
  const masked = maskServiceNoun(folded);
  for (const rule of WORK_TYPE_RULES) {
    for (const needle of rule.needles) {
      const n = foldText(needle);
      if (n.includes(" ") || !masked.includes(n)) continue;
      const index = tokens.findIndex((t) => t.includes(n));
      if (index === -1) continue;
      // "a few / a couple of / a dozen / several …" before the occupation:
      // more than one, not how many — and never the article's "one".
      if (tokens.slice(Math.max(0, index - 3), index).some((w) => PLURAL_QUANTIFIER.test(w))) return "vague";
      if (PLURAL_VERB.test(folded)) return "other";
      return isSingularToken(verb.lang, tokens[index], tokens.slice(Math.max(0, index - 2), index))
        ? "singular"
        : "other";
    }
  }
  return null;
}

/** How many workers the sentence states — see the module comment. */
export function readNeedHeadcount(text: string | null | undefined): NeedHeadcount | null {
  const teams = readTeamComposition(text);
  if (teams?.status === "known") {
    return { total: teams.total, teams: teams.teams, perTeam: teams.perTeam, basis: "teams", clarification: null };
  }
  if (teams?.status === "unclear") {
    return { total: null, teams: teams.teams, perTeam: null, basis: null, clarification: teams.clarification };
  }
  const count = countPeopleInNeed({ description: text ?? "" });
  if (count !== null) return { total: count, teams: null, perTeam: null, basis: "count", clarification: null };
  const occupation = readOccupationNumber(text);
  if (occupation === "vague") {
    return { total: null, teams: null, perTeam: null, basis: null, clarification: "headcount_unclear" };
  }
  if (occupation === "singular") {
    return { total: 1, teams: null, perTeam: null, basis: "singular_occupation", clarification: null };
  }
  return null;
}
