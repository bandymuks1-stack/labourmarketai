/**
 * Text folding for recognition (Work Journal Text-to-Skill Recognition v1).
 *
 * Recognition must match Lithuanian written WITHOUT diacritics (workers type
 * `dazem` for `dažau`, `transeja` for `tranšėja`). We fold BOTH the entry text
 * and the dictionary needles to a diacritic-free lowercase form purely for
 * MATCHING — the original text is never mutated for display or storage.
 *
 * Cyrillic is left as-is (Russian needles already carry the exact stems);
 * Unicode NFD + combining-mark stripping handles most Latin accents, and an
 * explicit LT map covers the few that NFD does not split the way we want.
 *
 * Pure, deterministic, no I/O — safe in both server and client bundles.
 */

/** Lithuanian letters → ASCII base. NFD handles the combining-accent ones, but
 *  we map explicitly so the behaviour is obvious and stable across runtimes. */
const LT_FOLD: Record<string, string> = {
  ą: "a",
  č: "c",
  ę: "e",
  ė: "e",
  į: "i",
  š: "s",
  ų: "u",
  ū: "u",
  ž: "z",
};

/** Letters NFD can NOT fold because they are standalone code points, not
 *  base+combining-mark compositions: German ß, Danish/Norwegian ø/æ, Polish ł,
 *  plus the rarer œ/đ/ð/þ. Needed since the offline language packs (2026-07-04)
 *  carry NL/DE/PL/LV/ET/FI/DA/NO/SV needles — workers type both "kørte" and
 *  "korte", both must match the same folded needle. Purely additive: none of
 *  these letters occur in the pre-existing LT/EN/RU needles or fixtures. */
const NON_DECOMPOSABLE_FOLD: Record<string, string> = {
  ß: "ss",
  ø: "o",
  æ: "ae",
  œ: "oe",
  đ: "d",
  ð: "d",
  þ: "th",
  ł: "l",
};

/**
 * Fold a string for matching: lowercase, map Lithuanian diacritics to their
 * ASCII base, and strip any remaining Unicode combining marks. Cyrillic and
 * other scripts pass through unchanged.
 */
export function foldText(input: string): string {
  if (!input) return "";
  let out = input.toLowerCase();
  out = out.replace(/[ąčęėįšųūž]/g, (ch) => LT_FOLD[ch] ?? ch);
  out = out.replace(/[ßøæœđðþł]/g, (ch) => NON_DECOMPOSABLE_FOLD[ch] ?? ch);
  // Strip leftover combining diacritics (NFD) for any other accented Latin.
  out = out.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return out;
}

/** Levenshtein edit distance, capped: returns a value > `max` as soon as the
 *  bound is exceeded (cheap early-out). Used only by the gated light-fuzzy tier
 *  on tokens that already failed exact + synonym matching. */
export function boundedEditDistance(a: string, b: string, max: number): number {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev = new Array<number>(lb + 1);
  let cur = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[lb];
}
