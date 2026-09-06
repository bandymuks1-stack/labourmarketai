/**
 * Role label — the occupation a person NAMED, in their own words (PURE).
 *
 * WHY THIS EXISTS. Production 2026-09-06 (build ca96605b, measured with the
 * professional-language walk): "Reikia buhalterio." / "reikia inžinieriaus" /
 * "reikia teisininko" / "reikia dizainerio" / "ieškome pardavimų specialisto"
 * all opened the need form with the ROLE EMPTY, and "Reikia projektų vadovo."
 * did not even reach the form (the project stem routed it to the projects
 * list). The platform's closed vocabularies — 43 manual work types
 * (`WORK_TYPE_RULES`) and the 49-profession catalogue (`PROFESSION_HINTS_LT`,
 * every slug seeded in `public.professions`) — cannot name an accountant, a
 * lawyer, an engineer, a designer, a project manager, a sales specialist.
 * Adding them to the catalogue is a seed migration (owner, RED); the honest
 * carry until then is the person's OWN word as a free-text label, with
 * `workType` / `professionSlug` null — no pretended catalogue match.
 *
 * WHAT IT READS.
 *   - `readRoleLabel`: a SEEK sentence ("reikia …", "ieškome …", "trūksta …",
 *     "need …", "нужен …") → the occupation noun phrase after the seek verb,
 *     returned in the NOMINATIVE ("buhalterio" → "Buhalteris", "projektų
 *     vadovo" → "Projektų vadovas") plus its grammatical number, so a bare
 *     singular ("reikia virėjo") can suggest a headcount of one.
 *   - `readProfessionStatement`: a PERSON sentence ("esu buhalteris", "dirbu
 *     inžinieriumi", "dirbau projektų vadovu 5 metus") → the profession
 *     stated, the catalogue slug when the ONE lexicon knows it, the years,
 *     and the tense (present = a profession, past = work history).
 *
 * HOW IT STAYS HONEST. Lithuanian occupation nouns carry a closed set of
 * agentive suffixes (-ininkas, -tojas, -ėjas, -eris, -istas, -ierius, -orius,
 * -ovas, -ikas, -antas, -ologas). A token qualifies as an occupation ONLY by
 * such a suffix (in the case the sentence needs), or by a short list of
 * professional stems in LT/EN/RU that no catalogue row covers. Generic person
 * nouns ("darbuotojų", "žmonių") and equipment nouns that share a suffix
 * ("kompiuterio", "traktoriaus") are excluded explicitly. Everything returned
 * is a SUGGESTION the person reads in an editable field — never a persisted
 * fact by itself (§7).
 *
 * The regex SOURCES are exported so the intent router composes its patterns
 * from the same definitions — one vocabulary per fact, nothing to drift.
 */
import { detectNeedProfession } from "@/lib/market/need-skills";
import { foldText } from "./normalize";
import { maskServiceNoun } from "./structure-need";
import { findWordNumbers } from "./word-numbers";

export type GrammaticalNumber = "singular" | "plural" | "unknown";

export interface RoleLabelReading {
  /** Nominative, first letter capitalised, ≤60 chars — the person's own words. */
  readonly label: string;
  /** The phrase exactly as typed. */
  readonly raw: string;
  readonly grammaticalNumber: GrammaticalNumber;
}

export interface ProfessionStatementReading {
  readonly label: string;
  readonly raw: string;
  /** Catalogue slug when the ONE profession lexicon recognises the phrase. */
  readonly professionSlug: string | null;
  /** "dirbau … 5 metus" — a stated span of years, or null. */
  readonly years: number | null;
  /** present: "esu / dirbu" (a profession); past: "dirbau" (work history). */
  readonly tense: "present" | "past";
}

// ── Shared regex sources (folded: no diacritics; Cyrillic kept) ─────────────

/** Professional occupation stems NO catalogue row covers (LT/EN/RU). The
 *  label is still the person's own word — this list only says "that word is
 *  an occupation". When the catalogue gains a row, the slug path takes over. */
