/**
 * Universal Work Text → Skill Recognition Core v1 (PR #477).
 *
 * A pure, deterministic parser/resolver that turns a free-text work entry — in
 * ANY work domain, Lithuanian-first, EN/RU-safe folding — into REVIEWABLE skill
 * suggestions plus the raw signals behind them (verbs, objects, quantities,
 * durations, domain hints) and UNMAPPED phrases for work it cannot resolve.
 *
 * Hard rules (doctrine §7, owner train file):
 *  - No external AI / API. No network. Pure lexicon + regex, stable ordering.
 *  - Suggestions are NEVER facts: every one is status "suggested", confirmed
 *    false, needsReview true. Nothing is auto-verified.
 *  - Unknown / unsupported work -> an unmapped review phrase, NEVER an invented
 *    unrelated skill (the construction-bias false positives are designed out).
 *
 * Recognition CORE only — no persistence, no DB, no UI. Builds on ./normalize.
 */
import { foldText } from "./normalize";
import type { SectorKey } from "./sectors";

export type RecognitionDomain =
  | "construction"
  | "web_design"
  | "admin"
  | "cleaning"
  | "electrical"
  | "cooking"
  | "gardening"
  | "driving_logistics"
  | "warehouse"
  | "customer_service"
  | "it"
  | "language"
  | "equipment"
  | "care";

/** Each recognition domain maps to ONE labour-market sector (sectors.ts). This
 *  is what makes the recogniser cross-sector rather than construction-leaning:
 *  construction is just one of many domains, never a default. */
export const DOMAIN_SECTOR: Record<RecognitionDomain, SectorKey> = {
  construction: "construction",
  electrical: "construction",
  web_design: "it_software",
  it: "it_software",
  admin: "office_admin",
  cleaning: "cleaning_facility",
  cooking: "hospitality_food",
  gardening: "agriculture",
  driving_logistics: "transport_logistics",
  warehouse: "transport_logistics",
  customer_service: "retail_sales",
  language: "education",
  equipment: "manufacturing",
  care: "care_health",
};

/** Recognition-derived signals are ALWAYS Work-Journal evidence (never CV /
 *  profile / manager / client, which come through other paths) and are never
 *  auto-verified (doctrine §7). */
export const EVIDENCE_SOURCE = "work_journal" as const;
export type EvidenceSource = typeof EVIDENCE_SOURCE;

export type RecognitionConfidence = "high" | "medium" | "low";

export interface RecognizedQuantity {
  readonly value: number;
  readonly unit: string;
  readonly raw: string;
}

export interface RecognizedDuration {
  readonly value: number;
  readonly unit: "hours" | "days" | "minutes";
  readonly raw: string;
}

export interface SkillSuggestion {
  readonly label: string;
  readonly canonicalSlug: string | null;
  readonly domain: RecognitionDomain;
  /** The labour-market sector this suggestion belongs to (cross-sector model). */
  readonly sector: SectorKey;
  readonly confidence: RecognitionConfidence;
  readonly reason: string;
  readonly sourcePhrase: string;
  readonly status: "suggested";
  readonly confirmed: false;
  readonly needsReview: true;
  /** System-detected from the Work Journal text; never verified by recognition. */
  readonly evidenceSource: EvidenceSource;
}

export interface UnmappedPhrase {
  readonly phrase: string;
  readonly reason: string;
}

export interface RecognitionSignals {
  readonly verbs: string[];
  readonly objects: string[];
  readonly quantities: RecognizedQuantity[];
  readonly durations: RecognizedDuration[];
  readonly domains: RecognitionDomain[];
}

export interface UniversalRecognition {
  readonly suggestions: SkillSuggestion[];
  readonly unmapped: UnmappedPhrase[];
  readonly signals: RecognitionSignals;
  readonly needsMoreDetail: boolean;
}

interface SkillRule {
  readonly domain: RecognitionDomain;
  readonly slug: string | null;
  readonly label: string;
  readonly verbs?: readonly string[];
  readonly objects: readonly string[];
  readonly confidence: RecognitionConfidence;
}

/** Cross-domain candidate-skill rules. Authored so each required domain resolves
 *  correctly AND cleaning never collapses into carpentry. */
