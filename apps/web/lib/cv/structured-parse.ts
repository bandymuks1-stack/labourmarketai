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

export interface CvWorkHistoryProposal {
  /** Employer + role exactly as stated in the CV line (bounded). */
  title: string;
  startYear: number | null;
  endYear: number | null;
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
}

const MAX_PER_SECTION = 20;
const MAX_LINE = 300;

// ── Lexicons (lt / en / ru / de / nl — the active locale set) ────────────────

const YEAR = "(?:19|20)\\d{2}";
const RANGE_END =
  "(?:(?:19|20)\\d{2}|dabar|šiuo metu|iki dabar|now|present|current|heute|heden|наст\\.?|настоящее время)";
const YEAR_RANGE_RE = new RegExp(
  `(${YEAR})\\s*(?:[–—-]|iki|to|until|bis|tot|по|до)\\s*(${RANGE_END})`,
  "i",
);
const CURRENT_RE =
  /dabar|šiuo metu|now|present|current|heute|heden|наст|настоящее/i;

const COMPANY_MARKER_RE =
  /\b(UAB|MB|AB|VšĮ|IĮ|GmbH|B\.?V\.?|Sp\.\s*z\s*o\.?o\.?|Ltd\.?|SIA|OÜ|OOO|ООО|LLC|Inc\.?)\b/;

const EDUCATION_RE =
  /universit|kolegij|college|hochschule|gimnazij|mokykl|school|schule|школ|университет|колледж|bakalaur|bachelor|magistr|master|мастер|магистр|doktor|doctor|доктор|profesin|vocational|berufsschule|akademij|academy|академ|institut|kursai|course|курс|opleiding|studij/i;

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
  [/profesin|vocational|berufs|профессиональн/i, "vocational"],
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

/** Bare section-header lines ("Sertifikatai", "Education", …) are structure,
 *  not content — they must never become proposals themselves. */
const SECTION_HEADER_RE =
  /^(sertifikatai|sertifikatas|pažymėjimai|certificates?|zertifikate|certificaten|сертификаты|išsilavinimas|education|ausbildung|opleiding|образование|kalbos|languages|sprachen|talen|языки|pasiekimai|achievements|erfolge|prestaties|достижения|apdovanojimai|awards|darbo patirtis|work (history|experience)|berufserfahrung|werkervaring|опыт работы)\s*:?$/i;

// ── Helpers ──────────────────────────────────────────────────────────────────

function clampLine(line: string): string {
  return line.length > MAX_LINE ? line.slice(0, MAX_LINE) : line;
}

function parseYearRange(line: string): {
  startYear: number | null;
  endYear: number | null;
  isCurrent: boolean;
} | null {
  const m = YEAR_RANGE_RE.exec(line);
  if (!m) {
    // single year — end-of-study / certificate style ("2018")
    return null;
  }
  const startYear = Number.parseInt(m[1], 10);
  const isCurrent = CURRENT_RE.test(m[2]);
  const endYear = isCurrent ? null : Number.parseInt(m[2], 10);
  if (endYear !== null && Number.isNaN(endYear)) return null;
  if (endYear !== null && endYear < startYear) return null;
  return { startYear, endYear, isCurrent };
}

function firstYear(line: string): number | null {
  const m = new RegExp(`\\b(${YEAR})\\b`).exec(line);
  return m ? Number.parseInt(m[1], 10) : null;
}

/** Strip the recognised date-range fragment so titles stay clean. */
function stripDates(line: string): string {
  return line
    .replace(YEAR_RANGE_RE, " ")
    .replace(new RegExp(`\\b${YEAR}\\b`, "g"), " ")
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
  };
  const raw = (text ?? "").trim();
  if (raw.length === 0) return out;

  const lines = raw
    .split(/\n+/)
    .map((l) => clampLine(l.trim()))
    .filter((l) => l.length >= 3)
    .slice(0, 400);

  const seenLang = new Set<string>();
  const seenAvailability = new Set<CvAvailabilityHintKey>();
  const seenTitles = new Set<string>();

  for (const line of lines) {
    if (SECTION_HEADER_RE.test(line)) continue;
    const isEducation = EDUCATION_RE.test(line);
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
      const { level, confidence } = languageLevelFor(line);
      if (level === null && line.length > 80) continue;
      seenLang.add(code);
      if (out.languages.length < MAX_PER_SECTION) {
        out.languages.push({ lang: code, level, confidence, sourceLine: line });
      }
    }

    // Availability hints — positive statements only (never an invented "no").
    for (const [re, key] of AVAILABILITY_RULES) {
      if (!re.test(line) || seenAvailability.has(key)) continue;
      seenAvailability.add(key);
      out.availability.push({ key, confidence: "medium", sourceLine: line });
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
          sourceLine: line,
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
          sourceLine: line,
        });
      }
      continue; // a certificate line is not also a job/education line
    }

    if (isAchievement && out.achievements.length < MAX_PER_SECTION) {
      const title = stripDates(line).slice(0, 160);
      if (title.length >= 3 && !seenTitles.has(`a:${title.toLowerCase()}`)) {
        seenTitles.add(`a:${title.toLowerCase()}`);
        out.achievements.push({ title, confidence: "low", sourceLine: line });
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
            educationTypeSlug: educationTypeSlugFor(line),
            startYear: range?.startYear ?? null,
            endYear: range?.endYear ?? firstYear(line),
            confidence: range ? "medium" : "low",
            sourceLine: line,
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
            startYear: range?.startYear ?? null,
            endYear: range?.endYear ?? null,
            isCurrent: range?.isCurrent ?? false,
            confidence: range && hasCompany ? "high" : range ? "medium" : "low",
            sourceLine: line,
          });
        }
      }
    }
  }

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
    p.availability.length > 0
  );
}
