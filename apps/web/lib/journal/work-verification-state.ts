import type { ReviewResult } from "@/lib/journal/review-status";

/**
 * WHAT IS THE VERIFICATION STATE OF THIS WORK, AND WHO COULD VERIFY IT?
 * (owner P0, 2026-09-06 — the orphaned-work-records defect.)
 *
 * ── THE DEFECT THIS EXISTS TO FIX ──────────────────────────────────────────
 * Measured on production, not inferred: of 17 unconfirmed live journal
 * entries, 15 sat in personal, organization-less engagement contexts. They are
 * real work, by real people. They saved successfully. They can reach NO
 * verifier — and the worker is told nothing at all.
 *
 * The receive loop itself was never broken: submit → the responsible person's
 * queue → approve → the worker sees the result was proven end-to-end on
 * production. The queue was empty because nothing had ever been written into a
 * review-enabled context.
 *
 * So the missing thing was never a screen. It was a SEMANTIC MODEL: the system
 * had exactly two notions — "has a confirmation row" and "does not" — and
 * "does not" silently covered four completely different situations:
 *
 *   · a verifier is looking at it right now;
 *   · an employer is known but nobody there can confirm work yet;
 *   · this is personal history and no employer is involved at all;
 *   · the person owns the company, so there is nobody above them.
 *
 * Rendering all four as one blank absence is the §54 defect exactly: a dead end
 * wearing the clothes of a successful empty state.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 * It does not devalue or hide self-reported work. A person's real work history
 * may predate LabourMarket.ai, predate their employer joining, or simply have
 * no reachable verifier today. That work stays — as provenance-bearing
 * evidence carrying its true state. `self_reported` is a legitimate, permanent,
 * honest state, NOT a failure and NOT a lesser record.
 *
 * It never invents a verifier. `{ kind: "none" }` is a real, returnable
 * outcome, and the states below have no value meaning "probably someone".
 *
 * It marks nothing VERIFIED without a real recorded confirmation: `verified`
 * is reachable ONLY from a `ReviewResult` of "approved", which is derived from
 * an actual append-only `journal_entry_confirmations` row. No context, no
 * import and no inference can produce it. `importedRecordCannotBeVerified` in
 * the tests pins that.
 *
 * ── COMPOSES, NEVER FORKS ──────────────────────────────────────────────────
 * Two vocabularies already existed and both are reused rather than restated:
 *
 *   `ReviewResult`      (review-status.ts) — what the reviewer DECIDED, derived
 *                        latest-wins from the append-only evidence rows.
 *   `ReviewCapability`  (employment-journal-context.ts) — whether a given
 *                        REVIEWER may review.
 *
 * Neither answers the WORKER's question, which is the one a person actually
 * asks out loud: *"Kam pateikti atliktą darbą?"* This composes the recorded
 * decision with the entry's engagement context into that answer.
 *
 * ── THE SAME MODEL MUST FIT HISTORICAL IMPORT ──────────────────────────────
 * Tomorrow's imports (a person's old timesheets, a company's work reports, an
 * authorized AI import) enter through these same states. An imported record
 * with a resolvable employer is `verifier_available`; one without is
 * `self_reported`. Neither is ever `verified`. That is why this takes plain
 * facts rather than a journal row: an import has no journal id yet.
 */

/**
 * The canonical verification states. Ordered from "no verifier involved" to
 * "decided", which is also the order the rules below resolve in reverse.
 */
export const WORK_VERIFICATION_STATES = [
  /** WORK CLAIMED / SELF-REPORTED — the person's own record, no employer
   *  involved. Legitimate evidence; simply not verified by anyone. */
  "self_reported",
  /** VERIFIER NOT YET IDENTIFIED — an organization is involved but no
   *  authorized verifier can be resolved from real context. */
  "verifier_not_identified",
  /** VERIFIER AVAILABLE — the organization is known and someone there could
   *  confirm, but the confirmation path is not switched on yet. */
  "verifier_available",
  /** VERIFICATION PENDING — it is in an authorized verifier's queue now. */
  "verification_pending",
  /** VERIFIED / APPROVED — a real confirmation row says so. */
  "verified",
  /** RETURNED — the verifier asked for changes. */
  "returned",
  /** DISPUTED — the verifier rejected it. */
  "disputed",
  /** VERIFICATION NOT APPLICABLE — genuinely nobody to verify against, e.g.
   *  the person owns the organization the work was done for. */
  "not_applicable",
] as const;

