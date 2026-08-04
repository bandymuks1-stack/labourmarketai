/**
 * Employer chat-workspace contract — PURE (W8 employer chat workspace).
 *
 * Lives outside the `"use server"` module for the same reason
 * `find-work-contract.ts` does: a server-action file may only export async
 * functions, so the shapes and the display limit sit here and are importable
 * from the server adapter, the result component and the tests alike.
 *
 * NOTHING HERE LOADS, RANKS, MATCHES OR DECIDES ANYTHING. The canonical
 * employer domain owns all of that and keeps owning it:
 *
 *   demands + matching + shortlist  →  lib/scouting/scouting.ts
 *   need lifecycle (§19 confirm)    →  lib/demand/demand-lifecycle.ts
 *   pipeline stage (derived)        →  lib/pipeline/candidate-pipeline.ts
 *   company context gate            →  lib/company/employer-company-context.ts
 *
 * These are the SHAPES the Context Panel renders — a narrow projection of
 * `ScoutSafeCandidate`, not a second candidate model. The projection is
 * deliberately narrower than the safe view: the panel is 22rem of a
 * conversation, so it carries the facts an employer decides on and defers the
 * rest to the existing full screen.
 *
 * ANONYMITY IS INHERITED, NOT RE-DERIVED. Every field below comes out of
 * `toScoutSafeCandidate`, which already routed the worker row through the Step
 * 3A visibility policy and `assertContactSafe`. This contract adds no field
 * that policy did not already approve — there is no name, no contact, no bio.
 */

import type { CandidatePipelineStage } from "@/lib/pipeline/candidate-pipeline";
import type { EmployerContextReason } from "@/lib/company/employer-company-context";
import type { NeedSkillSource } from "@/lib/market/need-skills";

/**
 * How many candidates the panel renders before deferring to the full scouting
 * screen. Small on purpose — the panel is the concise active answer, the route
 * is the detail (the same rule the calendar and opportunities results follow).
 *
 * The projection reports the REAL total alongside, so a capped list is
 * announced rather than silently truncated.
 */
export const EMPLOYER_CANDIDATES_LIMIT = 8;

/** How many of the company's demands the chat lists before deferring. */
export const EMPLOYER_DEMANDS_LIMIT = 6;

/** One of the company's own demands, as the chat and the panel show it. */
export interface EmployerDemandRow {
  readonly requestId: string;
  readonly title: string;
  /** `customer_requests.status` verbatim (draft / submitted / closed …). A raw
   *  token, localized at the surface — never a status this layer invented. */
  readonly status: string;
  /** Whether a requirement set is derivable at all. `false` means matching has
   *  nothing to run on, and the surface says so instead of showing an empty
   *  candidate list. */
  readonly structured: boolean;
  /**
   * HOW the requirement set was derived (PR4) — the fact that decides whether
   * the §19 explicit human act is even available. Only `recognized_from_text`
   * and `profession_expanded` are confirmable; an already human-structured
   * need has nothing to confirm, and `null` means nothing was derivable.
   *
   * DOCUMENTED DEGRADATION: in the demand LIST this comes from
   * `listCompanyDemands`, which derives from the title alone and therefore
   * reports only `human_structured` or `null` (its own source comment says
   * "null here just means open it"). The full derivation runs in `runScouting`
   * over the whole row, so the value carried by the CANDIDATES view is the
   * authoritative one. The panel offers `confirm` from the candidates view for
   * exactly that reason — never from the list.
   */
  readonly needSource: NeedSkillSource | null;
}

/**
 * The company's demand list. `no-company-context` is its OWN state, never
 * folded into `empty`: "you are standing in your personal space" and "your
 * company has not described a need yet" are different truths about a person's
 * work, and telling them apart is the whole point of the W8 slice-1 gate.
 */
export type EmployerDemandsResult =
  | { readonly kind: "demands"; readonly demands: readonly EmployerDemandRow[] }
  | { readonly kind: "empty" }
  | { readonly kind: "no-company-context"; readonly reason: EmployerContextReason }
  | { readonly kind: "blocked" };

/** A gap the deterministic engine reported, as an opaque code. The panel
 *  localizes the code; it never receives a sentence this layer composed. */
export type EmployerCandidateGapCode =
  | "skills_missing"
  | "language_missing"
  | "country_mismatch"
  | "location_outside_radius"
  | "pay_above_offer"
  | "accommodation_needed_not_provided"
  | "profession_mismatch";

/** One ranked candidate, projected from `ScoutSafeCandidate`. */
export interface EmployerCandidateRow {
  readonly workerId: string;
  /** The deterministic anonymized token (no name, ever). */
  readonly label: string;
  readonly professionSlug: string | null;
  /** match-v1 status verbatim. */
  readonly matchStatus: "strong" | "possible" | "weak" | "insufficient_data";
  /** false the moment a hard criterion failed — a weighted score never
   *  restores it, so the panel shows it as a fact, not a score. */
  readonly eligible: boolean;
  /** §19 contextual coverage, or null when the need carries no skill set. */
  readonly coveragePct: number | null;
  /** Matched skills that are manager-confirmed (§19 c). */
  readonly confirmedCount: number;
  readonly gaps: readonly EmployerCandidateGapCode[];
  /** Profile-safe country from the visibility policy. */
  readonly country: string | null;
  /** Owner rule 6 — whether communication/booking may start at all. */
  readonly canContact: boolean;
  readonly shortlistStatus: "saved" | "interested" | "not_fit" | "reviewed" | null;
  /** The company's OWN internal note (never worker data). */
  readonly shortlistNote: string | null;
  /** The ONE derived pipeline stage (P4) — never a 7th stored enum. */
  readonly pipelineStage: CandidatePipelineStage;
  /** `booking_requests.status` for this pair, or null. THE booking state the
   *  employer asked for, read from the canonical row — never inferred. */
  readonly bookingStatus: string | null;
}

/**
 * The panel's candidate view for ONE demand.
 *
 * Every non-ok kind is a DIFFERENT sentence on the surface. Collapsing
 * `not-structured` into an empty list would tell an employer "nobody matches"
 * when the truth is "there is nothing to match against" — the exact class of
 * lie the scouting page already refuses to tell.
 */
export type EmployerCandidatesResult =
  | {
      readonly kind: "ok";
      readonly demand: EmployerDemandRow;
      readonly candidates: readonly EmployerCandidateRow[];
      /** How many candidates the engine actually ranked (before the panel cap). */
      readonly total: number;
      /** True when the panel is showing fewer than `total`. */
      readonly capped: boolean;
      /** W10 slice 3 — true when MORE candidates were retrievable than the
       *  retrieval budget allowed. An employer reading a short list is
       *  entitled to know the platform did not look at everyone. */
      readonly retrievalCapped: boolean;
    }
  | { readonly kind: "not-structured"; readonly demand: EmployerDemandRow }
  | { readonly kind: "not-found" }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "no-company-context"; readonly reason: EmployerContextReason }
  | { readonly kind: "blocked" }
  | { readonly kind: "error" };
