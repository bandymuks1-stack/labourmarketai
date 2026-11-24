import { normalizeLabel, type ResolveEntity } from "@/lib/timesheet-import/resolve-entities";
import { tidy } from "./source-rows";

/**
 * WORK CONTEXT — what a source's "object" cell and its work text actually
 * name. Pure: strings in, structured interpretation out. No IO, no clock.
 *
 * The owner's real file (2026-09-16) writes one cell per person-day and puts
 * EVERY place of that day in it: `Hoofdgracht 3; Kantoor`,
 * `Hoofdgracht 1; Hoofdgracht 3; Hoofdgracht 13; Kantoor`. The same column
 * also carries things that are not places at all (`Administraciniai/
 * koordinavimo darbai` is an activity, `2 uur - garantie` is a duration
 * note), and 23 rows name their site only as the first words of the work
 * text, misspelled (`Hoofdgraht 13`, `Hofdracht3`, `Anna Franklin 16`).
 *
 * Read as one label, that cell became 37 "objects", most of them composite
 * garbage, and the 23 rows lost their site. This module is the reading the
 * source deserves (owner command §5–§7):
 *
 *   split       `A; B` is TWO contexts, never an object called "A; B";
 *   classify    a place, an activity or a duration note — decided by the
 *               words, not by which column they sat in;
 *   resolve     against what the organization already has AND against the
 *               file's own most frequent spelling — same house number
 *               required to merge, different numbers NEVER merge;
 *   extract     the site from the leading words of the work text when the
 *               object cell is empty;
 *   allocate    per-place hours when the text states them (`(7 uur)`,
 *               `2,5 uur`), and `unknown_split` when it does not — a total
 *               is never divided by guess.
 *
 * Everything here is DERIVED and says so: each result carries a method slug
 * and a confidence. Source spelling is preserved on every segment. Genuine
 * ambiguity (several candidates) is returned as a question, never decided.
 */

// ── segments ────────────────────────────────────────────────────────────────

export type ContextSegmentKind = "place" | "activity" | "note";

export interface ContextSegment {
  /** The source spelling, whitespace-tidied. */
  readonly label: string;
  readonly kind: ContextSegmentKind;
  /** `normalizeLabel(label)` — the comparison key. */
  readonly key: string;
  /** For a place: the street words without the house number, folded. */
  readonly street: string | null;
  /** For a place: the house number as written (`3`, `12a`), lower-cased. */
  readonly number: string | null;
}

/** A duration written as a figure and a unit, in any of the source
 *  languages (`2 uur`, `7 val`, `1.5 h`, `2,5 Std`). */
