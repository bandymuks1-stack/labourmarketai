/**
 * THE ONE ENGAGEMENT-CONTEXT LABEL COMPOSER (issue #1689, defect J).
 *
 * Pure: no IO, no i18n lookups — every word it prints is handed in already
 * localized. Safe on client and server.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────
 * The work-context selector showed "Darbuotojas — Darbuotojas". Two rows
 * with no organization and no title both had the RELATIONSHIP as their base
 * label, the ambiguity rule then appended the relationship as a qualifier,
 * and the person read the same word twice with nothing between them to
 * choose by. Meanwhile the journal page composed the same rows a third way
 * ("Org · Rel", "Asmeninis įrašas · title", "Asmeninis įrašas"), so the same
 * context carried a different name depending on which surface asked.
 *
 * ── THE RULES ────────────────────────────────────────────────────────────
 *   personal (no organization) → personalEntryLabel [ · title ]
 *   organization               → (orgName | orgTypeLabel | title) · relationship
 *   qualifier (labels collide) → · title, else · YYYY-MM from started_at —
 *                                NEVER a word the label already carries
 *   guaranteed distinct        → YYYY-MM is appended as the last resort; if
 *                                two rows are still identical (same org,
 *                                same relationship, no title, same month)
 *                                an ordinal keeps them tellable apart.
 *
 * Both surfaces call `composeDistinctEngagementLabels` over the same input,
 * so a context is named once, the same way, everywhere.
 */

export type EngagementLabelInput = {
  /** The organization's display name (already resolved), or null. */
  readonly orgName: string | null;
  /** Localized organization TYPE ("Įmonė" / "Agentūra") — the fallback name
   *  for an organization that has no display name. */
  readonly orgTypeLabel: string | null;
  /** The person's own title for the context, or null. */
  readonly title: string | null;
  /** Localized relationship name ("Darbuotojas") — from the ONE canonical
   *  catalogue, never a raw slug. */
  readonly relationshipLabel: string;
  /** Localized "Asmeninis įrašas" — the head of every org-less context. */
  readonly personalEntryLabel: string;
  /** True when the context has no organization. */
  readonly isPersonal: boolean;
  /** ISO date/time the context started, or null. */
  readonly startedAt: string | null;
  /** Append a distinguishing qualifier (used when labels collide). */
  readonly needsQualifier?: boolean;
};

const SEP = " · ";

const clean = (s: string | null | undefined): string | null => {
  const v = (s ?? "").replace(/\s+/g, " ").trim();
  return v.length > 0 ? v : null;
};

/** "2026-03" from an ISO date, or null when it cannot be read. */
export function yearMonthOf(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec((iso ?? "").trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Does the label already carry this word — as a whole segment, or as a
 *  whole word inside one? ("Darbų vadovas" carries "vadovas"; it does not
 *  carry "vadova".) */
function carries(label: string, word: string): boolean {
  const a = label.toLocaleLowerCase();
  const b = word.toLocaleLowerCase();
  if (a === b) return true;
  if (a.split(SEP).some((seg) => seg.trim() === b)) return true;
  return new RegExp(`(^|[\\s·])${escapeRe(b)}($|[\\s·])`, "u").test(a);
}

/** Append a segment unless the label already carries it. */
function withSegment(label: string, segment: string | null): string {
  const s = clean(segment);
  if (!s || carries(label, s)) return label;
  return `${label}${SEP}${s}`;
}

/**
 * The label of ONE context. Deterministic and repeatable: the same input
 * always yields the same words, and no word is ever printed twice.
 */
export function composeEngagementLabel(input: EngagementLabelInput): string {
  const title = clean(input.title);
  const relationship = clean(input.relationshipLabel) ?? "";
  const personal = clean(input.personalEntryLabel) ?? "";

  let label: string;
  if (input.isPersonal) {
    label = personal || relationship;
    label = withSegment(label, title);
  } else {
    const head = clean(input.orgName) ?? clean(input.orgTypeLabel) ?? title ?? relationship;
    label = head;
    // "X · X" is the defect this module exists to end: the relationship is
    // appended only when the head is not already that very word.
    label = withSegment(label, relationship);
  }

  if (input.needsQualifier) {
    // The title first (their own words); the start month when there is no
    // title or the title is already in the label.
    const before = label;
    label = withSegment(label, title);
    if (label === before) label = withSegment(label, yearMonthOf(input.startedAt));
  }
  return label;
}

/**
 * Labels for a LIST of contexts, guaranteed pairwise distinct and in input
 * order. A label that is already unique is left exactly as composed; only
 * colliding labels are qualified, and only as far as needed.
 */
export function composeDistinctEngagementLabels(
  rows: readonly EngagementLabelInput[],
): string[] {
  const base = rows.map((r) => composeEngagementLabel({ ...r, needsQualifier: false }));
  const counts = new Map<string, number>();
  for (const b of base) counts.set(b, (counts.get(b) ?? 0) + 1);

  // Step 1 — qualify the colliding ones (title, else YYYY-MM).
  let labels = rows.map((r, i) =>
    (counts.get(base[i]) ?? 0) > 1
      ? composeEngagementLabel({ ...r, needsQualifier: true })
      : base[i],
  );

  // Step 2 — still colliding: the start month as the last resort.
  const again = new Map<string, number>();
  for (const l of labels) again.set(l, (again.get(l) ?? 0) + 1);
  labels = labels.map((l, i) =>
    (again.get(l) ?? 0) > 1 ? withSegment(l, yearMonthOf(rows[i].startedAt)) : l,
  );

  // Step 3 — identical in every fact the product holds: an ordinal, so the
  // person can at least tell "the first" from "the second" and choose.
  const seen = new Map<string, number>();
  const final = new Map<string, number>();
  for (const l of labels) final.set(l, (final.get(l) ?? 0) + 1);
  return labels.map((l) => {
    if ((final.get(l) ?? 0) <= 1) return l;
    const n = (seen.get(l) ?? 0) + 1;
    seen.set(l, n);
    return n === 1 ? l : `${l} (${n})`;
  });
}
