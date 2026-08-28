/**
 * Offer–Demand recognition — normalized type contract (v1).
 *
 * This layer NORMALIZES the existing pure engines into one named vocabulary; it
 * does NOT replace or duplicate them. The matching result, need structuring and
 * readiness derivations all stay in their canonical modules:
 *   - lib/market/match-v1.ts         (matchWorkerToNeed → MatchResultV1)
 *   - lib/structuring/structure-need.ts (structureNeed → NeedStructureSuggestion)
 *   - lib/player-card/readiness.ts   (deriveWorkerReadiness)
 *
 * Everything here is PURE: no DB, no IO, no fabricated values. Recognized values
 * carry a reason; nothing is asserted as confirmed unless the source says so.
 */
import type { MatchResultV1, MatchStatus } from "@/lib/market/match-v1";
import type { NeedStructureSuggestion } from "@/lib/structuring/structure-need";

/** The four real entry intents. One unified question, four answers. */
export type RecognitionIntent =
  | "need_work" // worker: I need work
  | "offer_services" // company / team: I offer services
  | "need_workers" // employer / agency: I need workers
  | "have_project"; // buyer: I have a project / task

/** How strongly a value is backed (claimed → imported → confirmed → evidence). */
export type FieldSource = "claimed" | "imported" | "confirmed" | "evidence";

export type FieldSeverity = "important" | "recommended";

/** Closed-set field vocabulary for a job demand (the pasted-job-post case). */
export type JobDemandFieldKey =
  | "role"
  | "location"
  | "sector"
  | "rotation"
  | "experience"
  | "scope"
  | "salary"
  | "grossNet"
  | "currency"
  | "weeklyHours"
  | "overtime"
  | "contractType"
  | "legalEmployer"
  | "language"
  | "drivingLicence"
  | "toolsPpe"
  | "accommodationType"
  | "accommodationDeductions"
  | "travelTiming"
  | "requiredDocuments"
  | "startDate";

export interface RecognizedField {
  readonly key: JobDemandFieldKey;
  /** Short reason code (the needle that matched) — never raw free text. */
  readonly reason?: string;
}

export interface MissingField {
  readonly key: JobDemandFieldKey;
  readonly severity: FieldSeverity;
}

export type RiskFlagCode =
  | "pay_unclear"
  | "accommodation_terms_unclear"
  | "legal_employer_unclear"
  | "language_requirement_unclear"
  | "documents_unclear"
  | "hours_overtime_unclear"
  | "low_recognition_confidence";

export interface RiskFlag {
  readonly code: RiskFlagCode;
}

/** Next actions only ever open an EXISTING surface (reuse, never a new write). */
export type NextActionCode =
  | "complete_missing_fields"
  | "submit_demand"
  | "improve_profile"
  | "add_service_offer"
  | "create_project"
  | "request_more_info"
  | "review_matches"
  // pre-search-gate v1 — intent-specific hand-offs to existing surfaces.
  | "complete_player_card"
  | "add_work_proof"
  | "search_opportunities"
  | "continue_to_demand"
  | "complete_service_profile"
  | "continue_to_services"
  | "continue_to_project";

export interface NextAction {
  readonly code: NextActionCode;
  /** Existing route the action opens, when it lives on another page. */
  readonly href?: string;
  /**
   * Whether the employer's own need text travels with this action.
   *
   * A plain `href` opens the destination EMPTY, which is why the employer used
   * to describe their need here and then describe it again on the demand form.
   * When this is true the surface first writes the canonical draft
   * (`customer_requests`, status='draft', owner-scoped) that the destination
   * already auto-continues from, and only then navigates. The flag lives on the
   * action rather than in the component so the pure layer stays the one place
   * that decides which hand-offs carry context.
   */
  readonly carriesNeedText?: boolean;
}

export type RecognitionConfidence = "high" | "medium" | "low";

/** A recognized "I need workers" card: structured identity + missing + risks. */
export interface RecognizedJobDemand {
  readonly intent: "need_workers";
  readonly structured: NeedStructureSuggestion;
  readonly recognized: readonly RecognizedField[];
  readonly missing: readonly MissingField[];
  readonly risks: readonly RiskFlag[];
  readonly confidence: RecognitionConfidence;
  readonly nextAction: NextAction;
}

/**
 * A recognized pre-search card for ANY intent: the intent-specific recognized /
 * missing / risk view + readiness + up to 3 working next actions. The unified
 * shape the pre-search gate UI renders (recognizeIntent → RecognizedCard).
 */
export interface RecognizedCard {
  readonly intent: RecognitionIntent;
  readonly recognized: readonly RecognizedField[];
  readonly missing: readonly MissingField[];
  readonly risks: readonly RiskFlag[];
  readonly confidence: RecognitionConfidence;
  readonly readiness: ReadinessState;
  /** 1–3 next actions, each opening an EXISTING route. Never more than 3. */
  readonly nextActions: readonly NextAction[];
}

/** Match readiness band for the top-N explanation (not a rating). */
export type MatchReadiness = "ready" | "needs_info" | "reject";

export interface MatchExplanation {
  /** Opaque caller id (e.g. worker row id) — NEVER a name in v1. */
  readonly subjectId: string;
  readonly status: MatchStatus;
  readonly readiness: MatchReadiness;
  readonly result: MatchResultV1;
  readonly nextAction: NextAction;
}

/** A line the UI localizes — shared by progress messages and the weekly digest. */
export interface LocalizableLine {
  /** i18n key under the marketRecognition namespace. */
  readonly code: string;
  readonly params?: Record<string, string | number>;
}

/** Useful participation — meaningful actions only (never an empty login). */
export type MeaningfulAction =
  | "worker_added_availability"
  | "worker_added_location"
  | "worker_added_experience"
  | "worker_added_photos"
  | "worker_updated_cv"
  | "worker_confirmed_skills"
  | "worker_responded_request"
  | "company_completed_job_fields"
  | "company_added_conditions"
  | "company_updated_offer"
  | "user_added_project_photos"
  | "user_reduced_missing_fields";

export type ParticipationActor = "worker" | "company" | "buyer";

export interface ParticipationEvent {
  readonly action: MeaningfulAction;
  readonly actor: ParticipationActor;
  /** Field keys that improved (drives the honest message; no fabricated streak). */
  readonly improved: readonly string[];
}

export type PrivateProgressMessage = LocalizableLine;

/** Normalized readiness state (wraps the existing readiness derivations). */
export type ReadinessLabel = "match_ready" | "improving" | "needs_basics";
export interface ReadinessState {
  readonly label: ReadinessLabel;
  readonly met: number;
  readonly total: number;
  readonly missingCount: number;
}

/**
 * Weekly digest input — AGGREGATE COUNTS ONLY. By construction it carries no
 * names, employers, companies, person-locations, salaries, documents or photos:
 * there is no field here that could identify a person. (Privacy boundary §E.)
 */
export interface WeeklyDigestCounts {
  readonly workersBecameReady: number;
  readonly needsBecameClear: number;
  readonly projectsClarified: number;
  /** Most-requested trade SLUGS (closed-set), counts implied by order. */
  readonly topTradeSlugs: readonly string[];
}

export interface WeeklyPublicDigest {
  readonly lines: readonly LocalizableLine[];
}
