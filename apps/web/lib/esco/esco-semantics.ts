/**
 * ESCO AS A SEMANTIC LAYER — the pure core.
 *
 * ESCO standardises MEANING. That is the whole of what it does here, and
 * saying it precisely is the point of this file.
 *
 * ── THE ONE RULE EVERYTHING ELSE FOLLOWS FROM ─────────────────────────────
 *
 *   AN ESCO CONCEPT IS NOT EVIDENCE.
 *
 * A match says "these words denote this concept". It does not say the person
 * can do it, has done it, was paid for it, was confirmed doing it, is
 * qualified to do it, or may lawfully do it in some country. Every one of
 * those is a different claim with a different source, and collapsing any of
 * them into "we found an ESCO code" is the failure this layer must not enable
 * (SEP-1 FACT/DERIVED/FORECAST, SEP-3 EVIDENCE/VERIFICATION, SEP-6 the
 * capability/qualification ladder).
 *
 * So this module deliberately has NO function that returns a skill a person
 * "has", no score, and no verification state. It resolves meaning and stops.
 *
 * ── WHY THIS IS NOT A SECOND SKILL SYSTEM ─────────────────────────────────
 *
 * `lib/structuring/concept-resolution` already owns the question "what
 * canonical PLATFORM concept did this person express", and its resolvers must
 * emit seeded platform slugs. This module answers a different question:
 * "what does this phrase mean in ESCO's vocabulary" — an interoperability
 * question, whose answers are ESCO concept ids and are labelled as such.
 *
 * The two are joined only where the platform taxonomy itself carries an
 * `esco_uri`, which today is true for ZERO of 161 skills and ZERO of 49
 * professions (measured on production 2026-09-08). That bridge is a separate
 * owner-gated decision (SKL-6 / PR #1355) and this layer does not assume,
 * require or pre-empt it. Everything here works without it, and works better
 * with it.
 *
 * ── EVIDENCE ORDER OF A LABEL MATCH ───────────────────────────────────────
 *
 * ESCO gives every concept a `preferred` label per language, plus
 * `alternative` labels, plus `hidden` ones (misspellings and near-synonyms it
 * does not want shown). They are not equally good evidence of meaning, so they
 * are ranked rather than merged — and `hidden` is usable for RECOGNISING an
 * input while never being shown back to a human as the name of anything.
 *
 * PURE. No IO, no clock, no copy. Safe in client and server bundles.
 */

/**
 * ── THE EXTENSION POINT FOR EXTERNAL LABOUR-MARKET SIGNALS ────────────────
 *
 * Recorded here because it is an ARCHITECTURAL fact about this layer, not a
 * plan: an ESCO concept id is the join key an external intelligence source
 * would arrive on. JRC / European Commission AI Watch is the named candidate
 * (occupational AI exposure, changing tasks, changing skill demand,
 * job-advertisement analysis, training supply).
 *
 * The shape such a signal would take, if one is ever admitted:
 *
 *   external source -> Agentai OS (verification, licence, cost, provenance)
 *     -> an ESCO occupation or skill concept
 *       -> LabourMarket.ai's own real work and real demand
 *         -> changing competency demand -> gap -> training / RPL -> opportunity
 *
 * NOTHING IS BUILT FOR IT AND NOTHING SHOULD BE until a source is verified in
 * Agentai OS, which stays the external-intelligence authority: duplicating
 * global collection inside this product is the boundary violation §18 of the
 * product contract exists to prevent.
 *
 * Two rules bind any future signal, and they are why this note sits in the
 * file that defines what ESCO is NOT:
 *
 *   · a signal about an OCCUPATION is never a signal about a PERSON. AI
 *     exposure, task change and demand shift describe a labour market. Ranking
 *     a human by them would be the universal score this product refuses, wearing
 *     an authoritative source as a disguise;
 *   · such a signal is FORECAST or DERIVED, never FACT (SEP-1), and it must
 *     carry its source, its date and its confidence or not be stored at all.
 */

/** ESCO's own two concept families, as stored. */
export type EscoConceptType = "occupation" | "skill";

/** ESCO's label tiers, strongest statement of meaning first. */
export type EscoLabelType = "preferred" | "alternative" | "hidden";

export const ESCO_LABEL_RANK: Readonly<Record<EscoLabelType, number>> = {
  preferred: 3,
  alternative: 2,
  hidden: 1,
};

/**
 * How a phrase reached a concept. Deliberately a closed set, and deliberately
 * WITHOUT an "inferred" or "ai" member: everything this layer does is a
 * deterministic lookup against stored labels, and if that ever changes it must
 * be a visible edit here rather than a new string appearing in data.
 */
