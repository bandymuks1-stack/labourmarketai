/**
 * Team matching v1 (Explainable Matching v1, Wagon 4).
 *
 * COMPOSES the ONE deterministic engine (`./match-v1` matchWorkerToNeed) —
 * it never forks it: every member is matched individually by the canonical
 * engine, and this module only derives SET-LEVEL facts from those results:
 *
 *   • coverage — which need skills ≥1 ELIGIBLE member covers (with counts);
 *   • set blockers — hard criteria that at least one member failed and NO
 *     member satisfies (a requirement the team as a whole cannot meet);
 *   • per-member roles-covered breakdown (which need skills each covers);
 *   • aggregated missing facts (deduped, with how many members owe each).
 *
 * Doctrine compliance:
 *   • §19: NO global team score. The coverage % basis is always complete
 *     ("n of m need skills covered, k of j members eligible") and exists only
 *     inside ONE need's context. Never persisted.
 *   • §7/§7.1: pure, deterministic, rule-based — same inputs, same output.
 *   • Hard-blocker invariant (same as the engine, guard-tested): a set-level
 *     hard blocker caps the team status at "weak" BEFORE any ordering and
 *     forces eligible=false. No coverage level can outscore it.
 *
 * Intended for demands with structured_v2.target_supply ∈
 * {team, multiple_workers}; the module itself works for any need. Author
 * mandatory/preferred tiers (requirement_priorities) flow through untouched
 * because the per-member results already carry them.
 *
 * This file is PURE (no DB, no fetch). Callers assemble the member subjects
 * from real rows (e.g. engagement_contexts → workers); nothing is invented.
 */

import {
  matchWorkerToNeed,
  matchStrengthOrder,
  MATCH_CALC_VERSION,
  type MatchNeed,
  type MatchResultV1,
  type MatchStatus,
  type MatchSubject,
} from "./match-v1";
import type {
  MatchCalcVersion,
  MatchCriterionResult,
  MatchMissingFact,
} from "./match-criteria-v2";

export interface TeamMemberMatch {
  /** Caller-supplied opaque reference (worker id / anonymized label); falls
   *  back to a stable positional ref. NEVER a display-name identity. */
  readonly memberRef: string;
  /** The member's full canonical engine result (status, tiers, why, gaps). */
  readonly result: MatchResultV1;
  /** Roles-covered breakdown: the need skills THIS member holds. */
  readonly coveredSkillIds: readonly string[];
}

export interface TeamSkillCoverage {
  readonly skillId: string;
  /** Members that hold the skill AND are eligible (no hard blocker). */
  readonly eligibleMembers: number;
  /** All members that hold the skill (incl. ineligible ones — shown so an
   *  "only an ineligible member covers this" situation stays visible). */
  readonly totalMembers: number;
}

/** §19 coverage basis — a % never exists without these numbers. */
export interface TeamCoverageBasis {
  /** Need skills covered by ≥1 ELIGIBLE member. */
  readonly coveredCount: number;
  readonly needTotal: number;
  /** One entry per need skill, stable (sorted) order. */
  readonly entries: readonly TeamSkillCoverage[];
}

export interface TeamAggregatedMissingFact extends MatchMissingFact {
  /** How many members lack/owe this fact (demand-side facts count once per
   *  member evaluation too — the count is the affected-member count). */
  readonly memberCount: number;
}

export type TeamMatchMissingDataCode = "need_not_structured" | "no_team_members";

export interface TeamMatchResultV1 {
  readonly status: MatchStatus;
  readonly calcVersion: MatchCalcVersion;
  /** false when a set-level hard blocker exists, the team is empty, or the
   *  need is unstructured. Coverage can never restore it. */
  readonly eligible: boolean;
  readonly memberCount: number;
  /** Members with eligible=true on their individual result. */
  readonly eligibleMemberCount: number;
  /** null when the need is unstructured (no % without a basis, ever). */
  readonly coverage: TeamCoverageBasis | null;
  /** Hard criteria ≥1 member failed and NO member satisfies — requirements
   *  the team as a whole cannot meet. Provenance (authorMarked) is kept. */
  readonly setBlockers: readonly MatchCriterionResult[];
  readonly members: readonly TeamMemberMatch[];
  /** Aggregated + deduped missing facts across members. */
  readonly missingFacts: readonly TeamAggregatedMissingFact[];
  readonly missingData: readonly TeamMatchMissingDataCode[];
}

export interface TeamMatchMeta {
  /** Optional per-member references, index-aligned with the members array. */
  readonly memberRefs?: readonly string[];
}

/** Same thresholds as the engine's evidence-weighted classification — the
 *  team status derives from eligible-member coverage, then hard caps. */
function coverageStatus(coveredCount: number, needTotal: number): MatchStatus {
  if (needTotal === 0) return "insufficient_data";
  if (coveredCount === 0) return "weak";
  const ratio = coveredCount / needTotal;
  if (ratio >= 0.8) return "strong";
  if (ratio >= 0.5) return "possible";
  return "weak";
}

