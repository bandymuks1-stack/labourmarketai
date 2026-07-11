/**
 * Matching v1 — deterministic worker↔need matching that lets Work Journal
 * skill evidence actually influence the result (Full Cycle Sprint v1, Step 3).
 *
 * COMPOSES the canonical contextual-fit engine (./fit `computeContextFit`,
 * doctrine §19) — it does NOT replace or duplicate it. fit.ts answers "what
 * share of the need's skills does the subject hold (and how many confirmed)";
 * this module answers "given that skill fit PLUS the evidence strength of the
 * matched skills PLUS the discrete compatibility checks (location, availability,
 * language, pay, accommodation, profession), how does this worker fit THIS
 * need, and WHY".
 *
 * Doctrine compliance:
 *   • §19 (Fit, ne reitingas): there is NO global person/company score. Every
 *     number here is need-context only, returned WITH its basis, never
 *     persisted. The headline % stays `computeContextFit`'s coverage
 *     (matched/total). Evidence strength is exposed as a per-tier breakdown
 *     (confirmed/journal/self) — the §19(c) "confirmed vs declared" share,
 *     refined to the three real `worker_skills.source` tiers.
 *   • §7 / §7.1 (AI never lies): pure, deterministic, rule-based. No external
 *     AI, no random, no fabricated data. Same inputs → same output.
 *   • Evidence order (sprint goal): manager_confirmed > work_journal >
 *     self_declared influences the status classification, so a journal-backed
 *     match outranks a purely self-declared one at equal coverage.
 *
 * This file is PURE (no DB, no fetch, no persistence). Callers assemble the
 * need/subject from real rows; the engine never invents data.
 */

import { computeContextFit, type FitBasis, type SubjectEscoSkill } from "./fit";
import { professionRelatedness } from "@/lib/taxonomy/profession-skills";
import type { NeedSkillSource } from "./need-skills";
import type { StructuredDemandV2 } from "@/lib/demand/structured-demand-v2";
import {
  MATCH_CALC_VERSION,
  compareCompensationV2,
  compareStartDateV2,
  engagementFormAccepted,
  type MatchCalcVersion,
  type MatchCriterionResult,
  type MatchMissingFact,
} from "./match-criteria-v2";

// Matching contract v2 (PR 4) — ONE engine, ONE import surface: the criterion
// vocabulary + pure comparators live in ./match-criteria-v2 and are re-exported
// here so no caller ever grows a second matching entry point.
export {
  MATCH_CALC_VERSION,
  NEGOTIABLE_SALARY_GAP_RATIO,
  WORKER_CONTRACT_TYPE_ACCEPTS,
  compareCompensationV2,
  compareStartDateV2,
  engagementFormAccepted,
} from "./match-criteria-v2";
export type {
  MatchCalcVersion,
  MatchCriterionClass,
  MatchCriterionId,
  MatchCriterionOutcome,
  MatchCriterionResult,
  MatchMissingFact,
} from "./match-criteria-v2";

/** Real `worker_skills.source` tiers, strongest first. */
export type EvidenceTier = "manager_confirmed" | "work_journal" | "self_declared";

/** Map a stored `worker_skills.source` value to the evidence tier. Pure;
 *  unknown/missing sources fall back to the weakest (self_declared) — never
 *  inflated. Lives here (not in the server-only read layer) so it is
 *  unit-testable. */
export function sourceToEvidence(source: string | null | undefined): EvidenceTier {
  if (source === "manager_confirmed") return "manager_confirmed";
  if (source === "work_journal") return "work_journal";
  return "self_declared";
}

/** Need-context coverage weight per evidence tier (manager > journal > self).
 *  Used ONLY to classify the need-context match status — never exposed or
 *  persisted as a person score. */
const EVIDENCE_WEIGHT: Record<EvidenceTier, number> = {
  manager_confirmed: 1.0,
  work_journal: 0.7,
  self_declared: 0.4,
};

export interface MatchSubjectSkill {
  /** Canonical skill id — the catalogue slug (legacy: an ESCO URI). */
  readonly uri: string;
  /** Evidence tier from worker_skills.source (NEVER inferred). */
  readonly evidence: EvidenceTier;
}

/** The company need, as much as the structured payload + demand row carry.
 *  All fields optional except the skill set — missing fields become honest
 *  "missing data" notes, never assumptions. */
