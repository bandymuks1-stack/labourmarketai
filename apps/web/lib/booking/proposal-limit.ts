/**
 * WHICH BOOKING-PROPOSAL LIMIT A REFUSAL NAMES.
 *
 * The database caps what one owner may have in flight
 * (`supabase/migrations/20260716121000_request_rate_limits_v3.sql`): at most
 * 10 proposals still waiting for a worker's answer, and at most 30 created in
 * any 24 hours. Both raise errcode P0004 with their own message. Accepting an
 * agency's candidate proposes a booking, so the same refusal can reach the
 * employer's offer decision, where it used to read as a generic failure.
 *
 * Pure: the code and message in, which limit out. `open` has a way out now
 * (withdraw proposals that are no longer needed); `daily` passes with time;
 * `unknown` is a P0004 whose text this reader does not recognise, still a
 * limit and never a generic error. Anything else is not a proposal limit.
 */
export type ProposalLimit = "open" | "daily" | "unknown";

export const PROPOSAL_LIMIT_ERRCODE = "P0004";

export function proposalLimitOf(
  code: string | null | undefined,
  message: string | null | undefined,
): ProposalLimit | null {
  const m = (message ?? "").toLowerCase();
  if (m.includes("too many open booking proposals")) return "open";
  if (m.includes("booking proposal daily limit reached")) return "daily";
  if (code === PROPOSAL_LIMIT_ERRCODE) return "unknown";
  return null;
}
