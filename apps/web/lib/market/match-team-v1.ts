/**
 * Team matching v1 (Explainable Matching v1, Wagon 4).
 *
 * CONSUMES the canonical team read-model contract (TeamMatchInputV1, see
 * ./team-match-contract.ts — Wagon 2 owns the read model that fills it) and
 * COMPOSES the ONE deterministic engine (`./match-v1` matchWorkerToNeed) —
 * it never forks it and never infers team state from tables itself.
 *
 * Two evaluation bases, always named on the result (§19: no number without
 * its basis):
 *   • "member_results" — when the caller legitimately holds the members'
 *     MatchSubjects, every member runs through the canonical engine and the
 *     set-level facts derive from those results (eligible-member coverage,
 *     set blockers = hard criteria no member satisfies, per-member
 *     roles-covered breakdown, aggregated missing facts).
 *   • "team_aggregate" — when only the contract aggregate is available,
 *     coverage derives from skillComposition and only aggregate-evaluable
 *     checks run (languages, availability, own-vehicle, accommodation).
 *     Per-member eligibility is then honestly UNKNOWN (null), never guessed.
 *
 * Contract semantics (binding): null / "unknown" / [] mean NOT STATED and
 * surface as missing facts — never as matches or mismatches.
 *
 * Doctrine compliance:
 *   • §19: NO global team score; coverage always ships its full basis.
 *   • §7/§7.1: pure, deterministic, rule-based.
 *   • Hard-blocker invariant (guard-tested): a set-level hard blocker caps
 *     the team status at "weak" BEFORE any ordering and forces
 *     eligible=false. No coverage level can outscore it.
 *
 * This file is PURE (no DB, no fetch). Author mandatory/preferred tiers
 * (structured_v2.requirement_priorities) flow through untouched.
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
import {
  compareLanguagesV2,
  type MatchCalcVersion,
  type MatchCriterionResult,
  type MatchMissingFact,
  type WorkerLanguageFact,
} from "./match-criteria-v2";
import type { TeamMatchInputV1 } from "./team-match-contract";

export type { TeamMatchInputV1 } from "./team-match-contract";

export interface TeamMemberMatch {
  /** Caller-supplied opaque reference (worker id / anonymized label); falls
   *  back to a stable positional ref. NEVER a display-name identity. */
  readonly memberRef: string;
  /** The member's full canonical engine result (status, tiers, why, gaps). */
  readonly result: MatchResultV1;
  /** Roles-covered breakdown: the need skills THIS member holds. */
  readonly coveredSkillIds: readonly string[];
}

export type TeamMatchBasis = "member_results" | "team_aggregate";

export interface TeamSkillCoverage {
  readonly skillId: string;
  /** Holders that are ELIGIBLE (member_results basis). On the team_aggregate
   *  basis per-member eligibility is unknowable → null, never guessed. */
  readonly eligibleMembers: number | null;
  /** All members holding the skill (declared). */
  readonly totalMembers: number;
}

/** §19 coverage basis — a % never exists without these numbers. */
export interface TeamCoverageBasis {
  readonly basis: TeamMatchBasis;
  /** member_results: need skills covered by ≥1 ELIGIBLE member.
   *  team_aggregate: need skills covered by ≥1 declared member. */
  readonly coveredCount: number;
  readonly needTotal: number;
  /** One entry per need skill, stable (sorted) order. */
  readonly entries: readonly TeamSkillCoverage[];
}

export interface TeamAggregatedMissingFact extends MatchMissingFact {
  /** How many members lack/owe this fact (1 for team-level facts). */
  readonly memberCount: number;
}

export type TeamMatchMissingDataCode =
  | "need_not_structured"
  | "no_team_members"
  | "team_skills_not_stated";

export interface TeamMatchResultV1 {
  readonly teamId: string;
  readonly status: MatchStatus;
  readonly calcVersion: MatchCalcVersion;
  /** Which facts the set-level result derives from. */
  readonly basis: TeamMatchBasis;
  /** false when a set-level hard blocker exists, the team is empty, or
   *  nothing is computable. Coverage can never restore it. */
  readonly eligible: boolean;
  /** Active team members per the canonical read model. */
  readonly memberCount: number;
  /** Members with eligible=true individual results (member_results basis);
   *  null on the team_aggregate basis (unknowable, never guessed). */
  readonly eligibleMemberCount: number | null;
  /** null when the need is unstructured or team skills are not stated. */
  readonly coverage: TeamCoverageBasis | null;
  /** Hard criteria the team as a whole cannot meet. member_results: ≥1
   *  member failed and none satisfies. team_aggregate: a both-sides-stated
   *  aggregate conflict. Provenance (authorMarked) is kept. */
  readonly setBlockers: readonly MatchCriterionResult[];
  /** Per-member breakdown (member_results basis only; [] on aggregate). */
  readonly members: readonly TeamMemberMatch[];
  /** Aggregated + deduped missing facts. */
  readonly missingFacts: readonly TeamAggregatedMissingFact[];
  readonly missingData: readonly TeamMatchMissingDataCode[];
}

