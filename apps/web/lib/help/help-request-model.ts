/**
 * Typed internal help requests (CR train WAGON 10, areas 18+19) — shared
 * client-safe model. The five help types mirror the CLOSED set enforced
 * server-side by submit_help_request_v1 (20260705260000) — guard-pinned.
 *
 * A help request is an ordinary customer_requests row with
 * payload.help_type set, status 'in_review' (operator queue), created only
 * through the gated RPC. Nothing is sent anywhere; a human reviews it and
 * no specialist is assigned automatically.
 */

export const HELP_REQUEST_TYPES = [
  "recruiter",
  "accounting",
  "legal",
  "documents",
  "demand_filling",
] as const;
export type HelpRequestType = (typeof HELP_REQUEST_TYPES)[number];

export const HELP_NOTE_MAX = 500;

export type HelpRequestActionResult =
  | { ok: true; requestId: string | null }
  | {
      ok: false;
      code:
        | "unauthenticated"
        | "invalid_type"
        | "note_too_long"
        | "demand_not_owned"
        | "too_many_open"
        | "not_ready"
        | "failed";
    };
