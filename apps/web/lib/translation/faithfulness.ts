/**
 * Checks for translated vacancies and messages. Vacancies use the original
 * digit check, while messages also preserve numeric structure and locked terms.
 * Readers retain the original when the applicable check fails.
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
      "contract(?:s|en)?", "agreement(?:s)?", // en, nl
      "overeenkomst(?:en)?", // nl
      "kontrakt(?:en|et|er|erne|erna|y|u|em|ów|a|e)?", // sv, no, da, pl, de
      "avtal(?:et|en|ets)?", "avtal(?:e|en|er)", "aftal(?:e|en|er)", // sv, no, da
      "umow(?:a|y|ie|ę|ą|om|ami|ach)", // pl
      "vertrag(?:s|es)?",
      "verträge(?:n)?", "vereinbarung(?:en)?", // de
      "sutart(?:is|ies|į|imi|yje|ys|ims)",
      "sutarč(?:iai|ių)", "susitarim(?:as|o|ui|ą|u|e|ai|ų|ams|us|ais|uose)", // lt
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

function word(alternatives: readonly string[], adjacentDigits = false): string {
  const boundary = adjacentDigits ? "\\p{L}\\p{M}" : "\\p{L}\\p{M}\\p{N}";
  return `(?<![${boundary}])(?:${alternatives.join("|")})(?![${boundary}])`;
}

const matchers = LOCKED_TERM_GROUPS.map((g) => {
  const tests: RegExp[] = [];
  if (g.codes?.length) tests.push(new RegExp(word(g.codes, true), "u"));
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

const currencyGroups = LOCKED_TERM_GROUPS.filter((group) => group.id !== "contract");
const currencyForms = currencyGroups.flatMap((group) => [
  ...(group.codes ?? []),
  ...(group.words ?? []),
  ...(group.marks ?? []),
]);
const currencyBefore = new RegExp(`(?<![\\p{L}\\p{M}])(?:${currencyForms.join("|")})\\s*$`, "iu");
const currencyAfter = new RegExp(`^\\s*(?:${currencyForms.join("|")})(?![\\p{L}\\p{M}])`, "iu");

function normalizeNumber(token: string): string {
  const compact = token.replace(/^\u2212/, "-").replace(/[ \u00a0\u202f]/g, "");
  // A different decimal separator disambiguates the groups of three.
  return compact
    .replace(/^([+-]?\d{1,3}(?:\.\d{3})+),(\d{1,2})$/, (_token, whole: string, fraction: string) => whole.replaceAll(".", "") + "." + fraction)
    .replace(/^([+-]?\d{1,3}(?:,\d{3})+)\.(\d{1,2})$/, (_token, whole: string, fraction: string) => whole.replaceAll(",", "") + "." + fraction)
    .replace(/^([+-]?\d+),(\d{1,2})$/, "$1.$2");
}

function numericFacts(text: string) {
  const facts = { date: [] as string[], time: [] as string[], amount: [] as string[], other: [] as string[] };
  for (const match of text.matchAll(/[+\-\u2212]?\d+(?:[.,:/-]\d+|[ \u00a0\u202f]\d{3}(?!\d))*/g)) {
    const [token] = match;
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(token)) {
      facts.date.push(token);
    } else if (/^\d{1,2}:\d{2}$/.test(token)) {
      facts.time.push(token.replace(/^0(\d:\d{2})$/, "$1"));
    } else {
      const number = normalizeNumber(token);
      const start = match.index;
      const end = start + token.length;
      const hasCurrency = currencyBefore.test(text.slice(0, start)) || currencyAfter.test(text.slice(end));
      (hasCurrency ? facts.amount : facts.other).push(number);
    }
  }
  return facts;
}

/** Allow different kinds of facts to reorder. Within each kind, keep the sequence. */
function messageNumbersPreserved(original: string, rendered: string): boolean {
  const source = numericFacts(original);
  const translation = numericFacts(rendered);
  return (["date", "time", "amount", "other"] as const).every((kind) =>
    source[kind].length === translation[kind].length &&
    source[kind].every((value, index) => value === translation[kind][index]),
  );
}

/** Both rules. The one question a reader asks before showing a rendering. */
export function renderingIsFaithful(original: string, rendered: string): boolean {
  return messageNumbersPreserved(original, rendered) && lockedTermsPreserved(original, rendered);
}