const RULES: readonly SkillRule[] = [
  { domain: "construction", slug: "plastering", label: "Sienų tinkavimas", verbs: ["tinkav"], objects: ["sien", "tinkav"], confidence: "high" },
  { domain: "construction", slug: "roofing", label: "Stogo sijų / konstrukcijų darbai", verbs: ["keit", "montav", "keic", "dej"], objects: ["stogo sij", "sij", "gegn", "stogo karkas", "stropil"], confidence: "high" },
  { domain: "construction", slug: "roofing", label: "Čerpių klojimas / stogo dangos darbai", verbs: ["kloj", "deng", "klot"], objects: ["cerp", "stogo dang", "danga"], confidence: "high" },
  // Web design fires only on WEB-EXPLICIT wording. Bare "svetainė" is LT-
  // ambiguous (website OR living room), so it is deliberately NOT an object
  // here — the ambiguous "svetainės dizainas" must not silently resolve to web
  // (the capability layer surfaces both readings as a clarification instead).
  { domain: "web_design", slug: null, label: "Puslapio / svetainės dizainas", objects: ["puslapio dizain", "puslap", "web dizain", "web design", "interneto svetain", "internetin svetain", "tinklap"], confidence: "medium" },
  { domain: "admin", slug: null, label: "Sandėlio / atsargų administravimas", verbs: ["tvark", "skaiciav", "inventoriz", "tikrin"], objects: ["sandel", "likuc", "atsarg"], confidence: "medium" },
  { domain: "admin", slug: null, label: "Excel ataskaitų pildymas", objects: ["excel", "ataskait"], confidence: "medium" },
  { domain: "admin", slug: "bookkeeping", label: "Sąskaitų rengimas", verbs: ["ruos", "reng", "isras", "dar", "pild"], objects: ["saskait"], confidence: "medium" },
  // Document handling — "Pildžiau dokumentus" is office/admin work, first-class.
  { domain: "admin", slug: "document-handling", label: "Dokumentų tvarkymas", verbs: ["pild", "tvark", "registrav", "ruos", "archyvav"], objects: ["dokument", "blank", "документ"], confidence: "high" },
  // Generic premises cleaning used to resolve to the CONSTRUCTION slug
  // site-cleaning — the construction-first leak. It is the universal
  // cleaning_facility skill cleaning-services (catalogue 20260704120000).
  { domain: "cleaning", slug: "cleaning-services", label: "Patalpų valymas", verbs: ["val", "tvark", "siurb"], objects: ["patalp", "biur", "kabinet", "grind", "ofis"], confidence: "high" },
  { domain: "cleaning", slug: "window-cleaning", label: "Langų valymas", verbs: ["plov", "val"], objects: ["lang"], confidence: "high" },
  { domain: "cleaning", slug: null, label: "Paviršių dezinfekavimas", verbs: ["dezinfek"], objects: ["pavirs", "patalp", "dezinfek"], confidence: "high" },
  { domain: "electrical", slug: null, label: "Kabelių montavimas", verbs: ["montav", "ties", "klot", "trauk"], objects: ["kabel", "laid"], confidence: "high" },
  { domain: "electrical", slug: "electrical-install", label: "Elektros skydo darbai", verbs: ["jung", "montav", "instal"], objects: ["skyd", "elektros skyd"], confidence: "high" },
  { domain: "electrical", slug: null, label: "Įtampos tikrinimas", verbs: ["tikrin", "matav", "matuo"], objects: ["itamp", "srov", "varz"], confidence: "high" },
  // ── Cross-sector activity rules — the whole labour market, not construction-
  //    only. Object-gated (a domain noun must be present) so a construction
  //    worker who logs cooking / driving / cleaning gets those too, and a pure
  //    cooking entry NEVER yields a construction suggestion. EN + RU folded
  //    needles sit beside the LT ones (Cyrillic passes through foldText). ──
  { domain: "cooking", slug: "cooking", label: "Maisto gaminimas", objects: ["maist", "virtuv", "patiek", "pietus", "sriub", "salot", "kepin", "cook", "kitchen", "meal", "готов", "кухн", "блюд", "еда"], confidence: "high" },
  { domain: "gardening", slug: "gardening", label: "Sodininkystė / aplinkos priežiūra", objects: ["zole", "zoles", "vejos", "vejon", "krum", "geliu", "gelyn", "darzo", "medeli", "sodinim", "ravej", "sodo", "priziurejau sod", "garden", "lawn", "сад", "газон", "трав", "цвет"], confidence: "high" },
  { domain: "driving_logistics", slug: "cargo-transport", label: "Vairavimas / transportas / logistika", objects: ["krovini", "marsrut", "logistik", "reisus", "reisai", "sunkvezim", "vilkik", "pristatym", "cargo", "delivery", "logistic", "груз", "маршрут", "достав", "рейс"], confidence: "high" },
  { domain: "warehouse", slug: "warehouse-operations", label: "Sandėlio darbai", objects: ["paletes", "palet", "komplektav", "iskrovim", "pakrovim", "stelaz", "sandelio darb", "prekiu surink", "pallet", "warehouse", "forklift", "склад", "палет", "комплект"], confidence: "high" },
  { domain: "customer_service", slug: "customer-service", label: "Klientų aptarnavimas", objects: ["klient", "aptarnav", "konsultav", "kasos", "kasoje", "parduotuv", "customer", "cashier", "клиент", "касс", "продаж", "обслуж"], confidence: "high" },
  { domain: "it", slug: null, label: "IT / programavimas", objects: ["programav", "kodo", "kodas", "duomenu baz", "serveri", "sistem", "aplikacij", "testav", "diegim", "konfigurav", "software", "server", "database", "программ", "сервер", "систем"], confidence: "medium" },
  { domain: "language", slug: "translation", label: "Vertimas / kalbos darbai", objects: ["vertim", "verciau", "vert tekst", "kalbos darb", "teksto redagav", "korektur", "subtitr", "translat", "перевод", "редактир", "коррект"], confidence: "high" },
  { domain: "equipment", slug: "equipment-operation", label: "Įrangos / mechanizmų operavimas", objects: ["krautuv", "ekskavator", "stakl", "mechanizm", "iranga", "traktori", "forklift", "excavator", "погрузчик", "экскаватор", "станок", "оборудован"], confidence: "high" },
  { domain: "care", slug: null, label: "Priežiūra / slauga", objects: ["pacient", "slaug", "vaiku prieziur", "seneli", "ligoni", "globos", "patient", "nursing", "пациент", "уход", "больн"], confidence: "high" },
];