export type WorkVerificationState = (typeof WORK_VERIFICATION_STATES)[number];

/**
 * Who could legitimately verify. `none` is a first-class answer — the whole
 * point is that the product says "nobody yet" instead of guessing.
 */
export type VerifierResolution =
  /** Exactly one authorized organization path. */
  | { readonly kind: "organization"; readonly organizationId: string }
  /** Several legitimate possibilities — the worker chooses, we never guess. */
  | { readonly kind: "choice"; readonly organizationIds: readonly string[] }
  /** The person owns the organization; there is nobody above them. */
  | { readonly kind: "self"; readonly organizationId: string }
  /** Cannot be resolved from real context. NEVER a placeholder for a guess. */
  | { readonly kind: "none" };

/** The single honest next step. Stable keys; the UI maps them to copy. */
export type VerificationNextAction =
  /** Nothing to do — a verifier already has it. */
  | "await_verifier"
  /** The employer is known but cannot confirm work yet. */
  | "ask_employer_to_enable_confirmation"
  /** No verifier resolvable — name or invite the responsible person. */
  | "identify_verifier"
  /** A decision exists; the worker may respond to it. */
  | "respond_to_decision"
  /** Nothing is required, and nothing is missing. */
  | "none";

/** The facts about the engagement context the work was logged against.
 *  Plain values, so an importer can supply them before any row exists. */
export interface VerifierContextFacts {
  /** NULL for the personal, organization-less context. */
  readonly organizationId: string | null;
  /** `journal_review_enabled` on that relationship. */
  readonly journalReviewEnabled: boolean;
  /** `employee`, `owner`, … — the person's relationship to the organization. */
  readonly relationshipSlug: string;
  /** `active`, `ended`, … — an ended relationship cannot receive new work. */
  readonly status: string;
}

export interface WorkVerificationInput {
  /**
   * The recorded decision, from `deriveReviewResult`. `"submitted"` means no
   * evidence row exists yet — awaiting, not approved. `null` means the
   * confirmations could not be read at all, which is UNKNOWN and must never be
   * shown as "nobody has confirmed this" (§54: unknown ≠ zero ≠ failed).
   */
  readonly reviewResult: ReviewResult | null;
  /** The entry's engagement context, or null when it has none. */
  readonly context: VerifierContextFacts | null;
}

export interface WorkVerification {
  readonly state: WorkVerificationState;
  readonly verifier: VerifierResolution;
  readonly nextAction: VerificationNextAction;
  /**
   * True when the confirmation evidence could not be read. The state is then
   * the best honest reading of the context alone, and the caller MUST render
   * it as unknown rather than as an absence of confirmation.
   */
  readonly evidenceUnavailable: boolean;
}

/** The relationships in which the person is the organization's own principal,
 *  so no one inside it stands above them to confirm their work. */
const SELF_PRINCIPAL_RELATIONSHIPS = new Set(["owner", "founder", "sole_trader"]);

/** Can this context carry work to an authorized verifier at all? */
function contextIsLive(c: VerifierContextFacts): boolean {
  return c.status === "active" && c.organizationId !== null;
}

/**
 * Derive one entry's verification state.
 *
 * A RECORDED DECISION ALWAYS WINS. It is an append-only fact about what a real
 * person actually did; no amount of context may talk over it. Only when there
 * is no decision does the context decide what the honest waiting state is.
 */
