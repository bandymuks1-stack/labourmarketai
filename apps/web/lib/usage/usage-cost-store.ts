/**
 * usage_cost_events store — SERVER-ONLY, best-effort persistence
 * (W14 Pilot Analytics slice v1).
 *
 * FIRST WRITER of the canonical append-only usage & cost ledger
 * `public.usage_cost_events` (applied to production as
 * `20260728114353_usage_cost_events_v1_clean_start.sql`; the table had ZERO
 * writers until this module). One `event_type='usage'` row per LIVE AI run,
 * written alongside the existing `ai_runs` audit row from
 * `lib/ai/run-agent-server.ts`.
 *
 * INVARIANTS (mirrors lib/ai/runtime/audit-store.ts):
 *   - NEVER throws: any failure (missing service key, network error, CHECK
 *     violation) is logged with a bounded, secret-free message and the run
 *     result is unaffected;
 *   - writes use the service-role client — `usage_cost_events` by design has
 *     NO INSERT policy/grant for authenticated callers (admin-only SELECT,
 *     append-only: UPDATE/DELETE/TRUNCATE are revoked AND trigger-blocked),
 *     so service role is the only write path — the billing-webhook pattern;
 *   - the row carries usage FACTS (provider, model id, token counts, cost
 *     figures) — never prompts, never outputs, never chat content.
 *
 * COST HONESTY (the table's own CHECK constraints, honoured here):
 *   - all money is EUR cents; USD figures from the pricing table are
 *     converted with the pinned, owner-reviewable `EUR_PER_USD` below —
 *     changing it REQUIRES a new `USAGE_COST_PRICING_VERSION` string so a
 *     repricing stays auditable (`usage_cost_events_pricing_version_required`);
 *   - `estimatedCents`/`actualCents` are fractional EUR cents (the CHECKs
 *     require non-negative numbers, not integers) so a sub-cent LLM run is
 *     never rounded into a fabricated 0 or a fabricated 1;
 *   - unknown cost = the key is OMITTED, never 0
 *     (`usage_cost_events_no_fabricated_zero`);
 *   - `actualCents` derives from SUPPLIER-REPORTED token usage priced at the
 *     owner-reviewed rate card (lib/ai/runtime/model-pricing.ts), so its
 *     `billingSource` is `supplier_reported` — it is NOT an invoice figure
 *     (`supplier_invoice` stays reserved for real invoice reconciliation);
 *   - a pre-run estimate carries `estimatedCents` with the same
 *     pricingVersion (`estimated_from_price_list` semantics live in the
 *     version string; the CHECK only demands `billingSource` for ACTUAL).
 */
import "server-only";
import { randomUUID } from "node:crypto";
import type { AiRoutingAuditRecord } from "@/lib/ai/runtime/task-routing";

/**
 * Pinned USD→EUR conversion for the cost ledger. OWNER-REVIEWABLE: this is a
 * deliberately static bookkeeping rate (approx. ECB reference, 2026-08), not
 * a live FX feed — a moving rate would make the same run cost a different
 * amount depending on the day it was written. Update it together with
 * USAGE_COST_PRICING_VERSION, never alone.
 */
export const EUR_PER_USD = 0.86;

/**
 * The rate card + FX pin this writer prices with. Bump when either the model
 * pricing table (lib/ai/runtime/model-pricing.ts) or EUR_PER_USD changes.
 */
export const USAGE_COST_PRICING_VERSION = "model-pricing-2026-06.eur-usd-0.86.v1";

/** How this writer labels usage-derived actual cost. `supplier_reported`:
 *  token counts come from the provider's own usage report; the price applied
 *  is the owner-reviewed public rate card — not a supplier invoice. */
export const USAGE_COST_BILLING_SOURCE = "supplier_reported";

export interface UsageCostPersistExtras {
  readonly profileId?: string | null;
  readonly organizationId?: string | null;
  /** Short label of the calling surface (e.g. the agent key). */
  readonly requestContext?: string | null;
}

/** Row shape for public.usage_cost_events — kept in sync with the applied
 *  migration 20260728114353. */
export interface UsageCostEventRow {
  readonly event_id: string;
  readonly occurred_at: string;
  readonly event_type: "usage";
  readonly status: "success" | "error" | "partial" | "rejected";
  readonly provider: string;
  readonly service: string;
  readonly resource: string | null;
  readonly profile_id: string | null;
  readonly organization_id: string | null;
  readonly feature_code: string | null;
  readonly payer: "platform";
  readonly measures: Record<string, number>;
  readonly cost: Record<string, string | number>;
  readonly metadata: Record<string, string>;
  readonly schema_version: number;
}

