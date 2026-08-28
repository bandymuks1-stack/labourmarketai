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
 *      content; the SERVER wrapper persists it best-effort into ai_runs via
 *      runtime/audit-store.ts — persistence only ever happens server-side).
 *
 * `runAiAgentCore` is pure-ish (takes a resolved config) so the whole pipeline
 * is unit/eval-tested via the mock provider with no env, key, or network. The
 * server wrapper `runAiAgent` resolves env config + the prompt entry.
 */
import { z } from "zod";
import {
  dispatchAiCompletion,
  type ChainDispatchContext,
} from "./runtime/run-core";
import type { AiProviderState } from "./runtime/provider-chain";
import { providerKindFor, type AiRuntimeConfig, type AiDisabledReason } from "./runtime/config-core";
import type { AiCompletionRequest, AiCompletionResult, AiLocale, AiErrorCode } from "./runtime/types";
import type { PromptRegistryEntry, AiAgentKey } from "./registry/types";
import {
  computeActualCostUsd,
  estimateTokensFromText,
} from "./runtime/model-pricing";
import {
  AI_RUN_OUTPUT_EXCERPT_MAX,
  TASK_POLICIES,
  assessRunBudget,
  buildRoutingAuditRecord,
  modelIdForAlias,
  resolveTaskRoute,
  taskTypeForAgent,
  type AiModelProvider,
  type AiRoutingAuditRecord,
  type AiRoutingRunOutcome,
  type AiTaskRouteContext,
  type AiCostProvider,
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

/**
 * Injectable dispatcher seam (tests exercise timeout/fallback without a
 * network).
 *
 * The third parameter is OPTIONAL so every existing two-argument override stays
 * assignable — a function that ignores an argument is assignable to a type that
 * declares it, so no test had to change to accommodate the chain.
 */
export type AiDispatcher = (
  request: AiCompletionRequest,
  cfg: AiRuntimeConfig,
  chain?: ChainDispatchContext,
) => Promise<AiCompletionResult>;

export interface RunAgentOptions {
  readonly locale: AiLocale;
  readonly maxOutputTokens?: number;
  /** Deterministic mock output for tests/dev (ignored by the live provider). */
  readonly mock?: unknown;
  /** Routing context (attempt / previous failure / cost estimate). Default: first attempt. */
  readonly route?: AiTaskRouteContext;
  /**
   * Today's run count for the daily-run-budget guard. The server wrapper
   * (run-agent-server.ts) supplies it from the persisted ai_runs counter on
   * live runs; when the count is unavailable the budget stays
   * caller-supplied-only — nothing fakes a counter.
   */
  readonly runsToday?: number;
  /** Language of the run — a routing dimension (activates languageRouting). */
  readonly language?: string;
  /** Input-source LABEL for the audit trail (e.g. "cv_upload") — never content. */
  readonly inputSource?: string;
  /** Profile the run relates to — used ONLY by the server wrapper for the
   *  ai_runs audit row (the core never reads it). */
  readonly profileId?: string;
  /**
   * Observed readiness of every chain provider (runtime/provider-health.ts).
   *
   * PRESENT → run-core walks the free-first provider chain. ABSENT → it keeps
   * the legacy single-provider behaviour exactly. The server wrapper supplies
   * it from real configuration; leaving it out is how every existing caller and
   * test stays on the path it was written for.
   */
  readonly providerStates?: readonly AiProviderState[];
  /** Test seam: replaces the real run-core dispatcher. */
  readonly dispatchOverride?: AiDispatcher;
}

/**
 * Latency enforcement: race one dispatch against the policy's maxLatencyMs.
 * On timeout the pending call is abandoned (the adapters additionally honor a
 * clamped cfg.timeoutMs via their own AbortController/SDK timeout) and an
 * honest timeout error result is returned so the fallback path can run.
 */
export async function withLatencyTimeout(
  pending: Promise<AiCompletionResult>,
  maxLatencyMs: number,
): Promise<AiCompletionResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AiCompletionResult>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        status: "error",
        code: "timeout",
        message: `policy latency ceiling ${maxLatencyMs}ms exceeded`,
      });
    }, maxLatencyMs);
  });
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Field NAMES sent to the model — categories only, never values (audit). */
/** Serialise for SIZING only. Never throws — a circular or exotic value must
 *  degrade the estimate, never the run. */
function safeJsonForSizing(input: unknown): string {
  try {
    return JSON.stringify(input) ?? "";
  } catch {
    return String(input);
  }
}

function dataCategoriesOf(input: unknown): readonly string[] {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? Object.keys(input as Record<string, unknown>)
    : [];
}

