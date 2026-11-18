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
 *   • sentence boundaries (`.`, `!`, `?`, newlines), commas and semicolons —
 *     except the dots the suggestion extractor also keeps (ONE shared rule,
 *     `protectNonBoundaryDots`): a unit's abbreviation dot before a
 *     lower-case continuation ("5 val. programavau"), a decimal separator
 *     ("3.5 val", "1,5 h") and a dot inside one token ("LabourMarket.ai",
 *     "www.imone.lt") — issue #1689, the owner's own sentence lost its
 *     context name to "LabourMarket" + "ai";
 *   • the colon that itemises a stated total ("dirbau 9 val.: 5 val. X, 2
 *     val. Y") closes the header phrase, the same cut the extractor makes
 *     (`ITEMISING_COLON_RX`) — so a persisted item re-fragments to the
 *     derivation's own id;
 *   • clause conjunctions (LT ir / bei / taip pat, EN and / also, NL en,
 *     DE und, RU и / а также) — ONLY when the left side already carries a verb-like
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
  ITEMISING_COLON_RX,
  QUANTITY_UNIT_PATTERNS,
  isDurationUnitWord,
  protectNonBoundaryDots,
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

/** A number+unit time/quantity expression ANYWHERE in a segment (same unit
 *  vocabulary as the trailing stripper, un-anchored). A comma-delimited
 *  segment carrying one is a real, measured work item — so the comma after it
 *  ends that item (see `segmentHasWorkAnchor`). Runs on FOLDED text. */
const CONTAINS_TIME_QTY_RE = new RegExp(
  `\\d+(?:[.,]\\d+)?\\s*(?:${[
    ...DURATION_UNIT_PATTERNS,
    ...QUANTITY_UNIT_PATTERNS,
  ].join("|")})`,
  "iu",
);

/** Clause conjunctions that MAY split two work items (folded forms). */
const CONJUNCTION_RE =
  /\s+(?:ir|bei|taip\s+pat|and|also|en|und|и|а\s+также)\s+/giu;

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

/** Quantity unit tokens (folded) — never make a fragment meaningful. The
 *  duration units come from the extractor's ONE vocabulary
 *  (`isDurationUnitWord`: valand* / hours / uur / Std / час* …). */
const QUANTITY_TOKEN_RE = /^(?:vnt|kg|m2|m|kv|шт|кг|м)$/u;

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
    if (QUANTITY_TOKEN_RE.test(tok) || isDurationUnitWord(tok)) continue;
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

/** A comma-delimited segment stands on its own as a work item when it carries
 *  a verb-like token OR a number+unit time/quantity expression — the same two
 *  signals the rest of the pipeline keys real work on. Receives GUARDED text
 *  (decimal separators are the \x01/\x02 marks); restores them before folding
 *  so "1,5 val" reads as a timed item, not as two bare numbers. */
function segmentHasWorkAnchor(guardedSegment: string): boolean {
  const folded = foldText(
    guardedSegment
      .replace(new RegExp(DECIMAL_COMMA, "g"), ",")
      .replace(new RegExp(DECIMAL_DOT, "g"), "."),
  );
  if (!folded) return false;
  if (CONTAINS_TIME_QTY_RE.test(folded)) return true;
  return tokenize(folded).some(isVerbLikeToken);
}

/**
 * Split ONE hard part on COMMAS — but ONLY where the comma sits between two
 * real work items: the text accumulated since the last boundary AND the
 * segment after the comma each carry a verb or a time/quantity expression
 * (`segmentHasWorkAnchor`). A comma with a bare noun phrase on either side is
 * NOT a boundary, so a descriptive clause — the kind a Lithuanian worker
 * writes to summarise analysis work ("privatumo, sutikimų, pasitikėjimo …
 * analizė, dokumentacijos spragų identifikavimas") — stays ONE fragment
 * instead of shattering into noun scraps that each surface as their own
 * `unresolved_fragment`; and a bare note trailing a real item ("dažiau sienas
 * 4 val, papildomos pastabos") joins that item rather than becoming a scrap.
 * Timed/quantified lists ("30 min pertrauka, 2 val dažiau") and verb-clause
 * lists ("kroviau paletes, valiau langus") still split exactly as before.
 * Operates on GUARDED text so decimal commas (\x01) are never split on.
 * Data-driven: extend the signals, never add a sentence-specific branch.
 */
function splitOnWorkItemCommas(guardedPart: string): string[] {
  if (!guardedPart.includes(",")) return [guardedPart];
  const segments = guardedPart.split(",");
  const out: string[] = [];
  let buffer = segments[0];
  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    if (segmentHasWorkAnchor(buffer) && segmentHasWorkAnchor(next)) {
      out.push(buffer);
      buffer = next;
    } else {
      // A bare noun phrase on one side — the comma joins, it does not bound.
      buffer = `${buffer},${next}`;
    }
  }
  out.push(buffer);
  return out;
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
/** Every itemising colon (the extractor's rule, applied to the whole text). */
const ITEMISING_COLON_G = new RegExp(ITEMISING_COLON_RX.source, "gu");

/**
 * Fragment a free-text journal entry into discrete work items.
 * Pure + deterministic; the SAME text always yields the SAME fragments
 * (ids included). Empty/blank input → [].
 */
export function fragmentJournalText(text: string): JournalFragment[] {
  if (!text || text.trim().length === 0) return [];

  // Protect the dots/commas that are not boundaries (decimal separators,
  // unit abbreviations before a lower-case word, dots inside one token) with
  // the extractor's own rule; single-character marks keep every index
  // aligned with the original text. The itemising colon becomes a hard
  // boundary so the stated-total header and its items split as the
  // extractor splits them.
  const guarded = protectNonBoundaryDots(text.replace(/\r/g, ""), {
    dot: DECIMAL_DOT,
    comma: DECIMAL_COMMA,
  }).replace(ITEMISING_COLON_G, (m) => `;${m.slice(1)}`);

  const restoreDecimals = (p: string): string =>
    p
      .replace(new RegExp(DECIMAL_COMMA, "g"), ",")
      .replace(new RegExp(DECIMAL_DOT, "g"), ".");

  // Hard boundaries are sentence punctuation, the itemising-colon-derived ';'
  // and newlines — NOT the comma. The comma was an unconditional boundary,
  // which shattered comma-separated descriptive prose into bare noun scraps
  // (each an unresolved_fragment). It is now split only where it ends a real
  // work item (`splitOnWorkItemCommas`). Both splits run on the GUARDED text
  // so decimal commas are never boundaries; decimals are restored per piece.
  const hardParts = guarded
    .split(/[.!?;\n]+/)
    .filter((p) => p.trim().length > 0);

  const out: JournalFragment[] = [];
  const seenIds = new Set<string>();
  for (const guardedPart of hardParts) {
    for (const guardedItem of splitOnWorkItemCommas(guardedPart)) {
      const part = restoreDecimals(guardedItem);
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
  }
  return out;
}
