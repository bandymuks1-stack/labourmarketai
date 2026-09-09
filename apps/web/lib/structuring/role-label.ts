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
  // Public-entry probe (lane F, 2026-09-06): "We need a developer for our
  // team" / "Нужен программист" read `unknown` — the EN/RU professional
  // stems stopped at the office professions. Stems are PREFIXES of a folded
  // token, so each one is chosen not to open on an everyday thing-word
  // ("техник" would swallow "техника" = equipment; "nurse" → "nursery").
  "accountant|lawyer|engineer|designer|consultant|economist|architect|analyst|developer|programmer|manager|specialist|teacher|technician|" +
  "бухгалтер|юрист|инженер|дизайнер|консультант|экономист|архитектор|аналитик|программист|разработчик|менеджер|специалист|учител|" +
  // de / nl (the two other fully routed locales)
  "buchhalter|ingenieur|anwalt|jurist|berater|entwickler|programmierer|spezialist|lehrer|techniker|" +
  "boekhouder|advocaat|ontwerper|adviseur|ontwikkelaar|programmeur|leraar|technicus|monteur";

/** Genitive endings an occupation noun takes after a seek verb — singular
 *  ("buhalterio") and plural ("suvirintojų", typed with or without ų). */
export const ROLE_SUFFIX_GENITIVE_SOURCE =
  "ininko|ininku|ininkes|tojo|toju|tojos|ejo|eju|ejos|erio|eriu|eres|isto|istu|istes|ieriaus|ieriu|oriaus|oriu|ovo|ovu|oves|iko|iku|ikes|anto|antu|antes|ologo|ologu|ologes";

/**
 * THE MANUAL TRADES, as people write them (folded stems).
 *
 * Lived inline inside the employer-demand rule of the intent router until
 * 2026-09-08, which meant the DEMAND side knew every trade and the SUPPLY
 * side knew none: "reikia 12 pastoliniku" was understood and "turime 20
 * pastoliniku" was not. A vocabulary only one direction can read is how a
 * market becomes one-directional. It lives here, beside
 * `OCCUPATION_STEM_SOURCE`, so both directions read the SAME list.
 *
 * Stems, not words: they must match every case ending the languages use.
 */
export const TRADE_STEM_SOURCE =
  "suvirin|elektrik|santechnik|stali(aus|ų|u)|mūrinink|dažytoj|stogden|plytel|vairuotoj|krautuv|ekskavator|virėj|padavėj|valytoj|pakuotoj|rinkėj|(?<!pa)slaug|welder|electrician|plumber|carpenter|painter|driver|cleaner|cook|сварщик|электрик|сантехник|водител|повар|уборщ|маляр|плотник|каменщик|schweißer|schweisser|klempner|maler|fahrer|koch|lasser|loodgieter|schilder|chauffeur|schoonmaker|kok\\b|tischler|timmerman|pastolinink|scaffolder|betonuotoj|concrete|tinkuotoj|plasterer|armat[uū]rinink|rebar|steel\\s+fixer|izoliuotoj|insulat|монтажник|бетонщик|штукатур|арматурщик|изолировщик|ger[uü]stbauer|steigerbouwer|betonbauer|betonwerker|stuckateur|stukadoor|betoniarz|tynkarz|zbrojarz|rusztowa|" +
  // 2026-09-09: "We need a team of 6 FITTERS for next week" measured
  // `unknown` while the same sentence with "welders" was understood — the
  // English word for `montuotoj` / `монтажник` was simply absent. `fitter` is
  // bounded so it cannot open on "fitted" / "fitting"; `installer` and
  // `montuotoj` cover the other ordinary forms.
  "fitter\\b|fitters\\b|installer|montuotoj";

/**
 * THE PEOPLE A SENTENCE CAN OFFER — one person, several, or a whole brigade.
 *
 * ── WHY THIS EXISTS (owner readiness window, 2026-09-09, Priority 2) ───────
 *
 * The `offer-capacity` rule had TWO patterns that each carried their own copy
 * of this list, and the copies had drifted. Pattern 1 ("we have N X and are
 * looking for work") knew `brigad`, `team`, `crew`, `ploeg`, `komand`.
 * Pattern 2 ("looking for work FOR OUR people") knew only the individual
 * nouns. Measured on the real router, the collective noun was the ONLY
 * difference between being understood and not:
 *
 *   "Looking for work for our PEOPLE"      → offer-capacity   (in the list)
 *   "Looking for work for our CREW"        → find-work        (not in it)
 *   "Ieškome darbo mūsų BRIGADAI"          → need-workers     (!!)
 *   "Ieškome projekto mūsų KOMANDAI"       → offer-capacity   (in the list)
 *   "Zoek werk voor onze PLOEG"            → find-work
 *   "Suchen Arbeit für unsere KOLONNE"     → unknown
 *   "Ищем проект для нашей БРИГАДЫ"        → unknown
 *
 * The middle one is the worst reading in the set: a brigade offering ITSELF
 * was read as an employer NEEDING workers — a complete SEP-4 inversion, which
 * is the exact defect owner window 7 created the supply direction to fix. It
 * survived for the brigade noun alone, because the brigade noun was in only
 * one of the two copies.
 *
 * This is the #1669 lesson for the third time in this file: a vocabulary kept
 * in two places drifts, and the half nobody re-reads is the half that breaks.
 * ONE list, read by both patterns.
 *
 * Individual and collective are deliberately in ONE source, not two: for the
 * question these patterns ask — *are these the speaker's own people?* — a
 * crew and a person are the same kind of answer. What a brigade additionally
 * IS (a unit with a headcount, a shared availability and a location) is
 * modelled downstream on the org spine, not here.
 */
