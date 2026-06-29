/**
 * Job-demand missing-field detection (v1) — PURE, deterministic, multilingual.
 *
 * `structureNeed` (lib/structuring/structure-need.ts) recognizes the closed-set
 * IDENTITY of a need (work type, country, team size, start period, accommodation
 * yes/no). It does NOT detect the practical DETAIL fields a job post needs before
 * it is match-ready: salary, gross/net, currency, weekly hours, overtime, contract
 * type, legal employer, language, driving licence, tools/PPE, accommodation type +
 * deductions, travel timing, required documents, start-date precision.
 *
 * This module reads the raw text ONLY to decide which of those fields are present
 * vs missing — it returns closed-set field keys + reason codes, never free text.
 * Same input → same output. No DB, no AI, no fabrication.
 */
import type {
  JobDemandFieldKey,
  FieldSeverity,
  RecognizedField,
  MissingField,
} from "./types";

interface FieldRule {
  readonly key: JobDemandFieldKey;
  readonly severity: FieldSeverity;
  /** Present when ANY pattern matches the lowercased text. */
  readonly patterns: readonly RegExp[];
  /** Short reason code emitted when recognized. */
  readonly reason: string;
}

// Patterns are intentionally small + multilingual (EN / LT / RU). They detect the
// PRESENCE of a topic, not its correctness — a vague post still counts a topic as
// "mentioned". Diacritics handled by matching stems without trailing endings.
const RULES: readonly FieldRule[] = [
  {
    key: "role",
    severity: "important",
    reason: "role_mentioned",
    patterns: [
      /\b(carpenter|welder|electrician|plumber|mason|painter|tiler|roofer|driver|cleaner|cook|welding|operator|fitter|labou?rer|helper)\b/,
      /\b(stalius|suvirintoj|elektrik|santechnik|mūrinink|dažytoj|vairuotoj|valytoj|virėj|montuotoj|operatori|pagalbinis)/,
      /\b(столяр|плотник|сварщик|электрик|сантехник|маляр|водитель|уборщик|повар|оператор|монтажник|разнорабоч)/,
    ],
  },
  {
    key: "location",
    severity: "important",
    reason: "location_mentioned",
    patterns: [
      /\b(norway|sweden|denmark|finland|germany|netherlands|poland|lithuania|latvia|estonia)\b/,
      /\b(norveg|švedij|svedij|danij|suomi|vokietij|niderland|lenkij|lietuv|latvij|eston)/,
      /\b(норвег|швец|дани|финлянд|герман|нидерланд|польш|литв|латв|эстон)/,
      /[A-ZÅÄÖÆØ][a-zåäöæø]+,\s*(norway|sweden|denmark|germany|netherlands|poland)/i,
    ],
  },
  {
    key: "sector",
    severity: "recommended",
    reason: "sector_mentioned",
    patterns: [
      /\b(shipyard|construction|warehouse|logistics|manufactur|hospitality|agricultur|cleaning|care)\b/,
      /\b(laivų|laivu|statyb|sandėl|sandel|gamyb|žemės ūki|valymo|slaug)/,
      /\b(верф|строительств|склад|производств|сельхоз|уборк|уход)/,
    ],
  },
  {
    key: "rotation",
    severity: "recommended",
    reason: "rotation_mentioned",
    patterns: [/\b\d\s*\/\s*\d\b/, /\b(rotation|rotacij|вахт|смен)/],
  },
  {
    key: "experience",
    severity: "recommended",
    reason: "experience_mentioned",
    patterns: [
      /\b\d+\s*(\+\s*)?(years?|yrs?|metų|metai|met\b|лет|год)/,
      /\b(experience|patirt|опыт)/,
    ],
  },
  {
    key: "scope",
    severity: "recommended",
    reason: "scope_mentioned",
    patterns: [
      /\b(installation|dismantling|renovation|finishing|assembly|maintenance|fitting)\b/,
      /\b(montav|ardym|renovacij|apdail|surinkim|priežiūr)/,
      /\b(монтаж|демонтаж|ремонт|отделк|сборк|обслуживан)/,
    ],
  },
  {
    key: "salary",
    severity: "important",
    reason: "salary_mentioned",
    patterns: [
      /(salary|pay|wage|rate)\b/,
      /\b(atlyginim|alga|įkainis|ikainis)/,
      /\b(зарплат|оплат|ставк)/,
      /[€$]|\b(eur|nok|sek|dkk|pln|usd)\b/i,
      /\d+\s*(€|eur|\/h|per hour|per month|\/mėn|в час|в месяц)/i,
    ],
  },
  {
    key: "grossNet",
    severity: "important",
    reason: "grossnet_mentioned",
    patterns: [
      /\b(gross|net)\b/,
      /\b(bruto|neto|į rankas|i rankas|ant popieriaus)/,
      /\b(брутто|нетто|на руки|до вычета)/,
    ],
  },
  {
    key: "currency",
    severity: "recommended",
    reason: "currency_mentioned",
    patterns: [/[€$]|\b(eur|nok|sek|dkk|pln|usd|euro|euru|евро)\b/i],
  },
  {
    key: "weeklyHours",
    severity: "important",
    reason: "hours_mentioned",
    patterns: [
      /\b\d{1,3}\s*(h|hours?|val)\b.*\b(week|savait|недел)/,
      /\b(hours per week|weekly hours|val\.? per savait|val\. ?\/ ?sav|часов в недел)/,
      /\b\d{1,2}\s*h\/?w\b/i,
    ],
  },
  {
    key: "overtime",
    severity: "recommended",
    reason: "overtime_mentioned",
    patterns: [/\b(overtime|viršvaland|virsvaland|сверхуроч|переработк)/],
  },
  {
    key: "contractType",
    severity: "important",
    reason: "contract_mentioned",
    patterns: [
      /\b(contract|employment|permanent|temporary|b2b|zzp)\b/,
      /\b(sutart|įdarbinim|idarbinim|neterminuot|terminuot)/,
      /\b(контракт|договор|трудоустройств|постоянн|временн)/,
    ],
  },
  {
    key: "legalEmployer",
    severity: "important",
    reason: "legal_employer_mentioned",
    patterns: [
      /\b(legal employer|employer of record|payroll company|hiring company)\b/,
      /\b(įdarbina|idarbina|darbdav|teisinis darbdav)/,
      /\b(работодател|оформлен|кто нанимает)/,
    ],
  },
  {
    key: "language",
    severity: "important",
    reason: "language_mentioned",
    patterns: [
      /\b(english|german|norwegian|polish|russian|language)\b/,
      /\b(angl|vokiečių|vokieciu|norvegų|norvegu|kalb)/,
      /\b(английск|немецк|норвежск|язык)/,
    ],
  },
  {
    key: "drivingLicence",
    severity: "recommended",
    reason: "driving_mentioned",
    patterns: [
      /\b(driving licen[sc]e|driver'?s licen[sc]e|category [a-e]\b|cat\.? [a-e]\b)/i,
      /\b(vairuotojo paž|vairuotojo paz|b kategorij)/,
      /\b(водительск|категори[яи] [a-eа-е])/i,
    ],
  },
  {
    key: "toolsPpe",
    severity: "recommended",
    reason: "tools_mentioned",
    patterns: [
      /\b(tools?|power tools?|ppe|drawings?|equipment)\b/,
      /\b(įrank|irank|brėžin|brezin|technin|priemon)/,
      /\b(инструмент|чертеж|оборудован|сиз)/,
    ],
  },
  {
    key: "accommodationType",
    severity: "important",
    reason: "accommodation_type_mentioned",
    patterns: [
      /\b(apartment|shared room|single room|housing type|dormitory)\b/,
      /\b(butas|kambar|bendrabut|apgyvendinimo tip)/,
      /\b(квартир|комнат|общежит|тип жил)/,
    ],
  },
  {
    key: "accommodationDeductions",
    severity: "important",
    reason: "accommodation_deductions_mentioned",
    patterns: [
      /\b(deduct|deduction|rent deducted|free of charge|no deduction)\b/,
      /\b(išskaič|isskaic|atskait|nemokam)/,
      /\b(удержан|вычет|бесплатн)/,
    ],
  },
  {
    key: "travelTiming",
    severity: "important",
    reason: "travel_timing_mentioned",
    patterns: [
      /\b(travel (paid|covered|reimbursed)|flight (paid|covered)|reimbursed after)\b/,
      /\b(kelionė apmok|kelione apmok|kelionės kompens)/,
      /\b(проезд оплач|компенсаци[яи] проезд|билет оплач)/,
    ],
  },
  {
    key: "requiredDocuments",
    severity: "important",
    reason: "documents_mentioned",
    patterns: [
      /\b(documents?|passport|id card|a1|certificate|right to work)\b/,
      /\b(dokument|pasas|asmens dokument|pažymėjim|pazymejim|sertifik)/,
      /\b(документ|паспорт|справк|сертификат|разрешени)/,
    ],
  },
  {
    key: "startDate",
    severity: "recommended",
    reason: "startdate_mentioned",
    patterns: [
      /\b\d{4}-\d{2}-\d{2}\b/,
      /\b\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
      /\b(start date|starting|pradžia nuo|pradzia nuo|дата начала|начало с)/,
    ],
  },
];

export interface JobDemandFieldScan {
  readonly recognized: readonly RecognizedField[];
  readonly missing: readonly MissingField[];
}

/**
 * Scan a raw job-post text and split the known fields into recognized vs missing.
 * Returns ONLY closed-set field keys + reason codes (no free text echoed back).
 */
export function detectJobDemandFields(rawText: string): JobDemandFieldScan {
  const hay = (rawText ?? "").toLowerCase();
  const recognized: RecognizedField[] = [];
  const missing: MissingField[] = [];

  for (const rule of RULES) {
    const present = rule.patterns.some((re) => re.test(hay));
    if (present) recognized.push({ key: rule.key, reason: rule.reason });
    else missing.push({ key: rule.key, severity: rule.severity });
  }

  return { recognized, missing };
}