/** Folded verb stems we treat as "real work happened" for unmapped detection.
 *  Generic verbs (dirb-, buv-, ej-) are EXCLUDED so a vague "dirbom objekte"
 *  stays needs-more-detail rather than a false unmapped phrase. */
const WORK_VERB_STEMS = [
  ...new Set(RULES.flatMap((r) => r.verbs ?? [])),
  "remont", "dazem", "daze", "pjov", "gren", "kas", "betonav", "muri", "suvir",
  "kalibrav", "derin", "program", "test", "vez", "kraun", "pakav",
  "gamin", "sodin", "ravej", "vairav", "komplektav", "aptarnav", "konsultav",
  "slaug", "operav", "vertim", "krovin",
];
const GENERIC_VERB_STEMS = ["dirb", "buv", "ej", "atvy", "isvy"];

const QUANTITY_RE = /(\d+(?:[.,]\d+)?)\s*(m²|m2|m³|m3|km|kg|cm|mm|t\b|vnt|ha)/giu;

/** The quantity extraction, reusable on its own (V9 value-intent foundation:
 *  the value structurer reads "30 kg" through the SAME rule the journal
 *  recogniser uses — one unit vocabulary, no drift). Behaviour identical to
 *  the former inline loop in recognizeUniversal. */
export function extractQuantities(text: string): RecognizedQuantity[] {
  const out: RecognizedQuantity[] = [];
  for (const m of (text ?? "").matchAll(QUANTITY_RE)) {
    out.push({ value: num(m[1]), unit: normUnit(m[2]), raw: m[0].trim() });
  }
  return out;
}
const DURATION_RE =
  /(\d+(?:[.,]\d+)?)\s*(valand[\p{L}]*|val\b|h\b|hours?\b|min[\p{L}]*|dien[\p{L}]*|d\b)/giu;

function num(s: string): number {
  return parseFloat(s.replace(",", "."));
}

function normUnit(u: string): string {
  const f = u.toLowerCase();
  if (f.startsWith("m²") || f === "m2") return "m2";
  if (f.startsWith("m³") || f === "m3") return "m3";
  return f;
}

function durationUnit(u: string): "hours" | "days" | "minutes" {
  const f = u.toLowerCase();
  if (f.startsWith("min")) return "minutes";
  if (f.startsWith("dien") || f === "d") return "days";
  return "hours";
}

