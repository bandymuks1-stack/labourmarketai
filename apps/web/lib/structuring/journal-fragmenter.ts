/**
 * Universal journal FRAGMENTER (Universal Journal Recall pipeline, P0).
 *
 * A free-text work entry is a list of discrete work items ("fragments").
 * Recognition MUST run per fragment so one unrecognised item can never
 * shadow — or be shadowed by — the others (that was the structural loss
 * stage of the 2026-07-19 production incident). This module is the ONE
 * fragmentation rule for the whole pipeline: pure, deterministic, no IO,
 * data-driven (no sentence-specific branches).
 *
 * Splitting rules:
 *   • sentence boundaries (`.`, `!`, `?`, newlines), commas and semicolons;
 *   • clause conjunctions (LT ir / bei / taip pat, EN and / also,
 *     RU и / а также) — ONLY when the left side already carries a verb-like
 *     token AND the right side starts a new verb phrase. "su X ir Y" tool
 *     enumerations never split: when the nearest token left of the
 *     conjunction chain is an instrumental preposition (su / with / с)
 *     before any verb, the conjunction joins nouns, not clauses.
 *
 * `normalized` = folded (see ./normalize), trailing time/quantity
 * expressions stripped (same unit vocabulary as extract-journal-suggestions),
 * whitespace collapsed. `id` = deterministic FNV-1a hex of `normalized`.
 */
import { foldText } from "./normalize";
import {
  DURATION_UNIT_PATTERNS,
  QUANTITY_UNIT_PATTERNS,
} from "./extract-journal-suggestions";

export type JournalFragment = {
  /** Deterministic short id (8-hex FNV-1a of `normalized`). */
  id: string;
  /** Raw fragment text (trimmed, original casing, time suffix kept). */
  text: string;
  /** Folded + time/quantity-stripped + whitespace-collapsed matching form. */
  normalized: string;
  /** False for pure time/stopword scraps — coverage counts skip them. */
  meaningful: boolean;
};

/** FNV-1a 32-bit hex — tiny pure hash; stable across runtimes (no crypto). */
export function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Trailing time/quantity expression, e.g. "- 1 h", "– 2 val.", "6h",
 *  "3 vnt.", "100 m2". Built from the SAME unit vocabulary the suggestion
 *  extractor matches (no re-invented unit list). Applied repeatedly so
 *  "…- 2 val 30 min" strips fully. Runs on FOLDED text. */
const TRAILING_TIME_QTY_RE = new RegExp(
  `(?:[\\s,;:–—-]|^)+(?:apie\\s+)?\\d+(?:[.,]\\d+)?\\s*(?:${[
    ...DURATION_UNIT_PATTERNS,
    ...QUANTITY_UNIT_PATTERNS,
  ].join("|")})\\s*$`,
  "iu",
);
const TRAILING_SEPARATORS_RE = /[\s,;:–—-]+$/u;
const LEADING_SEPARATORS_RE = /^[\s,;:–—-]+/u;

/** Clause conjunctions that MAY split two work items (folded forms). */
const CONJUNCTION_RE = /\s+(?:ir|bei|taip\s+pat|and|also|и|а\s+также)\s+/giu;

/** Instrumental prepositions — a conjunction directly inside a "su X ir Y"
 *  enumeration joins nouns and must never split. */
const INSTRUMENTAL_PREPOSITIONS: ReadonlySet<string> = new Set([
  "su",
  "with",
  "с",
  "со",
]);

/** Small curated verb list (folded) for irregular forms the suffix
 *  heuristics cannot see — reuses the verb families the extraction lexicons
 *  already anchor on (EN irregular past, common RU past forms). */
const CURATED_VERBS: ReadonlySet<string> = new Set([
  "made",
  "built",
  "wrote",
  "did",
  "ran",
  "drove",
  "sold",
  "taught",
  "fed",
  "swept",
  "cut",
  "took",
  "went",
  "laid",
  "мыл",
  "вел",
  "вёл",
  "нес",
  "нёс",
  "пек",
  "пёк",
]);

const LT_VERB_SUFFIXES = [
  "inau",
  "dziau",
  "ejau",
  "iau",
  "jau",
  "au",
  "iu",
] as const;

const CYRILLIC_RE = /[Ѐ-ӿ]/;

/** Verb-like heuristic on a FOLDED token: LT past/present suffixes, EN past
 *  `-ed` / gerund `-ing`, RU past `-л/-ла/-ал/-ил`, or a curated verb. */
export function isVerbLikeToken(token: string): boolean {
  if (!token) return false;
  if (CURATED_VERBS.has(token)) return true;
  if (CYRILLIC_RE.test(token)) {
    return token.length >= 3 && /(?:л|ла|ал|ил)$/u.test(token);
  }
  if (token.length >= 4 && /(?:ed|ing)$/.test(token)) return true;
  if (token.length >= 4) {
    for (const s of LT_VERB_SUFFIXES) {
      if (token.endsWith(s)) return true;
    }
  }
  return false;
}

/** Stopword / filler tokens (folded, LT + EN + RU). Data-driven — extend by
 *  adding a token, never by a sentence-specific branch. */
