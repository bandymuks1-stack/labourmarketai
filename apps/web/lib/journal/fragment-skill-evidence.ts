/**
 * FRAGMENT → SKILL evidence (issue #1689, owner rule §5 — four kinds of time).
 *
 * A journal entry stores the worker's own phrases as indexed `parsed_fragment`
 * metric rows, each with its own `fragment_time` and `fragment_activity`. The
 * skill pipeline links skills to the ENTRY (`journal_entry_skills`) and knows,
 * inside its derivation, WHICH fragment each recognition came from — but until
 * now that knowledge was never persisted, so the work-intelligence model had
 * to refuse the split: "6 h tiles, 2 h plaster" with two linked skills was
 * 8 h of involvement and 0 h attributed to either.
 *
 * This module is the pure half of closing that gap:
 *
 *   • `fragment_skill` metric rows — `"<index>|<slug>"`, one per (fragment,
 *     skill) pair the recognition or the worker's confirmation placed ON that
 *     fragment. Append-only, idempotent by value, entry-scoped; the row is a
 *     statement of WHERE a link came from, never a new link (the link itself
 *     stays in `journal_entry_skills`, and a row whose skill is no longer
 *     linked is inert by construction).
 *   • `mapRecognitionToPersistedFragments` — joins the derivation's fragment
 *     ids to the persisted fragment indices. Two fragmenters split the text
 *     (the suggestion extractor persists, the recognition fragmenter derives);
 *     they agree on the vast majority of phrases and this join fails CLOSED
 *     where they do not — an unmatched phrase simply gets no row and the
 *     entry-level rule keeps applying.
 *
 * Nothing here invents a duration or a skill: a row is written only for a
 * skill the pipeline actually recognised (exact / synonym / resolved) or the
 * worker explicitly confirmed, on a phrase the worker actually wrote.
 */

import { fragmentJournalText } from "@/lib/structuring/journal-fragmenter";

/** Metric slug: `value_text = "<1-based fragment index>|<skill slug>"`. */
export const FRAGMENT_SKILL_METRIC_SLUG = "fragment_skill";

const SLUG_RE = /^[a-z0-9_-]{1,64}$/i;

export type PersistedFragment = {
  /** 1-based index — the same index `fragment_time` / `fragment_activity` use. */
  readonly index: number;
  /** The worker's phrase as persisted in `parsed_fragment`. */
  readonly phrase: string;
};

export type FragmentSkillRow = {
  readonly index: number;
  readonly slug: string;
};

/** Parse `parsed_fragment` values (`"<index>|<phrase>"`) into fragments.
 *  Malformed rows are skipped; a duplicate index keeps the first row. */
