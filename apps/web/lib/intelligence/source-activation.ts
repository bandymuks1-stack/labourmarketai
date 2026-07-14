/**
 * Intelligence SOURCE ACTIVATION framework (Source Readiness v1).
 *
 * The complete, deterministic pre-activation contract for ANY external
 * intelligence source. NOTHING here activates anything: this module only
 * evaluates recorded FACTS (approvals, reviews, policies) against the ten
 * mandatory requirements and says honestly which are missing. Activation
 * itself remains a two-step OWNER action outside this code path:
 * registry flip (source-governance.ts, guard-pinned OFF) + the gated DB
 * registry — and the kill switch always wins over both.
 *
 * The ten requirements (ALL must pass — no partial activation):
 *   owner_approval · technical_approval · legal_approval · robots_check ·
 *   terms_review · rate_limits · import_policy · retention_policy ·
 *   rollback_plan · kill_switch
 *
 * No IO, no fetch (a robots status is a RECORDED review result, never a
 * live probe), no Date.now. i18n codes only. Pure module.
 */
import type { IntelligenceSourceProfile } from "./source-governance";
import { deriveSourceLifecycleState } from "./source-lifecycle";

export const ACTIVATION_REQUIREMENT_IDS = [
  "owner_approval",
  "technical_approval",
  "legal_approval",
  "robots_check",
  "terms_review",
  "rate_limits",
  "import_policy",
  "retention_policy",
  "rollback_plan",
  "kill_switch",
] as const;
export type ActivationRequirementId =
  (typeof ACTIVATION_REQUIREMENT_IDS)[number];

/** Result of the human robots.txt / API-terms review — a recorded fact.
 *  "not_applicable" is valid only for official statistics APIs. */
export type RobotsReviewStatus =
  | "allows"
  | "disallows"
  | "not_checked"
  | "not_applicable";

export interface SourceRateLimitPolicyV1 {
  readonly maxRequestsPerHour: number;
  readonly maxBytesPerFetch: number;
  readonly maxItemsPerSession: number;
}

export interface SourceImportPolicyV1 {
  /** Closed set of metric keys this source may ever produce. */
  readonly metricKeys: readonly string[];
  /** Closed set of ISO-3166 alpha-2 countries this source may cover. */
  readonly countries: readonly string[];
  /** Languages the source text may arrive in (lowercase ISO-639-1). */
  readonly languages: readonly string[];
  readonly maxSessionsPerDay: number;
}

export interface SourceRetentionPolicyV1 {
  readonly observationTtlDays: number;
  /** Expired observations are marked, never silently rewritten. */
  readonly expiredHandling: "mark_expired" | "delete";
}

/**
 * Everything the activation decision rests on. Every field is a RECORDED
 * fact (who approved what, when, with which policy) — absent facts are
 * null/false, never assumed.
 */
export interface SourceActivationFactsV1 {
  readonly ownerApprovedAtIso: string | null;
  readonly ownerApprovalNote: string | null;
  readonly technicalApprovedAtIso: string | null;
  /** Legal approval is the profile's legalStatus === "confirmed". */
  readonly termsReviewedAtIso: string | null;
  readonly robotsStatus: RobotsReviewStatus;
  readonly rateLimit: SourceRateLimitPolicyV1 | null;
  readonly importPolicy: SourceImportPolicyV1 | null;
  readonly retention: SourceRetentionPolicyV1 | null;
  /** Pointer to the written rollback plan (doc path / section). */
  readonly rollbackPlanRef: string | null;
  /** The kill switch must EXIST and have been TESTED before activation. */
  readonly killSwitch: {
    readonly implemented: boolean;
    readonly testedAtIso: string | null;
  };
  /** An ENGAGED kill switch vetoes everything, whatever else says. */
  readonly killSwitchEngaged: boolean;
}

/** The honest zero-state: nothing approved, nothing reviewed, nothing
 *  planned. This is where every external source stands until the owner
 *  process actually happens. */
export const EMPTY_ACTIVATION_FACTS: SourceActivationFactsV1 = {
  ownerApprovedAtIso: null,
  ownerApprovalNote: null,
  technicalApprovedAtIso: null,
  termsReviewedAtIso: null,
  robotsStatus: "not_checked",
  rateLimit: null,
  importPolicy: null,
  retention: null,
  rollbackPlanRef: null,
  killSwitch: { implemented: false, testedAtIso: null },
  killSwitchEngaged: false,
};

export interface ActivationRequirementStatus {
  readonly id: ActivationRequirementId;
  readonly satisfied: boolean;
  /** i18n code explaining the current state of this requirement. */
  readonly detailCode: string;
}

export interface ActivationReadinessV1 {
  readonly sourceKey: string;
  /** True only when ALL ten requirements pass AND no veto applies. Being
   *  ready still activates nothing — it unlocks the owner's decision. */
  readonly ready: boolean;
  readonly requirements: readonly ActivationRequirementStatus[];
  /** Hard vetoes that outrank every satisfied requirement. */
  readonly vetoCodes: readonly string[];
}

