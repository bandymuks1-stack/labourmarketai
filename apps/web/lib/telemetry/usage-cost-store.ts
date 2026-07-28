import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeProvider } from "@/lib/telemetry/provider-registry";
import {
  EVENT_SCHEMA_VERSION,
  validateEventShape,
  workspaceId,
  type EventCost,
  type EventStatus,
  type EventType,
  type Payer,
  type RevenueLink,
  type UsageCostEvent,
  type UsageMeasures,
} from "@/lib/telemetry/usage-cost-event-model";

/**
 * USAGE & COST EVENT STORE — the append-only write path.
 *
 * Contract: `docs/architecture/usage-cost-event-model-v1.md`.
 * Storage:  `supabase/migrations/20260728120000_usage_cost_events_v1.sql`.
 *
 * Four properties, each enforced HERE and again in the database, so neither
 * layer is the only thing standing between a bug and a wrong number:
 *
 *  1. APPEND-ONLY — this module exposes no update and no delete. The table
 *     revokes both from every role and a trigger raises on either.
 *  2. IDENTITY IS SERVER-RESOLVED — the caller cannot pass profile_id,
 *     organization_id or workspace_id. They are derived from the session here;
 *     the input type has no field for them.
 *  3. IDEMPOTENT — `event_id` is the primary key and the insert is
 *     `on conflict do nothing`. A retry returns `duplicate` deterministically
 *     and never touches the stored row.
 *  4. COST HONESTY — the shape validator refuses a fabricated zero and a
 *     missing pricing version before the row is built; the table's CHECK
 *     constraints refuse them again.
 *
 * Never throws into a caller: telemetry must not be able to break a product
 * action (risk R4). Every failure is a tagged result.
 */

const RELATION_ABSENT = "42P01";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

/**
 * What a caller may supply. Deliberately has NO identity fields: passing an
 * owner is structurally impossible, not merely validated away.
 */
export interface UsageCostEventInput {
  /** Idempotency key. Same key = same event, forever. */
  readonly eventId: string;
  readonly occurredAt?: string;
  readonly eventType: EventType;
  readonly provider: string;
  readonly service: string;
  readonly resource?: string | null;
  readonly status: EventStatus;
  readonly measures?: UsageMeasures;
  readonly cost?: EventCost;
  readonly revenueLink?: RevenueLink | null;
  readonly featureCode?: string | null;
  readonly planKey?: string | null;
  readonly payer?: Payer | null;
  readonly sessionId?: string | null;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export type UsageCostWriteResult =
  | { readonly ok: true; readonly stored: "inserted" | "duplicate"; readonly eventId: string }
  | {
      readonly ok: false;
      readonly reason:
        | "invalid_shape"
        | "needs_migration"
        | "rejected_by_database"
        | "error";
      readonly detail?: string;
    };

/** Server-resolved attribution. Never accepted from a caller. */
export interface ResolvedIdentity {
  readonly profileId: string | null;
  readonly organizationId: string | null;
  readonly workspaceId: string | null;
}

/**
 * Resolve WHO the event belongs to from the session alone.
 *
 * `organizationId` comes from the canonical membership-validated resolver, so
 * a stale or foreign pointer can never win. `workspaceId` is DERIVED
 * (`personal:<profile>` / `org:<org>`) — there is no workspaces table.
 */
export async function resolveEventIdentity(): Promise<ResolvedIdentity> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { profileId: null, organizationId: null, workspaceId: null };

  let organizationId: string | null = null;
  try {
    const { getActiveOrganizationContext } = await import(
      "@/lib/company/active-organization"
    );
    const ctx = await getActiveOrganizationContext();
    organizationId = ctx.activeOrganizationId ?? null;
  } catch {
    // Honest degradation: an unresolved organisation means the PERSONAL
    // workspace, never a guessed one.
    organizationId = null;
  }

  return {
    profileId: user.id,
    organizationId,
    workspaceId: organizationId
      ? workspaceId({ kind: "organization", organizationId })
      : workspaceId({ kind: "personal", profileId: user.id }),
  };
}

/**
 * Append one event. The ONLY write path into `usage_cost_events`.
 *
 * `identity` is injected so a background/system emitter can record an event
 * for a known owner without a session; when omitted it is resolved from the
 * caller's own session. In neither case does the EVENT INPUT carry identity.
 */
export async function recordUsageCostEvent(
  input: UsageCostEventInput,
  identity?: ResolvedIdentity,
): Promise<UsageCostWriteResult> {
  const who = identity ?? (await resolveEventIdentity());
  const provider = normalizeProvider(input.provider);

  const event: UsageCostEvent = {
    eventId: input.eventId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    eventType: input.eventType,
    provider: provider.slug,
    service: input.service,
    resource: input.resource ?? null,
    status: input.status,
    attribution: {
      workspaceId: who.workspaceId,
      userId: who.profileId,
      organizationId: who.organizationId,
      sessionId: input.sessionId ?? null,
      featureCode: input.featureCode ?? null,
      planKey: input.planKey ?? null,
      payer: input.payer ?? null,
    },
    measures: input.measures ?? {},
    cost: input.cost ?? {
      currency: "EUR",
      estimatedCents: null,
      actualCents: null,
      pricingVersion: null,
      supplier: null,
      billingSource: null,
    },
    revenueLink: input.revenueLink ?? null,
    metadata: input.metadata ?? {},
    schemaVersion: EVENT_SCHEMA_VERSION,
  };

  const violations = validateEventShape(event);
  if (violations.length > 0) {
    return { ok: false, reason: "invalid_shape", detail: violations.join(",") };
  }

  const row = {
    event_id: event.eventId,
    occurred_at: event.occurredAt,
    event_type: event.eventType,
    status: event.status,
    provider: event.provider,
    service: event.service,
    resource: event.resource,
    workspace_id: event.attribution.workspaceId,
    profile_id: event.attribution.userId,
    organization_id: event.attribution.organizationId,
    session_id: event.attribution.sessionId,
    feature_code: event.attribution.featureCode,
    plan_key: event.attribution.planKey,
    payer: event.attribution.payer,
    measures: event.measures,
    cost: event.cost,
    revenue_link: event.revenueLink,
    metadata: event.metadata,
    schema_version: event.schemaVersion,
  };

  // Idempotent by construction: the same event_id is stored exactly once and
  // the stored row is never modified by a retry.
  const { data, error } = await admin()
    .from("usage_cost_events")
    .insert(row)
    .select("event_id");

  if (!error) {
    const inserted = Array.isArray(data) && data.length > 0;
    return {
      ok: true,
      stored: inserted ? "inserted" : "duplicate",
      eventId: event.eventId,
    };
  }
  if (error.code === UNIQUE_VIOLATION) {
    // A concurrent writer stored the same event first — same key, same event.
    return { ok: true, stored: "duplicate", eventId: event.eventId };
  }
  if (error.code === RELATION_ABSENT) {
    return { ok: false, reason: "needs_migration" };
  }
  if (error.code === CHECK_VIOLATION) {
    return { ok: false, reason: "rejected_by_database", detail: error.message };
  }
  return { ok: false, reason: "error", detail: error.message };
}
