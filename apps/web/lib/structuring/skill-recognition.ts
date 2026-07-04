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
import { LANGUAGE_PACKS } from "./language-packs";
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

/**
 * Cleaning-context guard for the flooring slug (real-world audit).
 *
 * "flooring" is the one trade with an ambiguous needle: a bare floor noun
 * ("grind…" / EN "floor" / RU "пол") is shared between LAYING a floor and
 * CLEANING one. "ploviau grindis" (I washed the floors) was wrongly read as
 * floor-laying. Owner rule: a wrong signal is worse than none. So when a floor
 * noun appears with a washing/cleaning verb AND no floor-laying verb (and no
 * unambiguous flooring material like laminate/parquet), we DROP flooring.
 * Real installation phrasings ("klojau/dėjau/montavau grindis", "dėjau
 * laminatą", "klojau parketą") all carry a laying verb or a material, so they
 * are never suppressed. Matching is on FOLDED text (diacritics stripped).
 */
const FLOOR_NOUN_RE = /grind|floor|пол/;
/** Floor-laying verbs OR unambiguous flooring materials → real flooring, keep. */
const FLOOR_INSTALL_RE =
  /kloj|dej|montav|klijav|tiesi|ireng|uzdej|laminat|ламинат|parket|паркет|parquet|laminate|напольн|laid floor|укладыв|стелил|laid|install|fitt|\blay\b/;
/** Washing / cleaning verbs (folded LT + RU + EN). */
const FLOOR_CLEAN_RE =
  /plov|plau|valiau|valau|valyt|svei|siurb|sluost|sutvark|sluav|мыл|помыл|мою|вымыл|убра|пропылесос|wash|mopp|mop |vacuum|hoover|swept|sweep|\bclean/;

/** True when a floor is named in an unmistakably cleaning (not laying) context.
 *  Exported so the profile-narrative extractor (`extract-profile-suggestions`)
 *  applies the EXACT same deterministic blocker — the two recognisers must agree
 *  that "ploviau grindis" is cleaning, never the flooring trade. Input must be
 *  FOLDED text (see ./normalize). */
export function isCleaningFloorContext(foldedText: string): boolean {
  return (
    FLOOR_NOUN_RE.test(foldedText) &&
    FLOOR_CLEAN_RE.test(foldedText) &&
    !FLOOR_INSTALL_RE.test(foldedText)
  );
}

/**
 * Power-tool context guard for the electrical-install slug (phrase-pack audit
 * 2026-07-04). The "elektr"/"электр" stems are the electrician's main needles,
 * but they also live inside "elektriniai įrankiai" / "электроинструмент" /
 * EN "power tools" — USING a power tool is not electrical installation work
 * ("Montavau baldus ir naudojau elektrinius įrankius" wrongly suggested
 * electrical-install). Owner rule: a wrong signal is worse than none. When a
 * power-tool noun is present and NO genuine electrical-work context is, the
 * electrical-install suggestion is dropped. Real electrical phrasings
 * ("keičiau rozetes", "монтаж проводки", "wiring") always carry an anchor from
 * the install regex, so they are never suppressed. Input must be FOLDED text.
 */
// Offline language packs (2026-07-04): the base "elektr" needle substring-
// matches power-tool words in EVERY Germanic/Slavic/Baltic/Finnic language
// ("elektrisch gereedschap", "Elektrowerkzeug", "elektronarzędzia", "elverktyg",
// "elektriline tööriist", "sähkötyökalu"…), so the guard carries per-language
// power-tool forms (folded) alongside LT/EN/RU. Genuine electrical WORK words
// per language live in ELECTRICAL_WORK_RE so real electricians never lose the
// suggestion.
const POWER_TOOL_RE =
  /elektrin[a-z]* irank|электроинструмент|power tool|power drill|elektrisch gereedschap|elektrowerkzeug|elektronarzedz|elverktyg|elvaerktoj|elektrisk verktoy|elektrisk drill|elektrili[a-z]* toorii|elektroinstrument|sahkotyokalu|elektronik|электроник/;