export interface MatchNeed {
  /** Canonical skill ids the need requires — catalogue SLUGS since PR4
   *  (see lib/market/need-skills.ts). Merged with `escoSkillUris`. */
  readonly skillIds?: readonly string[];
  /** Legacy field: ESCO skill URIs (kept for back-compat; matching never
   *  DEPENDS on ESCO — a NULL esco_uri must never make matching inert). */
  readonly escoSkillUris?: readonly string[];
  /** Where the requirement set came from (need-skills derivation). A
   *  recognized/expanded need is labeled honest-suggestion, never silently
   *  presented as human-structured. */
  readonly needSource?: NeedSkillSource | null;
  readonly professionSlug?: string | null;
  /** ISO-3166 alpha-2 country the work is in. */
  readonly country?: string | null;
  /** City/locality of the work (free-form; compared normalized). */
  readonly city?: string | null;
  /** Work-site coordinates + acceptable radius, when they exist. NEVER
   *  invented — engine-ready, data-gated. */
  readonly lat?: number | null;
  readonly lng?: number | null;
  readonly radiusKm?: number | null;
  /** Language codes/labels the need requires. */
  readonly languages?: readonly string[];
  /** Pay the company offers (ceiling, EUR). */
  readonly payOfferedEurMax?: number | null;
  /** Does the need provide accommodation? */
  readonly accommodationProvided?: boolean | null;
  /** ISO date the need starts. */
  readonly startDate?: string | null;
  /** The demand's typed structured_v2 cluster when the payload carries one
   *  (read via readStructuredDemandV2 — canonical contract §2). Optional and
   *  additive: absence keeps every existing check EXACTLY as before. */
  readonly structuredV2?: StructuredDemandV2 | null;
}

export interface MatchSubject {
  readonly skills: readonly MatchSubjectSkill[];
  readonly professionSlug?: string | null;
  /** ISO-3166 alpha-2 of where the worker currently is. */
  readonly country?: string | null;
  /** City/locality the worker is in or prefers (free-form). */
  readonly city?: string | null;
  /** Worker coordinates, when the worker has shared them. NEVER invented. */
  readonly lat?: number | null;
  readonly lng?: number | null;
  /** Countries the worker will relocate to / work in. */
  readonly preferredCountries?: readonly string[];
  readonly languages?: readonly string[];
  readonly availabilityStatus?: "available" | "busy" | "unavailable" | string | null;
  /** ISO date the worker is free from. */
  readonly availableFrom?: string | null;
  /** Worker's expected minimum pay (EUR). */
  readonly salaryMinEur?: number | null;
  readonly accommodationNeeded?: boolean | null;
  /** workers.preferred_contract_type ('employment' | 'subcontract' |
   *  'temporary' | 'any') — engagement-form hard check fires ONLY when both
   *  sides stated their form (contract v2). Never inferred. */
  readonly preferredContractType?: string | null;
}

/** Great-circle distance in km (haversine). Pure; used only when BOTH sides
 *  carry real coordinates. */
export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type MatchStatus = "strong" | "possible" | "weak" | "insufficient_data";

/** Strongest-first ordering so callers/tests can compare two matches. */
export const MATCH_STRENGTH_ORDER: Record<MatchStatus, number> = {
  insufficient_data: 0,
  weak: 1,
  possible: 2,
  strong: 3,
};
export function matchStrengthOrder(status: MatchStatus): number {
  return MATCH_STRENGTH_ORDER[status];
}

/** Positive signals — why the worker fits. Code + params; the UI renders the
 *  localized sentence (slug→JSON, §2/§10), never a hardcoded string here. */
export type MatchReason =
  | { readonly code: "skill_fit"; readonly matched: number; readonly total: number; readonly confirmed: number }
  | { readonly code: "skills_journal_supported"; readonly count: number }
  | { readonly code: "skills_manager_confirmed"; readonly count: number }
  | { readonly code: "country_match" }
  | { readonly code: "city_match" }
  | { readonly code: "location_within_radius"; readonly km: number; readonly radiusKm: number }
  | { readonly code: "mobility_match" }
  | { readonly code: "available_now" }
  | { readonly code: "language_match" }
  | { readonly code: "profession_match" }
  | { readonly code: "profession_related"; readonly sharedSkillRatio: number }
  | { readonly code: "pay_within_offer" }
  | { readonly code: "accommodation_ok" };

