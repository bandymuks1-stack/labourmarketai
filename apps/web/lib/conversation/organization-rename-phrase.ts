/**
 * THE NEW NAME, READ OUT OF THE SENTENCE — pure, client-safe, no IO.
 *
 * "Pervadink šią agentūrą į Nonstop Group UAB." / "Pas mane yra agentūra be
 * pavadinimo. Pervadink ją Nonstop Group UAB." / "rename my company to Nonstop
 * Group UAB" — the person already said the name. Chat-first rule: never ask
 * for a fact the sentence carries. This reads it so the confirm form opens
 * PREFILLED; it never writes, and the person still sees, edits and confirms
 * the value before anything is saved.
 *
 * ── It keeps the ORIGINAL CASING ─────────────────────────────────────────
 * The router folds a sentence to lower-case base letters to MATCH it; a name
 * must be read from what was actually typed, or "Nonstop Group UAB" would be
 * offered back as "nonstop group uab". Every regex below therefore runs on
 * the raw text, case-insensitively, with the diacritic and non-diacritic
 * spellings written out — and a Unicode-letter look-around instead of `\b`,
 * which is ASCII-only in JavaScript (it misfires beside ą, ė, ž and Cyrillic).
 *
 * ── How the name is found, in order ──────────────────────────────────────
 *   1. A QUOTED span wins: „X“, “X”, "X", «X».
 *   2. After the rename verb, the first TARGET marker introduces the name:
 *      lt `į` (also typed `i`), en `to`/`into`, ru `в`/`во`/`на`, nl `naar`,
 *      pl `na`, de `zu`/`auf` — and `in` only after a German or Dutch verb
 *      ("Benenne meine Firma in X um", "wijzig de naam in X"), because in
 *      English "in" introduces a place, not a name.
 *   3. A colon: "Agentūros pavadinimas: X".
 *   4. Otherwise the name is where the CAPITALISED run starts after the verb
 *      ("Pervadink ją Nonstop Group UAB") — pronouns and nouns the person
 *      typed in lower case are skipped.
 * Nothing found → `null`, and the form opens empty. It never guesses a name.
 */

/** The same bounds the canonical save enforces (`save_company_setup_v3`). */
export const RENAME_NAME_MIN = 2;
export const RENAME_NAME_MAX = 200;

/** A letter or digit on neither side — a Unicode-safe word edge. */
const L = "[\\p{L}\\p{N}]";

/**
 * The verbs across the six routed locales, in TWO tiers. Deliberately the
 * verbs only: which ORGANISATION is meant is the router's and the server's
 * question, not this reader's.
 *
 * A RENAME verb is looked for first, anywhere in the sentence, because a
 * sentence may open with an unrelated word that looks like a weaker verb —
 * "PAS mane yra agentūra be pavadinimo. Pervadink ją …" starts with the
 * Lithuanian preposition `pas`, which is also the Dutch verb in "pas aan".
 * Only when no rename verb exists does a CHANGE verb ("pakeisk … pavadinimą",
 * "change the company name") anchor the search.
 */
const RENAME_VERBS = [
  "pervadin", // lt
  "renam", // en
  "переимен", // ru
  "hernoem", // nl
  "umbenenn", "benenn", // de — "umbenennen", "Benenne … in X um"
  "przemianuj", "nazwij", // pl
] as const;

const CHANGE_VERBS = [
  // lt
  "pakei", "keis", "atnaujin", "pataisy", "nustaty", "nurody", "suteik",
  // en
  "change", "update", "set", "edit", "correct",
  // ru
  "смени", "измени", "поменя", "обнови", "исправ", "установ",
  // nl
  "wijzig", "verander",
  // de — `ander` alone is left out: it is also "andere" (another).
  "änder", "aender", "aktualisier", "korrigier",
  // pl
  "zmień", "zmien", "popraw", "ustaw",
] as const;

const verbRe = (stems: readonly string[]): RegExp =>
  new RegExp(`(?<!${L})(${stems.join("|")})\\p{L}*(?!${L})`, "iu");

const RENAME_VERB_RE = verbRe(RENAME_VERBS);
const CHANGE_VERB_RE = verbRe(CHANGE_VERBS);

