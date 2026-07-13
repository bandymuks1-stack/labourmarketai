/**
 * ONE canonical candidate pipeline (P4) — PURE derivation module.
 *
 * The repo has 6 competing status models around a (demand, worker) pair:
 * `demand_shortlist` (saved/interested/not_fit/reviewed),
 * `demand_interest_signals` (interested/withdrawn/reviewed/contacted),
 * `booking_requests` (proposed/accepted/declined/withdrawn/expired),
 * `project_worker_operational_statuses`, `candidate_drafts` and the dormant
 * `match_actions`. This module does NOT add a 7th enum or table. Instead it
 * derives ONE canonical human pipeline stage from the EXISTING facts, at read
 * time, with a documented precedence ladder.
 *
 * THE STAGE IS DERIVED, NEVER STORED. That is exactly what makes it canonical
 * without a 7th enum: there is no new column, no new table, no new CHECK
 * constraint, and nothing to drift out of sync. The source-of-truth rows in
 * `demand_shortlist`, `demand_interest_signals`, `booking_requests` and the
 * `conversations` model stay untouched; this module is a read-time lens.
 *
 * The 7 human stages (ordered as a funnel):
 *   new (Naujas) → reviewing (Peržiūrimas) → contacted (Susisiekti) →
 *   interview (Pokalbis) → offer (Pasiūlymas) → accepted (Priimtas) →
 *   rejected (Atmestas)
 *
 * Precedence ladder (top rung wins — later facts dominate earlier ones):
 *   1. booking accepted                          → "accepted"
 *   2. booking proposed (still open)             → "offer"
 *   3. shortlist not_fit OR booking declined     → "rejected"
 *   4. a direct conversation exists for the pair → "interview"
 *   5. interest signal acknowledged 'contacted'  → "contacted"
 *   6. shortlist saved/interested/reviewed OR
 *      interest signal acknowledged 'reviewed'   → "reviewing"
 *   7. otherwise (appears in scouting, no action)→ "new"
 *
 * Honesty notes:
 * - "interview" (Pokalbis) means A REAL TWO-WAY IN-APP CONVERSATION IS OPEN
 *   between the company and the worker — NOT a scheduled meeting. No
 *   interview/calendar entity exists in this repo (audit §3), so the stage is
 *   labelled by the fact we actually have: an open exchange.
 * - A withdrawn or expired booking is NOT an active offer and NOT a
 *   rejection by the worker — it falls through to the lower rungs (the
 *   shortlist/conversation facts keep telling the truth).
 * - A worker-initiated interest signal alone ('interested', no company act)
 *   stays "new": the pipeline reflects the COMPANY's process, and the company
 *   has not acted yet. The scouting card shows the interest badge separately.
 * - Default-closed: unknown/absent facts never invent a stage — they fall
 *   through, ending at "new".
 *
 * PURE: no IO, no DB, no server-only import. Fact loading lives in
 * ./candidate-pipeline-facts.ts (server-side); the UI passes plain facts in.
 */

export const CANDIDATE_PIPELINE_STAGES = [
  "new",
  "reviewing",
  "contacted",
  "interview",
  "offer",
  "accepted",
  "rejected",
] as const;

export type CandidatePipelineStage = (typeof CANDIDATE_PIPELINE_STAGES)[number];

/** demand_shortlist.status closed set (migration 20260612220000). */
const SHORTLIST = ["saved", "interested", "not_fit", "reviewed"] as const;
/** demand_interest_signals.status closed set (migration 20260704230000). */
const INTEREST = ["interested", "withdrawn", "reviewed", "contacted"] as const;
/** booking_requests.status closed set (migration 20260613100100). */
const BOOKING = ["proposed", "accepted", "declined", "withdrawn", "expired"] as const;

type ShortlistStatus = (typeof SHORTLIST)[number];
type InterestStatus = (typeof INTEREST)[number];
type BookingStatus = (typeof BOOKING)[number];

/** Default-closed normalizer: anything outside the closed set is treated as
 *  "no fact" (null) — an unknown DB value can never mint a pipeline stage. */
