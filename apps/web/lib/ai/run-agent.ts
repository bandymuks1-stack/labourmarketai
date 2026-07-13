/**
 * Agent runner (Internal LLM Agents v1, PR3 · task routing P8–P9).
 *
 * The single path every internal agent runs through. It:
 *   1. validates the structured INPUT against the registry entry's schema;
 *   2. resolves the TASK ROUTE for the agent's task type (cost-aware tier →
 *      model alias — the call sites never choose a model) and blocks honestly
 *      on a cost ceiling / missing human gate / exceeded daily run budget;
 *   3. dispatches one completion (disabled / mock / live) with the routed
 *      per-request model override;
 *   4. validates the RAW model output against the entry's STRICT envelope schema
 *      — raw output is NEVER returned unvalidated (ai-output-schema-required);
 *   5. returns a typed outcome: suggestion | disabled | needs_review — each
 *      carrying the routing AUDIT record (field NAMES only, never input
 *      content; persistence of the record is an owner-gated follow-up).
 *
 * `runAiAgentCore` is pure-ish (takes a resolved config) so the whole pipeline
 * is unit/eval-tested via the mock provider with no env, key, or network. The
 * server wrapper `runAiAgent` resolves env config + the prompt entry.
 */
import { dispatchAiCompletion } from "./runtime/run-core";
import { providerKindFor, type AiRuntimeConfig, type AiDisabledReason } from "./runtime/config-core";
import type { AiCompletionRequest, AiLocale, AiErrorCode } from "./runtime/types";
import type { PromptRegistryEntry, AiAgentKey } from "./registry/types";
import {
  TASK_POLICIES,
  assessRunBudget,
  buildRoutingAuditRecord,
  modelIdForAlias,
  resolveTaskRoute,
  taskTypeForAgent,
  type AiRoutingAuditRecord,
  type AiRoutingRunOutcome,
  type AiTaskRouteContext,
  type TaskRouteDecision,
} from "./runtime/task-routing";

export type AiAgentReviewReason =
  | "invalid_input"
  | "schema_rejected"
  | "route_blocked"
  | AiErrorCode;

export type AiAgentOutcome<T = unknown> =
  | {
      readonly status: "suggestion";
      readonly agent: AiAgentKey;
      readonly provider: string;
      readonly model: string;
      readonly value: T;
      /** Routing audit record (names/categories only — never input content). */
      readonly routing?: AiRoutingAuditRecord;
    }
  | {
      readonly status: "disabled";
      readonly reason: AiDisabledReason;
      readonly routing?: AiRoutingAuditRecord;
    }
  | {
      readonly status: "needs_review";
      readonly reason: AiAgentReviewReason;
      readonly detail?: string;
      readonly routing?: AiRoutingAuditRecord;
    };

export interface RunAgentOptions {
  readonly locale: AiLocale;
  readonly maxOutputTokens?: number;
  /** Deterministic mock output for tests/dev (ignored by the live provider). */
  readonly mock?: unknown;
  /** Routing context (attempt / previous failure / cost estimate). Default: first attempt. */
  readonly route?: AiTaskRouteContext;
  /**
   * Today's run count for the daily-run-budget guard. HONEST GAP: no run
   * counter store exists yet (owner-gated follow-up) — the budget is enforced
   * only when a caller supplies a real count; nothing fakes one.
   */
  readonly runsToday?: number;
}

/** Field NAMES sent to the model — categories only, never values (audit). */
function dataCategoriesOf(input: unknown): readonly string[] {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? Object.keys(input as Record<string, unknown>)
    : [];
}

