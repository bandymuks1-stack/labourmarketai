/**
 * Eval harness (Internal LLM Agents v1, PR3).
 *
 * Runs an agent end-to-end through the MOCK provider (no env, key, or network)
 * and returns the typed outcome, so fixtures can assert that real outputs pass
 * validation and unsafe outputs are rejected. This is the runnable proof that
 * the agent pipeline + strict-schema enforcement work without any live provider.
 */
import { resolveAiRuntimeConfig } from "../runtime/config-core";
import { runAiAgentCore, type AiAgentOutcome } from "../run-agent";
import type { PromptRegistryEntry } from "../registry/types";
import type { AiLocale } from "../runtime/types";

export interface AgentEvalCase {
  readonly name: string;
  readonly locale: AiLocale;
  readonly input: unknown;
  /** The canned model output the mock provider returns for this case. */
  readonly mock: unknown;
  /** The output-token cap the product call site passes (sizes the route's
   *  cost ceiling exactly as in production). Omitted = runtime default. */
  readonly maxOutputTokens?: number;
  /** Language of the INPUT text, when it differs from the target `locale`
   *  (a translation). Passed as the run's `language`, which run-agent
   *  forwards as `request.sourceLanguage` — never the target locale. */
  readonly sourceLanguage?: string;
  readonly expect:
    | { readonly status: "suggestion" }
    | { readonly status: "needs_review"; readonly reason?: string }
    | { readonly status: "disabled" };
}

const MOCK_CFG = resolveAiRuntimeConfig({
  mode: "mock",
  provider: undefined,
  apiKey: undefined,
  model: undefined,
  timeoutMs: undefined,
  maxRetries: undefined,
  maxOutputTokens: undefined,
  dailyRunBudget: undefined,
});

export async function runAgentEval(
  entry: PromptRegistryEntry,
  c: AgentEvalCase,
): Promise<AiAgentOutcome> {
  return runAiAgentCore(entry, c.input, MOCK_CFG, {
    locale: c.locale,
    mock: c.mock,
    ...evalRunOptions(c),
  });
}

/** Per-case run options shared by the mock harness and the live runner, so
 *  both send the same request shape. */
export function evalRunOptions(c: AgentEvalCase): {
  maxOutputTokens?: number;
  language?: string;
} {
  return {
    ...(c.maxOutputTokens !== undefined ? { maxOutputTokens: c.maxOutputTokens } : {}),
    ...(c.sourceLanguage !== undefined ? { language: c.sourceLanguage } : {}),
  };
}

// ── Lithuanian eval checks (target language + no invented facts) ───────────
//
// Light, deterministic heuristics — NOT a language detector and NOT a fact
// extractor. They are shared by the mock-provider vitest suite and by the
// opt-in live runner (scripts/ai-evals-live.ts), so a live model is held to
// exactly the bar the canned fixtures are.

/** Keys whose string values are identifiers / enums, never reader-facing text. */
const NON_TEXT_KEYS = new Set([
  "ref",
  "id",
  "kind",
  "intent",
  "alternatives",
  "education_type_slug",
  "lang",
  "level",
]);

/** Keys that ASK or WARN rather than assert — a question about a certificate
 *  is not an invented certificate. Excluded from the invented-facts scan only. */
const NON_CLAIM_KEY =
  /^(missing_|unclear_|limitations$|wording_warnings$|.*_questions?$|suggested_followup_question$)/;

function collectStrings(
  value: unknown,
  skip: (key: string) => boolean,
  out: string[] = [],
  key = "",
): string[] {
  if (typeof value === "string") {
    if (!skip(key)) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, skip, out, key);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (!skip(k)) collectStrings(v, skip, out, k);
    }
  }
  return out;
}

