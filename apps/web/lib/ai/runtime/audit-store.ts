/**
 * ai_runs audit store — SERVER-ONLY, best-effort persistence (AI Router v1).
 *
 * Persists the routing audit record built by task-routing.ts into the
 * append-only `ai_runs` table (gated draft migration
 * 20260714150000_ai_runs_audit_v1.sql) and supplies the persisted daily-run
 * counter for the AI_DAILY_RUN_BUDGET guard.
 *
 * INVARIANTS:
 *   - NEVER throws: any failure (missing service key, table not applied,
 *     network error) is logged with a bounded, secret-free message and the
 *     run result is unaffected;
 *   - writes use the service-role client (same server-only pattern as the
 *     billing webhook writes) — there is no client write path;
 *   - the record carries field NAMES and a bounded validated-output excerpt
 *     only — input content never reaches this module.
 */
import "server-only";
import {
  AI_RUN_OUTPUT_EXCERPT_MAX,
  type AiRoutingAuditRecord,
} from "./task-routing";
import type { AiRuntimeState } from "./config-core";

/**
 * What KIND of event a finished route is, for the audit trail.
 *
 * The original writer asked one question — "did a vendor answer?" — and
 * discarded everything else. That made `ai_runs` silent about the majority of
 * what actually happens on a stack with no provider configured: a real person
 * really reached an AI surface, the router really resolved a route, and no
 * vendor ever saw the payload. Those runs are not nothing, and they are not
 * synthetic either. They are the ZERO-VENDOR resolutions the cost doctrine
 * wants counted first (docs: cost-aware AI task routing — deterministic-first).
 *
 *   `vendor_run`       a provider really answered. Persisted, priced.
 *   `vendorless_route` really decided, no vendor engaged (runtime disabled,
 *                      deterministic tier, or a pre-dispatch block). Persisted,
 *                      NEVER priced — see `buildAiRunRow`.
 *   `synthetic`        the mock provider fabricated the output. NEVER persisted:
 *                      a synthetic row in a cost log is worse than a missing
 *                      one, because it produces a confident wrong number.
 */
export type AiRunDisposition = "vendor_run" | "vendorless_route" | "synthetic";

/** Pure disposition of a finished route. */
export function auditDispositionFor(state: AiRuntimeState): AiRunDisposition {
  if (state === "mock") return "synthetic";
  if (state === "live") return "vendor_run";
  return "vendorless_route";
}

export interface AiRunPersistExtras {
  readonly profileId?: string | null;
  /** Short label of the calling surface (e.g. the agent key). */
  readonly requestContext?: string | null;
  /**
   * What kind of event this is. Defaults to `vendor_run` so every existing
   * caller keeps its exact behaviour. A `vendorless_route` row carries NO
   * money (see below); `synthetic` never reaches this builder at all.
   */
  readonly disposition?: AiRunDisposition;
  /**
   * Deterministic idempotency key for THIS run — becomes the row's primary
   * key (`ai_runs.id`). The server wrapper generates exactly one per
   * `runAiAgent` invocation, so a retry layer re-attempting the persist can
   * only ever land ONE row for the run: a duplicate key resolves as
   * already-persisted, never as a second count (the LMC ledger's
   * idempotency-key rule, applied to this ledger). Absent → the DB default
   * `gen_random_uuid()` applies and the insert is NOT idempotent.
   */
  readonly runId?: string | null;
}

/** Row shape for public.ai_runs — kept in sync with the gated migration. */
export interface AiRunRow {
  /** Caller-supplied idempotency key (see AiRunPersistExtras.runId). */
  readonly id?: string;
  readonly task_type: string;
  readonly provider: string;
  readonly model_alias: string;
  readonly model_id: string | null;
  readonly prompt_version: string | null;
  readonly tier: string;
  readonly route_reason: string | null;
  readonly locale: string | null;
  readonly input_source: string | null;
  readonly data_categories_sent: string[];
  readonly output_excerpt: string | null;
  readonly schema_validation: string;
  readonly confidence: string | null;
  readonly estimated_cost_usd: number | null;
  readonly actual_cost_usd: number | null;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly latency_ms: number | null;
  readonly fallback_applied: boolean;
  readonly fallback_reason: string | null;
  readonly escalation_applied: boolean;
  readonly blocked_reason: string | null;
  readonly human_review_state: string | null;
  readonly profile_id: string | null;
  readonly request_context: string | null;
}

/** Pure record → row mapping (exported for tests). Bounds every free-text
 *  field to the migration's CHECK limits so an insert can never fail on size.
 *
 *  A `vendorless_route` row is also SUBJECT-FREE — see `profile_id` below.
 *
 *  COST HONESTY. A `vendorless_route` row reports NULL for both cost columns,
 *  never 0 and never the pre-run estimate. No vendor was engaged, so there is
 *  no money — and an estimate for a model that never ran would sum, at month
 *  end, into spend that never happened. The route's reasoning survives in
 *  `tier`, `route_reason` and `blocked_reason`; only the money is dropped. */