export async function runAiAgentCore<T = unknown>(
  entry: PromptRegistryEntry,
  input: unknown,
  cfg: AiRuntimeConfig,
  opts: RunAgentOptions,
): Promise<AiAgentOutcome<T>> {
  // 1. Validate input — a bad input never reaches the model.
  const parsedInput = entry.inputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { status: "needs_review", reason: "invalid_input", detail: parsedInput.error.message };
  }

  // 2. Resolve the task route — call sites never pick a model/provider.
  const taskType = taskTypeForAgent(entry.agent);
  const routeCtx: AiTaskRouteContext = opts.route ?? { attempt: 1 };
  const decision = resolveTaskRoute(taskType, routeCtx);
  const policy = TASK_POLICIES[taskType];
  const dataCategoriesSent = dataCategoriesOf(parsedInput.data);
  const auditBase: Omit<
    AiRoutingRunOutcome,
    "providerAdapter" | "schemaValidation" | "confidence" | "latencyMs" | "usage"
  > = {
    actualCostUsd: null, // honest: no pricing table is wired
    humanReviewState: policy.humanReview ? "pending" : "not_required",
    dataCategoriesSent,
    estimatedCostUsd: routeCtx.estimatedCostUsd ?? null,
  };
  const skippedAudit = (decision2: TaskRouteDecision): AiRoutingAuditRecord =>
    buildRoutingAuditRecord(decision2, {
      ...auditBase,
      providerAdapter: "none",
      schemaValidation: "skipped",
      confidence: null,
      latencyMs: null,
      usage: null,
    });

  if (decision.blocked === "cost_ceiling") {
    return {
      status: "needs_review",
      reason: "budget_exceeded",
      detail: decision.reason,
      routing: skippedAudit(decision),
    };
  }
  if (decision.blocked === "needs_human_confirmation") {
    return {
      status: "needs_review",
      reason: "route_blocked",
      detail: decision.reason,
      routing: skippedAudit(decision),
    };
  }
  if (
    opts.runsToday !== undefined &&
    assessRunBudget(opts.runsToday, cfg) === "budget_exceeded"
  ) {
    return {
      status: "needs_review",
      reason: "budget_exceeded",
      detail: `daily run budget reached (${opts.runsToday}/${cfg.dailyRunBudget})`,
      routing: skippedAudit(decision),
    };
  }

  const request: AiCompletionRequest = {
    agentKey: entry.agent,
    promptVersion: entry.version,
    system: entry.system,
    input: parsedInput.data,
    locale: opts.locale,
    maxOutputTokens: opts.maxOutputTokens,
    model: decision.modelAlias ? modelIdForAlias(decision.modelAlias) : undefined,
    mock: opts.mock,
  };

  const startedAt = Date.now();
  const result = await dispatchAiCompletion(request, cfg);
  const latencyMs = Date.now() - startedAt;

  const audit = (
    schemaValidation: AiRoutingRunOutcome["schemaValidation"],
    confidence: string | null,
  ): AiRoutingAuditRecord =>
    buildRoutingAuditRecord(decision, {
      ...auditBase,
      providerAdapter:
        result.status === "ok" ? result.provider : providerKindFor(cfg),
      schemaValidation,
      confidence,
      latencyMs,
      usage:
        result.status === "ok" && result.usage
          ? {
              inputTokens: result.usage.inputTokens ?? null,
              outputTokens: result.usage.outputTokens ?? null,
            }
          : null,
    });

  if (result.status === "disabled") {
    return { status: "disabled", reason: result.reason, routing: audit("skipped", null) };
  }
  if (result.status === "error") {
    return {
      status: "needs_review",
      reason: result.code,
      detail: result.message,
      routing: audit("skipped", null),
    };
  }

  // 4. Validate RAW output against the STRICT envelope — discard if off-shape.
  const parsedOutput = entry.outputSchema.safeParse(result.raw);
  if (!parsedOutput.success) {
    return {
      status: "needs_review",
      reason: "schema_rejected",
      detail: parsedOutput.error.message,
      routing: audit("failed", null),
    };
  }

  const envelopeConfidence =
    parsedOutput.data !== null &&
    typeof parsedOutput.data === "object" &&
    typeof (parsedOutput.data as { confidence?: unknown }).confidence === "string"
      ? ((parsedOutput.data as { confidence: string }).confidence)
      : null;

  return {
    status: "suggestion",
    agent: entry.agent,
    provider: result.provider,
    model: result.model,
    value: parsedOutput.data as T,
    routing: audit("passed", envelopeConfidence),
  };
}