const DURATION_RE = /(?:^|[\s(])(\d{1,3}(?:[.,]\d{1,2})?)\s*(uur|u|val|h|hrs|hours|std|godz|час|ч)\b\.?/iu;

/** Words that make a segment an ACTIVITY rather than a place. Deliberately
 *  short and deterministic: a word that names work in the source languages.
 *  Matching is on folded whole words. */
const ACTIVITY_WORDS: readonly string[] = [
  "darbai", "darbas", "darbu", "darbo",
  "koordinavimo", "koordinavimas", "administraciniai", "administravimas",
  "werk", "werken", "werkzaamheden", "work", "works",
  "administratie", "coordinatie", "administration", "coordination",
  "arbeit", "arbeiten", "verwaltung", "koordination",
  "prace", "praca", "administracja", "koordynacja",
  "rabota", "raboty", "administrirovanie", "koordinaciya",
];

/** `A; B` → [`A`, `B`]. Semicolons and line breaks separate contexts; a
 *  slash does not (`Administraciniai/koordinavimo darbai` is one label).
 *  Duplicates within one cell collapse to the first spelling. */
export function splitContextLabel(label: string | null | undefined): readonly string[] {
  if (!label) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of label.split(/[;\n\r]+/)) {
    const clean = tidy(part);
    if (clean === "") continue;
    const key = normalizeLabel(clean);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/** The street words and the trailing house number of a place label, on the
 *  folded key. `Hofdracht3` → { street: "hofdracht", number: "3" };
 *  `2e Nieuwstraat` → { street: "2e nieuwstraat", number: null }. */
export function placeParts(key: string): { street: string | null; number: string | null } {
  const m = /^(.*?\p{L})\s*(\d{1,4}[a-z]?)$/u.exec(key);
  if (m) return { street: m[1].trim(), number: m[2] };
  return { street: key === "" ? null : key, number: null };
}

export function classifySegment(label: string): ContextSegmentKind {
  if (DURATION_RE.test(label)) return "note";
  const words = normalizeLabel(label).split(" ");
  if (words.some((w) => ACTIVITY_WORDS.includes(w))) return "activity";
  return "place";
}

export function toSegment(label: string): ContextSegment {
  const clean = tidy(label);
  const kind = classifySegment(clean);
  const key = normalizeLabel(clean);
  if (kind !== "place") return { label: clean, kind, key, street: null, number: null };
  const parts = placeParts(key);
  return { label: clean, kind, key, street: parts.street, number: parts.number };
}

/** One source cell → its contexts. */
export function segmentsOf(label: string | null | undefined): readonly ContextSegment[] {
  return splitContextLabel(label).map(toSegment);
}

// ── similarity ──────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 = identical, 0 = nothing in common. On folded, space-free text so a
 *  missing space (`Hofdracht3`) does not count against a spelling. */
export function similarity(a: string, b: string): number {
  const x = a.replace(/\s+/g, "");
  const y = b.replace(/\s+/g, "");
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(x, y) / longest;
}

/** Below this a street spelling is a different street, not a typo. */
export const TYPO_SIMILARITY_FLOOR = 0.6;
/** A street named without its number matches a numbered place only when the
 *  street itself is (near-)identical. */
export const STREET_ONLY_SIMILARITY_FLOOR = 0.85;

// ── resolution ──────────────────────────────────────────────────────────────

/** A place the resolver may match against: an existing work object (`id`
 *  set) or the file's own canonical spelling of a place it names on other
 *  rows (`id: null` — it does not exist yet; the plan will create it). */
export interface KnownPlace {
  readonly id: string | null;
  readonly name: string;
}

export type PlaceResolution =
  | {
      readonly kind: "matched";
      readonly place: KnownPlace;
      readonly confidence: 1;
      readonly method: "exact_label";
    }
  | {
      readonly kind: "proposed";
      readonly place: KnownPlace;
      readonly confidence: number;
      readonly method: "typo_same_house_number" | "street_without_number" | "near_identical_name";
    }
  | { readonly kind: "ambiguous"; readonly candidates: readonly KnownPlace[] }
  | { readonly kind: "new" };

const MAX_CANDIDATES = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Resolve one PLACE segment. Deterministic, in this order:
 *   1. the same folded label → matched;
 *   2. a house number on both sides: the SAME number and a street spelling
 *      within typo distance → proposed (`Hoofdgraht 13` → `Hoofdgracht 13`);
 *      a different number is never a candidate (`Hoofdgracht 3` ≠ `… 5`);
 *   3. no number on the segment: a single known place on the same street →
 *      proposed at low confidence (`Travers` → `Travers 19`); several →
 *      ambiguous (`Hoofdgracht` among 1/3/5/13);
 *   4. a non-address name within near-identical distance → proposed;
 *   5. nothing → new.
 * More than one candidate at any step is a QUESTION, returned as such.
 */
export function resolvePlace(segment: ContextSegment, known: readonly KnownPlace[]): PlaceResolution {
  if (segment.kind !== "place" || segment.key === "") return { kind: "new" };

  const exact = known.filter((k) => normalizeLabel(k.name) === segment.key);
  if (exact.length === 1) return { kind: "matched", place: exact[0], confidence: 1, method: "exact_label" };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact.slice(0, MAX_CANDIDATES) };

  const scored = known.map((k) => {
    const parts = placeParts(normalizeLabel(k.name));
    return { place: k, ...parts };
  });

  if (segment.number !== null && segment.street !== null) {
    const street = segment.street;
    const sameNumber = scored
      .filter((k) => k.number === segment.number && k.street !== null)
      .map((k) => ({ place: k.place, sim: similarity(street, k.street as string) }))
      .filter((k) => k.sim >= TYPO_SIMILARITY_FLOOR)
      .sort((a, b) => b.sim - a.sim);
    if (sameNumber.length === 1) {
      return {
        kind: "proposed",
        place: sameNumber[0].place,
        confidence: round2(Math.min(0.9, sameNumber[0].sim)),
        method: "typo_same_house_number",
      };
    }
    if (sameNumber.length > 1) {
      return { kind: "ambiguous", candidates: sameNumber.slice(0, MAX_CANDIDATES).map((s) => s.place) };
    }
    return { kind: "new" };
  }

  // No number on the segment.
  const street = segment.street ?? segment.key;
  const sameStreet = scored
    .filter((k) => k.street !== null && k.number !== null)
    .map((k) => ({ place: k.place, sim: similarity(street, k.street as string) }))
    .filter((k) => k.sim >= STREET_ONLY_SIMILARITY_FLOOR)
    .sort((a, b) => b.sim - a.sim);
  if (sameStreet.length === 1) {
    return { kind: "proposed", place: sameStreet[0].place, confidence: 0.6, method: "street_without_number" };
  }
  if (sameStreet.length > 1) {
    return { kind: "ambiguous", candidates: sameStreet.slice(0, MAX_CANDIDATES).map((s) => s.place) };
  }

  const nearName = scored
    .filter((k) => k.number === null)
    .map((k) => ({ place: k.place, sim: similarity(segment.key, normalizeLabel(k.place.name)) }))
    .filter((k) => k.sim >= STREET_ONLY_SIMILARITY_FLOOR)
    .sort((a, b) => b.sim - a.sim);
  if (nearName.length === 1) {
    return {
      kind: "proposed",
      place: nearName[0].place,
      confidence: round2(Math.min(0.9, nearName[0].sim)),
      method: "near_identical_name",
    };
  }
  if (nearName.length > 1) {
    return { kind: "ambiguous", candidates: nearName.slice(0, MAX_CANDIDATES).map((s) => s.place) };
  }
  return { kind: "new" };
}

// ── the file's own canonical places ─────────────────────────────────────────

export interface CanonicalPlace {
  /** The spelling the source uses most; the name the plan would create. */
  readonly name: string;
  readonly key: string;
  /** Every other source spelling folded into this place, with row counts. */
  readonly spellings: readonly { readonly label: string; readonly rows: number }[];
  readonly rows: number;
  /** Resolved against the organization's existing objects. */
  readonly existing: KnownPlace | null;
  readonly existingMethod: "exact_label" | "typo_same_house_number" | "street_without_number" | "near_identical_name" | null;
  readonly existingConfidence: number | null;
}

/**
 * Cluster every explicit PLACE segment of a session into canonical places.
 * Most frequent spelling first; a rarer spelling that resolves to an
 * accepted one (same number + typo distance, or street-only) is an alias.
 * Each canonical place is then resolved once against the organization's
 * objects. Ambiguity at either step is NOT folded — the segment stays its
 * own place and the row-level resolution will ask.
 */
export function canonicalPlaces(
  segments: readonly ContextSegment[],
  existingObjects: readonly ResolveEntity[],
  /** Keys whose spelling wins regardless of frequency — the object CELL's
   *  spellings over the work text's, so three misspelled text mentions
   *  cannot outvote the one correctly written cell. */
  preferred: ReadonlySet<string> = new Set(),
): readonly CanonicalPlace[] {
  const counts = new Map<string, { label: string; rows: number; seg: ContextSegment }>();
  for (const s of segments) {
    if (s.kind !== "place" || s.key === "") continue;
    const e = counts.get(s.key);
    if (e) e.rows += 1;
    else counts.set(s.key, { label: s.label, rows: 1, seg: s });
  }
  // Numbered places anchor the clusters; unnumbered follow. Within a group,
  // frequency decides which spelling is canonical.
  const ordered = [...counts.values()].sort((a, b) => {
    const an = a.seg.number !== null ? 0 : 1;
    const bn = b.seg.number !== null ? 0 : 1;
    const ap = preferred.has(a.seg.key) ? 0 : 1;
    const bp = preferred.has(b.seg.key) ? 0 : 1;
    return an - bn || ap - bp || b.rows - a.rows || a.label.localeCompare(b.label);
  });

  const accepted: { name: string; key: string; spellings: { label: string; rows: number }[]; rows: number }[] = [];
  for (const entry of ordered) {
    const known: KnownPlace[] = accepted.map((a) => ({ id: null, name: a.name }));
    const r = resolvePlace(entry.seg, known);
    if (r.kind === "proposed") {
      const target = accepted.find((a) => a.name === r.place.name);
      if (target) {
        target.spellings.push({ label: entry.label, rows: entry.rows });
        target.rows += entry.rows;
        continue;
      }
    }
    accepted.push({ name: entry.label, key: entry.seg.key, spellings: [], rows: entry.rows });
  }

  const existing: KnownPlace[] = existingObjects.map((o) => ({ id: o.id, name: o.name }));
  return accepted.map((a) => {
    const r = resolvePlace(toSegment(a.name), existing);
    const hit = r.kind === "matched" || r.kind === "proposed" ? r : null;
    return {
      name: a.name,
      key: a.key,
      spellings: a.spellings,
      rows: a.rows,
      existing: hit ? hit.place : null,
      existingMethod: hit ? hit.method : null,
      existingConfidence: hit ? hit.confidence : null,
    };
  });
}

// ── site from the work text ─────────────────────────────────────────────────

export interface SiteFromText {
  readonly label: string;
  readonly method: "address_at_text_start" | "known_place_at_text_start";
  readonly confidence: number;
}

/** Street words followed by a house number, at the very start of the text. */
const LEADING_ADDRESS_RE = /^\s*([\p{L}][\p{L}.'’\-]*(?:\s+[\p{L}][\p{L}.'’\-]*){0,3})\s*(\d{1,4}[a-z]?)(?![\d.,:]\s*\d)\b/u;

