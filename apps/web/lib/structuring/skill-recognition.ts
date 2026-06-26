/**
 * Deterministic skill recognition (Work Journal Text-to-Skill Recognition v1).
 *
 * Tiered, evidence-ordered, NO external AI (owner Q1/Q3, 2026-06-13):
 *   exact (base needle)  → high   — strongest evidence
 *   synonym (curated)    → medium
 *   light fuzzy (gated)  → low    — never overrides stronger evidence
 *
 * All matching runs on FOLDED text (see ./normalize) so Lithuanian written
 * without diacritics still matches. Every recognised skill carries a reason
 * (the matched word) so the UI can explain WHY it was suggested. Suggestions
 * are NEVER facts — the worker confirms each one (doctrine §7).
 *
 * Pure + deterministic (stable ordering); safe in client + server bundles.
 */
import { SKILL_HINTS_LT } from "./keywords";
import { SKILL_SYNONYMS } from "./synonyms";
import { foldText, boundedEditDistance } from "./normalize";

export type SkillConfidence = "high" | "medium" | "low";
export type SkillMatchVia = "exact" | "synonym" | "fuzzy";

export interface RecognizedSkill {
  readonly slug: string;
  readonly confidence: SkillConfidence;
  readonly via: SkillMatchVia;
  /** The word/phrase that triggered the match (best-effort original casing). */
  readonly matchedText: string;
}

/** Default cap on suggestions surfaced for one entry (owner: max 3–5). */
export const RECOGNITION_LIMIT = 4;

/** Light-fuzzy guards: only reasonably long tokens, edit distance ≤1, against
 *  only reasonably long stems — short stems would false-match aggressively. */
const FUZZY_MIN_TOKEN_LEN = 6;
// Stems must be ≥6 chars: shorter ones (e.g. "kasim") fuzzy-matched unrelated
// words ("kasininku" = cashier) — exactly the false positive to avoid.
const FUZZY_MIN_STEM_LEN = 6;
const FUZZY_MAX_DISTANCE = 1;

type Term = { slug: string; term: string; via: "exact" | "synonym"; len: number };

/** Folded dictionary terms (built once). Exact terms come from the base
 *  needles; synonym terms from the curated synonym sets. */
const TERMS: readonly Term[] = (() => {
  const out: Term[] = [];
  for (const row of SKILL_HINTS_LT) {
    for (const n of row.needles) {
      const t = foldText(n).trim();
      if (t) out.push({ slug: row.slug, term: t, via: "exact", len: t.length });
    }
  }
  for (const [slug, phrases] of Object.entries(SKILL_SYNONYMS)) {
    for (const p of phrases) {
      const t = foldText(p).trim();
      if (t) out.push({ slug, term: t, via: "synonym", len: t.length });
    }
  }
  return out;
})();

/** Single-word folded stems (≥ FUZZY_MIN_STEM_LEN) per slug, for the fuzzy tier. */
const FUZZY_STEMS: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const t of TERMS) {
    if (t.term.includes(" ") || t.len < FUZZY_MIN_STEM_LEN) continue;
    const arr = m.get(t.slug) ?? [];
    arr.push(t.term);
    m.set(t.slug, arr);
  }
  return m;
})();

const VIA_RANK: Record<SkillMatchVia, number> = { exact: 3, synonym: 2, fuzzy: 1 };
const VIA_CONFIDENCE: Record<SkillMatchVia, SkillConfidence> = {
  exact: "high",
  synonym: "medium",
  fuzzy: "low",
};

/** Original word (from the user's text) whose folded form contains `foldedTerm`,
 *  so the reason shows what the worker actually wrote. Null for multi-word terms
 *  or cross-token matches. */
function originalWordFor(
  originalTokens: readonly string[],
  foldedTokens: readonly string[],
  foldedTerm: string,
): string | null {
  if (foldedTerm.includes(" ")) return null;
  for (let i = 0; i < foldedTokens.length; i++) {
    if (foldedTokens[i].includes(foldedTerm)) return originalTokens[i];
  }
  return null;
}

/**
 * Recognise skills in a free-text entry. Returns at most `limit` suggestions,
 * ordered strongest-evidence-first (exact > synonym > fuzzy, then longer match,
 * then slug). One entry per slug (its best tier wins).
 */
export function recognizeSkills(
  text: string,
  limit: number = RECOGNITION_LIMIT,
): RecognizedSkill[] {
  if (!text || text.trim().length === 0) return [];
  const folded = foldText(text);
  const originalTokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const foldedTokens = originalTokens.map(foldText);

  // best tier per slug
  const best = new Map<
    string,
    { via: SkillMatchVia; len: number; matchedText: string }
  >();

  for (const t of TERMS) {
    if (!folded.includes(t.term)) continue;
    const prior = best.get(t.slug);
    const better =
      !prior ||
      VIA_RANK[t.via] > VIA_RANK[prior.via] ||
      (VIA_RANK[t.via] === VIA_RANK[prior.via] && t.len > prior.len);
    if (better) {
      const word = originalWordFor(originalTokens, foldedTokens, t.term);
      best.set(t.slug, { via: t.via, len: t.len, matchedText: word ?? t.term });
    }
  }

  // Fuzzy tier — only for slugs with NO exact/synonym hit; conservative so it
  // never overrides stronger evidence (owner Q3).
  for (let i = 0; i < foldedTokens.length; i++) {
    const tok = foldedTokens[i];
    if (tok.length < FUZZY_MIN_TOKEN_LEN) continue;
    for (const [slug, stems] of FUZZY_STEMS) {
      if (best.has(slug)) continue;
      for (const stem of stems) {
        // compare the token's leading stem-length slice to the stem
        const cand = tok.slice(0, stem.length);
        // Leading-character guard (real-world audit): a real typo almost never
        // changes the FIRST letter, but a 1-edit window on the first char turns
        // common unrelated verbs into false matches ("rašiau" → "kasiau" =
        // earthworks). Require the first character to match before accepting a
        // fuzzy hit — kills the leading-swap hallucination, keeps real typos
        // ("laminata" → "laminate").
        if (cand.length === 0 || cand[0] !== stem[0]) continue;
        if (
          boundedEditDistance(cand, stem, FUZZY_MAX_DISTANCE) <= FUZZY_MAX_DISTANCE
        ) {
          best.set(slug, { via: "fuzzy", len: stem.length, matchedText: originalTokens[i] });
          break;
        }
      }
    }
  }

  const list: RecognizedSkill[] = [...best.entries()].map(([slug, b]) => ({
    slug,
    via: b.via,
    confidence: VIA_CONFIDENCE[b.via],
    matchedText: b.matchedText,
  }));

  list.sort(
    (a, b) =>
      VIA_RANK[b.via] - VIA_RANK[a.via] ||
      b.matchedText.length - a.matchedText.length ||
      a.slug.localeCompare(b.slug),
  );

  return list.slice(0, Math.max(0, limit));
}
