/**
 * De-identification for the owner's Living CV screens (`prod-living-cv-screens`).
 *
 * The walk reads real production pages through a read-only synthetic account. Before a page
 * renders, every same-origin document, RSC and fetch body is rewritten so that no real person
 * name, and no client or partner company name, reaches the browser. The names are learned at
 * runtime and held in memory only: nothing here is ever written to the repository, a log or an
 * artefact.
 *
 * Each replacement has EXACTLY the byte length of the original token. A React Flight text row
 * (`<id>:T<hex byte length>,<text>`) states the byte length of its text, so a replacement of any
 * other length would corrupt the stream and break the page. Pure ASCII of the same UTF-8 byte
 * length keeps every format the server sends intact: HTML, the flight payload embedded in it,
 * RSC responses and JSON.
 */

const LETTER = /\p{L}/u;

/** The parts of a name that identify a person: whole words of three or more characters. */
export function nameTokens(name: string): string[] {
  return name
    .split(/[\s,;/()·|]+/u)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((t) => [...t].length >= 3 && LETTER.test(t));
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

export interface Pseudonyms {
  /** original token → its replacement (same UTF-8 byte length, ASCII). */
  readonly map: ReadonlyMap<string, string>;
  /** every original token, for the leak check. */
  readonly tokens: readonly string[];
}

/**
 * People become "Darbuotojas A", "Darbuotojas B" …; client and partner companies become
 * "Uzsakovas 1", "Uzsakovas 2" … (cut to each token's byte length). Tokens of the organizations
 * the owner chose to show (`keep`) are never replaced. A token shared by a person and a company
 * is treated as a person's.
 */
export function buildPseudonyms(people: readonly string[], companies: readonly string[], keep: readonly string[]): Pseudonyms {
  const kept = new Set(keep.flatMap(nameTokens).map((t) => t.toLocaleLowerCase("lt")));
  const map = new Map<string, string>();
  const add = (token: string, label: string, tag: string) => {
    if (map.has(token) || kept.has(token.toLocaleLowerCase("lt"))) return;
    map.set(token, sameBytes(label, tag, Buffer.byteLength(token, "utf8")));
  };
  const uniquePeople = [...new Set(people.map((p) => p.trim()).filter(Boolean))];
  uniquePeople.forEach((name, i) => {
    for (const t of nameTokens(name)) add(t, "Darbuotojas", letterOf(i));
  });
  const uniqueCompanies = [...new Set(companies.map((c) => c.trim()).filter(Boolean))];
  uniqueCompanies.forEach((name, i) => {
    for (const t of nameTokens(name)) add(t, "Uzsakovas", String(i + 1));
  });
  return { map, tokens: [...map.keys()] };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One pattern for every token: whole words only, longest first. */
export function tokenPattern(tokens: readonly string[]): RegExp | null {
  if (tokens.length === 0) return null;
  const alternation = [...tokens].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternation})(?![\\p{L}\\p{N}])`, "gu");
}

/** Replace every token in a body. The byte length of the body never changes. */
export function rewrite(body: string, p: Pseudonyms): string {
  const re = tokenPattern(p.tokens);
  if (!re) return body;
  return body.replace(re, (m) => p.map.get(m) ?? m);
}

/** How many original tokens remain in a text. A count, never the text. */
export function leakCount(text: string, tokens: readonly string[]): number {
  const re = tokenPattern(tokens);
  if (!re) return 0;
  return [...text.matchAll(re)].length;
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
