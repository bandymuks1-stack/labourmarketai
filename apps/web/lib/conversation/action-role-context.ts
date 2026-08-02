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
  return "worker";
}