export const OCCUPATION_STEM_SOURCE =
  "buhalter|teisinink|inzinier|dizainer|konsultant|ekonomist|architekt|analitik|finansinink|rinkodarinink|marketolog|vadybinink|" +
  "accountant|lawyer|engineer|designer|consultant|economist|architect|analyst|" +
  "бухгалтер|юрист|инженер|дизайнер|консультант|экономист|архитектор|аналитик|" +
  // de / nl (the two other fully routed locales)
  "buchhalter|ingenieur|anwalt|jurist|berater|entwickler|boekhouder|advocaat|ontwerper|adviseur|ontwikkelaar|programmeur";

/** Genitive endings an occupation noun takes after a seek verb — singular
 *  ("buhalterio") and plural ("suvirintojų", typed with or without ų). */
export const ROLE_SUFFIX_GENITIVE_SOURCE =
  "ininko|ininku|ininkes|tojo|toju|tojos|ejo|eju|ejos|erio|eriu|eres|isto|istu|istes|ieriaus|ieriu|oriaus|oriu|ovo|ovu|oves|iko|iku|ikes|anto|antu|antes|ologo|ologu|ologes";

/** Nominative endings after "esu" (masc./fem.). */
export const ROLE_SUFFIX_NOMINATIVE_SOURCE =
  "ininkas|ininke|tojas|toja|ejas|eja|eris|ere|istas|iste|ierius|iere|orius|ore|ovas|ove|ikas|ike|antas|ante|ologas|ologe";

/** Instrumental endings after "dirbu / dirbau" ("inžinieriumi", "vadovu"). */
export const ROLE_SUFFIX_INSTRUMENTAL_SOURCE =
  "ininku|ininke|toju|toja|eju|eja|eriu|ere|istu|iste|ieriumi|iere|oriumi|ore|ovu|ove|iku|ike|antu|ante|ologu|ologe";

/** Tokens that share a suffix but are never a role: generic person nouns,
 *  the service noun, learners, and everyday equipment ("kompiuterio"). */
export const ROLE_NOUN_EXCLUSION_SOURCE =
  "darbuotoj|zmog|zmon|asmen|kandidat|student|mokin|paslaug|savanor|" +
  "kompiuter|kompresor|traktor|generator|monitor|motor|printer|router|kalkuliator|ventiliator|radiator|akumuliator|kondicionier|konteiner|transporter|server|skaner|projektor|telefon|automobil";

/** The seek verbs that open an employer/buyer need (folded). */
export const SEEK_VERB_SOURCE =
  "reikia|reikes|reiketu|reikalingas|reikalinga|reikalingi|reikalingos|truksta|truks|ieskau|ieskome|ieskom|need|needs|needed|looking\\s+for|нужен|нужна|нужны|нужно|ищем|ищу|требуется|требуются";

/** The person-statement anchors (folded). */
export const PROFESSION_STATEMENT_ANCHOR_SOURCE =
  "esu|dirbu|dirbau|i\\s+am|i'm|я|работаю|работал|работала|ik\\s+ben|ik\\s+werk\\s+als|ich\\s+bin|ich\\s+arbeite\\s+als";

// ── Internals ───────────────────────────────────────────────────────────────

const STEM_RE = new RegExp(`^(?:${OCCUPATION_STEM_SOURCE})`, "u");
const EXCLUDED_RE = new RegExp(`^(?:${ROLE_NOUN_EXCLUSION_SOURCE})`, "u");
const GENITIVE_RE = new RegExp(`(?:${ROLE_SUFFIX_GENITIVE_SOURCE})$`, "u");
const NOMINATIVE_RE = new RegExp(`(?:${ROLE_SUFFIX_NOMINATIVE_SOURCE})$`, "u");
const INSTRUMENTAL_RE = new RegExp(`(?:${ROLE_SUFFIX_INSTRUMENTAL_SOURCE})$`, "u");
const SEEK_RE = new RegExp(`(?:^|[^\\p{L}])(?:${SEEK_VERB_SOURCE})(?![\\p{L}])`, "u");
const STATEMENT_RE = new RegExp(
  `(?:^|[^\\p{L}])(?:as\\s+)?(${PROFESSION_STATEMENT_ANCHOR_SOURCE})(?![\\p{L}])`,
  "u",
);
const PAST_RE = /^(dirbau|работал|работала)$/u;

