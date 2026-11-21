/**
 * TRANSLATION FAITHFULNESS — the ONE check a machine rendering must pass
 * before a reader sees it instead of the original.
 *
 * Shared by every reader that shows a provider's rendering: the vacancy
 * reader (`lib/vacancy-store/vacancy-translation-read.ts`) and the message
 * reader (`lib/communication/translation-read.ts`). Pure: no IO, no provider,
 * no locale table of its own. A rendering that fails is never "fixed" here —
 * the caller refuses it and the reader keeps the author's own words.
 *
 * Two rules, both order-insensitive so a reordered clause still passes:
 *   1. every digit run of the original survives ({@link digitsPreserved});
 *   2. every LOCKED TERM of the original is still represented
 *      ({@link lockedTermsPreserved}) — money units and contract words, where
 *      a dropped or swapped word changes what was agreed.
 */

/** Every run of digits in the original must survive the rendering — pay,
 *  dates, headcounts and hours are contractual facts. Order-insensitive so a
 *  reordered clause still passes; a LOST or CHANGED number does not. */
export function digitsPreserved(original: string, rendered: string): boolean {
  // A figure may be grouped with a space, a dot or a comma ("35 000",
  // "1.234,50", "1 234.50"); the comparison is on the digits themselves.
  const runs = (s: string) => (s.match(/\d+(?:[ .,]\d+)*/g) ?? []).map((r) => r.replace(/[ .,]/g, ""));
  const want = runs(original);
  if (want.length === 0) return true;
  const have = new Map<string, number>();
  for (const r of runs(rendered)) have.set(r, (have.get(r) ?? 0) + 1);
  for (const r of want) {
    const n = have.get(r) ?? 0;
    if (n === 0) return false;
    have.set(r, n - 1);
  }
  return true;
}

/**
 * A locked term is a CONCEPT, not a word: its forms span the communication
 * languages, so "sutartis" rendered as "contract" is faithful while a
 * rendering that drops the word — or turns SEK into NOK — is not. A group
 * present in the original must be present in the rendering, in any of its
 * forms.
 *
 *   `codes` — case-sensitive (ISO currency codes: "nok" is Norwegian for
 *             "enough", "NOK" is the krone);
 *   `words` — case-insensitive, whole words, endings spelled out where a
 *             bare stem would also catch a verb ("sutarti" = to agree,
 *             "договорились" = we agreed, "vertragen" = to tolerate);
 *   `marks` — symbols matched as they are.
 *
 * Deliberately SHORT. A term missing from this list is simply not locked
 * (the digit rule still holds); a form missing from a group makes a faithful
 * rendering fall back to the original — the safe direction.
 */
interface LockedTermGroup {
  readonly id: string;
  readonly codes?: readonly string[];
  readonly words?: readonly string[];
  readonly marks?: readonly string[];
}

export const LOCKED_TERM_GROUPS: readonly LockedTermGroup[] = [
  {
    id: "eur",
    codes: ["EUR"],
    words: ["eur(?:as|ai|ų|ui|ais|ams)?", "euro(?:s|n|t)?", "евро", "євро"],
    marks: ["€"],
  },
  { id: "sek", codes: ["SEK"] },
  { id: "nok", codes: ["NOK"] },
  { id: "dkk", codes: ["DKK"] },
  // "kr" alone does not say which krone; any krone code or word answers it.
  { id: "krone", codes: ["SEK", "NOK", "DKK"], words: ["kr", "kron(?:a|or|e|er|en|erne|ų|os)"] },
  { id: "pln", codes: ["PLN"], words: ["zł", "złot(?:y|ych|e|ego)", "zlot(?:y|ych)", "злот(?:ый|ых|ые|ого)"] },
  {
    id: "contract",
    words: [
      "contract(?:s|en)?", // en, nl
      "overeenkomst(?:en)?", // nl
      "kontrakt(?:en|et|er|erne|erna|y|u|em|ów|a|e)?", // sv, no, da, pl, de
      "avtal(?:et|en|ets)?", // sv
      "umow(?:a|y|ie|ę|ą|om|ami|ach)", // pl
      "vertrag(?:s|es)?",
      "verträge(?:n)?", // de
      "sutart(?:is|ies|į|imi|yje|ys|ims)",
      "sutarč(?:iai|ių)", // lt
      "līgum(?:s|a|u|i|iem|am|ā)", // lv
      "leping(?:u|ut|us|ud|ute)?", // et
      "договор(?:а|у|ом|е|ы|ов)?",
      "договір",
      "договор(?:і|ів)", // ru, uk
      "контракт(?:а|у|ом|е|ы|ов|і|ів)?", // ru, uk
      "ხელშეკრულებ\\p{L}*", // ka
    ],
  },
];

// Whole word: not glued to a letter or digit on either side.
const word = (alternatives: readonly string[]) => `(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`;

const matchers = LOCKED_TERM_GROUPS.map((g) => {
  const tests: RegExp[] = [];
  if (g.codes?.length) tests.push(new RegExp(word(g.codes), "u"));
  if (g.words?.length) tests.push(new RegExp(word(g.words), "iu"));
  const marks = g.marks ?? [];
  return {
    id: g.id,
    present: (s: string) => tests.some((re) => re.test(s)) || marks.some((m) => s.includes(m)),
  };
});

/** The locked-term groups the text carries (ids, in list order). */
export function lockedTermsIn(text: string): readonly string[] {
  return matchers.filter((m) => m.present(text)).map((m) => m.id);
}

/** Every locked term of the original is still represented in the rendering.
 *  A MISSING term means the rendering is unfaithful — never "close enough". */
export function lockedTermsPreserved(original: string, rendered: string): boolean {
  return matchers.every((m) => !m.present(original) || m.present(rendered));
}

/** Both rules. The one question a reader asks before showing a rendering. */
export function renderingIsFaithful(original: string, rendered: string): boolean {
  return digitsPreserved(original, rendered) && lockedTermsPreserved(original, rendered);
}