/** Optional member-level inputs, usable ONLY where the caller legitimately
 *  reads member subjects (e.g. the superadmin workbench). */
export interface TeamMemberSubjects {
  readonly subjects: readonly MatchSubject[];
  /** Index-aligned opaque refs for the breakdown. */
  readonly refs?: readonly string[];
}

/** Same thresholds as the engine's coverage classification. */
function coverageStatus(coveredCount: number, needTotal: number): MatchStatus {
  if (needTotal === 0) return "insufficient_data";
  if (coveredCount === 0) return "weak";
  const ratio = coveredCount / needTotal;
  if (ratio >= 0.8) return "strong";
  if (ratio >= 0.5) return "possible";
  return "weak";
}

function needSkillIdsOf(need: MatchNeed): string[] {
  return [
    ...new Set(
      [...(need.skillIds ?? []), ...(need.escoSkillUris ?? [])].filter(
        (u) => u.trim() !== "",
      ),
    ),
  ].sort();
}

/**
 * Deterministic team↔need match over the canonical contract. Pure.
 */
export function matchTeamToNeed(
  need: MatchNeed,
  team: TeamMatchInputV1,
  members?: TeamMemberSubjects,
): TeamMatchResultV1 {
  const needSkillIds = needSkillIdsOf(need);
  const memberMode = members != null && members.subjects.length > 0;

  const memberMatches: TeamMemberMatch[] = memberMode
    ? members!.subjects.map((subject, i) => {
        const result = matchWorkerToNeed(need, subject);
        return {
          memberRef: members!.refs?.[i] ?? `member_${i + 1}`,
          result,
          coveredSkillIds: result.skillFit?.matchedUris ?? [],
        };
      })
    : [];

  const missingData: TeamMatchMissingDataCode[] = [];
  if (needSkillIds.length === 0) missingData.push("need_not_structured");
  if (team.activeMemberCount === 0 && !memberMode) missingData.push("no_team_members");

  const base = {
    teamId: team.teamId,
    calcVersion: MATCH_CALC_VERSION,
    memberCount: memberMode ? memberMatches.length : team.activeMemberCount,
    members: memberMatches,
  } as const;

  // ── Honest insufficient_data terminals. ───────────────────────────────────
  if (needSkillIds.length === 0 || (team.activeMemberCount === 0 && !memberMode)) {
    return {
      ...base,
      status: "insufficient_data",
      basis: memberMode ? "member_results" : "team_aggregate",
      eligible: false,
      eligibleMemberCount: memberMode
        ? memberMatches.filter((m) => m.result.eligible).length
        : null,
      coverage: null,
      setBlockers: [],
      missingFacts: aggregateMemberMissingFacts(memberMatches),
      missingData,
    };
  }

  return memberMode
    ? matchByMemberResults(base, needSkillIds, memberMatches, missingData)
    : matchByTeamAggregate(base, need, needSkillIds, team, missingData);
}

// ── member_results basis ─────────────────────────────────────────────────────

