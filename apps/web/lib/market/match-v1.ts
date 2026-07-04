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
  if (skillFit === null) {
    missingData.push("need_not_structured");
    return {
      status: "insufficient_data",
      skillFit: null,
      evidence: { matchedManagerConfirmed: 0, matchedJournalSupported: 0, matchedSelfDeclared: 0 },
      reasons,
      gaps,
      missingData,
      availability,
      nextAction: "structure_demand",
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

  if (subject.skills.length === 0) missingData.push("no_subject_skills");

  // Positive skill reasons.
  reasons.push({
    code: "skill_fit",
    matched: skillFit.matchedTotal,
    total: skillFit.needTotal,
    confirmed: skillFit.matchedConfirmed,
  });
  if (matchedManagerConfirmed > 0)
    reasons.push({ code: "skills_manager_confirmed", count: matchedManagerConfirmed });
  if (matchedJournalSupported > 0)
    reasons.push({ code: "skills_journal_supported", count: matchedJournalSupported });

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
    } else {
      gaps.push({ code: "location_outside_radius", km: kmRounded, radiusKm: need.radiusKm! });
      softCap = true;
    }
  } else if (need.city && subject.city && norm(need.city) === norm(subject.city)) {
    reasons.push({ code: "city_match" });
  } else if (need.country) {
    const nc = norm(need.country);
    if (norm(subject.country) === nc) {
      reasons.push({ code: "country_match" });
    } else if (subject.preferredCountries?.some((c) => norm(c) === nc)) {
      reasons.push({ code: "mobility_match" });
    } else if (subject.country || (subject.preferredCountries?.length ?? 0) > 0) {
      gaps.push({ code: "country_mismatch" });
      softCap = true;
    } else {
      missingData.push("location_unknown");
    }
  } else if (!subject.country && !subject.city && !haveSubjectGeo) {
    missingData.push("location_unknown");
  }

  // Profession — direct match, or related via shared profession_skills links
  // (Jaccard over the static 232-link mirror; deterministic).
  if (need.professionSlug && subject.professionSlug) {
    if (norm(need.professionSlug) === norm(subject.professionSlug)) {
      reasons.push({ code: "profession_match" });
    } else {
      const rel = professionRelatedness(need.professionSlug, subject.professionSlug);
      if (rel >= 0.2) {
        reasons.push({
          code: "profession_related",
          sharedSkillRatio: Math.round(rel * 100) / 100,
        });
      } else {
        gaps.push({ code: "profession_mismatch" });
      }
    }
  }

  // Availability.
  if (subject.availabilityStatus == null && subject.availableFrom == null) {
    missingData.push("availability_unknown");
  } else if (norm(subject.availabilityStatus) === "available") {
    reasons.push({ code: "available_now" });
  } else if (norm(subject.availabilityStatus) === "unavailable") {
    softCap = true; // explicitly unavailable is a soft mismatch
  }

  // Language — a required language the worker lacks is a hard block.
  if (need.languages && need.languages.length > 0) {
    if (subject.languages == null) {
      missingData.push("language_unknown");
    } else {
      const have = new Set(subject.languages.map(norm));
      const missing = need.languages.filter((l) => !have.has(norm(l)));
      if (missing.length === 0) reasons.push({ code: "language_match" });
      else {
        gaps.push({ code: "language_missing", required: missing });
        hardBlock = true;
      }
    }
  }

  // Pay — worker's expected minimum above the offered ceiling is a soft cap.
  if (need.payOfferedEurMax != null) {
    if (subject.salaryMinEur == null) {
      missingData.push("pay_unknown");
    } else if (subject.salaryMinEur <= need.payOfferedEurMax) {
      reasons.push({ code: "pay_within_offer" });
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
    if (need.accommodationProvided === true) reasons.push({ code: "accommodation_ok" });
    else if (need.accommodationProvided === false) {
      gaps.push({ code: "accommodation_needed_not_provided" });
      softCap = true;
    }
  }

  // ── Deterministic status from evidence-weighted coverage, then caps. ──
  let status: MatchStatus;
  if (skillFit.matchedTotal === 0) status = "weak";
  else if (evidenceWeightedCoverage >= 0.8) status = "strong";
  else if (evidenceWeightedCoverage >= 0.5) status = "possible";
  else status = "weak";

  // Apply compatibility caps (never upgrade, only cap downward).
  if (hardBlock && matchStrengthOrder(status) > matchStrengthOrder("weak")) status = "weak";
  if (softCap && matchStrengthOrder(status) > matchStrengthOrder("possible")) status = "possible";

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
  };
}
