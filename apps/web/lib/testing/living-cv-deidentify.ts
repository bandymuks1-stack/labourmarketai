import { redactContactData } from "../vacancy-store/vacancy-redaction";

/**
 * De-identification for the owner's Living CV screens (`prod-living-cv-screens`).
 *
 * The walk reads real production pages through a read-only synthetic account. The names it must
 * hide are learned at runtime and held in memory only: nothing here is ever written to the
 * repository, a log or an artefact. There are two layers:
 *
 * 1. NETWORK, before rendering (`rewrite`). Every same-origin document, RSC and fetch body is
 *    rewritten on its way to the browser. Each roster name is matched with its Lithuanian case
 *    endings (Linas, Lino, Linui; Ramūnas, Ramūno), in its stored capitalisation and in capitals.
 *    E-mail addresses, international phone numbers and personal codes are masked too. Every
 *    replacement has EXACTLY the byte length of what it replaces, because a React Flight text
 *    row (`<id>:T<hex byte length>,<text>`) states its byte length and any other length would
 *    corrupt the stream. This layer stays case-sensitive so it never touches markup or code
 *    (`<link`, `line-height`).
 *
 * 2. RENDERED TEXT, before each screenshot (`maskFreeText`). Every visible text node and field
 *    value is masked again, case-insensitively: roster names with their endings, contact data
 *    (the platform's own `redactContactData`), personal codes, and every other capitalised word
 *    that is not a word of the product's own catalogues (interface, professions, skills) or one of
 *    the two organizations the owner chose to show. Such a word becomes "[…]". Over-masking is
 *    accepted; under-masking is the failure.
 *
 * After both, `leakCount` checks the whole document. One roster token left means no screenshot.
 */

const LETTER = /\p{L}/u;

/** Lithuanian name endings, longest first (nominative and the oblique cases a name takes). */
export const LT_NAME_ENDINGS: readonly string[] = [
  "ienėms", "ienėse", "aitėms", "ytėms", "utėms", "ūtėms",
  "ienės", "ienei", "ienėj", "ienę", "iene", "ienė",
  "aitės", "aitei", "aitę", "aite", "aitė",
  "ytės", "ytei", "ytę", "yte", "ytė",
  "utės", "utei", "utę", "ute", "utė",
  "ūtės", "ūtei", "ūtę", "ūte", "ūtė",
  "iumi", "iaus", "iams", "iuose",
  "ams", "ais", "uose", "oje", "ose", "ioje", "iai", "iui", "ius", "iam", "ių",
  "ėms", "ėse", "ės", "ei", "ę", "ėj", "ė",
  "as", "is", "ys", "us", "os", "aus", "ui", "io", "iu", "ią", "ia", "ai", "ą", "į", "ų", "ū",
  "o", "u", "a", "e", "y", "i",
];
const ENDINGS_ALT = [...LT_NAME_ENDINGS].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
const ENDINGS_UPPER_ALT = [...LT_NAME_ENDINGS]
  .map((e) => e.toLocaleUpperCase("lt"))
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

/** The parts of a name that identify a person: whole words of three or more characters. */
export function nameTokens(name: string): string[] {
  return name
    .split(/[\s,;/()·|]+/u)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((t) => [...t].length >= 3 && LETTER.test(t));
}

/** The token without its Lithuanian ending, when at least three letters remain. */
export function stemOf(token: string): string {
  const lower = token.toLocaleLowerCase("lt");
  for (const e of [...LT_NAME_ENDINGS].sort((a, b) => b.length - a.length)) {
    if (lower.endsWith(e) && [...token].length - [...e].length >= 3) return [...token].slice(0, [...token].length - [...e].length).join("");
  }
  return token;
}

/** ASCII `label` cut or padded to exactly `bytes` bytes, always ending with `tag`. */
export function sameBytes(label: string, tag: string, bytes: number): string {
  if (bytes <= tag.length) return tag.slice(tag.length - bytes);
  const body = bytes - tag.length;
  const head = label.length >= body ? label.slice(0, body) : label + "_".repeat(body - label.length);
  return head + tag;
}

