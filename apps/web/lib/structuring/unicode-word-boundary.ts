/**
 * A Unicode-aware word boundary — the ONE definition. JS `\b` is ASCII-only,
 * so it misfires at every non-ASCII boundary (Lithuanian ąčęėįšųūž,
 * Cyrillic): `darbą\b` never matches after `ą`, `\bопыт` never matches after
 * a space, and `\bcv\b` still lets `zxcv` match. This asserts a real
 * letter↔non-letter transition (requires the `u` flag), so short stems stay
 * properly bounded across every launch language.
 *
 * Its own tiny module so a client surface (the market recognizer) can use it
 * without importing the conversation intent router, which re-exports it.
 */
// A COMPACT letter/number class over the scripts the product speaks (Latin
// incl. extended + additional, Greek, Cyrillic, Georgian, digits). It replaced
// `[\p{L}\p{N}]` inside the boundary because V8 expands the property classes
// into hundreds of ranges, eight times per boundary, across ~700 patterns: the
// first sentence of a process cost ~2.8 s to compile and now costs ~90 ms
// (router-boundary-cost.test.ts). Do not put `\p{...}` back in the boundary.
const WORD_CLASS =
  "[0-9A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u052F\\u10A0-\\u10FF\\u1C90-\\u1CBF\\u1E00-\\u1EFF]";

export const UNICODE_WORD_BOUNDARY =
  "(?:(?<!" + WORD_CLASS + ")(?=" + WORD_CLASS + ")|(?<=" + WORD_CLASS + ")(?!" + WORD_CLASS + "))";

/** The same pattern with every ASCII `\b` replaced by the Unicode boundary,
 *  compiled with the `u` flag (other flags kept). */
export function withUnicodeBoundaries(re: RegExp): RegExp {
  const flags = re.flags.includes("u") ? re.flags : `${re.flags}u`;
  return new RegExp(re.source.replace(/\\b/g, UNICODE_WORD_BOUNDARY), flags);
}