/** Reader-facing strings of an envelope's `data`. */
export function userFacingText(data: unknown): string[] {
  return collectStrings(data, (k) => NON_TEXT_KEYS.has(k));
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const LT_LETTERS = /[ąčęėįšųūž]/g;
/** Cyrillic, and letters of Polish / German / Latvian that Lithuanian lacks. */
const FOREIGN_LETTERS = /[Ѐ-ӿłśćńźżóäöüßāēīķļņģ]/i;
const LT_WORDS = new Set([
  "ir", "yra", "kad", "su", "į", "ar", "nėra", "bet", "kaip", "jūsų", "jums",
  "jūs", "savo", "dar", "tik", "per", "iki", "nuo", "apie", "kas", "kur",
  "kiek", "taip", "ne", "prie", "po", "dėl", "arba", "tai", "buvo", "bus",
  "galite", "reikia", "darbo", "šiuo", "metu",
]);
const EN_WORDS = new Set([
  "the", "and", "is", "are", "of", "to", "your", "with", "for", "you", "this",
  "that", "in", "on", "not", "has", "have", "will",
]);

/**
 * Does this text read as Lithuanian? Lithuanian-only letters plus Lithuanian
 * function words must outweigh English function words, and no Cyrillic or
 * other-language-only letter may appear. Empty text is not Lithuanian.
 */
export function looksLithuanian(texts: readonly string[]): { ok: boolean; detail: string } {
  const text = texts.join(" ").toLowerCase();
  if (text.trim() === "") return { ok: false, detail: "no reader-facing text" };
  const foreign = text.match(FOREIGN_LETTERS);
  if (foreign) return { ok: false, detail: `non-Lithuanian letter "${foreign[0]}"` };
  const words = text.split(/[^\p{L}]+/u).filter(Boolean);
  const lt =
    (text.match(LT_LETTERS)?.length ?? 0) + 2 * words.filter((w) => LT_WORDS.has(w)).length;
  const en = 2 * words.filter((w) => EN_WORDS.has(w)).length;
  return lt > en
    ? { ok: true, detail: `lt=${lt} en=${en}` }
    : { ok: false, detail: `reads as non-Lithuanian (lt=${lt} en=${en})` };
}

const ORG_MARK = "(?:UAB|AB|MB|IĮ|VšĮ|SIA|OÜ)";
const CAP_WORDS = "\\p{Lu}[\\p{L}\\p{N}&-]*(?:\\s+\\p{Lu}[\\p{L}\\p{N}&-]*){0,3}";
const EMPLOYER_PATTERNS = [
  new RegExp(`(?<![\\p{L}\\p{N}])${ORG_MARK}\\s*[„"“']([^"“”'\\n]{2,60})["“”']`, "gu"),
  new RegExp(`(?<![\\p{L}\\p{N}])${ORG_MARK}\\s+(${CAP_WORDS})`, "gu"),
  new RegExp(
    `(${CAP_WORDS})\\s+(?:GmbH|B\\.V\\.|BV|Ltd\\.?|Oy|AS|ApS|Sp\\. z o\\.o\\.|Inc\\.?|LLC)(?![\\p{L}])`,
    "gu",
  ),
];
const CERT_CODES = /(?<![\p{L}\p{N}])(A1|VCA|SCC|SEP|CSCS|ADR|IPAF|CPC)(?![\p{L}\p{N}])/gu;
/** Certificate words (folded) in the supported languages — a translation may
 *  say "pažymėjimas" for an input "certificate", so the concept is matched. */
const CERT_STEMS = [
  "sertifik", "pazymejim", "licen", "certifi", "diplom", "atestat", "zertifi",
  "certyfik", "справк", "сертифи",
];
const MONTHS: readonly (readonly [number, RegExp])[] = [
  [1, /\b(sausi[os]|january)\b/], [2, /\b(vasari[os]|february)\b/],
  [3, /\b(kovo|march)\b/], [4, /\b(balandz(io|is)|april)\b/],
  [5, /\b(geguz(es|e))\b/], [6, /\b(birzel(io|is)|june)\b/],
  [7, /\b(liepos|july)\b/], [8, /\b(rugpjuc(io|is)|august)\b/],
  [9, /\b(rugsej(o|is)|september)\b/], [10, /\b(spali[os]|october)\b/],
  [11, /\b(lapkric(io|is)|november)\b/], [12, /\b(gruodz(io|is)|december)\b/],
];
const DATE_TOKEN = /(?<!\d)(?:\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{2,4}|(?:19|20)\d{2})(?!\d)/g;

function collectYearNumbers(value: unknown, out: number[] = [], key = ""): number[] {
  if (typeof value === "number" && /year$/.test(key)) out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectYearNumbers(v, out, key);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectYearNumbers(v, out, k);
  }
  return out;
}