/**
 * Deterministic team↔need match. Pure: same inputs → same output.
 */
export function matchTeamToNeed(
  need: MatchNeed,
  teamMembers: readonly MatchSubject[],
  teamMeta?: TeamMatchMeta,
): TeamMatchResultV1 {
  // The need's canonical requirement set — the SAME id merge the engine uses.
  const needSkillIds = [
    ...new Set(
      [...(need.skillIds ?? []), ...(need.escoSkillUris ?? [])].filter(
        (u) => u.trim() !== "",
      ),
    ),
  ].sort();

  const members: TeamMemberMatch[] = teamMembers.map((subject, i) => {
    const result = matchWorkerToNeed(need, subject);
    return {
      memberRef: teamMeta?.memberRefs?.[i] ?? `member_${i + 1}`,
      result,
      coveredSkillIds: result.skillFit?.matchedUris ?? [],
    };
  });

  const missingData: TeamMatchMissingDataCode[] = [];
  if (needSkillIds.length === 0) missingData.push("need_not_structured");
  if (members.length === 0) missingData.push("no_team_members");

  // ── Honest insufficient_data terminals (nothing derivable). ──────────────
  if (needSkillIds.length === 0 || members.length === 0) {
    return {
      status: "insufficient_data",
      calcVersion: MATCH_CALC_VERSION,
      eligible: false,
      memberCount: members.length,
      eligibleMemberCount: members.filter((m) => m.result.eligible).length,
      coverage: null,
      setBlockers: [],
      members,
      missingFacts: aggregateMissingFacts(members),
      missingData,
    };
  }

  const eligibleMemberCount = members.filter((m) => m.result.eligible).length;

  // ── Set-level coverage (eligible members carry it; all-member counts stay
  //    visible so an ineligible-only cover is never silently presented). ────
  const entries: TeamSkillCoverage[] = needSkillIds.map((skillId) => {
    let eligibleMembers = 0;
    let totalMembers = 0;
    for (const m of members) {
      if (!m.coveredSkillIds.includes(skillId)) continue;
      totalMembers += 1;
      if (m.result.eligible) eligibleMembers += 1;
    }
    return { skillId, eligibleMembers, totalMembers };
  });
  const coveredCount = entries.filter((e) => e.eligibleMembers > 0).length;
  const coverage: TeamCoverageBasis = {
    coveredCount,
    needTotal: needSkillIds.length,
    entries,
  };

  // ── Set-level blockers: a hard criterion ≥1 member FAILED and NO member
  //    MEETS. First-appearance record wins (stable member order) so the
  //    authorMarked provenance of the blocking reason is preserved. ─────────
  const metCriteria = new Set<string>();
  for (const m of members) {
    for (const c of m.result.matchedHard) metCriteria.add(c.criterion);
  }
  const setBlockers: MatchCriterionResult[] = [];
  const seenBlockers = new Set<string>();
  for (const m of members) {
    for (const c of m.result.blocking) {
      if (metCriteria.has(c.criterion) || seenBlockers.has(c.criterion)) continue;
      seenBlockers.add(c.criterion);
      setBlockers.push(c);
    }
  }

  // ── Status: coverage classification, then the hard caps (never upward). ──
  let status = coverageStatus(coveredCount, needSkillIds.length);
  // STRUCTURAL INVARIANT (same as the engine): a set-level hard blocker caps
  // the status at "weak" BEFORE any ordering; coverage cannot outscore it.
  if (setBlockers.length > 0 && matchStrengthOrder(status) > matchStrengthOrder("weak")) {
    status = "weak";
  }
  // No eligible member at all → the team cannot currently staff the need.
  if (eligibleMemberCount === 0 && matchStrengthOrder(status) > matchStrengthOrder("weak")) {
    status = "weak";
  }

  const eligible = setBlockers.length === 0 && eligibleMemberCount > 0;

  return {
    status,
    calcVersion: MATCH_CALC_VERSION,
    eligible,
    memberCount: members.length,
    eligibleMemberCount,
    coverage,
    setBlockers,
    members,
    missingFacts: aggregateMissingFacts(members),
    missingData,
  };
}

/** Dedupe missing facts across members (criterion+side+source) with an
 *  affected-member count. First-appearance order — deterministic. */
function aggregateMissingFacts(
  members: readonly TeamMemberMatch[],
): TeamAggregatedMissingFact[] {
  const out: TeamAggregatedMissingFact[] = [];
  const indexByKey = new Map<string, number>();
  for (const m of members) {
    // A member reports a given fact at most once (engine dedupes), so the
    // count equals the number of affected members.
    for (const f of m.result.missingFacts) {
      const key = `${f.criterion}|${f.side}|${f.source}`;
      const idx = indexByKey.get(key);
      if (idx == null) {
        indexByKey.set(key, out.length);
        out.push({ ...f, memberCount: 1 });
      } else {
        out[idx] = { ...out[idx], memberCount: out[idx].memberCount + 1 };
      }
    }
  }
  return out;
}
