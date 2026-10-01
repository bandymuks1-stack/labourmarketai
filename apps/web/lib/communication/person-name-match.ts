/**
 * Person-name matching for "write to / open the conversation with X" — PURE.
 *
 * A spoken or typed reference carries the person in an inflected form
 * ("parašyk Jonui", "pokalbis su Jonu", "write to Anna"). The product's name
 * lists hold the nominative ("Jonas Jonaitis"). Two rules make them meet
 * without a language model and without ever guessing across people:
 *
 *   - names and queries are compared as lower-cased, diacritic-free tokens;
 *   - a query token matches a name token when they share a common prefix of at
 *     least 3 characters AND what remains of EACH token after that prefix is at
 *     most 3 characters (Lithuanian case endings are 1-3 characters: Jonas /
 *     Jonui / Jonu / Jono; Petras / Petrui / Petrą) - so Jonas is not Jonaitis.
 *
 * Query tokens that match no name token (the verb, a filler) are ignored; the
 * candidates matching the MOST tokens remain (a surname narrows a first name).
 * Candidates are returned best-first; the CALLER decides what one vs
 * many means — this module never picks a person for the user.
 */

const STOP = new Set([
  "su", "ir", "to", "the", "with", "and", "for", "man", "mano", "pas", "per",
  "ar", "kad", "pokalbi", "pokalbis", "conversation", "message", "zinute",
]);

/** Lower-case, strip diacritics, keep letters/digits only. */
export function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0430-\u044f\u0451\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(value: string): string[] {
  return foldName(value)
    .split(" ")
    .filter((t) => t.length > 0);
}

/** Whether one query token refers to one name token (inflection-tolerant). */
export function tokensMatch(queryToken: string, nameToken: string): boolean {
  if (queryToken === nameToken) return true;
  let i = 0;
  const max = Math.min(queryToken.length, nameToken.length);
  while (i < max && queryToken[i] === nameToken[i]) i += 1;
  // What is left of EACH token after the shared prefix must look like a case
  // ending (at most 3 characters); two different names do not.
  return i >= 3 && queryToken.length - i <= 3 && nameToken.length - i <= 3;
}

export interface NamedCandidate<T> {
  readonly name: string;
  readonly item: T;
}

/**
 * The candidates the query refers to. A query with no usable token (only
 * stop-words) matches nothing — never "everyone".
 */
export function matchPeopleByName<T>(
  query: string,
  candidates: readonly NamedCandidate<T>[],
): T[] {
  const q = nameTokens(query).filter((t) => !STOP.has(t) && t.length >= 2);
  if (q.length === 0) return [];
  const scored: { item: T; hits: number; score: number }[] = [];
  for (const c of candidates) {
    const names = nameTokens(c.name);
    let hits = 0;
    let score = 0;
    for (const qt of q) {
      const hit = names.find((nt) => tokensMatch(qt, nt));
      if (hit) {
        hits += 1;
        score += hit === qt ? 2 : 1;
      }
    }
    if (hits > 0) scored.push({ item: c.item, hits, score });
  }
  // A verb or filler in the sentence ("parasyk") matches nobody and is ignored;
  // when a surname narrows the reference, only the people it fits remain.
  const best = scored.reduce((m, s) => Math.max(m, s.hits), 0);
  return scored
    .filter((s) => s.hits === best)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.item);
}
