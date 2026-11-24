/**
 * Display-time concept dedupe for recognised work signals
 * (work-journal-perfect-flow-p0, owner round 3).
 *
 * The recogniser surfaces a work item through several paths (per-fragment
 * activity label, matched declared-skill name, capability label, undeclared
 * skill name). The SAME concept must show as ONE visible signal — never twice,
 * and never as a raw English slug next to its localized label.
 *
 * Because the only common denominator across those paths is the localized human
 * LABEL (a fragment's `mason` slug, a skill's `bricklaying` slug and a
 * capability's "Mūrijimas" label all describe one concept), dedupe is by
 * normalized label. This is correct ONLY when labels are always localized — the
 * `journal-no-raw-slug` guard pins that recogniser slugs always resolve to an LT
 * name, so a raw slug can never appear as one of these labels.
 *
 * Pure + deterministic, so it is unit-tested and the composer uses the SAME
 * logic the test asserts.
 */

/** Normalize a label for concept comparison: lowercase, trim, collapse runs of
 *  whitespace. (Folding accents is intentionally NOT done — "Mūrijimas" and a
 *  hypothetical accent-stripped variant are the same localized string already.) */
export function normalizeSignalLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Drop items whose localized label duplicates another item OR an
 * already-shown label. Order preserved; the FIRST occurrence wins.
 *
 * @param items     ordered list of labelled signals ({ name } at minimum)
 * @param alreadyShown labels already visible elsewhere (declared/matched skills,
 *                     fragment activity labels) — a new item matching one of
 *                     these is a duplicate concept and is dropped
 */
export function dedupeSignalsByLabel<T extends { name: string }>(
  items: readonly T[],
  alreadyShown: Iterable<string> = [],
): T[] {
  const seen = new Set<string>();
  for (const s of alreadyShown) {
    const k = normalizeSignalLabel(s);
    if (k) seen.add(k);
  }
  const out: T[] = [];
  for (const item of items) {
    const key = normalizeSignalLabel(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
