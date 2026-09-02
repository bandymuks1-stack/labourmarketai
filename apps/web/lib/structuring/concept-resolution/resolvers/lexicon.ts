/**
 * LEXICON RESOLVER — the deterministic, offline, always-available answer to
 * `expression → concept`. First in the registry, and the reason the registry
 * can safely grow.
 *
 * It is a thin adapter over the existing recognizer: same dictionary, same
 * tiers, same guards, same results. That is the point — doctrine I-7 requires
 * matching and extraction to work with NO generative AI, so the default
 * resolver must be the one that needs no provider, no key, no network and no
 * budget. Every richer resolver added later is an ADDITION beside this one,
 * never a replacement for it.
 *
 * It is language-blind by construction: one folded dictionary holding every
 * language's needles at once. That is why a worker who writes half a sentence
 * in Lithuanian and half in English is still understood, and why `language` is
 * an optional hint here rather than a filter.
 */
import { recognizeSkills, RECOGNITION_LIMIT } from "../../skill-recognition";
import type { ConceptResolver, ResolvedConcept } from "../types";

export const LEXICON_RESOLVER_ID = "lexicon";

export const lexiconResolver: ConceptResolver = {
  id: LEXICON_RESOLVER_ID,
  // The dictionary is static and offline, so the only input it cannot look at
  // is one with no letters in it.
  canResolve: (text) => typeof text === "string" && text.trim().length > 0,
  resolve: (text, opts): readonly ResolvedConcept[] =>
    recognizeSkills(text, opts.limit ?? RECOGNITION_LIMIT).map((s) => ({
      slug: s.slug,
      tier: s.via,
      confidence: s.confidence,
      matchedText: s.matchedText,
      resolver: LEXICON_RESOLVER_ID,
    })),
};
