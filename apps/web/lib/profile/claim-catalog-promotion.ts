import { extractProfileSuggestions } from "@/lib/structuring/extract-profile-suggestions";

/**
 * Canonical-journey P2 (living CV) — claim → catalogue promotion, PURE part.
 *
 * The audit's central living-CV break: free-label `profile_skill_claims`
 * (what the CV import / text composer produces) can never gain work-journal
 * evidence, because `journal_entry_skills` links require a catalogued
 * `skill_id`. This module maps a CONFIRMED claim label to the catalogued
 * skill slugs its own text triggers in the deterministic lexicon — so one
 * user confirmation can be recorded BOTH as the claim (their words) and as
 * the catalogued skill (the row matching, journal evidence and the Verified
 * CV read).
 *
 * Honesty rules:
 *   - runs the SAME deterministic extractor the platform already trusts
 *     (extract-profile-suggestions) on the label text alone — no AI, no
 *     fuzzy guessing beyond the shared lexicon;
 *   - mapping happens ONLY for labels the user explicitly confirmed;
 *   - the caller (server action) additionally clamps to the worker's own
 *     work directions — a mapped slug outside them is reported as skipped,
 *     never silently stored.
 */
export function mapClaimLabelsToCatalogSlugs(
  labels: readonly string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const label of labels) {
    const trimmed = (label ?? "").trim();
    if (!trimmed) continue;
    try {
      const s = extractProfileSuggestions(trimmed);
      if (s.skillSlugs.length > 0) out.set(trimmed, [...s.skillSlugs]);
    } catch {
      // A single label failing the lexicon pass must never break the batch.
    }
  }
  return out;
}

/** Distinct catalogued slugs across all mapped labels. */
export function distinctMappedSlugs(map: Map<string, string[]>): string[] {
  const set = new Set<string>();
  for (const slugs of map.values()) for (const s of slugs) set.add(s);
  return [...set];
}
