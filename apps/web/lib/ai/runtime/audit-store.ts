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

export interface AiRunPersistExtras {
  readonly profileId?: string | null;
  /** Short label of the calling surface (e.g. the agent key). */
  readonly requestContext?: string | null;
}

/** Row shape for public.ai_runs — kept in sync with the gated migration. */
export interface AiRunRow {
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
 *  field to the migration's CHECK limits so an insert can never fail on size. */
export function buildAiRunRow(
  record: AiRoutingAuditRecord,
  extras: AiRunPersistExtras = {},
): AiRunRow {
  return {
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
    estimated_cost_usd: record.estimatedCostUsd,
    actual_cost_usd: record.actualCostUsd,
    input_tokens: record.usage?.inputTokens ?? null,
    output_tokens: record.usage?.outputTokens ?? null,
    latency_ms: record.latencyMs,
    fallback_applied: record.fallback,
    fallback_reason: record.fallbackReason
      ? record.fallbackReason.slice(0, 120)
      : null,
    escalation_applied: record.escalation,
    blocked_reason: record.blocked,
    human_review_state: record.humanReviewState,
    profile_id: extras.profileId ?? null,
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
      error: { message?: string } | null;
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