/** Words that END the noun phrase: prepositions, connectives, time words,
 *  possessives, places. Folded stems / whole words. */
const STOP_WORD_RE =
  /^(i|is|su|be|prie|per|nuo|iki|del|apie|pas|uz|ant|po|kad|kuris|kuri|kurie|ir|bei|arba|o|bet|mano|musu|jusu|savo|rytoj|siandien|poryt|kita|kitas|kito|sia|si|sio|savait[a-z]*|men[a-z]*|metus|metu|metai|dien[a-z]*|val[a-z]*|nuolat|skubiai|for|from|in|at|to|with|and|or|next|this|в|на|с|со|для|и|или)$/u;

/** Month stems the time parser knows — a month word never joins a role. */
const MONTH_STEM_RE =
  /^(saus|vasar|kov|baland|geguz|birzel|liep|rugpj|rugsej|spal|lapkri|gruod|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/u;

/** A modifier that may stay in front of the head noun WITHOUT changing case
 *  when the head becomes nominative: a genitive attribute ("projektų",
 *  "įrangos", "programinės", "anglų kalbos"). Masculine genitive adjectives
 *  ("patyrusio", "gero") agree with the head and would read wrong — dropped. */
const ATTRIBUTE_RE = /(ų|u|ių|iu|os|ės|es)$/u;

/** LT case → nominative for the head noun. ORIGINAL spelling is kept (the
 *  suffix is replaced on the token as typed; ASCII-typed forms get ASCII
 *  nominatives). Longest suffix first. */
const GENITIVE_TO_NOMINATIVE: ReadonlyArray<readonly [string, string]> = [
  ["ieriaus", "ierius"], ["ierių", "ierius"], ["ieriu", "ierius"],
  ["oriaus", "orius"], ["orių", "orius"], ["oriu", "orius"],
  ["ininko", "ininkas"], ["ininkų", "ininkas"], ["ininku", "ininkas"], ["ininkės", "ininkė"], ["ininkes", "ininke"],
  ["ologo", "ologas"], ["ologų", "ologas"], ["ologu", "ologas"], ["ologės", "ologė"], ["ologes", "ologe"],
  ["tojo", "tojas"], ["tojų", "tojas"], ["toju", "tojas"], ["tojos", "toja"],
  ["ėjo", "ėjas"], ["ėjų", "ėjas"], ["ėju", "ėjas"], ["ėjos", "ėja"],
  ["ejo", "ejas"], ["ejų", "ejas"], ["eju", "ejas"], ["ejos", "eja"],
  ["erio", "eris"], ["erių", "eris"], ["eriu", "eris"], ["erės", "erė"], ["eres", "ere"],
  ["isto", "istas"], ["istų", "istas"], ["istu", "istas"], ["istės", "istė"], ["istes", "iste"],
  ["anto", "antas"], ["antų", "antas"], ["antu", "antas"], ["antės", "antė"], ["antes", "ante"],
  ["ovo", "ovas"], ["ovų", "ovas"], ["ovu", "ovas"], ["ovės", "ovė"], ["oves", "ove"],
  ["iko", "ikas"], ["ikų", "ikas"], ["iku", "ikas"], ["ikės", "ikė"], ["ikes", "ike"],
];

const INSTRUMENTAL_TO_NOMINATIVE: ReadonlyArray<readonly [string, string]> = [
  ["ieriumi", "ierius"], ["oriumi", "orius"],
  ["ininku", "ininkas"], ["ininke", "ininkė"],
  ["ologu", "ologas"], ["ologe", "ologė"],
  ["toju", "tojas"], ["ėju", "ėjas"], ["eju", "ejas"],
  ["eriu", "eris"], ["istu", "istas"], ["antu", "antas"], ["ovu", "ovas"], ["iku", "ikas"],
  // feminine instrumental equals the nominative for these classes
  ["toja", "toja"], ["ėja", "ėja"], ["eja", "eja"], ["ere", "erė"], ["iste", "istė"], ["ante", "antė"], ["ove", "ovė"], ["ike", "ikė"],
];

function replaceSuffix(token: string, table: ReadonlyArray<readonly [string, string]>): string {
  const lower = token.toLowerCase();
  for (const [from, to] of table) {
    if (lower.endsWith(from) && lower.length > from.length + 1) {
      return lower.slice(0, lower.length - from.length) + to;
    }
  }
  return lower;
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

const LABEL_MAX = 60;

interface Token {
  readonly raw: string;
  readonly folded: string;
  /** Character offset of the token in the original text. */
  readonly at: number;
}

/** Fold the text CHARACTER BY CHARACTER so offsets stay aligned with the
 *  original (a folded letter is always exactly one character here). */
function foldAligned(text: string): string {
  let out = "";
  for (const ch of text) {
    const f = foldText(ch);
    out += f.length === 1 ? f : f.length === 0 ? ch.toLowerCase() : f[0];
  }
  return out;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  const re = /[\p{L}\p{N}']+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ raw: m[0], folded: foldText(m[0]), at: m.index });
  }
  return out;
}

function isNumberToken(tok: Token): boolean {
  if (/^\d{1,4}$/.test(tok.raw)) return true;
  return findWordNumbers(tok.raw).length === 1;
}

/** Is this token an occupation noun in the given case? Returns the
 *  grammatical number when it is, null when it is not. */
function occupationHead(
  tok: Token,
  caseRe: RegExp,
): GrammaticalNumber | null {
  if (EXCLUDED_RE.test(tok.folded)) return null;
  if (tok.folded.length < 5) return null;
  const bySuffix = caseRe.test(tok.folded);
  const byStem = STEM_RE.test(tok.folded);
  if (!bySuffix && !byStem) return null;
  if (caseRe === GENITIVE_RE && bySuffix) {
    // Plural genitive endings (typed with or without the ų).
    return /(ų|u)$/u.test(tok.folded) && /(inku|toju|eju|eriu|istu|ieriu|oriu|ovu|iku|antu|ologu)$/u.test(tok.folded)
      ? "plural"
      : "singular";
  }
  return "unknown";
}

/** The attribute tokens immediately before the head (up to three), kept only
 *  while every one of them is a genitive attribute and not a stop word. */
function attributesBefore(tokens: Token[], headIndex: number, floor: number): Token[] {
  const out: Token[] = [];
  for (let i = headIndex - 1; i >= floor && out.length < 3; i--) {
    const t = tokens[i];
    if (STOP_WORD_RE.test(t.folded) || MONTH_STEM_RE.test(t.folded) || isNumberToken(t)) break;
    if (!ATTRIBUTE_RE.test(t.folded) || EXCLUDED_RE.test(t.folded)) break;
    out.unshift(t);
  }
  return out;
}

function phraseOf(tokens: Token[]): string {
  return tokens.map((t) => t.raw).join(" ");
}

function bounded(label: string): string {
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX).trim()}…` : label;
}

/**
 * The occupation an employer/buyer NAMED after a seek verb, in the nominative.
 * `null` when the sentence names no occupation noun (a service, a thing, a
 * generic "people") — never a guess.
 */
export function readRoleLabel(text: string): RoleLabelReading | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const folded = foldAligned(raw);
  const seek = SEEK_RE.exec(folded);
  if (!seek) return null;
  const tokens = tokenize(raw);
  // The first token strictly after the seek verb's END (offsets line up:
  // the folded text is built one character per character).
  const verbEnd = seek.index + seek[0].length;
  const start = tokens.findIndex((t) => t.at >= verbEnd);
  if (start === -1) return null;
  // Up to four tokens after the verb may precede the head: a number, an
  // article, up to three attributes.
  for (let i = start; i < Math.min(tokens.length, start + 5); i++) {
    const t = tokens[i];
    if (STOP_WORD_RE.test(t.folded) && !/^(mano|musu|jusu|savo)$/u.test(t.folded)) break;
    if (MONTH_STEM_RE.test(t.folded)) break;
    const number = occupationHead(t, GENITIVE_RE);
    if (!number) continue;
    const attrs = attributesBefore(tokens, i, start);
    const head = replaceSuffix(t.raw, GENITIVE_TO_NOMINATIVE);
    const label = capitalise(bounded([...attrs.map((a) => a.raw.toLowerCase()), head].join(" ")));
    return { label, raw: phraseOf([...attrs, t]), grammaticalNumber: number };
  }
  return null;
}

/**
 * "esu buhalteris" / "dirbu inžinieriumi" / "dirbau projektų vadovu 5 metus".
 * The head noun must be lower-case as typed (a capitalised word after "esu"
 * is a NAME, not a profession), and must be an occupation noun in the case
 * the anchor takes: nominative after "esu", instrumental after "dirbu/dirbau".
 */
export function readProfessionStatement(text: string): ProfessionStatementReading | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const folded = foldAligned(raw);
  const anchor = STATEMENT_RE.exec(folded);
  if (!anchor) return null;
  const verb = anchor[1];
  const tense: ProfessionStatementReading["tense"] = PAST_RE.test(verb) ? "past" : "present";
  const isLtNominative = verb === "esu";
  const isInstrumental = verb === "dirbu" || verb === "dirbau";
  const tokens = tokenize(raw);
  const verbEnd = anchor.index + anchor[0].length;
  const start = tokens.findIndex((t) => t.at >= verbEnd);
  if (start === -1) return null;
  for (let i = start; i < Math.min(tokens.length, start + 5); i++) {
    const t = tokens[i];
    if (STOP_WORD_RE.test(t.folded)) break;
    // A capitalised word after "esu" / "dirbu" is a NAME ("esu Jonas"), never
    // a role — the suffix classes are open enough that a surname ("Ivanovas")
    // could pass them. German capitalises every noun, and the EN/NL/DE paths
    // accept a closed stem list only, so the guard is Lithuanian-only.
    if ((isLtNominative || isInstrumental) && /^[\p{Lu}]/u.test(t.raw)) break;
    let number: GrammaticalNumber | null = null;
    if (isLtNominative) number = occupationHead(t, NOMINATIVE_RE);
    else if (isInstrumental) number = occupationHead(t, INSTRUMENTAL_RE);
    else number = STEM_RE.test(t.folded) && !EXCLUDED_RE.test(t.folded) ? "unknown" : null;
    if (!number) continue;
    const attrs = attributesBefore(tokens, i, start);
    const head = isInstrumental ? replaceSuffix(t.raw, INSTRUMENTAL_TO_NOMINATIVE) : t.raw.toLowerCase();
    const phrase = [...attrs.map((a) => a.raw.toLowerCase()), head].join(" ");
    const label = capitalise(bounded(phrase));
    const professionSlug = detectNeedProfession(maskServiceNoun(foldText(phrase)));
    const yearsMatch = folded.match(/(\d{1,2})\s*(?:met|years?|yrs?|лет|год)/u);
    const years = yearsMatch ? Number.parseInt(yearsMatch[1], 10) : null;
    return {
      label,
      raw: phraseOf([...attrs, t]),
      professionSlug,
      years: years !== null && years >= 0 && years <= 60 ? years : null,
      tense,
    };
  }
  return null;
}