export function deriveWorkVerificationState(
  input: WorkVerificationInput,
): WorkVerification {
  const { reviewResult, context } = input;

  // 1. A real decision exists — report it, whatever the context now says.
  //    (A relationship can end after the work was confirmed; the confirmation
  //    does not evaporate because the job did.)
  if (reviewResult === "approved") {
    return {
      state: "verified",
      verifier: verifierOf(context),
      nextAction: "none",
      evidenceUnavailable: false,
    };
  }
  if (reviewResult === "rejected") {
    return {
      state: "disputed",
      verifier: verifierOf(context),
      nextAction: "respond_to_decision",
      evidenceUnavailable: false,
    };
  }
  if (reviewResult === "changes_requested") {
    return {
      state: "returned",
      verifier: verifierOf(context),
      nextAction: "respond_to_decision",
      evidenceUnavailable: false,
    };
  }

  const evidenceUnavailable = reviewResult === null;

  // 2. No context at all — the work is the person's own claim.
  if (!context) {
    return {
      state: "self_reported",
      verifier: { kind: "none" },
      nextAction: "identify_verifier",
      evidenceUnavailable,
    };
  }

  // 3. The person is the organization's own principal: nobody stands above
  //    them. This is NOT a gap to nag about — it is genuinely not applicable.
  if (
    context.organizationId !== null &&
    SELF_PRINCIPAL_RELATIONSHIPS.has(context.relationshipSlug)
  ) {
    return {
      state: "not_applicable",
      verifier: { kind: "self", organizationId: context.organizationId },
      nextAction: "none",
      evidenceUnavailable,
    };
  }

  // 4. Personal, organization-less context — self-reported, and no verifier is
  //    identified. Kept as real evidence; the person is told it is unverified
  //    and offered the one useful next step.
  if (!contextIsLive(context)) {
    return {
      state: context.organizationId === null ? "self_reported" : "verifier_not_identified",
      verifier: { kind: "none" },
      nextAction: "identify_verifier",
      evidenceUnavailable,
    };
  }

  const organizationId = context.organizationId as string;

  // 5. An employer is known and can confirm work — it is in their queue.
  if (context.journalReviewEnabled) {
    return {
      state: "verification_pending",
      verifier: { kind: "organization", organizationId },
      nextAction: "await_verifier",
      evidenceUnavailable,
    };
  }

  // 6. The employer is known, but nobody there is set up to confirm work yet.
  //    Named honestly, with the action that actually unblocks it.
  return {
    state: "verifier_available",
    verifier: { kind: "organization", organizationId },
    nextAction: "ask_employer_to_enable_confirmation",
    evidenceUnavailable,
  };
}

/** The verifier a decided entry was decided by, as far as context can say. */
function verifierOf(context: VerifierContextFacts | null): VerifierResolution {
  if (!context || context.organizationId === null) return { kind: "none" };
  if (SELF_PRINCIPAL_RELATIONSHIPS.has(context.relationshipSlug)) {
    return { kind: "self", organizationId: context.organizationId };
  }
  return { kind: "organization", organizationId: context.organizationId };
}

/**
 * "KAM PATEIKTI ATLIKTĄ DARBĄ?" — answered across ALL of a person's contexts,
 * for when the question is asked in general rather than about one entry.
 *
 * The owner's rule, implemented literally:
 *   exactly one valid verifier  → show that verifier / confirmation path
 *   several                     → present the legitimate choices, preselect none
 *   none                        → say so; the work stays self-reported evidence
 *
 * This deliberately mirrors `resolveEngagementContext`'s B/C/D hierarchy — the
 * rule that already decides WHERE work is logged now also decides WHO can
 * confirm it, so the two can never disagree about the same relationship.
 */
export function resolveVerifierOptions(
  contexts: readonly VerifierContextFacts[],
): VerifierResolution {
  const live = contexts.filter(contextIsLive);
  if (live.length === 0) return { kind: "none" };

  // Someone else's organization can verify; your own cannot verify you.
  const external = live.filter(
    (c) => !SELF_PRINCIPAL_RELATIONSHIPS.has(c.relationshipSlug),
  );

  if (external.length === 1) {
    return { kind: "organization", organizationId: external[0].organizationId as string };
  }
  if (external.length > 1) {
    const ids = [...new Set(external.map((c) => c.organizationId as string))];
    return ids.length === 1
      ? { kind: "organization", organizationId: ids[0] }
      : { kind: "choice", organizationIds: ids };
  }

  // Only self-principal contexts: nobody above them, and that is the answer.
  const own = live[0];
  return { kind: "self", organizationId: own.organizationId as string };
}

/** True when the work carries no verification and none can currently be
 *  reached — the exact population of the 15 orphaned records. */
export function isVerificationDeadEnd(v: WorkVerification): boolean {
  return (
    (v.state === "self_reported" || v.state === "verifier_not_identified") &&
    v.verifier.kind === "none"
  );
}