/** Verbs after which `in` introduces the new name (German / Dutch usage). */
const IN_TAKES_NAME = /^(hernoem|wijzig|verander|umbenenn|benenn|änder|aender)/iu;

/** Markers that introduce the target name, compared lower-cased. */
const MARKERS: ReadonlySet<string> = new Set(["į", "to", "into", "в", "во", "на", "naar", "na", "zu", "auf"]);

/** Paired quotes. Single quotes are left out on purpose: an apostrophe is
 *  part of real names ("O'Brien Ltd"). */
const QUOTED_RE = /[„“"«]\s*([^„“”"«»\n]{2,200}?)\s*[“”"»]/u;

const TRAILING_POLITE_RE =
  /[,\s]+(prašau|prasau|please|bitte|пожалуйста|alsjeblieft|alstublieft|proszę|prosze)$/iu;

/** Tidy a candidate: one line, no trailing punctuation, no separable `um`. */
function clean(raw: string): string | null {
  let name = raw.split(/\r?\n/)[0] ?? "";
  name = name.trim();
  // German separable verb: "Benenne meine Firma in X um".
  name = name.replace(/\s+um[.!…]*$/iu, "");
  name = name.replace(TRAILING_POLITE_RE, "");
  // A legal form written with dots ("Sp. z o.o.", "s.r.o.", "a.s.") keeps its
  // final dot — it is part of the name, not the end of the sentence.
  const legalFormDot = /(?:^|\s)(?:\p{L}{1,4}\.){2,}$/u.test(name);
  name = name.replace(legalFormDot ? /[\s!?…;,]+$/u : /[\s.!?…;,]+$/u, "").trim();
  // A name that is still wrapped in quotes (a half-typed pair) loses them.
  name = name.replace(/^[„“"«]+|[“”"»]+$/gu, "").trim();
  if (name.length < RENAME_NAME_MIN || name.length > RENAME_NAME_MAX) return null;
  if (!/[\p{L}\p{N}]/u.test(name)) return null;
  return name;
}

/** Does this token open a name — an upper-case letter or a digit first? */
function opensName(token: string): boolean {
  const first = token.replace(/^[„“"«(]+/u, "").charAt(0);
  if (!first) return false;
  if (/\p{N}/u.test(first)) return true;
  return first === first.toLocaleUpperCase() && first !== first.toLocaleLowerCase();
}

/**
 * Read the organisation's NEW name out of a rename sentence, keeping the
 * casing the person typed. `null` when the sentence does not carry one.
 */
export function readRenameTarget(text: string): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;

  const quoted = QUOTED_RE.exec(raw);
  if (quoted?.[1]) {
    const name = clean(quoted[1]);
    if (name) return name;
  }

  const verb = RENAME_VERB_RE.exec(raw) ?? CHANGE_VERB_RE.exec(raw);
  const tail = verb ? raw.slice(verb.index + verb[0].length) : raw;
  const inTakesName = verb ? IN_TAKES_NAME.test(verb[1] ?? "") : false;

  // 2. The first target marker after the verb.
  if (verb) {
    const tokens = [...tail.matchAll(/\S+/gu)];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i]![0];
      const bare = token.replace(/[.,;:!?]+$/u, "");
      const lower = bare.toLocaleLowerCase();
      // `i` is Lithuanian `į` typed without the diacritic — but only in lower
      // case, because the English pronoun is always written "I".
      const isMarker =
        MARKERS.has(lower) || bare === "i" || (inTakesName && lower === "in");
      if (!isMarker) continue;
      const next = tokens[i + 1];
      if (!next || next.index === undefined) return null;
      return clean(tail.slice(next.index));
    }
  }

  // 3. A colon: "Agentūros pavadinimas: X".
  const colon = tail.indexOf(":");
  if (colon >= 0) {
    const name = clean(tail.slice(colon + 1));
    if (name) return name;
  }

  // 4. The capitalised run after the verb.
  if (!verb) return null;
  for (const m of tail.matchAll(/\S+/gu)) {
    if (m.index === undefined) continue;
    if (opensName(m[0])) return clean(tail.slice(m.index));
  }
  return null;
}
