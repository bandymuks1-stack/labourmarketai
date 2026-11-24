/**
 * Coarse telemetry role for a conversation action id (W8 slice 1).
 *
 * The W8 audit found the inline action form reporting EVERY conversation write
 * as `role_context: "worker"` — including `company.create-demand`, which is the
 * employer's primary act. The one funnel that could have shown employer intake
 * was therefore attributing it to the worker funnel.
 *
 * The mapping is the action id's own namespace, which is already the
 * dispatcher's routing key (`lib/conversation/dispatch.ts` splits on exactly
 * these prefixes), so there is no second source of truth and no new role enum:
 * the values are the EXISTING coarse vocabulary documented in
 * `lib/telemetry/actions.ts` ('worker' | 'company' | 'agency' | 'customer').
 *
 * Pure, no IO — safe on both sides of the boundary and directly unit-testable.
 */

/** The coarse role vocabulary telemetry already accepts. */
export type TelemetryRoleContext = "worker" | "company" | "agency" | "customer";

/**
 * Derive the coarse role from a namespaced conversation action id.
 * An unknown / unnamespaced id falls back to `"worker"` — the historical value,
 * so an id this mapping has never seen cannot silently invent an employer
 * event. (A NEW namespace must be added here deliberately; the guard test pins
 * that every registered employer action id maps away from "worker".)
 */
export function roleContextForAction(actionId: string): TelemetryRoleContext {
  if (actionId.startsWith("company.")) return "company";
  if (actionId.startsWith("agency.")) return "agency";
  if (actionId.startsWith("customer.")) return "customer";
  // §7.1 — the RELATIONSHIP namespace. `engagement.*` actions are held by the
  // employer AND the worker over the same row, so no coarse role is true of
  // them: whichever value this returned would be wrong half the time.
  //
  // It is stated explicitly rather than left to the fallback below, because a
  // silent fallback reads as "an id nobody has classified yet" — and because
  // the choice needs its reason recorded. "worker" is the LESS privileged
  // attribution, the same direction `asSide()` in `lib/engagements/
  // end-engagement.ts` takes when the server's side is unreadable: an employer
  // act miscounted as a worker act understates the employer funnel, whereas
  // the reverse would invent employer activity that did not happen.
  //
  // The honest fix is a telemetry vocabulary that can express "either party",
  // which is a change to `lib/telemetry/actions.ts` and out of this slice's
  // scope. Until then this is the safe direction, not a claim of correctness.
  if (actionId.startsWith("engagement.")) return "worker";
  return "worker";
}
