/**
 * OBJECT MAPPING — timesheet place labels ↔ the objects another source names
 * (invoice lines, a register of sites), as a HUMAN-CONFIRMABLE proposal.
 *
 * Three outcomes per timesheet label, and only the first is ever linked
 * without a person:
 *
 *   exact         the same street AND the same house number
 *   street_only   the same street, a different or missing house number — a
 *                 PROPOSAL that needs a person's confirmation; never linked
 *                 automatically (the second-largest real site was of this
 *                 kind: one source wrote the number, the other did not)
 *   unmatched     nothing on the same street
 *
 * `applyDecisions` turns the proposal plus the person's answers into links:
 * a street_only label is linked only when the person confirmed a specific
 * target, and an unmatched label stays unlinked. Nothing here knows an
 * organization, a customer or a company; it compares labels.
 *
 * Pure. Folding: accents and case removed, Dutch postcodes dropped, the
 * MAIN street word (first alphabetic token of ≥5 letters that is not a
 * place-name suffix) plus the first purely numeric token.
 */

export type MappingTier = "exact" | "street_only" | "unmatched";

export interface MappingProposal {
  readonly label: string;
  readonly tier: MappingTier;
  /** Candidate target labels (empty when unmatched). */
  readonly candidates: readonly string[];
  /** True for every tier except `exact` with ONE candidate group. */
  readonly requiresConfirmation: boolean;
}

export interface LabelKey {
  readonly street: string;
  readonly number: string;
}

const fold = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b\d{4}\s?[a-z]{2}\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function labelKey(label: string, placeWords: ReadonlySet<string> = new Set()): LabelKey {
  const toks = fold(label).split(" ").filter(Boolean);
  const street = toks.find((t) => /^[a-z]+$/.test(t) && t.length >= 5 && !placeWords.has(t)) ?? toks[0] ?? "";
  const number = toks.find((t) => /^\d+$/.test(t)) ?? "";
  return { street, number };
}

export function proposeMapping(input: {
  readonly timesheetLabels: readonly string[];
  readonly targetLabels: readonly string[];
  /** Town names that must not be taken for the street word. */
  readonly placeWords?: readonly string[];
}): readonly MappingProposal[] {
  const place = new Set((input.placeWords ?? []).map((w) => fold(w)));
  const targets = input.targetLabels.map((label) => ({ label, key: labelKey(label, place) }));
  const seen = new Set<string>();
  const out: MappingProposal[] = [];
  for (const label of input.timesheetLabels) {
    if (seen.has(label)) continue;
    seen.add(label);
    const k = labelKey(label, place);
    const sameStreet = targets.filter((t) => t.key.street === k.street && k.street !== "");
    const exact = sameStreet.filter((t) => t.key.number === k.number && k.number !== "");
    if (exact.length > 0) {
      const distinct = [...new Set(exact.map((t) => t.label))];
      out.push({ label, tier: "exact", candidates: distinct, requiresConfirmation: false });
    } else if (sameStreet.length > 0) {
      out.push({
        label,
        tier: "street_only",
        candidates: [...new Set(sameStreet.map((t) => t.label))],
        requiresConfirmation: true,
      });
    } else {
      out.push({ label, tier: "unmatched", candidates: [], requiresConfirmation: true });
    }
  }
  return out;
}

export interface MappingDecision {
  readonly label: string;
  /** The target the person confirmed, or null for "none of these". */
  readonly target: string | null;
}

/** Final links: exact → its candidate; street_only/unmatched → only a decision. */
export function applyDecisions(
  proposals: readonly MappingProposal[],
  decisions: readonly MappingDecision[],
): ReadonlyMap<string, string | null> {
  const answered = new Map(decisions.map((d) => [d.label, d.target]));
  const links = new Map<string, string | null>();
  for (const p of proposals) {
    if (p.tier === "exact") {
      links.set(p.label, p.candidates[0] ?? null);
      continue;
    }
    const answer = answered.get(p.label);
    // A confirmation must name one of the candidates the proposal offered.
    links.set(p.label, answer !== undefined && answer !== null && p.candidates.includes(answer) ? answer : null);
  }
  return links;
}
