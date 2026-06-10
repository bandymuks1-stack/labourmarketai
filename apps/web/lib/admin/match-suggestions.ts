/**
 * Matching MVP — pure, rule-based shortlist (Workstream A).
 *
 * Doctrine §7 (AI-never-lies) shape: every suggestion carries ONLY
 * data-derived evidence reasons from a fixed enum — no numeric "fit score"
 * is produced or shown anywhere, and the ordering is a transparent
 * rule-based sort (filter matches first, then verified evidence depth).
 * The HUMAN decides; this only shortens the reading.
 *
 * Pure module: no I/O, no supabase — inputs come from the workbench lists.
 */

import type {
  DemandRow,
  SupplyWorkerRow,
} from "@/lib/admin/matching-workbench";

/** Fixed evidence-reason enum — each maps to an i18n label and is provably
 *  derivable from canonical data. Never extended at render time. */
export type MatchReason =
  | "country_match"
  | "preferred_country_match"
  | "available_now"
  | "profession_token_match"
  | "verified_skills"
  | "manager_confirmations"
  | "journal_evidence";

export interface MatchSuggestion {
  readonly worker: SupplyWorkerRow;
  readonly reasons: readonly MatchReason[];
}

const TOKEN_SPLIT_RE = /[^\p{L}\p{N}]+/u;
const MIN_TOKEN_LEN = 4;

/** Tokens from the request's free-text role/title/summary, lowercased. */
function demandTokens(demand: DemandRow): readonly string[] {
  const text = [demand.roleOrWorkType, demand.title, demand.needSummary]
    .filter((v): v is string => !!v)
    .join(" ")
    .toLowerCase();
  return [
    ...new Set(text.split(TOKEN_SPLIT_RE).filter((t) => t.length >= MIN_TOKEN_LEN)),
  ];
}

/** A profession slug matches when any demand token is a prefix of any slug
 *  word or vice versa (e.g. "santechnik..." vs "plumber" won't match across
 *  languages — that's honest: cross-language matching arrives with the ESCO
 *  canon (gated), not by guessing here). */
function professionTokenMatch(
  slugs: readonly string[],
  tokens: readonly string[],
): boolean {
  for (const slug of slugs) {
    const words = slug.toLowerCase().split(/[-_]/);
    for (const w of words) {
      if (w.length < MIN_TOKEN_LEN) continue;
      for (const t of tokens) {
        if (w.startsWith(t) || t.startsWith(w)) return true;
      }
    }
  }
  return false;
}

export function buildMatchSuggestions(
  demand: DemandRow,
  supply: readonly SupplyWorkerRow[],
  maxResults = 5,
): readonly MatchSuggestion[] {
  const tokens = demandTokens(demand);
  const country = demand.country?.trim().toUpperCase() ?? null;

  const scored = supply.map((worker) => {
    const reasons: MatchReason[] = [];
    if (country && worker.locationCountry?.toUpperCase() === country) {
      reasons.push("country_match");
    } else if (
      country &&
      worker.preferredCountries.some((c) => c.toUpperCase() === country)
    ) {
      reasons.push("preferred_country_match");
    }
    if (worker.availabilityStatus === "available") reasons.push("available_now");
    if (professionTokenMatch(worker.professionSlugs, tokens)) {
      reasons.push("profession_token_match");
    }
    if (worker.skillsConfirmed > 0) reasons.push("verified_skills");
    if (worker.managerConfirmations > 0) reasons.push("manager_confirmations");
    if (worker.journalEntries > 0) reasons.push("journal_evidence");
    return { worker, reasons };
  });

  // Transparent rule-based order: more filter-type matches first, then
  // deeper verified evidence. No composite numeric score is exposed.
  const filterWeight = (s: MatchSuggestion): number =>
    (s.reasons.includes("country_match") ? 2 : 0) +
    (s.reasons.includes("preferred_country_match") ? 1 : 0) +
    (s.reasons.includes("available_now") ? 1 : 0) +
    (s.reasons.includes("profession_token_match") ? 2 : 0);

  return scored
    .filter((s) => s.reasons.length > 0)
    .sort(
      (a, b) =>
        filterWeight(b) - filterWeight(a) ||
        b.worker.skillsConfirmed - a.worker.skillsConfirmed ||
        b.worker.managerConfirmations - a.worker.managerConfirmations ||
        b.worker.journalEntries - a.worker.journalEntries,
    )
    .slice(0, maxResults);
}

/** Supply-panel filters (server-rendered via searchParams). */
export function filterSupply(
  supply: readonly SupplyWorkerRow[],
  opts: { country: string | null; availability: string | null },
): readonly SupplyWorkerRow[] {
  return supply.filter((w) => {
    if (opts.country) {
      const c = opts.country.toUpperCase();
      const hit =
        w.locationCountry?.toUpperCase() === c ||
        w.preferredCountries.some((p) => p.toUpperCase() === c);
      if (!hit) return false;
    }
    if (opts.availability && w.availabilityStatus !== opts.availability) {
      return false;
    }
    return true;
  });
}
