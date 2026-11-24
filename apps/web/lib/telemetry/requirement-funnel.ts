/**
 * Requirement funnel events — PURE mapping (employer funnel closure, owner
 * §23 canonical chain, 2026-09-22).
 *
 * The logged-in employer's requirement path (`lib/demand/demand-request.ts`
 * → `submit_demand_request_v2` → `customer_requests`) emitted NO
 * pilot_event: the chain was measurable up to `company_need_submitted`
 * (the anonymous pre-auth form) and then went dark exactly where a company
 * states a real need. This module decides, from the stored row's status,
 * which bounded events that write produces — so the rule is one function
 * with a unit test rather than an `if` inside a server action.
 *
 *   - every successful write     → `demand_saved` with `status` on it
 *                                  (REQUIREMENT_COMPLETED, the write itself);
 *   - a worker-visible status    → additionally `requirement_activated`
 *     (`submitted` | `approved`)    (the requirement is now in the market:
 *                                  the worker board RPC serves `submitted`
 *                                  rows; `approved` is the admin-pipeline's
 *                                  own accepted state).
 *
 * `draft`, `in_review`, `needs_followup`, `closed` produce the write event
 * only. No event is inferred from a status the caller did not observe.
 */

import {
  FUNNEL_EVENTS,
  REQUIREMENT_STATUSES,
  type FunnelEventName,
  type RequirementStatus,
} from "./funnel-events";

/** Statuses under which a requirement is live for workers. */
export const REQUIREMENT_ACTIVE_STATUSES: readonly RequirementStatus[] = [
  "submitted",
  "approved",
];

/** Type guard over the closed status set — a value that is not in it is not
 *  a requirement status and may not be written to an event. */
export function isRequirementStatus(value: unknown): value is RequirementStatus {
  return (
    typeof value === "string" &&
    (REQUIREMENT_STATUSES as readonly string[]).includes(value)
  );
}

export function isRequirementActivatedStatus(status: RequirementStatus): boolean {
  return REQUIREMENT_ACTIVE_STATUSES.includes(status);
}

/**
 * The bounded events a successful requirement write emits, in order.
 * Always the write event first; the activation event only for an active
 * status. Never empty for a valid status.
 */
export function requirementFunnelEvents(
  status: RequirementStatus,
): readonly FunnelEventName[] {
  const events: FunnelEventName[] = [FUNNEL_EVENTS.demandSaved];
  if (isRequirementActivatedStatus(status)) {
    events.push(FUNNEL_EVENTS.requirementActivated);
  }
  return events;
}
