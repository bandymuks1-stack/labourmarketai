/**
 * A TYPED OCCUPATION WORD THAT IS A CATALOGUE PROFESSION IN THE READER'S OWN
 * LANGUAGE BECOMES THAT PROFESSION FILTER.
 *
 * The anonymous free-text box matches the publisher's own occupation label, and
 * 100% of the live supply is published in Swedish. So a Lithuanian visitor who
 * types "valytojas" (the exact name of a catalogue profession, which the
 * homepage itself shows) got a FALSE ZERO: nothing in Swedish contains it.
 * The catalogue (`messages/{locale}/professions.json`) already maps slug to the
 * reader's word and the board already filters by slug, so this reuses that
 * mapping: it adds no search path, no table and no query.
 *
 * Deliberately conservative: it returns a slug only when exactly ONE profession
 * matches. Ambiguity returns null and the plain text search runs unchanged.
 */

export interface ProfessionLabel {
  readonly slug: string;
  readonly label: string;
}

/** Lowercase, diacritics removed ("Kepejas" and "kepejas" are the same word), ß as ss ("Schweißer" and "Schweisser"). */
export function foldForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchProfessionByLabel(
  query: string,
  options: readonly ProfessionLabel[],
): string | null {
  const q = foldForMatch(query);
  if (q.length < 3) return null;

  const folded = options.map((o) => ({ slug: o.slug, l: foldForMatch(o.label) }));
  const hit = matchFolded(q, folded);
  if (hit) return hit;
  // "Kuechenhilfe" is how a keyboard without ü writes "Küchenhilfe". Tried second, so a label
  // that really holds ue or ae ("Steuerberater") is still matched as itself.
  const typed = q.replace(/([aou])e/g, "$1");
  return typed !== q && typed.length >= 3 ? matchFolded(typed, folded) : null;
}

function matchFolded(q: string, folded: readonly { slug: string; l: string }[]): string | null {

  const exact = folded.filter((o) => o.l === q);
  if (exact.length === 1) return exact[0]!.slug;
  if (exact.length > 1) return null;

  const loose = folded.filter((o) => {
    // A typed beginning of the label ("valyt").
    if (q.length >= 4 && o.l.startsWith(q)) return true;
    // An inflected form of the label ("valytoja", "kepeju"): the label minus
    // its 2-letter ending is the stem the declension keeps.
    if (o.l.length >= 6 && !o.l.includes(" ") && q.startsWith(o.l.slice(0, -2))) {
      return true;
    }
    return false;
  });
  return loose.length === 1 ? loose[0]!.slug : null;
}

/**
 * WORDS PEOPLE TYPE THAT NO CATALOGUE LABEL NAMES, each for one existing profession.
 *
 * On a Swedish and Norwegian supply these answer a false zero in text search. Only a
 * word that cannot be publisher text belongs here: `chef` means manager in Swedish,
 * `programmer` sits inside `programmerare` and `lagerist` is Swedish too, so all three
 * stay free text. Tried last, so a catalogue label always wins.
 */
const TYPED_WORDS: Readonly<Record<string, readonly string[]>> = {
  driver: [
    "truck driver",
    "lorry driver",
    "sunkvežimio vairuotojas",
    "vilkiko vairuotojas",
    "lkw fahrer",
    "lkw-fahrer",
    "vrachtwagenchauffeur",
    "дальнобойщик",
    "водитель грузовика",
  ],
  cook: ["küchenchef", "szef kuchni", "шеф-повар"],
  software_developer: ["entwickler", "softwareentwickler", "ontwikkelaar", "softwareontwikkelaar"],
  teacher: ["учитель"],
  warehouse_worker: ["sandėlininkas", "sandėlininkė", "magazynier", "кладовщик"],
};

const TYPED_WORD_SLUG: ReadonlyMap<string, string> = new Map(
  Object.entries(TYPED_WORDS).flatMap(([slug, words]) => words.map((w) => [foldForMatch(w), slug] as const)),
);

/**
 * THE SAME WORD IN ANOTHER ACTIVE LANGUAGE (2026-10-08 anonymous walk).
 *
 * `/lt/jobs?q=welder` and `/en/jobs?q=valytojas` reported a false zero: the
 * word IS a catalogue profession, just not in the reader's language (a
 * Lithuanian reading the English board, a shared link, a habit). The reader's
 * own catalogue is tried first and wins; only when it finds nothing are the
 * other active catalogues tried, and a slug is returned only when every
 * catalogue that matches agrees on the SAME slug — a word that means two
 * different professions in two languages stays a plain text search.
 */
export function matchProfessionAcrossLocales(
  query: string,
  readerOptions: readonly ProfessionLabel[],
  otherLocaleOptions: readonly (readonly ProfessionLabel[])[],
): string | null {
  const own = matchProfessionByLabel(query, readerOptions);
  if (own) return own;
  const hits = new Set<string>();
  for (const options of otherLocaleOptions) {
    const slug = matchProfessionByLabel(query, options);
    if (slug) hits.add(slug);
  }
  if (hits.size > 1) return null;
  return hits.size === 1 ? [...hits][0]! : (TYPED_WORD_SLUG.get(foldForMatch(query)) ?? null);
}