const STOPWORDS: ReadonlySet<string> = new Set([
  // LT
  "ir",
  "bei",
  "su",
  "po",
  "prie",
  "per",
  "ant",
  "del",
  "kad",
  "tai",
  "taip",
  "pat",
  "dar",
  "jau",
  "bet",
  // EN
  "and",
  "the",
  "with",
  "also",
  "for",
  "was",
  "were",
  "did",
  "had",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "at",
  // RU
  "и",
  "с",
  "со",
  "на",
  "а",
  "также",
  "был",
  "было",
  "для",
  "по",
  "за",
]);

/** Time/quantity unit tokens (folded) — never make a fragment meaningful. */
const UNIT_TOKEN_RE =
  /^(?:val|valand\p{L}*|min|minu[ct]\p{L}*|h|d|vnt|kg|m2|m|kv|час\p{L}*|мин\p{L}*|дн\p{L}*|день|ч|шт|кг|м)$/u;

function tokenize(folded: string): string[] {
  return folded.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
}

/** MEANINGFUL iff ≥1 token of length ≥3 that is not a stopword, unit or
 *  pure number. Non-meaningful fragments are still RETURNED (with
 *  `meaningful:false`) so coverage counts can skip them explicitly. */
function isMeaningful(normalized: string): boolean {
  for (const tok of tokenize(normalized)) {
    if (tok.length < 3) continue;
    if (STOPWORDS.has(tok)) continue;
    if (UNIT_TOKEN_RE.test(tok)) continue;
    if (/^\d+$/.test(tok)) continue;
    return true;
  }
  return false;
}

/** True when the conjunction at `index` sits inside an instrumental
 *  enumeration ("su X ir Y"): scanning the left side backwards, a
 *  preposition (su/with/с) appears before any verb-like token. */
function insideInstrumentalEnumeration(leftFolded: string): boolean {
  const tokens = tokenize(leftFolded);
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (INSTRUMENTAL_PREPOSITIONS.has(tokens[i])) return true;
    if (isVerbLikeToken(tokens[i])) return false;
  }
  return false;
}

/** First non-stopword token of the folded right side. */
function firstContentToken(rightFolded: string): string | null {
  for (const tok of tokenize(rightFolded)) {
    if (STOPWORDS.has(tok)) continue;
    return tok;
  }
  return null;
}

/** Split ONE hard part on clause conjunctions (recursive left→right). */
function splitOnConjunctions(part: string): string[] {
  const folded = foldText(part);
  CONJUNCTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CONJUNCTION_RE.exec(folded)) !== null) {
    const leftFolded = folded.slice(0, m.index);
    const rightFolded = folded.slice(m.index + m[0].length);
    const leftHasVerb = tokenize(leftFolded).some(isVerbLikeToken);
    if (!leftHasVerb) continue;
    if (insideInstrumentalEnumeration(leftFolded)) continue;
    const rightStart = firstContentToken(rightFolded);
    if (!rightStart || !isVerbLikeToken(rightStart)) continue;
    // Folding never changes string LENGTH for the characters involved
    // (1:1 char map + lowercase), so folded indices align with the original.
    const left = part.slice(0, m.index);
    const right = part.slice(m.index + m[0].length);
    return [left, ...splitOnConjunctions(right)];
  }
  return [part];
}

/** Strip trailing time/quantity expressions + separators (folded input). */
function stripTimeAndQuantity(folded: string): string {
  let out = folded;
  for (let guard = 0; guard < 6; guard++) {
    const next = out.replace(TRAILING_TIME_QTY_RE, "");
    if (next === out) break;
    out = next;
  }
  return out
    .replace(TRAILING_SEPARATORS_RE, "")
    .replace(LEADING_SEPARATORS_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

const DECIMAL_COMMA = "";
const DECIMAL_DOT = "";

/**
 * Fragment a free-text journal entry into discrete work items.
 * Pure + deterministic; the SAME text always yields the SAME fragments
 * (ids included). Empty/blank input → [].
 */
export function fragmentJournalText(text: string): JournalFragment[] {
  if (!text || text.trim().length === 0) return [];

  // Protect decimal separators ("1,5 val" / "2.5 h") from the hard split.
  const guarded = text
    .replace(/\r/g, "")
    .replace(/(\d),(\d)/g, `$1${DECIMAL_COMMA}$2`)
    .replace(/(\d)\.(\d)/g, `$1${DECIMAL_DOT}$2`);

  const hardParts = guarded
    .split(/[.!?;,\n]+/)
    .map((p) =>
      p
        .replace(new RegExp(DECIMAL_COMMA, "g"), ",")
        .replace(new RegExp(DECIMAL_DOT, "g"), "."),
    )
    .map((p) => p.replace(LEADING_SEPARATORS_RE, "").trim())
    .filter((p) => p.length > 0);

  const out: JournalFragment[] = [];
  const seenIds = new Set<string>();
  for (const part of hardParts) {
    for (const piece of splitOnConjunctions(part)) {
      const textPiece = piece
        .replace(LEADING_SEPARATORS_RE, "")
        .replace(TRAILING_SEPARATORS_RE, "")
        .trim();
      if (!textPiece) continue;
      const normalized = stripTimeAndQuantity(foldText(textPiece));
      if (!normalized) continue;
      const id = fnv1aHex(normalized);
      if (seenIds.has(id)) continue; // exact duplicate fragment — one card
      seenIds.add(id);
      out.push({
        id,
        text: textPiece,
        normalized,
        meaningful: isMeaningful(normalized),
      });
    }
  }
  return out;
}