function pick<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
): T | null {
  return value != null && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

export interface CandidatePipelineFacts {
  /** demand_shortlist.status for (owner, request, worker), or null. */
  readonly shortlistStatus: string | null;
  /** demand_interest_signals.status for (request, worker), or null.
   *  'withdrawn' rows are treated as no signal. */
  readonly interestStatus: string | null;
  /** booking_requests.status for (owner, request, worker), or null.
   *  The propose RPC upserts ONE row per pair, so this is the pair's
   *  current lifecycle state, not one of many. */
  readonly bookingStatus: string | null;
  /** True when a direct in-app conversation between the company user and
   *  this worker exists (pair-level fact — see candidate-pipeline-facts). */
  readonly conversationExists: boolean;
}

/**
 * Derive the ONE canonical pipeline stage for a (demand, worker) pair from
 * the existing facts. Pure, deterministic, default-closed to "new".
 */
export function deriveCandidatePipelineStage(
  facts: CandidatePipelineFacts,
): CandidatePipelineStage {
  const shortlist = pick<ShortlistStatus>(facts.shortlistStatus, SHORTLIST);
  const interest = pick<InterestStatus>(facts.interestStatus, INTEREST);
  const booking = pick<BookingStatus>(facts.bookingStatus, BOOKING);

  // 1. The worker ACCEPTED a real booking proposal — the strongest fact.
  if (booking === "accepted") return "accepted";
  // 2. An OPEN booking proposal is the offer stage (withdrawn/expired are
  //    not open and fall through; declined is handled as rejection below).
  if (booking === "proposed") return "offer";
  // 3. Closed negatively: the company marked not_fit, or the worker declined.
  if (shortlist === "not_fit" || booking === "declined") return "rejected";
  // 4. A real two-way conversation is open (honest meaning of "Pokalbis").
  if (facts.conversationExists) return "interview";
  // 5. The company acknowledged the worker's interest as 'contacted'
  //    (demand_interest_signals is the only fact source with a contacted
  //    state — demand_shortlist has no contacted-equivalent status).
  if (interest === "contacted") return "contacted";
  // 6. The company is actively considering: any positive shortlist status,
  //    or the company acknowledged the interest signal as 'reviewed'.
  if (shortlist !== null || interest === "reviewed") return "reviewing";
  // 7. Default-closed: in the scouting results, no company action yet.
  return "new";
}

export interface CandidatePipelineNextAction {
  /** i18n key under the candidatePipeline namespace. */
  readonly key: string;
  /** Real, existing route (locale-prefixed). Never a dead link. */
  readonly href: string;
}

export interface NextActionContext {
  readonly locale: string;
  /** customer_requests.id of the demand the pipeline is scoped to. */
  readonly requestId: string;
}

/**
 * Exactly ONE next action per stage — a real route, never a fake control.
 * new/reviewing/rejected act on the scouting page itself (shortlist decision,
 * in-card contact button, other candidates); contacted/interview go to the
 * real messaging surface; offer/accepted go to the real bookings surface.
 */
export function nextActionForStage(
  stage: CandidatePipelineStage,
  ctx: NextActionContext,
): CandidatePipelineNextAction {
  const scouting = `/${ctx.locale}/dashboard/company/scouting?request=${ctx.requestId}`;
  const communication = `/${ctx.locale}/dashboard/communication`;
  const bookings = `/${ctx.locale}/dashboard/bookings`;
  switch (stage) {
    case "new":
      return { key: "candidatePipeline.action.review", href: scouting };
    case "reviewing":
      return { key: "candidatePipeline.action.contact", href: scouting };
    case "contacted":
      return { key: "candidatePipeline.action.message", href: communication };
    case "interview":
      return {
        key: "candidatePipeline.action.continueConversation",
        href: communication,
      };
    case "offer":
      return { key: "candidatePipeline.action.viewOffer", href: bookings };
    case "accepted":
      return { key: "candidatePipeline.action.planWork", href: bookings };
    case "rejected":
      return { key: "candidatePipeline.action.reviewOthers", href: scouting };
  }
}