function splitClauses(text: string): string[] {
  return text
    .split(/[,;.]|\s+(?:ir|bei|and|и)\s+/giu)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

const STOPWORDS = new Set([
  "siandien", "siadien", "imones", "imone", "darbuotoja", "darbuotojas",
  "su", "ir", "bei", "the", "objekte", "objektas", "as", "mes", "jie",
]);

function matchedWords(originalTokens: string[], foldedTokens: string[], needles: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < foldedTokens.length; i++) {
    for (const n of needles) {
      if (n && !n.includes(" ") && foldedTokens[i].includes(n)) {
        out.push(originalTokens[i]);
        break;
      }
    }
  }
  return out;
}

const ALL_VERB_NEEDLES = [...new Set(RULES.flatMap((r) => r.verbs ?? []))];
const ALL_OBJECT_NEEDLES = [...new Set(RULES.flatMap((r) => r.objects))];

/** Recognise work text -> reviewable suggestions + signals + unmapped phrases. */
export function recognizeUniversal(text: string): UniversalRecognition {
  const empty: UniversalRecognition = {
    suggestions: [],
    unmapped: [],
    signals: { verbs: [], objects: [], quantities: [], durations: [], domains: [] },
    needsMoreDetail: true,
  };
  const trimmed = (text ?? "").trim();
  if (!trimmed) return empty;

  const clauses = splitClauses(trimmed);
  const suggestions: SkillSuggestion[] = [];
  const seen = new Set<string>();
  const unmapped: UnmappedPhrase[] = [];
  const domains = new Set<RecognitionDomain>();

  for (const clause of clauses) {
    const folded = foldText(clause);
    let clauseMatched = false;

    for (const rule of RULES) {
      const hasObject = rule.objects.some((o) => folded.includes(o));
      if (!hasObject) continue;
      const hasVerb = !rule.verbs || rule.verbs.some((v) => folded.includes(v));
      if (!hasVerb) continue;

      clauseMatched = true;
      const key = rule.slug ? `slug:${rule.slug}:${rule.label}` : `label:${rule.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      domains.add(rule.domain);

      const oTokens = clause.split(/[^\p{L}\p{N}²³]+/u).filter(Boolean);
      const fTokens = oTokens.map(foldText);
      const reasonWords = [
        ...matchedWords(oTokens, fTokens, rule.verbs ?? []),
        ...matchedWords(oTokens, fTokens, rule.objects),
      ];
      suggestions.push({
        label: rule.label,
        canonicalSlug: rule.slug,
        domain: rule.domain,
        sector: DOMAIN_SECTOR[rule.domain],
        confidence: rule.confidence,
        reason: reasonWords.length > 0 ? reasonWords.join(" + ") : clause,
        sourcePhrase: clause,
        status: "suggested",
        confirmed: false,
        needsReview: true,
        evidenceSource: EVIDENCE_SOURCE,
      });
    }

    if (!clauseMatched) {
      const f = foldText(clause);
      const hasWorkVerb = WORK_VERB_STEMS.some((v) => f.includes(v));
      const hasGenericOnly = GENERIC_VERB_STEMS.some((v) => f.includes(v));
      const contentWords = clause
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(foldText(w)));
      if (hasWorkVerb && contentWords.length >= 1 && !(hasGenericOnly && contentWords.length < 2)) {
        unmapped.push({ phrase: clause, reason: "recognised work wording, no matching skill" });
      }
    }
  }

  const originalTokens = trimmed.split(/[^\p{L}\p{N}²³]+/u).filter(Boolean);
  const foldedTokens = originalTokens.map(foldText);
  const verbs = [...new Set(matchedWords(originalTokens, foldedTokens, ALL_VERB_NEEDLES))];
  const objects = [...new Set(matchedWords(originalTokens, foldedTokens, ALL_OBJECT_NEEDLES))];

  const quantities = extractQuantities(trimmed);
  const durations: RecognizedDuration[] = [];
  for (const m of trimmed.matchAll(DURATION_RE)) {
    durations.push({ value: num(m[1]), unit: durationUnit(m[2]), raw: m[0].trim() });
  }

  const needsMoreDetail = suggestions.length === 0 && unmapped.length === 0;

  return {
    suggestions,
    unmapped,
    signals: { verbs, objects, quantities, durations, domains: [...domains] },
    needsMoreDetail,
  };
}