function matchByMemberResults(
  base: {
    readonly teamId: string;
    readonly calcVersion: MatchCalcVersion;
    readonly memberCount: number;
    readonly members: readonly TeamMemberMatch[];
  },
  needSkillIds: readonly string[],
  members: readonly TeamMemberMatch[],
  missingData: TeamMatchMissingDataCode[],
): TeamMatchResultV1 {
  const eligibleMemberCount = members.filter((m) => m.result.eligible).length;

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
  const coveredCount = entries.filter((e) => (e.eligibleMembers ?? 0) > 0).length;

  // Set blockers: a hard criterion ≥1 member FAILED and NO member MEETS.
  // First-appearance record wins (stable member order) so authorMarked
  // provenance of the blocking reason is preserved.
  const metCriteria = new Set<string>();
  for (const m of members) {
    for (const c of m.result.matchedHard) metCriteria.add(c.criterion);
  }
  const setBlockers: MatchCriterionResult[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    for (const c of m.result.blocking) {
      if (metCriteria.has(c.criterion) || seen.has(c.criterion)) continue;
      seen.add(c.criterion);
      setBlockers.push(c);
    }
  }

  let status = coverageStatus(coveredCount, needSkillIds.length);
  // STRUCTURAL INVARIANT: a set-level hard blocker caps at weak BEFORE any
  // ordering; coverage cannot outscore it.
  if (setBlockers.length > 0 && matchStrengthOrder(status) > matchStrengthOrder("weak")) {
    status = "weak";
  }
  if (eligibleMemberCount === 0 && matchStrengthOrder(status) > matchStrengthOrder("weak")) {
    status = "weak";
  }

  return {
    ...base,
    status,
    basis: "member_results",
    eligible: setBlockers.length === 0 && eligibleMemberCount > 0,
    eligibleMemberCount,
    coverage: {
      basis: "member_results",
      coveredCount,
      needTotal: needSkillIds.length,
      entries,
    },
    setBlockers,
    missingFacts: aggregateMemberMissingFacts(members),
    missingData,
  };
}

// ── team_aggregate basis ─────────────────────────────────────────────────────

