/**
 * Structured CV section parsing — the M2 wiring of the CV import flow
 * (Full CV System v1; lib/cv/types.ts declared the M2 contract).
 *
 * PURE + DETERMINISTIC (no IO, no server-only): regex/lexicon heuristics over
 * the already-extracted CV text (lib/cv/extract.ts). It PROPOSES section
 * entries — work history, education, languages, certificates, achievements,
 * salary expectation, availability hints — with an HONEST confidence tag.
 * Nothing here persists anything: every proposal goes through the per-item
 * human confirm in the review panel (PLATFORM_DOCTRINE §7.1 — extraction
 * suggests, the user disposes), and confirmed items are written by the server
 * actions in lib/profile/cv-section-import-actions.ts into their CANONICAL
 * tables. No value is ever invented: a language without a stated level keeps
 * `level: null` (the user must pick one); an hourly wage is NEVER converted
 * into a monthly expectation.
 */

// ── Proposal shapes ──────────────────────────────────────────────────────────

export type CvProposalConfidence = "high" | "medium" | "low";

/** A period endpoint at the precision the CV actually stated — never more.
 *  A bare year keeps month/day null; "2021-03" keeps day null. Downstream
 *  persistence (lib/cv/period-dates.ts) expands to first/last day of the
 *  STATED unit, so the worker's real precision is preserved, not invented. */
export interface CvDatePart {
  year: number;
  month: number | null;
  day: number | null;
}

export interface CvWorkHistoryProposal {
  /** Employer + role exactly as stated in the CV line (bounded). */
  title: string;
  startYear: number | null;
  endYear: number | null;
  /** Full-precision period endpoints (deterministic parser only — the AI
   *  enhancement path still proposes bare years and leaves these unset). */
  start?: CvDatePart | null;
  end?: CvDatePart | null;
  isCurrent: boolean;
  confidence: CvProposalConfidence;
  sourceLine: string;
}

export interface CvEducationProposal {
  institution: string;
  program: string | null;
  /** Best-guess registry slug (education_types seed set); 'other' when unsure. */
  educationTypeSlug: string;
  startYear: number | null;
  endYear: number | null;
  confidence: CvProposalConfidence;
  sourceLine: string;
}

export interface CvLanguageProposal {
  /** Canonical worker_languages code (closed 11-language set). */
  lang: string;
  /** CEFR level or 'native' when the text states one — otherwise null and the
   *  user must choose (no invented levels). */
  level: string | null;
  confidence: CvProposalConfidence;
  sourceLine: string;
}

export interface CvCertificateProposal {
  title: string;
  year: number | null;
  confidence: CvProposalConfidence;
  sourceLine: string;
}

export interface CvAchievementProposal {
  title: string;
  confidence: CvProposalConfidence;
  sourceLine: string;
}

export interface CvSalaryProposal {
  minEur: number | null;
  maxEur: number | null;
  confidence: CvProposalConfidence;
  sourceLine: string;
}

export type CvAvailabilityHintKey =
  | "willingToRelocate"
  | "hasTransport"
  | "nightShiftsOk"
  | "weekendShiftsOk";

export interface CvAvailabilityHint {
  key: CvAvailabilityHintKey;
  confidence: CvProposalConfidence;
  sourceLine: string;
}

export interface CvSectionProposals {
  workHistory: CvWorkHistoryProposal[];
  education: CvEducationProposal[];
  languages: CvLanguageProposal[];
  certificates: CvCertificateProposal[];
  achievements: CvAchievementProposal[];
  /** At most one — a CV states one expectation; conflicting lines lower it to
   *  the FIRST plausible monthly figure (honest: never averaged/merged). */
  salary: CvSalaryProposal | null;
  availability: CvAvailabilityHint[];
  /** The CV's own lines that became no proposal at all, for the person to place
   *  or discard, so nothing they wrote silently disappears. Never a contact
   *  line, a heading or a bare date. */
  unplaced: string[];
}

const MAX_PER_SECTION = 20;
const MAX_LINE = 300;

// ── Lexicons (lt / en / ru / de / nl — the active locale set) ────────────────