/** A, B, …, Z, AA, AB, … */
export function letterOf(i: number): string {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

interface Entry {
  readonly token: string;
  readonly stem: string;
  readonly label: string;
  readonly tag: string;
}

export interface Pseudonyms {
  readonly entries: readonly Entry[];
  /** every original token, for the leak check (never printed). */
  readonly tokens: readonly string[];
  /** the tokens of the organizations the owner chose to show, lower-cased. */
  readonly kept: ReadonlySet<string>;
  /** every replacement the rewrite has produced, so the text pass leaves them alone. */
  readonly emitted: Set<string>;
}

/**
 * People become "Darbuotojas A", "Darbuotojas B" …; client and partner companies become
 * "Uzsakovas 1", "Uzsakovas 2" … (cut to each match's byte length). Tokens of the organizations
 * the owner chose to show (`keep`) are never replaced. A token shared by a person and a company
 * is treated as a person's.
 */
export function buildPseudonyms(people: readonly string[], companies: readonly string[], keep: readonly string[]): Pseudonyms {
  const kept = new Set(keep.flatMap(nameTokens).map((t) => t.toLocaleLowerCase("lt")));
  const entries: Entry[] = [];
  const seen = new Set<string>();
  const add = (token: string, label: string, tag: string) => {
    const key = token.toLocaleLowerCase("lt");
    if (seen.has(key) || kept.has(key)) return;
    seen.add(key);
    entries.push({ token, stem: stemOf(token), label, tag });
  };
  [...new Set(people.map((p) => p.trim()).filter(Boolean))].forEach((name, i) => {
    for (const t of nameTokens(name)) add(t, "Darbuotojas", letterOf(i));
  });
  [...new Set(companies.map((c) => c.trim()).filter(Boolean))].forEach((name, i) => {
    for (const t of nameTokens(name)) add(t, "Uzsakovas", String(i + 1));
  });
  return { entries, tokens: entries.map((e) => e.token), kept, emitted: new Set() };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BOUND_L = "(?<![\\p{L}\\p{N}])";
const BOUND_R = "(?![\\p{L}\\p{N}])";

/**
 * Every roster token with its endings, whole words only, longest stems first.
 * `caseInsensitive` false: the stored capitalisation and all capitals (safe for markup).
 */
export function rosterPattern(p: Pseudonyms, caseInsensitive: boolean): RegExp | null {
  if (p.entries.length === 0) return null;
  const forms = new Set<string>();
  for (const e of [...p.entries].sort((a, b) => b.stem.length - a.stem.length)) {
    forms.add(`${escapeRegExp(e.stem)}(?:${ENDINGS_ALT})?`);
    forms.add(`${escapeRegExp(e.token)}`);
    if (!caseInsensitive) forms.add(`${escapeRegExp(e.stem.toLocaleUpperCase("lt"))}(?:${ENDINGS_UPPER_ALT})?`);
  }
  return new RegExp(`${BOUND_L}(?:${[...forms].join("|")})${BOUND_R}`, caseInsensitive ? "giu" : "gu");
}

function entryFor(p: Pseudonyms, match: string): Entry | undefined {
  const m = match.toLocaleLowerCase("lt");
  let best: Entry | undefined;
  for (const e of p.entries) {
    const s = e.stem.toLocaleLowerCase("lt");
    if (m.startsWith(s) && (!best || s.length > best.stem.length)) best = e;
  }
  return best;
}

/** Contact data and personal codes inside a raw body: masked with the same byte length. */
const BODY_CONTACT: readonly RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /\+\d[\d ().-]{6,}\d/g,
  /(?<!\d)[3-6]\d{10}(?!\d)/g, // Lithuanian personal code (asmens kodas)
];

function maskSameLength(s: string): string {
  return s.replace(/[^@.\s]/g, "x");
}

/** Network layer: replace every roster form and mask contact data. The byte length never changes. */
export function rewrite(body: string, p: Pseudonyms): string {
  let out = body;
  const re = rosterPattern(p, false);
  if (re) {
    out = out.replace(re, (m) => {
      if (p.kept.has(m.toLocaleLowerCase("lt"))) return m;
      const e = entryFor(p, m);
      if (!e) return m;
      const r = sameBytes(e.label, e.tag, Buffer.byteLength(m, "utf8"));
      p.emitted.add(r);
      return r;
    });
  }
  for (const c of BODY_CONTACT) out = out.replace(c, maskSameLength);
  return out;
}

const MASK = "[…]";

/**
 * Street addresses inside free text (run 45401396990 let "…laan" and "…straat35" through in the
 * history card descriptions). A street word, by its suffix or by a street abbreviation next to a
 * name, is masked together with the house number written after it or glued to it. Dutch, German,
 * Lithuanian and Polish forms; over-masking is accepted.
 */
const HOUSE_NO = String.raw`(?:\s*\d+[a-z]?(?:\s*[-/]\s*\d+[a-z]?)?)?`;
const STREET_SUFFIX = String.raw`(?:straat|str\.|laan|weg|gracht|plein|kade|dreef|singel|steeg|hof|strasse|straße|gatvė|gatve|takas|aikštė|skveras)`;
const ADDRESS_PATTERNS: readonly RegExp[] = [
  // "Van Eedenlaan 12", "Keizersgracht35", "Vredenburgstraat 7a", "Kade 3", "Gedimino gatvė 9".
  new RegExp(String.raw`(?<![\p{L}\p{N}])[\p{L}'’-]*${STREET_SUFFIX}${HOUSE_NO}(?![\p{L}\p{N}])`, "giu"),
  // "ul. Marszałkowska 102/4", "ulica Długa 5", "al. Jerozolimskie 1".
  new RegExp(String.raw`(?<![\p{L}\p{N}])(?:ul\.|ulica|al\.|aleja|os\.|pl\.)\s*[\p{L}'’.-]+(?:\s+[\p{L}'’.-]+)?${HOUSE_NO}(?![\p{L}\p{N}])`, "giu"),
  // "Vilniaus g. 12", "Laisvės al. 5", "Konstitucijos pr. 7".
  new RegExp(String.raw`(?<![\p{L}\p{N}])[\p{L}'’-]+\s+(?:g\.|al\.|pr\.|skg\.|pl\.)${HOUSE_NO}(?![\p{L}\p{N}])`, "giu"),
];
const PERSONAL_CODE = /(?<!\d)[3-6]\d{10}(?!\d)/g;
const CAPITALISED = /(?<![\p{L}\p{N}])\p{Lu}[\p{L}'’-]{2,}(?![\p{L}\p{N}])/gu;

/**
 * Rendered-text layer, for one visible text or field value. `allow` holds lower-cased words that
 * are never names: the product's own catalogue words.
 */
export function maskFreeText(text: string, p: Pseudonyms, allow: ReadonlySet<string>): string {
  let out = text;
  const re = rosterPattern(p, true);
  if (re) out = out.replace(re, (m) => (p.emitted.has(m) || p.kept.has(m.toLocaleLowerCase("lt")) ? m : MASK));
  out = redactContactData(out).text.replace(/\[\[\d+\]\]/g, MASK);
  for (const re of ADDRESS_PATTERNS) out = out.replace(re, MASK);
  out = out.replace(PERSONAL_CODE, MASK);
  out = out.replace(CAPITALISED, (w) => {
    if (p.emitted.has(w)) return w;
    const lower = w.toLocaleLowerCase("lt");
    if (allow.has(lower) || p.kept.has(lower)) return w;
    // Hyphenated words are fine when every part is a catalogue word.
    if (w.includes("-") && w.split("-").every((part) => allow.has(part.toLocaleLowerCase("lt")) || p.kept.has(part.toLocaleLowerCase("lt")))) return w;
    return MASK;
  });
  return out;
}

/**
 * The words a catalogue uses in LOWER CASE somewhere. A catalogue's example names ("Jonas",
 * "John") are only ever written capitalised, so they never enter the list, while an interface
 * word that opens a heading ("Projektai") also appears in lower case elsewhere. A word the
 * catalogues only ever capitalise is masked: over-masking is accepted.
 */
export function catalogueWords(json: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof json === "string") {
    // Example addresses and links ("jonas@example.com") are not words.
    const text = json.replace(/\S+@\S+|\bhttps?:\/\/\S+|\bwww\.\S+/gu, " ");
    for (const w of text.match(/[\p{L}][\p{L}'’-]*/gu) ?? []) {
      for (const part of w.split("-")) {
        if (part && part === part.toLocaleLowerCase("lt")) into.add(part);
      }
      if (w === w.toLocaleLowerCase("lt")) into.add(w);
    }
  } else if (Array.isArray(json)) {
    for (const v of json) catalogueWords(v, into);
  } else if (json && typeof json === "object") {
    for (const v of Object.values(json)) catalogueWords(v, into);
  }
  return into;
}

/** How many roster tokens remain in a text. A count, never the text. */
export function leakCount(text: string, p: Pseudonyms, caseInsensitive: boolean): number {
  const re = rosterPattern(p, caseInsensitive);
  if (!re) return 0;
  return [...text.matchAll(re)].filter((m) => !p.emitted.has(m[0]) && !p.kept.has(m[0].toLocaleLowerCase("lt"))).length;
}

/** Response bodies the rewrite reads: text the page renders from. */
export function isRewritableContentType(contentType: string | undefined): boolean {
  const ct = (contentType ?? "").toLowerCase();
  return /text\/html|text\/x-component|application\/json|text\/plain|application\/x-ndjson/.test(ct);
}

/**
 * A PNG with only the chunks that draw the picture: IHDR, PLTE, tRNS, IDAT, IEND. Text, time,
 * EXIF, colour-profile and every other ancillary chunk is dropped.
 */
export function stripPngMetadata(png: Buffer): Buffer {
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 8 || !png.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  const keep = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
  const parts: Buffer[] = [SIGNATURE];
  let at = 8;
  while (at + 12 <= png.length) {
    const len = png.readUInt32BE(at);
    const type = png.toString("latin1", at + 4, at + 8);
    const end = at + 12 + len;
    if (end > png.length) throw new Error("truncated PNG");
    if (keep.has(type)) parts.push(png.subarray(at, end));
    at = end;
    if (type === "IEND") break;
  }
  return Buffer.concat(parts);
}