export const OWN_PEOPLE_SOURCE =
  // individual / generic person nouns
  "darbuotoj|žmon|specialist|worker|people|staff|medewerk|mensen|mitarbeit|leute|работник|люд|специалист|" +
  // the collective ones — a team, a brigade, a crew, a gang, a shift
  "komand|brigad|team|crew|gang|ploeg|kolonne|equipe|équipe|бригад|команд|смен";

/**
 * TIME UNITS, as people write them (folded stems).
 *
 * A NUMBER FOLLOWED BY ONE OF THESE IS A DURATION, NEVER A HEADCOUNT — and
 * that single distinction is what separates a person describing themselves
 * from an organisation describing its workforce:
 *
 *   "turime 20 pastolininku"                 20 = how many people → SUPPLY
 *   "turiu 3 metus patirties suvirintoju"     3 = how long        → the PERSON
 *
 * The employer-demand rule has excluded these since 2026-09-08 — "reikia 12
 * valandu" is a question about time, not about people. The supply rules added
 * the same day copied that rule's SHAPE but not this guard, so "I have 3 years
 * experience as a welder" was read as an agency offering welders.
 *
 * It lives here beside `TRADE_STEM_SOURCE` for the same reason that one does:
 * a vocabulary only one direction can read is how the two directions drift
 * apart. Stems, not words — `fold()` strips diacritics before matching, so
 * `men` covers "mėnesius" and `god` covers "года".
 */
export const DURATION_UNIT_SOURCE =
  "val|valand|dien|savait|men|metu|hour|day|week|month|year|yr|час|дн|недел|месяц|год|stunde|tag|woche|monat|jahr|uur|dag|week|maand|jaar";

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
  "reikia|reikes|reiketu|reikalingas|reikalinga|reikalingi|reikalingos|truksta|truks|ieskau|ieskome|ieskom|need|needs|needed|looking\\s+for|нужен|нужна|нужны|нужно|ищем|ищу|требуется|требуются|" +
  // de / nl — "Wir brauchen 2 Buchhalter", "ich suche einen Elektriker",
  // "wij zoeken een boekhouder" (lane F probe 2026-09-06: `unknown` before).
  "brauche|brauchen|benotige|benotigen|suche|suchen|zoek|zoeken";

/** The person-statement anchors (folded). */
export const PROFESSION_STATEMENT_ANCHOR_SOURCE =
  "esu|dirbu|dirbau|i\\s+am|i'm|я|работаю|работал|работала|ik\\s+ben|ik\\s+werk\\s+als|ich\\s+bin|ich\\s+arbeite\\s+als";

/**
 * WHOSE WORK IS IT — the possessive half of grammatical person.
 *
 * `PROFESSION_STATEMENT_ANCHOR_SOURCE` above answers *who is speaking*
 * ("esu", "i am", "я"). These two answer *whose thing is being spoken about*,
 * and they live here for the same reason that one does: a vocabulary kept in
 * the surface that happens to need it first is how the two directions drift
 * apart (#1669). `lib/marketing/public-entry.ts` reads `speaksOfOwnWork` from
 * here and defines no patterns of its own — its
 * `public-entry-real-intent.test.ts` guard enforces exactly that, and it
 * caught the first draft of this doing it wrong.
 *
 * TWO lists, and the second is what makes the reading safe. Lithuanian `savo`
 * is a REFLEXIVE possessive — it means "one's own" and belongs to whichever
 * subject the sentence has, so it appears in "noriu įkelti **savo** istoriją"
 * (a person) and in "mūsų komanda įkelia **savo** tabelius" (a company)
 * alike. A one-sided "mine" test reads the second as a person, so an explicit
 * ORGANISATIONAL possessive always wins.
 *
 * Written in the right SCRIPT, which the first draft got wrong: `мо` is
 * Cyrillic and cannot be spelled with a Latin `mo`. That bug let "хочу
 * загрузить **мои** старые данные о работе" read as an organisation, and only
 * probing all five routed locales found it — four passed. Bounded with
 * `\p{L}` look-arounds and the `u` flag, never `\b`, which is ASCII-only and
 * cannot bound a Cyrillic or Lithuanian word at all.
 */
const MINE_RE =
  /(?:^|[^\p{L}])(?:mano|savo|my|mine|mein(?:e|em|en|er|es)?|mijn|мо(?:й|я|е|ё|и|ю|его|ей|их|ими)|сво(?:й|я|е|ё|и|ю|его|ей|их|ими))(?![\p{L}])/iu;

const OURS_RE =
  /(?:^|[^\p{L}])(?:musu|mūsų|our|ours|unser(?:e|em|en|er|es)?|onze|ons|наш(?:е|а|и|его|ей|их|ими)?)(?![\p{L}])/iu;

/**
 * Does the sentence claim the thing as the SPEAKER'S OWN, rather than the
 * organisation's?
 *
 * `false` when it says neither — silence is not a claim, so a caller must
 * keep whatever default it had. Never infer a person from the absence of
 * "our".
 */
export function speaksOfOwnWork(sentence: string): boolean {
  if (OURS_RE.test(sentence)) return false;
  return MINE_RE.test(sentence);
}

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