const YEAR = "(?:19|20)\\d{2}";
const MONTH = "(?:0[1-9]|1[0-2])";
const DAY = "(?:0[1-9]|[12]\\d|3[01])";
/** A period endpoint as CVs actually write it: "2021", "2021-03", "2021.03",
 *  "2021/03", "2021-03-15", month-first "03/2021" or day-first "15.03.2021".
 *  Only the YEAR is ever extracted as data (the proposal contract is
 *  year-granular) — but month/day parts must be RECOGNISED, otherwise
 *  "2021-03 - 2024-11" neither parses as a range nor strips cleanly, and the
 *  saved title keeps residue like "03 - -11 - …" while both years are
 *  silently lost. */
const MONTH_FIRST = `(?:(?:${DAY}\\s?[./-]\\s?)?${MONTH}\\s?[./-]\\s?)?`;
const MONTH_AFTER = `(?:\\s?[./-]\\s?${MONTH}(?:\\s?[./-]\\s?${DAY})?(?!\\d))?`;
/** One period endpoint, whole token (no inner captures — parsed by
 *  parseDateToken so the STATED precision survives into the proposal). */
const DATE_TOKEN = `${MONTH_FIRST}${YEAR}${MONTH_AFTER}`;
const RANGE_END =
  `(?:${DATE_TOKEN}` +
  "|dabar|šiuo metu|iki dabar|now|present|current|heute|heden|наст\\.?|настоящее время)";
