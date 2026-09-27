import { locales } from "@/lib/i18n/config";

/**
 * A PROFESSION IN THE PERSON'S OWN WORDS — the one place that decides how it is
 * read, stored and shown. PURE: no React, no Supabase, no IO.
 *
 * WHY THIS EXISTS. `worker_professions` now holds three kinds of row (ledger
 * 20260927060325 / 20260927062927): a registry profession, the person's own
 * words, or their words with a standardized link. Four surfaces have to agree
 * about what to display and what to store — onboarding, the profile, the
 * Living CV and the ŠIANDIEN line — and the moment they each decide for
 * themselves, one of them starts showing something different from the others.
 *
 * WHAT IT REFUSES TO DO. It never guesses a profession, never detects a
 * language from the text, and never rewrites what the person typed. The only
 * normalization is removing whitespace around the words, which is not a change
 * to them; the words themselves are stored and shown exactly as given.
 */

/** Bounds mirroring the database CHECK `char_length(btrim(label)) between 2 and 200`. */
export const SELF_DECLARED_PROFESSION_MIN_LENGTH = 2;
export const SELF_DECLARED_PROFESSION_MAX_LENGTH = 200;

/**
 * How many self-declared professions one submission may carry. Request
 * hygiene, NOT a product rule: a person may hold 0, 1 or N, and nothing in the
 * product caps how many they accumulate over time. This only stops a single
 * hand-crafted POST from asking for an unbounded row insert.
 */
export const SELF_DECLARED_PROFESSION_MAX_PER_SUBMIT = 20;

/**
 * The person's words, ready to store: outer whitespace removed, nothing else
 * touched. `null` when there is nothing storable — too short, too long, or
 * blank. Inner spacing, capitalisation, punctuation and spelling are theirs.
 */
export function normalizeSelfDeclaredProfession(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const words = raw.trim();
  if (words.length < SELF_DECLARED_PROFESSION_MIN_LENGTH) return null;
  if (words.length > SELF_DECLARED_PROFESSION_MAX_LENGTH) return null;
  return words;
}

/**
 * The dedupe key for a label, matching the database's generated
 * `normalized_label` (`lower(btrim(label))`).
 *
 * `btrim` strips spaces and `String.prototype.trim` strips all whitespace, so
 * the two could in principle disagree — they cannot here, because every label
 * is stored through `normalizeSelfDeclaredProfession` and therefore already
 * carries no surrounding whitespace of any kind, leaving `btrim` nothing to do.
 */
export function selfDeclaredProfessionKey(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * THE LANGUAGE TO RECORD with the words: the real locale of the session that
 * submitted them, when it is one the product actually serves.
 *
 * Never detected from the text and never defaulted. An absent or unrecognised
 * locale records NOTHING — an unknown language stays unknown (SEP-7: UNKNOWN ≠
 * a value), which is exactly why the column is nullable. Note that the
 * onboarding action's own `locale` variable falls back to "lt" for the profile
 * row; that fallback must never reach this function, or it would put a
 * language on words nobody claimed to write in Lithuanian.
 */
export function recordableInputLanguage(
  locale: string | null | undefined,
): string | null {
  if (typeof locale !== "string") return null;
  const code = locale.trim().toLowerCase();
  return (locales as readonly string[]).includes(code) ? code : null;
}

/** One of a person's professions, as any surface receives it. */
export type ProfessionEntry = {
  /** Registry slug when the person picked a catalogue profession. */
  readonly slug: string | null;
  /** The person's own words when the registry does not carry what they do. */
  readonly label: string | null;
};

/**
 * WHAT TO SHOW for one entry: the localized registry name, or — when there is
 * none — the person's own words, exactly as they typed them.
 *
 * `translateSlug` returns `null` for a slug the catalogue cannot name, so a
 * stale slug degrades to the words (usually absent, hence `null`) rather than
 * rendering a raw slug at a person.
 */
export function professionDisplayName(
  entry: ProfessionEntry,
  translateSlug: (slug: string) => string | null,
): string | null {
  if (entry.slug) {
    const name = translateSlug(entry.slug);
    if (name && name.trim()) return name;
  }
  const own = (entry.label ?? "").trim();
  return own.length > 0 ? own : null;
}

/**
 * The self-declared labels a form carries, as ONE field both halves agree on.
 * JSON rather than a delimiter, because a person's words may contain commas
 * ("Pastolininkas, aukštalipis") and a delimiter would cut them in half.
 */
export function serializeSelfDeclaredProfessions(
  labels: readonly string[],
): string {
  return JSON.stringify(labels);
}

/**
 * Read that field back: normalized, deduped by the database's own key, capped,
 * and order-preserving. Never throws — a malformed value yields nothing rather
 * than failing a signup.
 */
export function parseSelfDeclaredProfessions(
  raw: string | null | undefined,
): string[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    const words = normalizeSelfDeclaredProfession(item);
    if (!words) continue;
    const key = selfDeclaredProfessionKey(words);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(words);
    if (out.length >= SELF_DECLARED_PROFESSION_MAX_PER_SUBMIT) break;
  }
  return out;
}