function isNonEmpty(v: string | null): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function positiveInt(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

function requirement(
  id: ActivationRequirementId,
  satisfied: boolean,
): ActivationRequirementStatus {
  return {
    id,
    satisfied,
    detailCode: `intelligence.activation.detail.${id}.${satisfied ? "ok" : "missing"}`,
  };
}

/**
 * Deterministic readiness evaluation. Same profile + facts always yield
 * the same result; nothing is inferred from absence — a missing fact is a
 * failed requirement.
 */
export function evaluateActivationReadiness(
  profile: IntelligenceSourceProfile,
  facts: SourceActivationFactsV1,
): ActivationReadinessV1 {
  const requirements: ActivationRequirementStatus[] = [
    requirement("owner_approval", isNonEmpty(facts.ownerApprovedAtIso)),
    requirement(
      "technical_approval",
      isNonEmpty(facts.technicalApprovedAtIso),
    ),
    requirement("legal_approval", profile.legalStatus === "confirmed"),
    requirement(
      "robots_check",
      facts.robotsStatus === "allows" ||
        // "not_applicable" is valid ONLY for official statistics APIs
        // (the documented exemption) — a public-web source can never
        // green its robots requirement by declaring robots irrelevant.
        (facts.robotsStatus === "not_applicable" &&
          profile.sourceKind === "public_official"),
    ),
    requirement("terms_review", isNonEmpty(facts.termsReviewedAtIso)),
    requirement(
      "rate_limits",
      facts.rateLimit !== null &&
        positiveInt(facts.rateLimit.maxRequestsPerHour) &&
        positiveInt(facts.rateLimit.maxBytesPerFetch) &&
        positiveInt(facts.rateLimit.maxItemsPerSession),
    ),
    requirement(
      "import_policy",
      facts.importPolicy !== null &&
        facts.importPolicy.metricKeys.length > 0 &&
        facts.importPolicy.countries.length > 0 &&
        facts.importPolicy.languages.length > 0 &&
        positiveInt(facts.importPolicy.maxSessionsPerDay),
    ),
    requirement(
      "retention_policy",
      facts.retention !== null &&
        positiveInt(facts.retention.observationTtlDays),
    ),
    requirement("rollback_plan", isNonEmpty(facts.rollbackPlanRef)),
    requirement(
      "kill_switch",
      facts.killSwitch.implemented && isNonEmpty(facts.killSwitch.testedAtIso),
    ),
  ];

  const vetoCodes: string[] = [];
  // An engaged kill switch outranks EVERYTHING.
  if (facts.killSwitchEngaged) {
    vetoCodes.push("intelligence.activation.veto.killSwitchEngaged");
  }
  // A source whose robots/terms review came back negative can never be
  // readied by collecting other approvals.
  if (facts.robotsStatus === "disallows") {
    vetoCodes.push("intelligence.activation.veto.robotsDisallow");
  }
  if (profile.legalStatus === "refused") {
    vetoCodes.push("intelligence.activation.veto.legalRefused");
  }
  if (deriveSourceLifecycleState(profile) === "blocked") {
    vetoCodes.push("intelligence.activation.veto.lifecycleBlocked");
  }
  // Internal sources never go through external activation at all.
  if (profile.sourceKind === "internal_aggregated") {
    vetoCodes.push("intelligence.activation.veto.internalSource");
  }

  return {
    sourceKey: profile.key,
    ready:
      vetoCodes.length === 0 && requirements.every((r) => r.satisfied),
    requirements,
    vetoCodes,
  };
}

// ── Owner activation checklist (item 6) ──────────────────────────────────────

export interface ActivationChecklistItemV1 {
  readonly id: ActivationRequirementId;
  /** i18n code for the item label (`intelligence.activation.item.*`). */
  readonly labelCode: string;
  readonly status: "green" | "red";
  readonly detailCode: string;
}

export interface OwnerActivationChecklistV1 {
  readonly sourceKey: string;
  readonly items: readonly ActivationChecklistItemV1[];
  readonly vetoCodes: readonly string[];
  /** True only when every item is green and no veto applies. */
  readonly activationAllowed: boolean;
}

/**
 * The ONE reusable owner checklist — a direct projection of the readiness
 * evaluation. Nothing activates until every item is green, and even then
 * activation is a separate owner registry action.
 */
export function buildOwnerActivationChecklist(
  profile: IntelligenceSourceProfile,
  facts: SourceActivationFactsV1 = EMPTY_ACTIVATION_FACTS,
): OwnerActivationChecklistV1 {
  const readiness = evaluateActivationReadiness(profile, facts);
  return {
    sourceKey: profile.key,
    items: readiness.requirements.map((r) => ({
      id: r.id,
      labelCode: `intelligence.activation.item.${r.id}`,
      status: r.satisfied ? "green" : "red",
      detailCode: r.detailCode,
    })),
    vetoCodes: readiness.vetoCodes,
    activationAllowed: readiness.ready,
  };
}