function matchByTeamAggregate(
  base: {
    readonly teamId: string;
    readonly calcVersion: MatchCalcVersion;
    readonly memberCount: number;
    readonly members: readonly TeamMemberMatch[];
  },
  need: MatchNeed,
  needSkillIds: readonly string[],
  team: TeamMatchInputV1,
  missingData: TeamMatchMissingDataCode[],
): TeamMatchResultV1 {
  const missingFacts: TeamAggregatedMissingFact[] = [];
  const setBlockers: MatchCriterionResult[] = [];
  let softCap = false;
  const v2 = need.structuredV2 ?? null;
  const priorities = v2?.requirement_priorities ?? null;

  // Skills — [] means NOT STATED (contract), never "holds nothing".
  let coverage: TeamCoverageBasis | null = null;
  if (team.skillComposition.length === 0) {
    missingData.push("team_skills_not_stated");
    missingFacts.push({
      criterion: "skills_coverage",
      side: "worker",
      source: "team_match_input_v1.skillComposition",
      memberCount: base.memberCount,
    });
  } else {
    const declaredBySlug = new Map<string, number>();
    for (const s of team.skillComposition) {
      declaredBySlug.set(s.slug, s.membersDeclared);
    }
    const entries: TeamSkillCoverage[] = needSkillIds.map((skillId) => ({
      skillId,
      eligibleMembers: null, // unknowable on the aggregate basis — never guessed
      totalMembers: declaredBySlug.get(skillId) ?? 0,
    }));
    coverage = {
      basis: "team_aggregate",
      coveredCount: entries.filter((e) => e.totalMembers > 0).length,
      needTotal: needSkillIds.length,
      entries,
    };
  }

  // Languages — reuse the canonical comparator over the stated composition.
  // Entries with an unstated level cannot PROVE a leveled requirement; they
  // become an honest missing fact instead of a fabricated pass/fail.
  const langSource = "team_match_input_v1.languageComposition";
  const requiredV2Langs = v2?.requirements?.languages ?? [];
  const legacyLangs = need.languages ?? [];
  if (requiredV2Langs.length > 0 || legacyLangs.length > 0) {
    if (team.languageComposition.length === 0) {
      missingFacts.push({
        criterion: "language",
        side: "worker",
        source: langSource,
        memberCount: base.memberCount,
      });
    } else {
      const statedFacts: WorkerLanguageFact[] = team.languageComposition
        .filter((l) => l.level != null && l.memberCount > 0)
        .map((l) => ({ lang: l.code, level: l.level as string }));
      const statedCodes = new Set(
        team.languageComposition
          .filter((l) => l.memberCount > 0)
          .map((l) => l.code.trim().toLowerCase()),
      );
      let levelUnknown = false;
      if (requiredV2Langs.length > 0) {
        const cmp = compareLanguagesV2(v2, statedFacts);
        // worker_unstated = no LEVELED facts at all — every requirement is
        // unproven; hard_not_met lists the failing subset.
        const failedLangs =
          cmp?.kind === "hard_not_met"
            ? cmp.failedLangs
            : cmp?.kind === "worker_unstated"
              ? requiredV2Langs.map((r) => r.lang)
              : [];
        // A required language held only at an UNSTATED level is unknown,
        // not a conflict (contract: null ⇒ missing fact).
        const trulyMissing = failedLangs.filter(
          (l) => !statedCodes.has(l.trim().toLowerCase()),
        );
        if (trulyMissing.length > 0) {
          setBlockers.push({
            criterion: "language",
            class: "hard",
            outcome: "not_met",
            source: langSource,
          });
        } else if (failedLangs.length > 0) {
          levelUnknown = true;
        }
      }
      const legacyMissing = legacyLangs.filter(
        (l) => !statedCodes.has(l.trim().toLowerCase()),
      );
      if (
        legacyMissing.length > 0 &&
        !setBlockers.some((b) => b.criterion === "language")
      ) {
        setBlockers.push({
          criterion: "language",
          class: "hard",
          outcome: "not_met",
          source: langSource,
        });
      }
      if (levelUnknown && !setBlockers.some((b) => b.criterion === "language")) {
        missingFacts.push({
          criterion: "language",
          side: "worker",
          source: `${langSource}.level`,
          memberCount: base.memberCount,
        });
      }
    }
  }

  // Availability — "unknown" is a missing fact; explicit not_available is a
  // soft cap (mirrors the engine's explicitly-unavailable semantics).
  if (team.availability.status === "unknown") {
    missingFacts.push({
      criterion: "availability",
      side: "worker",
      source: "team_match_input_v1.availability",
      memberCount: base.memberCount,
    });
  } else if (team.availability.status === "not_available") {
    softCap = true;
  }

  // Own vehicle — evaluated only when the demand states the requirement.
  const vehicleRequired = v2?.transport?.own_vehicle_required === true;
  const vehiclePreferred = v2?.requirements?.own_vehicle === true;
  if (vehicleRequired || vehiclePreferred) {
    const vehicleTier = priorities?.own_vehicle ?? null;
    const vehicleIsHard =
      vehicleTier !== null ? vehicleTier === "mandatory" : vehicleRequired;
    if (team.transport.ownTransport == null) {
      missingFacts.push({
        criterion: "own_vehicle",
        side: "worker",
        source: "team_match_input_v1.transport.ownTransport",
        memberCount: base.memberCount,
      });
    } else if (team.transport.ownTransport === false && vehicleIsHard) {
      setBlockers.push({
        criterion: "own_vehicle",
        class: "hard",
        outcome: "not_met",
        source: "team_match_input_v1.transport.ownTransport",
        ...(vehicleTier !== null ? { authorMarked: true } : {}),
      });
    }
  }

  // Accommodation — worker-side need vs stated non-provision; the author's
  // mandatory tier upgrades the mismatch to a hard set blocker (default: the
  // engine's soft-cap semantics).
  const provided =
    need.accommodationProvided ??
    (v2?.accommodation?.state === "offered"
      ? true
      : v2?.accommodation?.state === "not_offered"
        ? false
        : null);
  if (provided === false) {
    if (team.accommodationNeeded == null) {
      missingFacts.push({
        criterion: "accommodation",
        side: "worker",
        source: "team_match_input_v1.accommodationNeeded",
        memberCount: base.memberCount,
      });
    } else if (team.accommodationNeeded === true) {
      if (priorities?.accommodation === "mandatory") {
        setBlockers.push({
          criterion: "accommodation",
          class: "hard",
          outcome: "not_met",
          source: "team_match_input_v1.accommodationNeeded",
          authorMarked: true,
        });
      } else {
        softCap = true;
      }
    }
  }

  // ── Status: coverage classification, then caps (never upward). ───────────
  let status: MatchStatus;
  if (coverage === null) {
    status = "insufficient_data";
  } else {
    status = coverageStatus(coverage.coveredCount, coverage.needTotal);
  }
  if (setBlockers.length > 0 && matchStrengthOrder(status) > matchStrengthOrder("weak")) {
    status = "weak";
  }
  if (softCap && matchStrengthOrder(status) > matchStrengthOrder("possible")) {
    status = "possible";
  }

  return {
    ...base,
    status,
    basis: "team_aggregate",
    eligible: setBlockers.length === 0 && coverage !== null,
    eligibleMemberCount: null,
    coverage,
    setBlockers,
    missingFacts,
    missingData,
  };
}

/** Dedupe missing facts across member results (criterion+side+source) with an
 *  affected-member count. First-appearance order — deterministic. */
function aggregateMemberMissingFacts(
  members: readonly TeamMemberMatch[],
): TeamAggregatedMissingFact[] {
  const out: TeamAggregatedMissingFact[] = [];
  const indexByKey = new Map<string, number>();
  for (const m of members) {
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