export function buildAiRunRow(
  record: AiRoutingAuditRecord,
  extras: AiRunPersistExtras = {},
): AiRunRow {
  const vendorless = (extras.disposition ?? "vendor_run") === "vendorless_route";
  return {
    ...(extras.runId ? { id: extras.runId } : {}),
    task_type: record.taskType.slice(0, 64),
    provider: record.providerAdapter.slice(0, 32),
    model_alias: (record.modelAlias ?? "none").slice(0, 32),
    model_id: record.modelId ? record.modelId.slice(0, 128) : null,
    prompt_version: record.promptVersion
      ? record.promptVersion.slice(0, 32)
      : null,
    tier: record.selectedTier.slice(0, 32),
    route_reason: record.reason ? record.reason.slice(0, 600) : null,
    locale: record.languageConsidered
      ? record.languageConsidered.slice(0, 16)
      : null,
    input_source: record.inputSource ? record.inputSource.slice(0, 120) : null,
    data_categories_sent: [...record.dataCategoriesSent],
    output_excerpt: record.outputExcerpt
      ? record.outputExcerpt.slice(0, AI_RUN_OUTPUT_EXCERPT_MAX)
      : null,
    schema_validation: record.schemaValidation,
    confidence: record.confidence ? record.confidence.slice(0, 16) : null,
    estimated_cost_usd: vendorless ? null : record.estimatedCostUsd,
    actual_cost_usd: vendorless ? null : record.actualCostUsd,
    input_tokens: record.usage?.inputTokens ?? null,
    output_tokens: record.usage?.outputTokens ?? null,
    latency_ms: record.latencyMs,
    fallback_applied: record.fallback,
    fallback_reason: record.fallbackReason
      ? record.fallbackReason.slice(0, 120)
      : null,
    escalation_applied: record.escalation,
    // Bounded like every other free-text column. `RouteBlockReason` is a
    // closed three-member union today, all far under the 64-char CHECK, so
    // this changes no current row — but the column is the one field the
    // docblock's "can never fail on size" promise did not actually cover, and
    // a persistence failure here is SILENT by design (best-effort write). A
    // future block reason with a longer name would have dropped the row.
    blocked_reason: record.blocked ? record.blocked.slice(0, 64) : null,
    human_review_state: record.humanReviewState,
    // DATA MINIMISATION. A vendorless row exists to be COUNTED, not to be
    // attributed: there is no spend to allocate to a person, so the person is
    // not recorded. `ai_runs` is already the subject of open retention/
    // de-linking work, and counting zero-vendor routes must not enlarge the
    // index of who asked what to buy an operational metric that never needed
    // a subject.
    profile_id: vendorless ? null : (extras.profileId ?? null),
    request_context: extras.requestContext
      ? extras.requestContext.slice(0, 120)
      : null,
  };
}

/** Minimal structural view of the admin client — the generated Database type
 *  does not know ai_runs until the gated migration is applied. */
interface MinimalAuditDb {
  from(table: "ai_runs"): {
    insert(values: Record<string, unknown>): PromiseLike<{
      error: { message?: string; code?: string } | null;
    }>;
    select(
      columns: string,
      options: { count: "exact"; head: true },
    ): {
      gte(column: string, value: string): {
        is(
          column: string,
          value: null,
        ): PromiseLike<{
          count: number | null;
          error: { message?: string } | null;
        }>;
      };
    };
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

async function adminDb(): Promise<MinimalAuditDb> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  return createAdminClient() as unknown as MinimalAuditDb;
}

/**
 * Best-effort append of one ai_runs row. NEVER throws; returns true when the
 * row was persisted, false otherwise (failure logged, run unaffected).
 */
export async function persistAiRunAudit(
  record: AiRoutingAuditRecord,
  extras: AiRunPersistExtras = {},
): Promise<boolean> {
  try {
    const db = await adminDb();
    const { error } = await db.from("ai_runs").insert(
      buildAiRunRow(record, extras) as unknown as Record<string, unknown>,
    );
    if (error) {
      // Unique violation on the deterministic run id = the row from THIS run
      // already landed (a retried persist). Idempotent success, not a
      // failure: the append-only ledger holds exactly one row for the run.
      if (extras.runId && error.code === "23505") return true;
      console.error("[ai/audit-store] persist failed", {
        message: (error.message ?? "unknown").slice(0, 200),
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("[ai/audit-store] persist failed", {
      message: boundedErrorMessage(err),
    });
    return false;
  }
}

/**
 * Persisted daily-run counter for the AI_DAILY_RUN_BUDGET guard: counts
 * today's (UTC) non-blocked ai_runs rows. Best-effort — returns null when the
 * count is unavailable (table not applied / query failed); the caller then
 * proceeds without the persisted guard and logs, never blocks on a broken
 * counter (honest degradation, no silent skip of real counts).
 */
export async function countAiRunsTodayBestEffort(): Promise<number | null> {
  try {
    const db = await adminDb();
    const startOfUtcDay = new Date();
    startOfUtcDay.setUTCHours(0, 0, 0, 0);
    const { count, error } = await db
      .from("ai_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfUtcDay.toISOString())
      .is("blocked_reason", null);
    if (error) {
      console.error("[ai/audit-store] daily-run count failed", {
        message: (error.message ?? "unknown").slice(0, 200),
      });
      return null;
    }
    return count ?? null;
  } catch (err) {
    console.error("[ai/audit-store] daily-run count failed", {
      message: boundedErrorMessage(err),
    });
    return null;
  }
}