/** USD → fractional EUR cents (6-decimal precision). null in, null out —
 *  an unknown cost never becomes a number. */
export function usdToEurCents(usd: number | null | undefined): number | null {
  if (usd === null || usd === undefined || !Number.isFinite(usd) || usd < 0) {
    return null;
  }
  return Math.round(usd * EUR_PER_USD * 100 * 1_000_000) / 1_000_000;
}

/**
 * Pure record → row mapping (exported for tests). Bounds every free-text
 * field to the migration's CHECK limits and honours every cost CHECK so an
 * insert can never fail on shape.
 */
export function buildUsageCostEventRow(
  record: AiRoutingAuditRecord,
  extras: UsageCostPersistExtras = {},
  ids: { eventId?: string; occurredAtIso?: string } = {},
): UsageCostEventRow {
  const measures: Record<string, number> = {};
  const inTok = record.usage?.inputTokens;
  const outTok = record.usage?.outputTokens;
  if (typeof inTok === "number" && Number.isFinite(inTok) && inTok >= 0) {
    measures.inputTokens = inTok;
  }
  if (typeof outTok === "number" && Number.isFinite(outTok) && outTok >= 0) {
    measures.outputTokens = outTok;
  }

  const actualCents = usdToEurCents(record.actualCostUsd);
  const estimatedCents = usdToEurCents(record.estimatedCostUsd);
  const cost: Record<string, string | number> = {};
  if (actualCents !== null) {
    cost.actualCents = actualCents;
    // The CHECK demands a billingSource for every actual figure.
    cost.billingSource = USAGE_COST_BILLING_SOURCE;
  }
  // No fabricated zero (table CHECK): an estimate of exactly 0 with no
  // actual and no billing source is forbidden — and rightly so, because our
  // estimator returns 0 only when it priced nothing. Omit it instead.
  if (estimatedCents !== null && !(estimatedCents === 0 && actualCents === null)) {
    cost.estimatedCents = estimatedCents;
  }
  if ("actualCents" in cost || "estimatedCents" in cost) {
    cost.currency = "EUR";
    cost.pricingVersion = USAGE_COST_PRICING_VERSION;
  }

  const metadata: Record<string, string> = {
    tier: record.selectedTier.slice(0, 32),
    model_alias: (record.modelAlias ?? "none").slice(0, 32),
  };
  if (extras.requestContext) {
    metadata.request_context = extras.requestContext.slice(0, 120);
  }
  if (record.blocked) metadata.blocked_reason = record.blocked.slice(0, 64);

  return {
    event_id: ids.eventId ?? randomUUID(),
    occurred_at: ids.occurredAtIso ?? new Date().toISOString(),
    event_type: "usage",
    // A blocked run performed no billable work — recorded as `rejected` so a
    // refusal is countable but never sums into spend as a success.
    status: record.blocked ? "rejected" : "success",
    provider: record.providerAdapter.slice(0, 64),
    service: "llm_completion",
    resource: record.modelId
      ? record.modelId.slice(0, 128)
      : record.modelAlias
        ? record.modelAlias.slice(0, 128)
        : null,
    profile_id: extras.profileId ?? null,
    organization_id: extras.organizationId ?? null,
    feature_code: record.taskType.slice(0, 64),
    // The platform pays for internal AI runs today — no user is billed.
    payer: "platform",
    measures,
    cost,
    metadata,
    schema_version: 1,
  };
}

/** Minimal structural view of the admin client — the generated Database type
 *  does not know usage_cost_events until `pnpm db:types` is re-run. */
interface MinimalUsageDb {
  from(table: "usage_cost_events"): {
    insert(values: Record<string, unknown>): PromiseLike<{
      error: { message?: string } | null;
    }>;
  };
}

function boundedErrorMessage(err: unknown): string {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "unknown error";
  // Never echo payloads/keys — keep the log short and structural.
  return message.slice(0, 200);
}

/**
 * Best-effort append of one usage_cost_events row. NEVER throws; returns
 * true when the row was persisted, false otherwise (failure logged, run
 * unaffected).
 */
export async function persistUsageCostEvent(
  record: AiRoutingAuditRecord,
  extras: UsageCostPersistExtras = {},
): Promise<boolean> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const db = createAdminClient() as unknown as MinimalUsageDb;
    const { error } = await db.from("usage_cost_events").insert(
      buildUsageCostEventRow(record, extras) as unknown as Record<string, unknown>,
    );
    if (error) {
      console.error("[usage-cost-store] persist failed", {
        message: (error.message ?? "unknown").slice(0, 200),
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("[usage-cost-store] persist failed", {
      message: boundedErrorMessage(err),
    });
    return false;
  }
}