/** Gaps — what is missing or incompatible. */
export type MatchGap =
  | { readonly code: "skills_missing"; readonly count: number; readonly uris: readonly string[] }
  | { readonly code: "language_missing"; readonly required: readonly string[] }
  | { readonly code: "country_mismatch" }
  | { readonly code: "location_outside_radius"; readonly km: number; readonly radiusKm: number }
  | { readonly code: "pay_above_offer"; readonly expected: number; readonly offered: number }
  | { readonly code: "accommodation_needed_not_provided" }
  | { readonly code: "profession_mismatch" };

/** Honest "we don't know" — drives missing-data reasons, never assumptions. */
export type MatchMissingDataCode =
  | "need_not_structured"
  | "need_recognized_not_confirmed"
  | "no_subject_skills"
  | "availability_unknown"
  | "location_unknown"
  | "pay_unknown"
  | "language_unknown";

/** The single clear next step for THIS result (owner mandate: matching must
 *  produce a next action, not just a number). Codes only — the UI localizes. */
export type MatchNextAction =
  | "structure_demand" // nothing derivable — describe/structure the need
  | "confirm_recognized_need" // requirements came from text recognition → human confirms
  | "review_and_shortlist" // strong/possible — open the candidate, shortlist
  | "review_gaps"; // weak — see missing skills / mismatches

export type MatchAvailability = "available" | "busy" | "unavailable" | "unknown";

export interface MatchResultV1 {
  readonly status: MatchStatus;
  /** §19 contextual coverage basis (null when the need is unstructured). */
  readonly skillFit: FitBasis | null;
  /** §19(c) confirmed-vs-declared, refined to the three real tiers. Counts the
   *  MATCHED skills only (skills that are both required and held). */
  readonly evidence: {
    readonly matchedManagerConfirmed: number;
    readonly matchedJournalSupported: number;
    readonly matchedSelfDeclared: number;
  };
  readonly reasons: readonly MatchReason[];
  readonly gaps: readonly MatchGap[];
  readonly missingData: readonly MatchMissingDataCode[];
  /** Normalized availability (unknown is honest, never assumed). */
  readonly availability: MatchAvailability;
  /** The one clear next step for this result. */
  readonly nextAction: MatchNextAction;

  // ── Matching contract v2 (PR 4) — additive per-criterion tiers ────────────
  /** Deterministic-rules calculation version ("2"). */
  readonly calcVersion: MatchCalcVersion;
  /** false the moment ANY hard criterion fails (or a hard criterion is
   *  unknowable → insufficient_data). A weighted score can never restore it. */
  readonly eligible: boolean;
  /** Hard criteria that were checked and MET. */
  readonly matchedHard: readonly MatchCriterionResult[];
  /** Hard criteria that FAILED — each one forces eligible=false and caps the
   *  status below "possible" (structural invariant, guard-tested). */
  readonly blocking: readonly MatchCriterionResult[];
  /** Weighted criteria that were met — ordering signals, never gates. */
  readonly strengths: readonly MatchCriterionResult[];
  /** Discussion points — never block, never silently boost. */
  readonly negotiables: readonly MatchCriterionResult[];
  /** Facts a side has not provided (criterion + which side must provide).
   *  Missing data NEVER fabricates an outcome. (Sits beside the legacy
   *  `missingData` code list, which stays untouched for compatibility.) */
  readonly missingFacts: readonly MatchMissingFact[];
}

/**
 * Deterministic need-context ranking (§19: order candidates FOR ONE need —
 * never a global person score). Status, then coverage, then confirmed share,
 * then explicit availability over unknown/unavailable, then stable.
 * Shared by scouting and the fixtures so ranking cannot drift apart.
 */
export function compareMatches(a: MatchResultV1, b: MatchResultV1): number {
  const s = matchStrengthOrder(b.status) - matchStrengthOrder(a.status);
  if (s !== 0) return s;
  const pa = a.skillFit?.pct ?? 0;
  const pb = b.skillFit?.pct ?? 0;
  if (pb !== pa) return pb - pa;
  const ca = a.skillFit?.matchedConfirmed ?? 0;
  const cb = b.skillFit?.matchedConfirmed ?? 0;
  if (cb !== ca) return cb - ca;
  const AV: Record<MatchAvailability, number> = { available: 3, busy: 2, unknown: 1, unavailable: 0 };
  return AV[b.availability] - AV[a.availability];
}