const YEAR_RANGE_RE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:[–—-]|iki|to|until|bis|tot|по|до)\\s*(${RANGE_END})`,
  "i",
);
/** Standalone date tokens left over once the range fragment is removed. */
const YEAR_MONTH_TOKEN_RE = new RegExp(
  `(?:\\b${DAY}\\s?[./-]\\s?)?(?:\\b${MONTH}\\s?[./-]\\s?)?\\b${YEAR}\\b${MONTH_AFTER}`,
  "g",
);
const CURRENT_RE =
  /dabar|šiuo metu|now|present|current|heute|heden|наст|настоящее/i;

const COMPANY_MARKER_RE =
  /\b(UAB|MB|AB|VšĮ|IĮ|GmbH|B\.?V\.?|Sp\.\s*z\s*o\.?o\.?|Ltd\.?|SIA|OÜ|OOO|ООО|LLC|Inc\.?)\b/;

const EDUCATION_RE =
  /universit|kolegij|college|hochschule|gimnazij|mokykl|school|schule|школ|университет|колледж|bakalaur|bachelor|magistr|master|мастер|магистр|doktor|doctor|доктор|profesin|vocational|berufsschule|akademij|academy|академ|institut|kursai|course|курс|opleiding|studij|rengimo cent|mokymo cent|training cent|technikum|liceum|лицей|техникум|училищ|szkoł/i;

const CERTIFICATE_RE =
  /sertifikat|certificate|certificaat|zertifikat|сертификат|pažymėjim|licencij|licentie|licen[cs]e|lizenz|лиценз|atestat|attest|удостоверен/i;

const ACHIEVEMENT_RE =
  /apdovanoj|award|auszeichnung|наград|laimėj|winner|prijs gewonnen|pasiekim|achievement|достижен/i;

/** keyword → education_types slug (registry seed set). Order matters — the
 *  first match wins, so more specific degrees precede generic "school". */
const EDUCATION_TYPE_RULES: ReadonlyArray<[RegExp, string]> = [
  [/doktor|doctor|phd|доктор/i, "doctorate"],
  [/magistr|master|магистр/i, "university_master"],
  [/bakalaur|bachelor|бакалавр/i, "university_bachelor"],
  [/universit|университет/i, "university_bachelor"],
  [/kolegij|college|hogeschool|колледж/i, "college"],
  [/profesin|vocational|berufs|профессиональн|rengimo cent|technikum|техникум|училищ/i, "vocational"],
  [/gimnazij|vidurin|secondary|gymnasium|гимназ|средн/i, "secondary"],
  [/pradin|primary|grundschule|начальн/i, "primary"],
  [/kursai|course|kurs|курс|training|mokym/i, "course_certificate"],
];

/** language-name lexicon → canonical worker_languages code. */
const LANGUAGE_RULES: ReadonlyArray<[RegExp, string]> = [
  [/lietuvi|lithuanian|litauisch|litouws|литовск/i, "lt"],
  [/angl[ųuo]|english|englisch|engels|английск/i, "en"],
  [/rus[ųuo]|russian|russisch|русск/i, "ru"],
  [/vokie|german|deutsch|duits|немецк/i, "de"],
  [/oland|nyderland|dutch|nederlands|голландск|нидерланд/i, "nl"],
  [/lenk|polish|polski|польск/i, "pl"],
  [/latvi|latvian|латышск/i, "lv"],
  [/est[ųuo]|estonian|эстонск/i, "et"],
  [/norveg|norwegian|norsk|норвежск/i, "no"],
  [/šved|swedish|svenska|шведск/i, "sv"],
  [/dan[ųuo]|danish|dansk|датск/i, "da"],
];

const CEFR_RE = /\b([ABC][12])\b/;
const NATIVE_RE = /gimtoji|gimtąja|native|moedertaal|muttersprache|родной/i;
const FLUENT_RE = /laisvai|fluent|fließend|vloeiend|свободно/i;

const SALARY_LINE_RE =
  /atlyginim|alga|salary|wage|loon|gehalt|зарплат|lūkest|expectation|€|eur/i;
const SALARY_RANGE_RE =
  /(\d{3,5})\s*[–—-]\s*(\d{3,5})\s*(?:€|eur)/i;
const SALARY_SINGLE_RE = /(\d{3,5})\s*(?:€|eur)/i;
const HOURLY_RE = /val\.|\/\s*val|per hour|hourly|\/\s*h\b|stunde|в час|per uur/i;

const AVAILABILITY_RULES: ReadonlyArray<[RegExp, CvAvailabilityHintKey]> = [
  [
    /galiu persikelti|galiu išvykti|willing to relocate|umzugsbereit|bereid te verhuizen|готов.{0,4}переехать|galiu dirbti užsienyje/i,
    "willingToRelocate",
  ],
  [
    /nuosav\w* automobil|turiu automobil|own car|own vehicle|eigenes auto|eigen auto|своя машина|собственный автомобиль/i,
    "hasTransport",
  ],
  [
    /naktin\w* pamain|night shift|nachtschicht|nachtdienst|ночн\w* смен/i,
    "nightShiftsOk",
  ],
  [
    /savaitgal|weekend|wochenende|выходны/i,
    "weekendShiftsOk",
  ],
];

/** The education_types slug of a course or training, as opposed to a school. */
export const TRAINING_TYPE_SLUG = "course_certificate";

/** Bare section-header lines ("Sertifikatai", "Education", …) are structure,
 *  not content — they must never become proposals themselves. */
const SECTION_HEADER_RE =
  /^(sertifikatai|sertifikatas|pažymėjimai|certificates?|zertifikate|certificaten|сертификаты|certyfikaty|išsilavinimas|education|ausbildung|opleiding|образование|wykształcenie|kalbos|languages|sprachen|talen|языки|języki|pasiekimai|achievements|erfolge|prestaties|достижения|osiągnięcia|apdovanojimai|awards|darbo patirtis|work (history|experience)|berufserfahrung|werkervaring|опыт работы|doświadczenie( zawodowe)?|mokymai|kursai|kvalifikacijos kėlimas|training|trainings|courses|weiterbildung|fortbildung|kurse|cursussen|trainingen|курсы|обучение|szkolenia|kursy)\s*:?$/i;
const TRAINING_HEADER_RE =
  /^(mokymai|kursai|kvalifikacijos kėlimas|training|trainings|courses|weiterbildung|fortbildung|kurse|cursussen|trainingen|курсы|обучение|szkolenia|kursy)\s*:?$/i;
const WORK_HEADER_RE =
  /^(darbo patirtis|work (history|experience)|berufserfahrung|werkervaring|опыт работы|doświadczenie( zawodowe)?)\s*:?$/i;
const EDUCATION_HEADER_RE =
  /^(išsilavinimas|education|ausbildung|opleiding|образование|wykształcenie)\s*:?$/i;

/** Month names, whole words only and only beside a year: "Kovalenko 2019" is
 *  not March. */
const MONTH_WORDS: ReadonlyArray<readonly [number, string]> = [
  [1, "sausis|sausio|saus|january|jan|januar|januari|styczeń|stycznia|sty|январь|января|янв"],
  [2, "vasaris|vasario|vas|february|feb|februar|februari|luty|lutego|lut|февраль|февраля|фев"],
  [3, "kovas|kovo|kov|march|mar|märz|maart|mrt|marzec|marca|март|марта|мар"],
  [4, "balandis|balandžio|bal|april|apr|kwiecień|kwietnia|kwi|апрель|апреля|апр"],
  [5, "gegužė|gegužės|geg|may|mai|mei|maj|maja|май|мая"],
  [6, "birželis|birželio|bir|june|jun|juni|czerwiec|czerwca|cze|июнь|июня|июн"],
  [7, "liepa|liepos|lie|july|jul|juli|lipiec|lipca|lip|июль|июля|июл"],
  [8, "rugpjūtis|rugpjūčio|rgp|august|aug|augustus|sierpień|sierpnia|sie|август|августа|авг"],
  [9, "rugsėjis|rugsėjo|rgs|september|sep|sept|wrzesień|września|wrz|сентябрь|сентября|сен"],
  [10, "spalis|spalio|spl|october|oct|okt|oktober|październik|października|paź|октябрь|октября|окт"],
  [11, "lapkritis|lapkričio|lap|november|nov|listopad|listopada|lis|ноябрь|ноября|ноя"],
  [12, "gruodis|gruodžio|grd|december|dec|dez|dezember|grudzień|grudnia|gru|декабрь|декабря|дек"],
];
const MONTH_NUMBER = new Map<string, number>(
  MONTH_WORDS.flatMap(([n, words]) => words.split("|").map((w) => [w, n] as const)),
);
const MONTH_ALT = [...MONTH_NUMBER.keys()].sort((a, b) => b.length - a.length).join("|");
const YEAR_MARK = "(?:\\s?(?:m|г|r)\\.?(?![\\p{L}]))?";
const MONTH_MARK = "(?:\\.|\\s?mėn\\.?)?";
const YEAR_THEN_MONTH_RE = new RegExp(
  `(?<![\\p{L}\\d])((?:19|20)\\d{2})${YEAR_MARK}\\s+(${MONTH_ALT})(?![\\p{L}])${MONTH_MARK}`,
  "giu",
);
const MONTH_THEN_YEAR_RE = new RegExp(
  `(?<![\\p{L}])(${MONTH_ALT})(?![\\p{L}])${MONTH_MARK}\\s+((?:19|20)\\d{2})(?!\\d)${YEAR_MARK}`,
  "giu",
);
const BULLET_RE = /^[•·▪●◦*–—-]\s/;
/** A phone number starts on its own: a run of digits glued to a letter is part
 *  of a name or a code ("UAB QASYNTHETICB42464955148", UF-3), not a contact.
 *  Read as a phone, such an employer line could not join its job title and
 *  period, so the job lost both. */
// No lookbehind: this file runs in the browser, and a browser without lookbehind (Safari
// before 16.4) would only get the shim's looser fallback (see lib/compat/regexp-lookbehind-shim).
const CONTACT_RE = /@|https?:|(?:^|[^\p{L}\d])\+?\d[\d\s()-]{6,}/u;
const MAX_UNPLACED = 40;

// ── Helpers ──────────────────────────────────────────────────────────────────

function clampLine(line: string): string {
  return line.length > MAX_LINE ? line.slice(0, MAX_LINE) : line;
}

/** Days in a calendar month (leap-aware); pure — no clock access. */
function daysInMonthOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parse one matched DATE_TOKEN at its STATED precision. Calendar-invalid
 *  input (e.g. "2021-02-30") is REJECTED (null) — never silently clamped. */
function parseDateToken(token: string): CvDatePart | null {
  const parts = token.replace(/\s+/g, "").split(/[./-]/).filter(Boolean);
  const isYear = (s: string) => /^(?:19|20)\d{2}$/.test(s);
  let year: number, month: number | null = null, day: number | null = null;
  if (parts.length === 1 && isYear(parts[0])) {
    year = Number.parseInt(parts[0], 10);
  } else if (parts.length === 2 && isYear(parts[0])) {
    year = Number.parseInt(parts[0], 10);
    month = Number.parseInt(parts[1], 10);
  } else if (parts.length === 2 && isYear(parts[1])) {
    month = Number.parseInt(parts[0], 10);
    year = Number.parseInt(parts[1], 10);
  } else if (parts.length === 3 && isYear(parts[0])) {
    year = Number.parseInt(parts[0], 10);
    month = Number.parseInt(parts[1], 10);
    day = Number.parseInt(parts[2], 10);
  } else if (parts.length === 3 && isYear(parts[2])) {
    day = Number.parseInt(parts[0], 10);
    month = Number.parseInt(parts[1], 10);
    year = Number.parseInt(parts[2], 10);
  } else {
    return null;
  }
  if (month !== null && (month < 1 || month > 12)) return null;
  if (day !== null) {
    if (month === null) return null;
    if (day < 1 || day > daysInMonthOf(year, month)) return null;
  }
  return { year, month, day };
}

/** One typed date at its stated precision; null when it is not a real date. */
export function parseCvDate(text: string): CvDatePart | null {
  return new RegExp(`^${DATE_TOKEN}$`).test(text.trim()) ? parseDateToken(text.trim()) : null;
}

function parseYearRange(line: string): {
  start: CvDatePart;
  end: CvDatePart | null;
  isCurrent: boolean;
} | null {
  const m = YEAR_RANGE_RE.exec(line);
  if (!m) {
    // single year — end-of-study / certificate style ("2018")
    return null;
  }
  const start = parseDateToken(m[1]);
  if (!start) return null;
  const isCurrent = CURRENT_RE.test(m[2]);
  const end = isCurrent ? null : parseDateToken(m[2]);
  if (!isCurrent && !end) return null;
  if (end) {
    // Reject only clearly reversed ranges: compare the end's latest possible
    // day against the start's earliest possible day at stated precision.
    const startLower = start.year * 10000 + (start.month ?? 1) * 100 + (start.day ?? 1);
    const endUpper = end.year * 10000 + (end.month ?? 12) * 100 + (end.day ?? 31);
    if (endUpper < startLower) return null;
  }
  return { start, end, isCurrent };
}

function firstYear(line: string): number | null {
  const m = new RegExp(`\\b(${YEAR})\\b`).exec(line);
  return m ? Number.parseInt(m[1], 10) : null;
}

/** Strip the recognised date-range fragment so titles stay clean. */
function stripDates(line: string): string {
  return line
    .replace(YEAR_RANGE_RE, " ")
    .replace(YEAR_MONTH_TOKEN_RE, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;·—–-]+|[\s,;·—–-]+$/g, "")
    .trim();
}

function educationTypeSlugFor(line: string): string {
  for (const [re, slug] of EDUCATION_TYPE_RULES) {
    if (re.test(line)) return slug;
  }
  return "other";
}

function languageLevelFor(line: string): {
  level: string | null;
  confidence: CvProposalConfidence;
} {
  const cefr = CEFR_RE.exec(line);
  if (cefr) return { level: cefr[1], confidence: "high" };
  if (NATIVE_RE.test(line)) return { level: "native", confidence: "high" };
  // "fluent" is a real statement but not a CEFR fact — propose C1 with LOW
  // confidence so the user sees it needs their judgement.
  if (FLUENT_RE.test(line)) return { level: "C1", confidence: "low" };
  return { level: null, confidence: "medium" };
}

/** The part of a list line that belongs to the language `re` matches: the
 *  comma/semicolon/slash/pipe segment that names it, when the line names more
 *  than one language. Otherwise the whole line. */
function languageSegment(line: string, re: RegExp): string {
  const named = LANGUAGE_RULES.filter(([r]) => r.test(line)).length;
  if (named < 2) return line;
  return line.split(/[,;/|]/).find((seg) => re.test(seg)) ?? line;
}

/** "2019 m. kovas" / "March 2019" as the numeric form the range grammar reads. */
function numericMonthDates(line: string): string {
  const num = (w: string) => String(MONTH_NUMBER.get(w.toLowerCase()) ?? 0).padStart(2, "0");
  return line
    .replace(YEAR_THEN_MONTH_RE, (_, y: string, m: string) => `${y}-${num(m)}`)
    .replace(MONTH_THEN_YEAR_RE, (_, m: string, y: string) => `${num(m)}/${y}`);
}

/** "training" reads like "education" and saves through the same records; it
 *  only fixes the type, so a course never reads as a school. */
type CvSection = "work" | "education" | "training" | "other" | null;

interface CvLine {
  /** Text the classifier reads; a stacked entry is its lines joined. */
  text: string;
  /** What the person's CV says, for the review ("title / employer / dates"). */
  source: string;
  section: CvSection;
  /** Joined from several lines: a reading of the layout, never high confidence. */
  stacked: boolean;
  isHeader: boolean;
}

function isLearningSection(section: CvSection): boolean {
  return section === "education" || section === "training";
}

/** A line that states an entry's period and nothing of its own: "03/2019 –
 *  12/2023", or under an education heading a lone year or "Program, 2016". */
function isPeriodLine(l: CvLine): boolean {
  if (l.isHeader) return false;
  if (isLearningSection(l.section) && /^(?:19|20)\d{2}$/.test(l.text)) return true;
  // "Program, 2016" under a school. Under a training heading it is a whole entry.
  if (l.section === "education" && !EDUCATION_RE.test(l.text) && /\s(?:19|20)\d{2}$/.test(l.text)) return true;
  return parseYearRange(l.text) !== null && stripDates(l.text).replace(/[^\p{L}]/gu, "").length === 0;
}

/** Could this line be the title or the employer of an entry? Not a duty bullet,
 *  a sentence, a contact line, or a line with its own period. */
function isEntryLine(l: CvLine): boolean {
  return (
    !l.isHeader &&
    !isPeriodLine(l) &&
    !BULLET_RE.test(l.text) &&
    l.text.length <= 90 &&
    !/[.!?]$/.test(l.text) &&
    !CONTACT_RE.test(l.text) &&
    parseYearRange(l.text) === null
  );
}

/**
 * PDF CVs usually stack an entry: title / employer / period, in any order, and
 * the classifier below reads ONE line at a time. This joins each period line
 * with the entry lines that belong to it, into the one-line form the classifier
 * already understands, so there is one parser and one set of rules.
 *
 * Lines before a period belong to it; a CV that opens each entry with the
 * period has them after it. One line after is also taken when it names an
 * employer (title / period / employer). Outside a known section, and under a
 * training heading (a course has a name, not an employer), only ONE line
 * is taken: a name or a headline above the first job is not part of that job.
 * Languages, certificates and the like are never grouped.
 */
function joinStackedEntries(input: readonly CvLine[]): CvLine[] {
  const used = new Set<number>();
  const joined = new Map<number, CvLine>();
  input.forEach((line, i) => {
    if (line.section === "other" || !isPeriodLine(line)) return;
    const reach = line.section === null || line.section === "training" ? 1 : 2;
    const before: number[] = [];
    for (let k = i - 1; k >= 0 && before.length < reach; k--) {
      if (used.has(k) || !isEntryLine(input[k]) || input[k].section !== line.section) break;
      before.unshift(k);
    }
    // A line with words of its own only completes the line before it.
    const hasWords = /\p{L}/u.test(line.text);
    const after: number[] = [];
    for (let k = i + 1; !hasWords && k < input.length && before.length + after.length < reach; k++) {
      if (!isEntryLine(input[k]) || input[k].section !== line.section) break;
      if (before.length > 0 && !COMPANY_MARKER_RE.test(input[k].text)) break;
      after.push(k);
    }
    const parts = [...before, ...after];
    if (parts.length === 0) return;
    // The school first: "Institution, program" is how education lines split.
    if (isLearningSection(line.section)) {
      parts.sort((a, b) => Number(EDUCATION_RE.test(input[b].text)) - Number(EDUCATION_RE.test(input[a].text)));
    }
    for (const k of parts) used.add(k);
    used.add(i);
    joined.set(i, {
      text: `${parts.map((k) => input[k].text).join(", ")}${/^\p{L}/u.test(line.text) ? ", " : " "}${line.text}`,
      source: [...before, i, ...after].map((k) => input[k].source).join(" / "),
      section: line.section,
      stacked: true,
      isHeader: false,
    });
  });
  return input.flatMap((line, i) => joined.get(i) ?? (used.has(i) ? [] : [line]));
}

// ── Main parser ──────────────────────────────────────────────────────────────

export function parseCvSections(text: string): CvSectionProposals {
  const out: CvSectionProposals = {
    workHistory: [],
    education: [],
    languages: [],
    certificates: [],
    achievements: [],
    salary: null,
    availability: [],
    unplaced: [],
  };
  const raw = (text ?? "").trim();
  if (raw.length === 0) return out;

  let section: CvSection = null;
  const lines = joinStackedEntries(
    raw
      .split(/\n+/)
      .map((l) => clampLine(l.trim()))
      .filter((l) => l.length >= 3)
      .slice(0, 400)
      .map((l): CvLine => {
        const isHeader = SECTION_HEADER_RE.test(l);
        if (isHeader) {
          section = WORK_HEADER_RE.test(l)
            ? "work"
            : EDUCATION_HEADER_RE.test(l)
              ? "education"
              : TRAINING_HEADER_RE.test(l)
                ? "training"
                : "other";
        }
        return { text: numericMonthDates(l), source: l, section, stacked: false, isHeader };
      }),
  );

  const seenLang = new Set<string>();
  const seenAvailability = new Set<CvAvailabilityHintKey>();
  const seenTitles = new Set<string>();

  for (const { text: line, source: sourceLine, section: inSection, stacked, isHeader } of lines) {
    if (isHeader) continue;
    // The heading the line sits under decides when the words alone cannot:
    // "UAB Mokyklų renovacija" under work experience is an employer.
    const isEducation =
      inSection === "training"
        ? line.replace(/[^\p{L}]/gu, "").length >= 3
        : inSection === "education"
        ? EDUCATION_RE.test(line) || stacked || parseYearRange(line) !== null
        : EDUCATION_RE.test(line) && !(inSection === "work" && COMPANY_MARKER_RE.test(line));
    const isCertificate = CERTIFICATE_RE.test(line);
    const isAchievement = ACHIEVEMENT_RE.test(line);
    const range = parseYearRange(line);

    // Languages — a line can carry several ("Anglų C1, rusų gimtoji").
    for (const [re, code] of LANGUAGE_RULES) {
      if (!re.test(line)) continue;
      if (seenLang.has(code)) continue;
      // Only treat as a language FACT when the line looks like a language
      // statement (has a level marker) or is short (a list line), otherwise
      // ordinary sentences mentioning a country/language would false-positive.
      // The level is read from THIS language's own part of the line: in
      // "Anglų B2, rusų gimtoji" Russian is native, not B2. A line naming one
      // language keeps the whole line ("Anglų kalba – B2").
      const { level, confidence } = languageLevelFor(languageSegment(line, re));
      if (level === null && line.length > 80) continue;
      seenLang.add(code);
      if (out.languages.length < MAX_PER_SECTION) {
        out.languages.push({ lang: code, level, confidence, sourceLine });
      }
    }

    // Availability hints — positive statements only (never an invented "no").
    for (const [re, key] of AVAILABILITY_RULES) {
      if (!re.test(line) || seenAvailability.has(key)) continue;
      seenAvailability.add(key);
      out.availability.push({ key, confidence: "medium", sourceLine });
    }

    // Salary expectation — first plausible MONTHLY figure only. Hourly wages
    // are never converted (workers.salary_*_eur is a monthly expectation).
    if (out.salary === null && SALARY_LINE_RE.test(line) && !HOURLY_RE.test(line)) {
      const rangeM = SALARY_RANGE_RE.exec(line);
      const single = rangeM ? null : SALARY_SINGLE_RE.exec(line);
      const min = rangeM
        ? Number.parseInt(rangeM[1], 10)
        : single
          ? Number.parseInt(single[1], 10)
          : null;
      const max = rangeM ? Number.parseInt(rangeM[2], 10) : null;
      const plausible = (n: number | null) => n === null || (n >= 300 && n <= 30000);
      if (min !== null && plausible(min) && plausible(max) && (max === null || max >= min)) {
        out.salary = {
          minEur: min,
          maxEur: max,
          confidence: rangeM ? "high" : "medium",
          sourceLine,
        };
      }
    }

    if (isCertificate && out.certificates.length < MAX_PER_SECTION) {
      const title = stripDates(line).slice(0, 160);
      if (title.length >= 3 && !seenTitles.has(`c:${title.toLowerCase()}`)) {
        seenTitles.add(`c:${title.toLowerCase()}`);
        out.certificates.push({
          title,
          year: firstYear(line),
          confidence: "medium",
          sourceLine,
        });
      }
      continue; // a certificate line is not also a job/education line
    }

    if (isAchievement && out.achievements.length < MAX_PER_SECTION) {
      const title = stripDates(line).slice(0, 160);
      if (title.length >= 3 && !seenTitles.has(`a:${title.toLowerCase()}`)) {
        seenTitles.add(`a:${title.toLowerCase()}`);
        out.achievements.push({ title, confidence: "low", sourceLine });
      }
      continue;
    }

    if (isEducation && out.education.length < MAX_PER_SECTION) {
      const cleaned = stripDates(line);
      if (cleaned.length >= 3) {
        // "Institution, program" / "Institution — program" split when present.
        const parts = cleaned.split(/\s*[,—–]\s+/);
        const institution = (parts[0] ?? cleaned).slice(0, 200);
        const program =
          parts.length > 1 ? parts.slice(1).join(", ").slice(0, 200) || null : null;
        if (!seenTitles.has(`e:${institution.toLowerCase()}`)) {
          seenTitles.add(`e:${institution.toLowerCase()}`);
          out.education.push({
            institution,
            program,
            educationTypeSlug: inSection === "training" ? TRAINING_TYPE_SLUG : educationTypeSlugFor(line),
            startYear: range?.start.year ?? null,
            endYear: range?.end?.year ?? firstYear(line),
            confidence: range ? "medium" : "low",
            sourceLine,
          });
        }
      }
      continue;
    }

    // Work history — a year range plus text, or a company-form marker.
    const hasCompany = COMPANY_MARKER_RE.test(line);
    if ((range || hasCompany) && out.workHistory.length < MAX_PER_SECTION) {
      const title = stripDates(line).slice(0, 200);
      // Require some real words left after removing dates.
      if (title.replace(/[^\p{L}]/gu, "").length >= 3) {
        const key = `w:${title.toLowerCase()}`;
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
          out.workHistory.push({
            title,
            startYear: range?.start.year ?? null,
            endYear: range?.end?.year ?? null,
            start: range?.start ?? null,
            end: range?.end ?? null,
            isCurrent: range?.isCurrent ?? false,
            confidence: range && hasCompany && !stacked ? "high" : range ? "medium" : "low",
            sourceLine,
          });
        }
      }
    }
  }

  // Read AFTER the classifier, from what it used: no second set of rules.
  const placed = new Set<string>(
    [
      ...out.workHistory,
      ...out.education,
      ...out.languages,
      ...out.certificates,
      ...out.achievements,
      ...out.availability,
      ...(out.salary ? [out.salary] : []),
    ].map((p) => p.sourceLine),
  );
  const unplaced = new Set<string>();
  for (const { source, isHeader } of lines) {
    const line = source.replace(BULLET_RE, "").trim();
    if (isHeader || placed.has(source) || CONTACT_RE.test(line)) continue;
    if (line.replace(/[^\p{L}]/gu, "").length >= 3) unplaced.add(line.slice(0, 200));
  }
  out.unplaced = [...unplaced].slice(0, MAX_UNPLACED);

  return out;
}

/** True when the parser found nothing at all — the review panel renders its
 *  honest empty state instead of empty group headers. */
export function hasAnyProposal(p: CvSectionProposals): boolean {
  return (
    p.workHistory.length > 0 ||
    p.education.length > 0 ||
    p.languages.length > 0 ||
    p.certificates.length > 0 ||
    p.achievements.length > 0 ||
    p.salary !== null ||
    p.availability.length > 0 ||
    p.unplaced.length > 0
  );
}