/**
 * When the object cell is empty, the source's own habit is to start the work
 * text with the site: `Hoofdgraht 13 (7 uur) Dakmontage…`, `anna franklaan
 * Meubels…`, `Bussum Montage…`. An address at the start is taken as it is
 * written (a typo is the resolver's job); otherwise the first one or two
 * words are compared with the streets of the known places. Nothing else is
 * guessed — a text that names no recognisable site leaves the site UNKNOWN.
 */
export function extractSiteFromText(text: string | null | undefined, known: readonly KnownPlace[]): SiteFromText | null {
  if (!text) return null;
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const head = firstLine.slice(0, 80);
  const addr = LEADING_ADDRESS_RE.exec(head);
  if (addr) {
    // `2 uur - garantie` style openings are durations, not addresses. The
    // label is the source's OWN characters (`Hofdracht3` stays `Hofdracht3`);
    // reading a typo is the resolver's job, not this function's.
    const candidate = head.slice(addr.index, addr.index + addr[0].length);
    if (!DURATION_RE.test(`${addr[1]} ${addr[2]}`)) {
      return { label: tidy(candidate), method: "address_at_text_start", confidence: 0.8 };
    }
  }
  const words = normalizeLabel(head).split(" ").filter((w) => w !== "");
  if (words.length === 0) return null;
  const tries = [words.slice(0, 2).join(" "), words[0]];
  let best: { label: string; sim: number } | null = null;
  for (const k of known) {
    const parts = placeParts(normalizeLabel(k.name));
    const street = parts.street ?? normalizeLabel(k.name);
    for (const t of tries) {
      if (t.length < 4) continue;
      const sim = similarity(t, street);
      if (sim >= 0.75 && (!best || sim > best.sim)) {
        // The label is the SOURCE's words (original spelling from the head),
        // not the known name — the resolver decides whether they are one.
        const original = firstLine.trim().split(/\s+/).slice(0, t.split(" ").length).join(" ");
        best = { label: tidy(original), sim };
      }
    }
  }
  if (!best) return null;
  return { label: best.label, method: "known_place_at_text_start", confidence: round2(Math.min(0.7, best.sim)) };
}