/**
 * Employers, dates and certificates the OUTPUT names that the INPUT does not.
 * One line per invented fact; empty = nothing invented that these patterns
 * can see. Heuristic limits: an employer is recognised only by a legal-form
 * marker (UAB „…“, … GmbH); a certificate by a known code or a certificate
 * word in a supported language; a date by digits or a LT/EN month name.
 */
export function inventedFacts(input: unknown, data: unknown): string[] {
  const inputRaw = JSON.stringify(input ?? null);
  const inputFolded = fold(inputRaw);
  const claims = collectStrings(data, (k) => NON_TEXT_KEYS.has(k) || NON_CLAIM_KEY.test(k));
  // Months the input states, by name or inside a numeric date.
  const inputMonths = new Set<number>(
    MONTHS.filter(([, re]) => re.test(inputFolded)).map(([n]) => n),
  );
  for (const m of inputRaw.matchAll(/\d{4}-(\d{2})-\d{2}|\d{1,2}\.(\d{1,2})\.\d{2,4}/g)) {
    inputMonths.add(Number(m[1] ?? m[2]));
  }
  const found: string[] = [];
  for (const text of claims) {
    for (const re of EMPLOYER_PATTERNS) {
      for (const m of text.matchAll(re)) {
        const name = m[1].trim();
        if (!inputFolded.includes(fold(name))) found.push(`employer: ${name}`);
      }
    }
    for (const m of text.matchAll(DATE_TOKEN)) {
      if (!inputRaw.includes(m[0])) found.push(`date: ${m[0]}`);
    }
    const folded = fold(text);
    for (const [month, re] of MONTHS) {
      if (re.test(folded) && !inputMonths.has(month)) {
        found.push(`date: month ${month}`);
      }
    }
    for (const m of text.matchAll(CERT_CODES)) {
      if (!new RegExp(`(?<![\\p{L}\\p{N}])${m[1]}(?![\\p{L}\\p{N}])`, "u").test(inputRaw)) {
        found.push(`certificate: ${m[1]}`);
      }
    }
    const stem = CERT_STEMS.find((s) => folded.includes(s));
    if (stem && !CERT_STEMS.some((s) => inputFolded.includes(s))) {
      found.push(`certificate: "${stem}…" with no certificate in the input`);
    }
  }
  for (const y of collectYearNumbers(data)) {
    if (!inputRaw.includes(String(y))) found.push(`date: year ${y}`);
  }
  return [...new Set(found)];
}

export interface CheckResult {
  readonly ok: boolean;
  readonly detail: string;
}

export interface LithuanianCaseVerdict {
  readonly schema: CheckResult;
  readonly language: CheckResult;
  readonly facts: CheckResult;
  readonly pass: boolean;
}

/** The three checks every Lithuanian case must pass: (a) a validated
 *  suggestion that re-parses against the agent's own output schema, (b)
 *  Lithuanian reader-facing text, (c) no employer / date / certificate the
 *  input did not contain. */
export function judgeLithuanianCase(
  entry: PromptRegistryEntry,
  input: unknown,
  out: AiAgentOutcome,
): LithuanianCaseVerdict {
  if (out.status !== "suggestion") {
    const why =
      out.status === "needs_review"
        ? `${out.reason}${out.detail ? `: ${out.detail.slice(0, 200)}` : ""}`
        : out.reason;
    const none = { ok: false, detail: "no suggestion to check" };
    return {
      schema: { ok: false, detail: `${out.status} (${why})` },
      language: none,
      facts: none,
      pass: false,
    };
  }
  const parsed = entry.outputSchema.safeParse(out.value);
  const schema = parsed.success
    ? { ok: true, detail: "matches output schema" }
    : { ok: false, detail: parsed.error.message.slice(0, 200) };
  const data = (out.value as { data?: unknown }).data;
  const language = looksLithuanian(userFacingText(data));
  const invented = inventedFacts(input, data);
  const facts =
    invented.length === 0
      ? { ok: true, detail: "nothing invented" }
      : { ok: false, detail: invented.join("; ") };
  return { schema, language, facts, pass: schema.ok && language.ok && facts.ok };
}
