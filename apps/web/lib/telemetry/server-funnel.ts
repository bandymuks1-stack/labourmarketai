/**
 * Server-side funnel emission (W14 Pilot Analytics slice v1).
 *
 * Mid-funnel marketplace events (`match_preview_generated`, `shortlist_added`,
 * `contact_requested`, …) happen inside SERVER actions, where there is no
 * client `trackFunnel` pipe. This helper routes them through the SAME
 * RLS-safe insert path as every other pilot event — `recordTelemetryEvent`
 * (lib/telemetry/actions.ts) — so all of its doctrine holds unchanged:
 *
 *   - profile_id is derived server-side from `supabase.auth.getUser()`;
 *     the call site never says who it is;
 *   - metadata keys stay allowlisted and size-capped by the action itself;
 *   - the insert is INSERT-only (no chained select — the documented prod
 *     defect fix in actions.ts stays intact because this module never
 *     touches the insert);
 *   - FIRE-AND-FORGET: a telemetry failure must NEVER break the product
 *     action that emitted it. The promise is detached and every rejection
 *     swallowed. This mirrors the existing server-side precedent in
 *     lib/demand/demand-request.ts (`sessionId: "server:…"`).
 *
 * Session semantics: server-emitted events carry a `server:<source>` session
 * id (bounded, non-identifying). They are NOT browser-tab sessions and are
 * deliberately distinguishable from them in any per-session analysis.
 */
import "server-only";
import { recordTelemetryEvent } from "./actions";
import { analyticsAttributionMetadata } from "./analytics-attribution";
import type { FunnelEventName, FunnelMetadata } from "./funnel-events";

export function emitServerFunnelEvent(
  event: FunnelEventName,
  opts: {
    /** Short module label for the pseudo-session id, e.g. "scouting". */
    source: string;
    /** Route context for the row; defaults to the dashboard root. */
    route?: string;
    /** Allowlisted, bounded scalars only — enforced again server-side. */
    metadata?: FunnelMetadata;
  },
): void {
  // M-P0-8: every server-emitted event carries the validated workspace
  // attribution (workspace_type / organization_id / org_role /
  // billing_subject) — resolved HERE so all emit sites inherit it and no
  // call site can fabricate an organization. Explicit metadata wins on key
  // collision (there is none today; the attribution keys are reserved).
  void analyticsAttributionMetadata()
    .then((attribution) =>
      recordTelemetryEvent({
        sessionId: `server:${opts.source}`.slice(0, 64),
        route: opts.route ?? "/dashboard",
        locale: "lt",
        eventName: event,
        result: "info",
        metadata: { ...attribution, ...(opts.metadata ?? {}) },
      }),
    )
    .catch(() => {
      // Best-effort by contract: the emitting action's outcome is
      // authoritative; a lost telemetry row is acceptable, a broken product
      // action is not.
    });
}
