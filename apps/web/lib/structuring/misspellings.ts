/**
 * Curated common-misspelling map (Recognition v1.1).
 *
 * The light-fuzzy tier in skill-recognition only fires on tokens ≥6 chars
 * (shorter stems false-match aggressively). That leaves a gap for SHORT,
 * frequently-misspelled job words ("kasinike" for "kasininkas",
 * "padaveja" for "padavėjas"). This module fixes that gap with an EXPLICIT,
 * hand-curated wrong→right token map — never a heuristic. Each entry is a
 * deliberate, safe correction; nothing is guessed.
 *
 * Rules:
 *   - Keys + values are FOLDED (lowercase, diacritic-free — see ./normalize)
 *     so they line up with the folded text the recognizers match on.
 *   - Whole-token replacement only (we never rewrite substrings inside a
 *     longer word), so an unrelated word can never be silently "corrected".
 *   - Every value resolves to a token that a real catalogue needle already
 *     contains, so a correction can only ever surface an EXISTING skill —
 *     it can never invent one.
 *
 * Pure, deterministic, no I/O — safe in client + server bundles.
 */
import { foldText } from "./normalize";

/**
 * Wrong folded token → correct folded token. Kept intentionally small; add a
 * row only for a misspelling you have actually seen and can defend. Each row
 * is covered by a false-positive test (misspellings.test.ts).
 */
const RAW_MISSPELLINGS: Readonly<Record<string, string>> = {
  // retail — cashier (kasininkas): dropped 'n', feminine, diminutive typo
  kasinikas: "kasininkas",
  kasinike: "kasininkas",
  kasininke: "kasininkas",
  // hospitality — waiter (padavėjas): missing trailing 's', feminine
  padaveja: "padavejas",
  padavejis: "padavejas",
  // cleaning — cleaner (valytojas): 'i' for 'y', feminine
  valitojas: "valytojas",
  valitoja: "valytojas",
  // transport — courier (kurjeris): 'ie'/'y' for 'je'
  kurieris: "kurjeris",
  kuryeris: "kurjeris",
  // office — bookkeeper (buhalteris): feminine / dropped 'i'
  buhaltere: "buhalteris",
  buhalteris: "buhalteris",
};

/** Folded map, built once. */
export const COMMON_MISSPELLINGS: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [wrong, right] of Object.entries(RAW_MISSPELLINGS)) {
    const w = foldText(wrong).trim();
    const r = foldText(right).trim();
    if (w && r && w !== r) m.set(w, r);
  }
  return m;
})();

/**
 * Apply the curated misspelling map to ALREADY-FOLDED text. Splits on
 * non-alphanumeric runs, replaces any whole token that is a known
 * misspelling with its correction, and rejoins with single spaces.
 *
 * Returns the corrected folded text AND whether any correction fired, so the
 * caller can mark a correction-derived match at a lower confidence than a
 * clean primary hit.
 */
export function applyMisspellings(folded: string): {
  text: string;
  corrected: boolean;
} {
  if (!folded) return { text: "", corrected: false };
  let corrected = false;
  const out = folded
    .split(/([^\p{L}\p{N}]+)/u)
    .map((part) => {
      const fix = COMMON_MISSPELLINGS.get(part);
      if (fix) {
        corrected = true;
        return fix;
      }
      return part;
    })
    .join("");
  return { text: out, corrected };
}