export function parsePersistedFragments(
  metrics: readonly { metric_slug: string | null; value_text: string | null }[],
): PersistedFragment[] {
  const seen = new Set<number>();
  const out: PersistedFragment[] = [];
  for (const m of metrics) {
    if (m.metric_slug !== "parsed_fragment" || typeof m.value_text !== "string") continue;
    const sep = m.value_text.indexOf("|");
    if (sep <= 0) continue;
    const index = Number.parseInt(m.value_text.slice(0, sep), 10);
    const phrase = m.value_text.slice(sep + 1).trim();
    if (!Number.isInteger(index) || index < 1 || !phrase || seen.has(index)) continue;
    seen.add(index);
    out.push({ index, phrase });
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Parse one `fragment_skill` value into its pair, or null when malformed. */
export function parseFragmentSkillValue(valueText: string | null | undefined): FragmentSkillRow | null {
  if (typeof valueText !== "string") return null;
  const sep = valueText.indexOf("|");
  if (sep <= 0) return null;
  const index = Number.parseInt(valueText.slice(0, sep), 10);
  const slug = valueText.slice(sep + 1).trim();
  if (!Number.isInteger(index) || index < 1 || !SLUG_RE.test(slug)) return null;
  return { index, slug };
}

export function formatFragmentSkillValue(row: FragmentSkillRow): string {
  return `${row.index}|${row.slug}`;
}

/** `fragment_skill` rows of an entry as index → set of slugs. */
export function fragmentSkillsByIndex(
  metrics: readonly { metric_slug: string | null; value_text: string | null }[],
): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  for (const m of metrics) {
    if (m.metric_slug !== FRAGMENT_SKILL_METRIC_SLUG) continue;
    const row = parseFragmentSkillValue(m.value_text);
    if (!row) continue;
    let set = out.get(row.index);
    if (!set) {
      set = new Set();
      out.set(row.index, set);
    }
    set.add(row.slug);
  }
  return out;
}

export type RecognitionFragmentRef = {
  readonly id: string;
  readonly normalized: string;
};

/**
 * Join the derivation's fragment ids to the persisted fragment indices.
 *
 * For each persisted phrase the SAME fragmenter the derivation used splits
 * it again; the ids that come out are the ids the derivation assigned to that
 * phrase whenever both fragmenters cut at the same places (the common case —
 * the recognition fragmenter is the finer of the two, so a persisted phrase
 * re-fragments into a subset of the derivation's fragments). When the ids do
 * not line up, the phrase's normalized form is matched against exactly ONE
 * derivation fragment that ends or starts with it (the extractor strips a
 * leading conjunction the fragmenter keeps — "ir klojau laminatą" vs "klojau
 * laminatą"); anything still unmatched or matched twice yields nothing.
 *
 * Returns one row per (index, slug) whose skill's `fragmentIds` intersect
 * the fragment ids joined to that index — deterministic and duplicate-free.
 */
export function mapRecognitionToPersistedFragments(input: {
  readonly persisted: readonly PersistedFragment[];
  readonly derivationFragments: readonly RecognitionFragmentRef[];
  readonly skills: readonly { readonly slug: string; readonly fragmentIds: readonly string[] }[];
}): FragmentSkillRow[] {
  if (input.persisted.length === 0 || input.skills.length === 0) return [];
  const derivedById = new Map(input.derivationFragments.map((f) => [f.id, f] as const));
  const derivedIds = new Set(derivedById.keys());

  const idsByIndex = new Map<number, Set<string>>();
  for (const p of input.persisted) {
    const pieces = fragmentJournalText(p.phrase);
    if (pieces.length === 0) continue;
    const matched = new Set<string>();
    for (const piece of pieces) {
      if (derivedIds.has(piece.id)) {
        matched.add(piece.id);
        continue;
      }
      // Loose join: the derivation fragment that carries this piece at one of
      // its ends, and only when exactly one does.
      const pn = piece.normalized.trim();
      if (pn.length < 6) continue;
      const hits = input.derivationFragments.filter(
        (f) =>
          f.normalized === pn ||
          f.normalized.endsWith(` ${pn}`) ||
          f.normalized.startsWith(`${pn} `),
      );
      if (hits.length === 1) matched.add(hits[0]!.id);
    }
    if (matched.size > 0) idsByIndex.set(p.index, matched);
  }
  if (idsByIndex.size === 0) return [];

  // A derivation fragment may be claimed by ONE persisted index only — if two
  // phrases joined to the same id, neither may use it (ambiguous → nothing).
  const ownerByFragmentId = new Map<string, number | null>();
  for (const [index, ids] of idsByIndex) {
    for (const id of ids) {
      ownerByFragmentId.set(id, ownerByFragmentId.has(id) ? null : index);
    }
  }

  const out: FragmentSkillRow[] = [];
  const seen = new Set<string>();
  for (const s of input.skills) {
    if (!SLUG_RE.test(s.slug)) continue;
    for (const fid of s.fragmentIds) {
      const index = ownerByFragmentId.get(fid);
      if (index === null || index === undefined) continue;
      const key = `${index}|${s.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ index, slug: s.slug });
    }
  }
  return out.sort((a, b) => a.index - b.index || a.slug.localeCompare(b.slug));
}