export type EscoMatchMethod = "exact_label" | "prefix_label";

export interface EscoConceptRef {
  readonly conceptId: string;
  readonly conceptType: EscoConceptType;
}

/**
 * One concept a phrase resolved to, with everything needed to explain it.
 *
 * `matchedLabel` and `matchedLocale` are not decoration: a correspondence a
 * person cannot see the reason for is one they cannot contest, and every
 * suggestion in this product must be contestable (doctrine §7).
 */
export interface EscoLabelMatch extends EscoConceptRef {
  readonly matchedLabel: string;
  readonly matchedLocale: string;
  readonly labelType: EscoLabelType;
  readonly method: EscoMatchMethod;
}

/**
 * A concept expressed across languages — the cross-language bridge.
 *
 * This is what makes "montavau pastolius", "scaffolder", "ställningsbyggare"
 * and "Gerüstbauer" one thing instead of four. It carries no claim about any
 * person; it is a fact about vocabulary.
 */
export interface EscoConceptLabels extends EscoConceptRef {
  /** locale → the preferred label in that locale. */
  readonly preferredByLocale: Readonly<Record<string, string>>;
}

/** ESCO's own relation vocabulary between an occupation and a skill. */
export type EscoRelationType = "essential" | "optional";

export interface EscoOccupationSkillLink {
  readonly occupationId: string;
  readonly skillId: string;
  readonly relationType: EscoRelationType;
}

/**
 * A read that could not be performed is NOT an empty result.
 *
 * SEP-7, at the one place where getting it wrong is most tempting: an empty
 * list renders as "no match" and looks like a perfectly good answer. The
 * caller must be able to tell "ESCO has nothing for this phrase" from "we
 * could not ask ESCO".
 */
export type EscoRead<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "unavailable"; readonly reason: "not_imported" | "error" };

/**
 * Order matches by how strongly they state the meaning: label tier first,
 * then an exact hit over a prefix hit, then shortest label (a prefix match on
 * a short label is a closer correspondence than on a long one), then the label
 * alphabetically so the order is total and stable.
 *
 * Stability matters more than it looks: an unstable order makes a suggestion
 * list flicker between identical inputs, which reads to a person as the system
 * changing its mind about them.
 */
export function compareEscoMatches(a: EscoLabelMatch, b: EscoLabelMatch): number {
  const tier = ESCO_LABEL_RANK[b.labelType] - ESCO_LABEL_RANK[a.labelType];
  if (tier !== 0) return tier;
  const method =
    (b.method === "exact_label" ? 1 : 0) - (a.method === "exact_label" ? 1 : 0);
  if (method !== 0) return method;
  const len = a.matchedLabel.length - b.matchedLabel.length;
  if (len !== 0) return len;
  return a.matchedLabel.localeCompare(b.matchedLabel);
}

/**
 * Collapse many label rows to one entry per concept, keeping the strongest.
 *
 * A concept typically matches several times — "scaffolder (construction)" and
 * "scaffolding labourer" are both the same occupation. Showing it twice would
 * imply two findings where there is one.
 */
export function dedupeByConcept(
  matches: readonly EscoLabelMatch[],
): readonly EscoLabelMatch[] {
  const best = new Map<string, EscoLabelMatch>();
  for (const m of [...matches].sort(compareEscoMatches)) {
    const key = `${m.conceptType}:${m.conceptId}`;
    if (!best.has(key)) best.set(key, m);
  }
  return [...best.values()].sort(compareEscoMatches);
}

/**
 * Is this label safe to SHOW a person as the name of the concept?
 *
 * `hidden` labels are ESCO's misspellings and deprecated forms. They are good
 * for recognising what someone typed and bad for telling them what it is:
 * echoing "ability to descalate" back at a person as the name of a competency
 * would make the product look illiterate and, worse, make a real concept look
 * like a typo.
 */
export function isDisplayableLabel(labelType: EscoLabelType): boolean {
  return labelType !== "hidden";
}

/**
 * THE GUARD RAIL, as a value rather than a comment.
 *
 * Anything that turns an ESCO correspondence into a claim about a person must
 * state which of these it is NOT. Exported so tests can assert the list has
 * not quietly shrunk.
 */
export const ESCO_IS_NOT: readonly string[] = [
  "evidence that the person did the work",
  "verification by an employer or client",
  "a formal qualification",
  "a recognised equivalence or RPL decision",
  "a current valid credential",
  "legal authorisation to practise in any jurisdiction",
  "a measure of how good the person is",
];