const ELECTRICAL_WORK_RE =
  /instaliac|rozet|jungikl|kabel|elektros darb|elektros mont|elektrik|wiring|rewir|electrical install|electrical work|проводк|розетк|электромонтаж|выключател|кабел|электрик|bedrading|stopcontact|groepenkast|elektra aangelegd|steckdose|verkabelt|verdrahtet|elektroinstallation|gniazdk|instalacje elektryczne|elektryk|ukladalem przewody|eluttag|stikkontakt|stopselkontakt|ledninger trukket|elinstallation|elarbete|elektriker|elektroniker|pistorasi|sahkoasennu|sahkotoi|rozete|elektroinstalac|vadus|elektrivarust|pistikup|elektritoo/;

/** True when electricity is named ONLY through a power-tool mention. */
export function isPowerToolOnlyElectricalContext(foldedText: string): boolean {
  return POWER_TOOL_RE.test(foldedText) && !ELECTRICAL_WORK_RE.test(foldedText);
}

/** Fuzzy-tier token blocklist (phrase-pack audit 2026-07-04): common EN
 *  past-tense verbs that sit 1 edit away from an unrelated dictionary stem and
 *  hallucinated construction skills in ordinary sentences — "filled" (invoices)
 *  → "filler" (skim-coating), "helped" (around the house) → "helper"
 *  (general-labour). Exact/synonym tiers are unaffected. */
const FUZZY_TOKEN_BLOCKLIST: ReadonlySet<string> = new Set(["filled", "helped"]);

type Term = {
  slug: string;
  term: string;
  via: "exact" | "synonym";
  len: number;
  /** Eligible as a fuzzy-tier stem. Offline language-pack needles (2026-07-04)
   *  are exact/synonym ONLY — 9 extra languages of stems in the fuzzy tier
   *  would multiply cross-language 1-edit collisions ("packade"→"packag" was
   *  the measured SV accident). Fuzzy stays base-lexicon (LT/EN/RU) only. */
  fuzzySource: boolean;
};

/** Folded dictionary terms (built once). Exact terms come from the base
 *  needles and the offline language packs; synonym terms from the curated
 *  synonym sets (base + packs). One recognizer, one term list — packs are
 *  extra rows in the SAME dictionary, never a second matching system. */
const TERMS: readonly Term[] = (() => {
  const out: Term[] = [];
  for (const row of SKILL_HINTS_LT) {
    for (const n of row.needles) {
      const t = foldText(n).trim();
      if (t) out.push({ slug: row.slug, term: t, via: "exact", len: t.length, fuzzySource: true });
    }
  }
  for (const [slug, phrases] of Object.entries(SKILL_SYNONYMS)) {
    for (const p of phrases) {
      const t = foldText(p).trim();
      if (t) out.push({ slug, term: t, via: "synonym", len: t.length, fuzzySource: true });
    }
  }
  for (const pack of LANGUAGE_PACKS) {
    for (const [slug, set] of Object.entries(pack.skills)) {
      for (const n of set.exact) {
        const t = foldText(n).trim();
        if (t) out.push({ slug, term: t, via: "exact", len: t.length, fuzzySource: false });
      }
      for (const p of set.synonyms ?? []) {
        const t = foldText(p).trim();
        if (t) out.push({ slug, term: t, via: "synonym", len: t.length, fuzzySource: false });
      }
    }
  }
  return out;
})();

/** Single-word folded stems (≥ FUZZY_MIN_STEM_LEN) per slug, for the fuzzy
 *  tier. Base-lexicon terms only (see Term.fuzzySource). */
const FUZZY_STEMS: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const t of TERMS) {
    if (!t.fuzzySource || t.term.includes(" ") || t.len < FUZZY_MIN_STEM_LEN) continue;
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
    if (FUZZY_TOKEN_BLOCKLIST.has(tok)) continue;
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

  // Cleaning-context guard: drop a flooring suggestion that exists only because
  // a floor was named in a washing/cleaning context (e.g. "ploviau grindis").
  if (best.has("flooring") && isCleaningFloorContext(folded)) {
    best.delete("flooring");
  }

  // Power-tool guard: drop an electrical-install suggestion that exists only
  // because a power tool was named (e.g. "naudojau elektrinius įrankius").
  if (best.has("electrical-install") && isPowerToolOnlyElectricalContext(folded)) {
    best.delete("electrical-install");
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