const norm = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

/**
 * Deterministic worker↔need match. Pure: same inputs → same output.
 */
export function matchWorkerToNeed(
  need: MatchNeed,
  subject: MatchSubject,
): MatchResultV1 {
  const reasons: MatchReason[] = [];
  const gaps: MatchGap[] = [];
  const missingData: MatchMissingDataCode[] = [];

  // Contract v2 per-criterion tiers (additive; derived from the SAME checks).
  const matchedHard: MatchCriterionResult[] = [];
  const blocking: MatchCriterionResult[] = [];
  const strengths: MatchCriterionResult[] = [];
  const negotiables: MatchCriterionResult[] = [];
  const missingFacts: MatchMissingFact[] = [];

  const availability: MatchAvailability = (() => {
    const s = norm(subject.availabilityStatus);
    if (s === "available") return "available";
    if (s === "busy") return "busy";
    if (s === "unavailable") return "unavailable";
    return "unknown";
  })();

  // ── Skill fit via the canonical engine (manager_confirmed ⇒ verified). ──
  // Canonical ids are SLUGS (skillIds); legacy escoSkillUris merge in for
  // back-compat. Matching never depends on ESCO being curated.
  const needSkillIds = [...(need.skillIds ?? []), ...(need.escoSkillUris ?? [])];
  const fitSubject: SubjectEscoSkill[] = subject.skills.map((s) => ({
    uri: s.uri,
    verified: s.evidence === "manager_confirmed",
  }));
  const skillFit = computeContextFit(needSkillIds, fitSubject);

  // Unstructured need ⇒ no percentage exists, ever (§19). Cannot match.
  // Contract v2: the required-skills HARD criterion is unknowable on the
  // demand side → insufficient_data + a missing-fact record. Eligibility is
  // NEVER fabricated from missing data.
  if (skillFit === null) {
    missingData.push("need_not_structured");
    missingFacts.push({
      criterion: "skills_coverage",
      side: "demand",
      source: "customer_requests.payload.structured_need",
    });
    return {
      status: "insufficient_data",
      skillFit: null,
      evidence: { matchedManagerConfirmed: 0, matchedJournalSupported: 0, matchedSelfDeclared: 0 },
      reasons,
      gaps,
      missingData,
      availability,
      nextAction: "structure_demand",
      calcVersion: MATCH_CALC_VERSION,
      eligible: false,
      matchedHard,
      blocking,
      strengths,
      negotiables,
      missingFacts,
    };
  }

  // A requirement set derived by recognition/expansion is an honest
  // SUGGESTION until the company confirms it (§19/§7) — flagged always.
  if (need.needSource === "recognized_from_text" || need.needSource === "profession_expanded") {
    missingData.push("need_recognized_not_confirmed");
  }

  // ── Evidence breakdown over the MATCHED skills + weighted coverage. ──
  const tierByUri = new Map<string, EvidenceTier>();
  for (const s of subject.skills) tierByUri.set(s.uri, s.evidence);

  let matchedManagerConfirmed = 0;
  let matchedJournalSupported = 0;
  let matchedSelfDeclared = 0;
  let weightedMatched = 0;
  for (const uri of skillFit.matchedUris) {
    const tier = tierByUri.get(uri) ?? "self_declared";
    weightedMatched += EVIDENCE_WEIGHT[tier];
    if (tier === "manager_confirmed") matchedManagerConfirmed += 1;
    else if (tier === "work_journal") matchedJournalSupported += 1;
    else matchedSelfDeclared += 1;
  }
  // Need-context, evidence-weighted coverage in [0,1]. NOT a person score:
  // it only exists for THIS need and is never returned/persisted as a number.
  const evidenceWeightedCoverage =
    skillFit.needTotal > 0 ? weightedMatched / skillFit.needTotal : 0;

  if (subject.skills.length === 0) {
    missingData.push("no_subject_skills");
    missingFacts.push({
      criterion: "skills_coverage",
      side: "worker",
      source: "worker_skills",
    });
  }

  // Positive skill reasons.
  reasons.push({
    code: "skill_fit",
    matched: skillFit.matchedTotal,
    total: skillFit.needTotal,
    confirmed: skillFit.matchedConfirmed,
  });
  if (skillFit.matchedTotal > 0) {
    strengths.push({
      criterion: "skills_coverage",
      class: "weighted",
      outcome: "met",
      source: "worker_skills",
    });
  }
  if (matchedManagerConfirmed > 0)
    reasons.push({ code: "skills_manager_confirmed", count: matchedManagerConfirmed });
  if (matchedJournalSupported > 0)
    reasons.push({ code: "skills_journal_supported", count: matchedJournalSupported });
  if (matchedManagerConfirmed + matchedJournalSupported > 0) {
    strengths.push({
      criterion: "evidence_tiers",
      class: "weighted",
      outcome: "met",
      source: "worker_skills.source",
    });
  }

  // Skill gap.
  if (skillFit.missingUris.length > 0)
    gaps.push({
      code: "skills_missing",
      count: skillFit.missingUris.length,
      uris: skillFit.missingUris,
    });

  // ── Discrete compatibility checks (reasons/gaps, NOT folded into a score). ──
  let hardBlock = false; // a true incompatibility caps status at weak
  let softCap = false; // a soft mismatch caps status at possible

  // Location — strongest available evidence wins, nothing is invented:
  //   coordinates+radius (both sides) > same city > country > mobility.
  //   Unknown worker location is missing data, never a negative (unless the
  //   worker's KNOWN location contradicts the need).
  const haveNeedGeo =
    need.lat != null && need.lng != null && need.radiusKm != null && need.radiusKm > 0;
  const haveSubjectGeo = subject.lat != null && subject.lng != null;
  if (haveNeedGeo && haveSubjectGeo) {
    const km = distanceKm(need.lat!, need.lng!, subject.lat!, subject.lng!);
    const kmRounded = Math.round(km);
    if (km <= need.radiusKm!) {
      reasons.push({ code: "location_within_radius", km: kmRounded, radiusKm: need.radiusKm! });
      strengths.push({
        criterion: "country_location",
        class: "weighted",
        outcome: "met",
        source: "company_demand_locations",
      });
    } else {
      gaps.push({ code: "location_outside_radius", km: kmRounded, radiusKm: need.radiusKm! });
      softCap = true;
    }
  } else if (need.city && subject.city && norm(need.city) === norm(subject.city)) {
    reasons.push({ code: "city_match" });
    strengths.push({
      criterion: "country_location",
      class: "weighted",
      outcome: "met",
      source: "preferred_locations.city",
    });
  } else if (need.country) {
    const nc = norm(need.country);
    if (norm(subject.country) === nc) {
      reasons.push({ code: "country_match" });
      strengths.push({
        criterion: "country_location",
        class: "weighted",
        outcome: "met",
        source: "workers.current_location_country",
      });
    } else if (subject.preferredCountries?.some((c) => norm(c) === nc)) {
      reasons.push({ code: "mobility_match" });
      strengths.push({
        criterion: "country_location",
        class: "weighted",
        outcome: "met",
        source: "workers.preferred_countries",
      });
    } else if (subject.country || (subject.preferredCountries?.length ?? 0) > 0) {
      gaps.push({ code: "country_mismatch" });
      softCap = true;
    } else {
      missingData.push("location_unknown");
      missingFacts.push({
        criterion: "country_location",
        side: "worker",
        source: "workers.current_location_country",
      });
    }
  } else if (!subject.country && !subject.city && !haveSubjectGeo) {
    missingData.push("location_unknown");
    missingFacts.push({
      criterion: "country_location",
      side: "worker",
      source: "workers.current_location_country",
    });
  }

  // Profession — direct match, or related via shared profession_skills links
  // (Jaccard over the static 232-link mirror; deterministic).
  if (need.professionSlug && subject.professionSlug) {
    if (norm(need.professionSlug) === norm(subject.professionSlug)) {
      reasons.push({ code: "profession_match" });
      strengths.push({
        criterion: "profession",
        class: "weighted",
        outcome: "met",
        source: "worker_professions",
      });
    } else {
      const rel = professionRelatedness(need.professionSlug, subject.professionSlug);
      if (rel >= 0.2) {
        reasons.push({
          code: "profession_related",
          sharedSkillRatio: Math.round(rel * 100) / 100,
        });
        strengths.push({
          criterion: "profession",
          class: "weighted",
          outcome: "met",
          source: "worker_professions",
        });
      } else {
        gaps.push({ code: "profession_mismatch" });
      }
    }
  }

  // Availability.
  if (subject.availabilityStatus == null && subject.availableFrom == null) {
    missingData.push("availability_unknown");
    missingFacts.push({
      criterion: "availability",
      side: "worker",
      source: "workers.availability_status",
    });
  } else if (norm(subject.availabilityStatus) === "available") {
    reasons.push({ code: "available_now" });
    strengths.push({
      criterion: "availability",
      class: "weighted",
      outcome: "met",
      source: "workers.availability_status",
    });
  } else if (norm(subject.availabilityStatus) === "unavailable") {
    softCap = true; // explicitly unavailable is a soft mismatch
  }

  // Language — a required language the worker lacks is a hard block.
  if (need.languages && need.languages.length > 0) {
    if (subject.languages == null) {
      missingData.push("language_unknown");
      missingFacts.push({
        criterion: "language",
        side: "worker",
        source: "worker_languages",
      });
    } else {
      const have = new Set(subject.languages.map(norm));
      const missing = need.languages.filter((l) => !have.has(norm(l)));
      if (missing.length === 0) {
        reasons.push({ code: "language_match" });
        matchedHard.push({
          criterion: "language",
          class: "hard",
          outcome: "met",
          source: "customer_requests.language_requirement",
        });
      } else {
        gaps.push({ code: "language_missing", required: missing });
        hardBlock = true;
        blocking.push({
          criterion: "language",
          class: "hard",
          outcome: "not_met",
          source: "customer_requests.language_requirement",
        });
      }
    }
  }

  // Pay — worker's expected minimum above the offered ceiling is a soft cap.
  if (need.payOfferedEurMax != null) {
    if (subject.salaryMinEur == null) {
      missingData.push("pay_unknown");
      missingFacts.push({
        criterion: "pay_ceiling",
        side: "worker",
        source: "workers.salary_min_eur",
      });
    } else if (subject.salaryMinEur <= need.payOfferedEurMax) {
      reasons.push({ code: "pay_within_offer" });
      strengths.push({
        criterion: "pay_ceiling",
        class: "weighted",
        outcome: "met",
        source: "workers.salary_min_eur",
      });
    } else {
      gaps.push({
        code: "pay_above_offer",
        expected: subject.salaryMinEur,
        offered: need.payOfferedEurMax,
      });
      softCap = true;
    }
  }

  // Accommodation — worker needs it but the need does not provide it.
  if (subject.accommodationNeeded === true) {
    if (need.accommodationProvided === true) {
      reasons.push({ code: "accommodation_ok" });
      strengths.push({
        criterion: "accommodation",
        class: "weighted",
        outcome: "met",
        source: "customer_requests.accommodation",
      });
    } else if (need.accommodationProvided === false) {
      gaps.push({ code: "accommodation_needed_not_provided" });
      softCap = true;
    }
  }

  // ── Structured demand v2 criteria (contract v2 — fire ONLY on real facts;
  //    absence stays lenient: unknown, never a block). ──────────────────────
  const v2 = need.structuredV2 ?? null;

  // Compensation vs the worker's stated minimum. Hard block ONLY when both
  // sides state comparable numbers and the gap exceeds the 15% window.
  const comp = compareCompensationV2(v2, subject.salaryMinEur);
  if (comp !== null) {
    const compSource = "customer_requests.payload.structured_v2.compensation";
    if (comp.kind === "met") {
      matchedHard.push({
        criterion: "compensation",
        class: "hard",
        outcome: "met",
        source: compSource,
      });
    } else if (comp.kind === "negotiable_gap" || comp.kind === "not_comparable") {
      negotiables.push({
        criterion: "compensation",
        class: "negotiable",
        outcome: "negotiable",
        source: compSource,
      });
    } else if (comp.kind === "hard_below_minimum") {
      hardBlock = true;
      blocking.push({
        criterion: "compensation",
        class: "hard",
        outcome: "not_met",
        source: compSource,
      });
    } else if (comp.kind === "demand_unstated") {
      missingFacts.push({ criterion: "compensation", side: "demand", source: compSource });
    } else {
      missingFacts.push({
        criterion: "compensation",
        side: "worker",
        source: "workers.salary_min_eur",
      });
    }
  } else if (need.payOfferedEurMax == null) {
    // No structured_v2 AND no legacy offer ceiling — the demand side has not
    // stated pay at all (honest missing fact, common on the worker board).
    missingFacts.push({
      criterion: "compensation",
      side: "demand",
      source: "customer_requests.payload.structured_v2.compensation",
    });
  }

  // Start date — flexibility is a discussion point, never a silent block.
  const start = compareStartDateV2(v2, subject);
  if (start !== null) {
    const timeSource = "customer_requests.payload.structured_v2.time";
    if (start.kind === "met") {
      strengths.push({
        criterion: "start_date",
        class: "weighted",
        outcome: "met",
        source: timeSource,
      });
    } else if (start.kind === "negotiable_window") {
      negotiables.push({
        criterion: "start_date",
        class: "negotiable",
        outcome: "negotiable",
        source: timeSource,
      });
    }
    // worker_unstated is already covered by the availability criterion;
    // demand_unstated means no stated window — lenient, nothing recorded.
  }

  // Shifts / hours — the worker side has no stated shift/hours preference
  // store yet, so a stated demand schedule is an honest discussion point.
  if ((v2?.time?.shifts?.length ?? 0) > 0 || v2?.time?.hours_per_week != null) {
    negotiables.push({
      criterion: "shifts_hours",
      class: "negotiable",
      outcome: "negotiable",
      source: "customer_requests.payload.structured_v2.time",
    });
  }

  // Engagement form vs workers.preferred_contract_type — hard ONLY when both
  // sides stated their form.
  if (v2?.engagement_form != null) {
    const formSource = "customer_requests.payload.structured_v2.engagement_form";
    const pref = (subject.preferredContractType ?? "").trim();
    if (pref === "") {
      missingFacts.push({
        criterion: "engagement_form",
        side: "worker",
        source: "workers.preferred_contract_type",
      });
    } else {
      const accepted = engagementFormAccepted(pref, v2.engagement_form);
      if (accepted === true) {
        matchedHard.push({
          criterion: "engagement_form",
          class: "hard",
          outcome: "met",
          source: formSource,
        });
      } else if (accepted === false) {
        hardBlock = true;
        blocking.push({
          criterion: "engagement_form",
          class: "hard",
          outcome: "not_met",
          source: formSource,
        });
      } else {
        // Stored worker value outside the closed map — unknown, never guessed.
        missingFacts.push({
          criterion: "engagement_form",
          side: "worker",
          source: "workers.preferred_contract_type",
        });
      }
    }
  }

  // Licence categories — no worker-side licence store exists, so a stated
  // requirement is ALWAYS a worker-side missing fact, never a block.
  if ((v2?.transport?.licence_categories?.length ?? 0) > 0) {
    missingFacts.push({
      criterion: "licence_categories",
      side: "worker",
      source: "worker_documents",
    });
  }

  // ── Deterministic status from evidence-weighted coverage, then caps. ──
  let status: MatchStatus;
  if (skillFit.matchedTotal === 0) status = "weak";
  else if (evidenceWeightedCoverage >= 0.8) status = "strong";
  else if (evidenceWeightedCoverage >= 0.5) status = "possible";
  else status = "weak";

  // Apply compatibility caps (never upgrade, only cap downward). STRUCTURAL
  // INVARIANT (contract v2, guard-tested): a failed hard criterion caps the
  // status at "weak" BEFORE any ordering — no weighted sum can outscore it,
  // and eligible is false for the same reason.
  if (hardBlock && matchStrengthOrder(status) > matchStrengthOrder("weak")) status = "weak";
  if (softCap && matchStrengthOrder(status) > matchStrengthOrder("possible")) status = "possible";

  const eligible = !hardBlock && blocking.length === 0;

  // The one clear next step (owner mandate). Confirming a recognized need is
  // the human act that upgrades the suggestion into a structured need.
  const nextAction: MatchNextAction =
    need.needSource === "recognized_from_text" || need.needSource === "profession_expanded"
      ? "confirm_recognized_need"
      : matchStrengthOrder(status) >= matchStrengthOrder("possible")
        ? "review_and_shortlist"
        : "review_gaps";

  return {
    status,
    skillFit,
    evidence: { matchedManagerConfirmed, matchedJournalSupported, matchedSelfDeclared },
    reasons,
    gaps,
    missingData,
    availability,
    nextAction,
    calcVersion: MATCH_CALC_VERSION,
    eligible,
    matchedHard,
    blocking,
    strengths,
    negotiables,
    missingFacts,
  };
}
