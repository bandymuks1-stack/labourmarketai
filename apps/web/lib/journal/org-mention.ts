/**
 * WHICH ORGANIZATION DID THE SENTENCE NAME? (owner continuation 2026-09-29 §7:
 * "Do not silently guess which employer/project receives work evidence.")
 *
 * Walked on production: "Šiandien 5 valandas betonavau pamatus Alfa objekte."
 * — the worker's relationship with Alfa had ENDED, their one active
 * organization context was Gama, and the card preselected Gama (Rule B).
 * The person named one organization and the evidence was one click from
 * landing at another.
 *
 * This only answers "which of THESE names did the text mention": the caller
 * passes the names of the person's own contexts (active ones, and ended ones
 * named through the narrow historical-names read). A mention is a
 * CAPITALISED word of the text that starts with a distinctive word of the
 * organization's name — capitalisation is what keeps "gamyboje" (a factory)
 * from naming "Gama". Legal forms and synthetic markers are not distinctive.
 *
 * Pure: no IO.
 */

const GENERIC = new Set([
  "qa", "synthetic", "testinis", "subjektas", "test", "uab", "mb", "ab", "vsi",
  "gmbh", "ag", "kg", "ltd", "limited", "llc", "inc", "sia", "as", "oy", "oyj", "bv", "nv",
  "sp", "zoo", "spolka", "sa", "srl", "company", "group", "imone", "agentura", "the", "and",
]);

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Distinctive words of an organization name (folded, ≥ 3 letters). */
export function distinctiveWords(name: string): string[] {
  return fold(name)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !GENERIC.has(w));
}

/** Capitalised words of the text, folded — the only candidates for a name. */
function capitalisedWords(text: string): string[] {
  return (text ?? "")
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((w) => /^\p{Lu}/u.test(w))
    .map((w) => fold(w));
}

/** Stem that tolerates Lithuanian case endings: "Alfa" → "alf" (Alfos, Alfoje). */
function stem(word: string): string {
  return word.length > 5 ? word.slice(0, -2) : word.length > 3 ? word.slice(0, -1) : word;
}

export function mentionsOrganization(text: string, orgName: string): boolean {
  const words = capitalisedWords(text);
  if (words.length === 0) return false;
  return distinctiveWords(orgName).some((d) => words.some((w) => w.startsWith(stem(d))));
}
