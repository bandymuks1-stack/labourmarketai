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

export type RecognitionDomain =
  | "construction"
  | "web_design"
  | "admin"
  | "cleaning"
  | "electrical";

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
  readonly confidence: RecognitionConfidence;
  readonly reason: string;
  readonly sourcePhrase: string;
  readonly status: "suggested";
  readonly confirmed: false;
  readonly needsReview: true;
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
  { domain: "web_design", slug: null, label: "Puslapio / svetainės dizainas", objects: ["puslapio dizain", "svetaines dizain", "web dizain", "puslap", "svetain"], confidence: "medium" },
  { domain: "admin", slug: null, label: "Sandėlio / atsargų administravimas", verbs: ["tvark", "skaiciav", "inventoriz", "tikrin"], objects: ["sandel", "likuc", "atsarg"], confidence: "medium" },
  { domain: "admin", slug: null, label: "Excel ataskaitų pildymas", objects: ["excel", "ataskait"], confidence: "medium" },
  { domain: "admin", slug: null, label: "Sąskaitų rengimas", verbs: ["ruos", "reng", "isras", "dar", "pild"], objects: ["saskait"], confidence: "medium" },
  { domain: "cleaning", slug: "site-cleaning", label: "Patalpų valymas", verbs: ["val", "tvark", "siurb"], objects: ["patalp", "biur", "kabinet", "grind"], confidence: "high" },
  { domain: "cleaning", slug: null, label: "Langų valymas", verbs: ["plov", "val"], objects: ["lang"], confidence: "high" },
  { domain: "cleaning", slug: null, label: "Paviršių dezinfekavimas", verbs: ["dezinfek"], objects: ["pavirs", "patalp", "dezinfek"], confidence: "high" },
  { domain: "electrical", slug: null, label: "Kabelių montavimas", verbs: ["montav", "ties", "klot", "trauk"], objects: ["kabel", "laid"], confidence: "high" },
  { domain: "electrical", slug: "electrical-install", label: "Elektros skydo darbai", verbs: ["jung", "montav", "instal"], objects: ["skyd", "elektros skyd"], confidence: "high" },
  { domain: "electrical", slug: null, label: "Įtampos tikrinimas", verbs: ["tikrin", "matav", "matuo"], objects: ["itamp", "srov", "varz"], confidence: "high" },
];

/** Folded verb stems we treat as "real work happened" for unmapped detection.
 *  Generic verbs (dirb-, buv-, ej-) are EXCLUDED so a vague "dirbom objekte"
 *  stays needs-more-detail rather than a false unmapped phrase. */
const WORK_VERB_STEMS = [
  ...new Set(RULES.flatMap((r) => r.verbs ?? [])),
  "remont", "dazem", "daze", "pjov", "gren", "kas", "betonav", "muri", "suvir",
  "kalibrav", "derin", "program", "test", "vez", "kraun", "pakav",
];
const GENERIC_VERB_STEMS = ["dirb", "buv", "ej", "atvy", "isvy"];

const QUANTITY_RE = /(\d+(?:[.,]\d+)?)\s*(m²|m2|m³|m3|km|kg|cm|mm|t\b|vnt|ha)/giu;
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
        confidence: rule.confidence,
        reason: reasonWords.length > 0 ? reasonWords.join(" + ") : clause,
        sourcePhrase: clause,
        status: "suggested",
        confirmed: false,
        needsReview: true,
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

  const quantities: RecognizedQuantity[] = [];
  for (const m of trimmed.matchAll(QUANTITY_RE)) {
    quantities.push({ value: num(m[1]), unit: normUnit(m[2]), raw: m[0].trim() });
  }
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