/** Street words + number anywhere in a text. Prose produces false hits
 *  (`ramen 8`), which is why `extractSitesFromText` keeps a non-leading
 *  mention only when it RESOLVES to a place already known. */
const ADDRESS_ANYWHERE_RE = /([\p{L}][\p{L}.'’\-]*(?:\s+[\p{L}][\p{L}.'’\-]*){0,2})\s*(\d{1,4})(?![\d.,:]?\d)\b/gu;

/**
 * Every site a text names: the leading one as `extractSiteFromText` reads
 * it (it may be new), then any further mention that resolves to a known
 * place — a day written as `Hoofdgraht 13 (7 uur) … Hoofdgraht 3 (2 uur)`
 * with an empty object cell names two places, and the second is only ever
 * accepted because `Hoofdgracht 3` is already known from other rows.
 */
export function extractSitesFromText(
  text: string | null | undefined,
  known: readonly KnownPlace[],
): readonly SiteFromText[] {
  const lead = extractSiteFromText(text, known);
  if (!lead || !text) return lead ? [lead] : [];
  const out: SiteFromText[] = [lead];
  // Deduplicated by the PLACE a mention resolves to, not by its spelling:
  // the leading `Vera Voorbeeldlin 16` and a later `Voorbeeldlin 16` (the
  // scanner's shorter suffix of the same words) are one place.
  const seen = new Set<string>([normalizeLabel(lead.label)]);
  const leadResolved = resolvePlace(toSegment(lead.label), known);
  if (leadResolved.kind === "matched" || leadResolved.kind === "proposed") {
    seen.add(normalizeLabel(leadResolved.place.name));
  }
  const keep = (label: string, confidence: number) => {
    const key = normalizeLabel(label);
    if (key === "" || seen.has(key)) return;
    const seg = toSegment(label);
    if (seg.kind !== "place") return;
    const r = resolvePlace(seg, known);
    if (r.kind !== "matched" && r.kind !== "proposed") return;
    const placeKey = normalizeLabel(r.place.name);
    if (seen.has(placeKey)) return;
    seen.add(key);
    seen.add(placeKey);
    out.push({ label: tidy(label), method: "known_place_at_text_start", confidence });
  };
  for (const m of text.matchAll(ADDRESS_ANYWHERE_RE)) {
    if (DURATION_RE.test(`${m[1]} ${m[2]}`)) continue;
    // The words before a number may include the tail of the sentence
    // (`… werklocatie. Hoofdgraht 3`); the shortest suffix that resolves
    // to a known place is the mention.
    const words = m[1].split(/\s+/);
    for (let n = 1; n <= words.length; n++) {
      const before = seen.size;
      keep(`${words.slice(words.length - n).join(" ")} ${m[2]}`, 0.6);
      if (seen.size > before) break;
    }
  }
  const folded = normalizeLabel(text);
  for (const k of known) {
    const key = normalizeLabel(k.name);
    if (placeParts(key).number !== null || key.length < 4) continue;
    if (folded.includes(key)) keep(k.name, 0.6);
  }
  return out;
}