/**
 * JSON-Schema projection of the entry's strict zod OUTPUT schema, so the
 * providers' structured-output hint carries the actual contract instead of a
 * generic "return a JSON object". Before this, `AiCompletionRequest.jsonSchema`
 * existed but nothing ever set it — every adapter's schema plumbing was dead.
 *
 * Best-effort BY DESIGN: a schema zod cannot project (transforms, custom
 * checks) degrades to `undefined` — the downstream zod validation in step 4
 * remains the enforcement either way. Cached per entry object; the registry
 * entries are module constants so the cache is effectively per agent.
 */
const jsonSchemaCache = new WeakMap<object, Record<string, unknown> | null>();
function jsonSchemaForEntry(
  entry: PromptRegistryEntry,
): Record<string, unknown> | undefined {
  const cached = jsonSchemaCache.get(entry);
  if (cached !== undefined) return cached ?? undefined;
  let projected: Record<string, unknown> | null = null;
  try {
    projected = z.toJSONSchema(entry.outputSchema, {
      io: "output",
      unrepresentable: "any",
    }) as Record<string, unknown>;
  } catch {
    projected = null;
  }
  jsonSchemaCache.set(entry, projected);
  return projected ?? undefined;
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
  /* Pre-run size, so the policy's cost ceiling is actually enforceable.
   *
   * The ceiling was unreachable before this: `estimatedCostUsd` was only ever
   * read from `opts.route` and no call site set it, so every
   * `maxEstimatedCostUsd` in TASK_POLICIES was decorative. We supply SIZE, not
   * cost — the router prices it against the tier it actually resolves, because
   * pricing needs the model and this layer must not know the model.
   *
   * Both halves of what goes on the wire are counted: the system prompt and
   * the validated input. An explicit `opts.route.estimatedCostUsd` still wins.
   */
  const expectedInputTokens =
    estimateTokensFromText(entry.system) +
    estimateTokensFromText(safeJsonForSizing(parsedInput.data));
  // The provider that will actually serve the run — the router prices its
  // CONCRETE model, never the tier alias (an alias resolves to Anthropic's
  // table and would quote the wrong vendor's rates). mock/disabled runs stay
  // on anthropic so tests remain deterministic.
  const costProvider: AiCostProvider =
    cfg.state === "live" ? cfg.provider : "anthropic";
  const routeCtx: AiTaskRouteContext = {
    attempt: 1,
    expectedInputTokens,
    provider: costProvider,
    // What the run is PERMITTED to emit, not merely what we expect — a
    // provider allowed more output can spend past a ceiling priced for less.
    maxOutputTokens: opts.maxOutputTokens ?? cfg.maxOutputTokens,
    ...opts.route,
    language: opts.route?.language ?? opts.language,
  };
  const decision = resolveTaskRoute(taskType, routeCtx);
  const policy = TASK_POLICIES[taskType];
  const dataCategoriesSent = dataCategoriesOf(parsedInput.data);
  const auditBase: Omit<
    AiRoutingRunOutcome,
    | "providerAdapter"
    | "schemaValidation"
    | "confidence"
    | "latencyMs"
    | "usage"
    | "actualCostUsd"
    | "modelId"
    | "outputExcerpt"
    | "fallbackReason"
  > = {
    humanReviewState: policy.humanReview ? "pending" : "not_required",
    dataCategoriesSent,
    // The estimate the router actually enforced. Reading it back off the
    // decision keeps the audit truthful on the automatic-sizing path, where
    // routeCtx carries only token size and no cost.
    estimatedCostUsd: decision.estimatedCostUsd ?? routeCtx.estimatedCostUsd ?? null,
    promptVersion: entry.version,
    inputSource: opts.inputSource ?? null,
  };
  const skippedAudit = (decision2: TaskRouteDecision): AiRoutingAuditRecord =>
    buildRoutingAuditRecord(decision2, {
      ...auditBase,
      providerAdapter: "none",
      schemaValidation: "skipped",
      confidence: null,
      latencyMs: null,
      usage: null,
      actualCostUsd: null,
      modelId: null,
      outputExcerpt: null,
      fallbackReason: null,
    });

  if (decision.blocked === "cost_unpriced") {
    // The model has no owner-reviewed price, so the ceiling cannot be
    // evaluated. Honest block rather than unbounded spend — fixed by adding a
    // reviewed price in runtime/model-pricing.ts, never by dropping the limit.
    return {
      status: "needs_review",
      reason: "budget_exceeded",
      detail: decision.reason,
      routing: skippedAudit(decision),
    };
  }

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

  // The routed alias resolves to the PRIMARY provider's candidate model id
  // (anthropic for mock/disabled so tests stay deterministic).
  // The local runtime has NO candidate table — it hosts exactly the model the
  // operator pulled, and `providers/local.ts` uses `cfg.localModel`. So the
  // alias resolves against anthropic's table purely to keep `request.model`
  // populated for the cloud candidates further down the chain; the local
  // adapter ignores it by design.
  const modelProvider: AiModelProvider =
    cfg.state === "live" && cfg.provider !== "local" ? cfg.provider : "anthropic";
  const requestForDecision = (d: TaskRouteDecision): AiCompletionRequest => ({
    agentKey: entry.agent,
    promptVersion: entry.version,
    system: entry.system,
    input: parsedInput.data,
    jsonSchema: jsonSchemaForEntry(entry),
    locale: opts.locale,
    maxOutputTokens: opts.maxOutputTokens,
    model: d.modelAlias ? modelIdForAlias(d.modelAlias, modelProvider) : undefined,
    modelAlias: d.modelAlias ?? undefined,
    preferredProvider: d.preferredProvider ?? undefined,
    mock: opts.mock,
  });
  const request = requestForDecision(decision);

  // Latency enforcement: the adapters honor a clamped timeout (their own
  // AbortController / SDK timeout) AND the dispatch is raced against the
  // policy ceiling, so a hung provider can never exceed policy.maxLatencyMs.
  const dispatcher: AiDispatcher = opts.dispatchOverride ?? dispatchAiCompletion;
  const guardedCfg: AiRuntimeConfig = {
    ...cfg,
    timeoutMs: Math.min(cfg.timeoutMs, policy.maxLatencyMs),
  };

  // Chain context — supplied only when the caller observed provider states.
  // Without it run-core keeps its legacy single-provider behaviour.
  const chainFor = (d: TaskRouteDecision): ChainDispatchContext | undefined =>
    opts.providerStates
      ? { decision: d, states: opts.providerStates }
      : undefined;

  let effectiveDecision = decision;
  let fallbackReason: string | null = null;
  const startedAt = Date.now();
  let result = await withLatencyTimeout(
    dispatcher(request, guardedCfg, chainFor(decision)),
    policy.maxLatencyMs,
  );

  // Timeout → ONE fallback-tier retry with an honest, visible reason.
  if (
    result.status === "error" &&
    result.code === "timeout" &&
    !decision.fallbackApplied
  ) {
    const fbDecision = resolveTaskRoute(taskType, {
      ...routeCtx,
      attempt: routeCtx.attempt + 1,
      previousProviderFailure: true,
    });
    if (!fbDecision.blocked && fbDecision.tier !== "deterministic") {
      effectiveDecision = fbDecision;
      fallbackReason = "latency_timeout";
      result = await withLatencyTimeout(
        dispatcher(
          requestForDecision(fbDecision),
          guardedCfg,
          chainFor(fbDecision),
        ),
        policy.maxLatencyMs,
      );
    }
  }
  const latencyMs = Date.now() - startedAt;

  const audit = (
    schemaValidation: AiRoutingRunOutcome["schemaValidation"],
    confidence: string | null,
    outputExcerpt: string | null = null,
  ): AiRoutingAuditRecord =>
    buildRoutingAuditRecord(effectiveDecision, {
      ...auditBase,
      // Which adapter ACTUALLY handled it. On the chain path a failure can come
      // from a candidate several places down the list, and `result.provider`
      // carries that — falling back to `cfg.provider` would have recorded the
      // primary provider as the one that failed when it never ran.
      providerAdapter:
        result.status === "ok"
          ? result.provider
          : (result.provider ?? providerKindFor(cfg)),
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
      // Real cost from real usage only — mock runs and unknown models stay
      // null (see runtime/model-pricing.ts; never a fabricated figure).
      actualCostUsd:
        result.status === "ok" && result.provider !== "mock" && result.usage
          ? computeActualCostUsd(
              result.model,
              result.usage.inputTokens ?? null,
              result.usage.outputTokens ?? null,
            )
          : null,
      modelId: result.status === "ok" ? result.model : (request.model ?? null),
      outputExcerpt,
      fallbackReason,
      // ADAPTER-level failures only. `result.message` on an `error` is built by
      // the adapter and is structural by construction ("gemini http 404",
      // "anthropic http 401", a timeout) — it never carries payload. A
      // schema-rejection detail is NOT routed here: that one echoes model
      // output, and an audit record never carries content.
      providerFailure:
        result.status === "error"
          ? `${result.code}: ${result.message ?? "no detail"}`
          : result.status === "disabled"
            ? `provider disabled: ${result.reason}`
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

  // Bounded excerpt of the schema-VALIDATED output (the accepted subset) —
  // doctrine §7.1: the response is logged; input content never is.
  let outputExcerpt: string | null = null;
  try {
    outputExcerpt = JSON.stringify(parsedOutput.data).slice(
      0,
      AI_RUN_OUTPUT_EXCERPT_MAX,
    );
  } catch {
    outputExcerpt = null;
  }

  return {
    status: "suggestion",
    agent: entry.agent,
    provider: result.provider,
    model: result.model,
    value: parsedOutput.data as T,
    routing: audit("passed", envelopeConfidence, outputExcerpt),
  };
}
