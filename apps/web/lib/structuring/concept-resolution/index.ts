/**
 * `resolveExpressionToConcepts` — THE callable seam.
 *
 * Every workflow that needs to turn what a person wrote into canonical
 * concepts goes through here. Before this existed, workflows called the
 * recognizer (and therefore the needle packs) directly, which meant the
 * deterministic lexicon was not merely the FIRST way to answer the question —
 * it was the only reachable one. Adding ESCO's multilingual labels, a
 * dictionary tier or an embedding tier would have meant editing every call
 * site. Now it means adding a resolver.
 *
 * ORDERED, NOT PARALLEL. Resolvers run cheapest-and-most-certain first, and a
 * later resolver may only ADD concepts the earlier ones did not find — it can
 * never downgrade or overwrite a deterministic hit. This is the same shape the
 * AI router uses for providers (zero-cost tier first), for the same reason:
 * the cheap deterministic answer is usually the right one, and when it is
 * right, nothing else should be allowed to make it worse.
 *
 * THE LIMIT IS APPLIED LAST, once, across the merged result — so introducing a
 * second resolver can never silently push a deterministic match off the end of
 * the list.
 *
 * Pure + deterministic. Safe in client and server bundles: the only resolver
 * shipped today is the offline lexicon.
 */
import { RECOGNITION_LIMIT } from "../skill-recognition";
import { lexiconResolver } from "./resolvers/lexicon";
import type { ConceptResolver, ResolveOptions, ResolvedConcept } from "./types";

export * from "./types";
export { conceptLanguageCoverage, coveredConceptLanguages, registeredButUncoveredLanguages } from "./coverage";
export { CONCEPT_TERM_SOURCES, conceptTerms, unseededSlugsIn, seededSlugs } from "./term-sources";
export { lexiconResolver, LEXICON_RESOLVER_ID } from "./resolvers/lexicon";

/**
 * The shipped resolvers, in evidence order.
 *
 * One today. The list is the extension point — LANGUAGE_MATRIX §4.1 steps 3
 * and 4 (ESCO labels, then embeddings) each append here rather than editing
 * anything a workflow imports.
 */
export const CONCEPT_RESOLVERS: readonly ConceptResolver[] = [lexiconResolver];

const TIER_RANK = { exact: 3, synonym: 2, fuzzy: 1 } as const;

/**
 * Resolve a human expression to canonical concepts.
 *
 * Returns at most `limit` concepts, strongest evidence first, one entry per
 * slug. The result carries WHICH resolver answered and WHAT in the person's
 * own text triggered it, because a suggestion the product cannot explain is a
 * suggestion it should not make (doctrine §7).
 */
export function resolveExpressionToConcepts(
  text: string,
  opts: ResolveOptions = {},
): readonly ResolvedConcept[] {
  const limit = opts.limit ?? RECOGNITION_LIMIT;
  const best = new Map<string, ResolvedConcept>();

  for (const resolver of CONCEPT_RESOLVERS) {
    if (!resolver.canResolve(text, opts)) continue;
    for (const c of resolver.resolve(text, { ...opts, limit })) {
      const prior = best.get(c.slug);
      // Earlier resolver wins ties: an equally-strong later answer never
      // displaces the deterministic one that arrived first.
      if (!prior || TIER_RANK[c.tier] > TIER_RANK[prior.tier]) best.set(c.slug, c);
    }
  }

  return [...best.values()]
    .sort(
      (a, b) =>
        TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
        b.matchedText.length - a.matchedText.length ||
        a.slug.localeCompare(b.slug),
    )
    .slice(0, Math.max(0, limit));
}