// ── per-place hours from the text ───────────────────────────────────────────

export type AllocationMethod =
  | "single_place"
  | "explicit_in_text"
  | "partial_in_text"
  | "unknown_split";

export interface HoursAllocation {
  readonly method: AllocationMethod;
  /** Per place, in the order given; `null` when the text states no figure. */
  readonly hours: readonly (number | null)[];
  /** True when every place has a figure and they add up to the stated
   *  total (±0.01); false when they do not; null when nothing to compare. */
  readonly consistent: boolean | null;
}

const HOURS_ANYWHERE_RE = /(?:^|[\s(–\-])(\d{1,3}(?:[.,]\d{1,2})?)\s*(uur|u|val|h|hrs|hours|std|godz|час|ч)\b\.?/giu;

function readFigure(s: string): number {
  return Number(s.replace(",", "."));
}

/** Folded like `normalizeLabel` — lower-case, diacritics stripped, one
 *  space between words — but a decimal separator BETWEEN digits survives,
 *  so `2,5 uur` is still two and a half hours and not "5 uur". */
function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/(?<!\d)[.,]|[.,](?!\d)/g, " ")
    .replace(/[^\p{L}\p{N}.,]+/gu, " ")
    .trim();
}

/**
 * The text of a multi-place day is usually sectioned by place:
 * `Hoofdgracht 3 … 8 uur  Hoofdgracht 5 … 1 uur`. Each place (any of its
 * spellings) is located in the text; the figures between one mention and
 * the next are that place's hours. A place with no figure stays `null`.
 * With a single place the total is its allocation. Nothing is divided.
 */
export function allocateHours(
  text: string | null | undefined,
  places: readonly { readonly name: string; readonly spellings: readonly string[] }[],
  total: number | null,
): HoursAllocation {
  if (places.length === 0) return { method: "unknown_split", hours: [], consistent: null };
  if (places.length === 1) return { method: "single_place", hours: [total], consistent: null };
  if (!text) return { method: "unknown_split", hours: places.map(() => null), consistent: null };

  const folded = foldText(text);
  const mentions: { index: number; pos: number }[] = [];
  places.forEach((p, index) => {
    let pos = -1;
    for (const spelling of [p.name, ...p.spellings]) {
      const key = normalizeLabel(spelling);
      if (key === "") continue;
      const at = folded.indexOf(key);
      if (at !== -1 && (pos === -1 || at < pos)) pos = at;
    }
    if (pos !== -1) mentions.push({ index, pos });
  });
  if (mentions.length === 0) return { method: "unknown_split", hours: places.map(() => null), consistent: null };
  mentions.sort((a, b) => a.pos - b.pos);

  const hours: (number | null)[] = places.map(() => null);
  for (let i = 0; i < mentions.length; i++) {
    const from = mentions[i].pos;
    const to = i + 1 < mentions.length ? mentions[i + 1].pos : folded.length;
    const segment = folded.slice(from, to);
    let sum = 0;
    let any = false;
    for (const m of segment.matchAll(HOURS_ANYWHERE_RE)) {
      sum += readFigure(m[1]);
      any = true;
    }
    if (any) hours[mentions[i].index] = round2(sum);
  }

  const stated = hours.filter((h): h is number => h !== null);
  if (stated.length === 0) return { method: "unknown_split", hours, consistent: null };
  if (stated.length < places.length) return { method: "partial_in_text", hours, consistent: null };
  const sum = round2(stated.reduce((a, b) => a + b, 0));
  return {
    method: "explicit_in_text",
    hours,
    consistent: total === null ? null : Math.abs(sum - total) <= 0.01,
  };
}
