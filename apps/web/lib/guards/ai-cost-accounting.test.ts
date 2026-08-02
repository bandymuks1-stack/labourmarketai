import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildAiRunRow } from "@/lib/ai/runtime/audit-store";
import type { AiRoutingAuditRecord } from "@/lib/ai/runtime/task-routing";

/**
 * A computed AI cost must reach a row, or say out loud that it did not.
 *
 * W14 audit P0-2 classified this as "AI usage and cost are computed and thrown
 * away — DEAD". Re-verified against the tree rather than taken on faith, and
 * the mechanism is NOT what the finding describes:
 *
 *   - the cost IS computed from real usage (`run-agent.ts` → `computeActualCostUsd`);
 *   - it IS attributed — model id, model alias, tier, task type, tokens,
 *     latency, the calling agent (`request_context`) and an optional profile;
 *   - it IS mapped to a row (`buildAiRunRow`) and the insert IS attempted;
 *   - and the writer IS wired into the canonical entrypoint `runAiAgent`,
 *     which five real feature modules use.
 *
 * The chain is complete in code. What is missing is the TABLE: the `ai_runs`
 * migration (`20260714150000_ai_runs_audit_v1.sql`) is an explicit human gate
 * and is NOT applied to production. So in production the insert fails, and —
 * until this slice — failed invisibly, because `run-agent-server.ts` awaited
 * `persistAiRunAudit` and DISCARDED its boolean. A run whose cost was never
 * recorded was indistinguishable from one that was.
 *
 * That single silent-drop is the part fixable without a migration, and it is
 * what this guard pins, together with the cost chain itself so the mapping
 * cannot rot while the gate is closed.
 *
 * NOTHING HERE TOUCHES BILLING. `ai_runs` is an internal cost-attribution log:
 * no charge, no credit decrement, no plan limit, no user-visible amount.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const RUN_AGENT_SERVER = read("lib/ai/run-agent-server.ts");
const RUN_AGENT = read("lib/ai/run-agent.ts");
const AUDIT_STORE = read("lib/ai/runtime/audit-store.ts");

/** A live run with real usage — the shape the router produces on success. */
function liveRecord(over: Partial<AiRoutingAuditRecord> = {}): AiRoutingAuditRecord {
  return {
    taskType: "journal_suggestions",
    selectedTier: "low_cost",
    providerAdapter: "anthropic",
    modelAlias: "fast",
    modelId: "claude-haiku-4-5-20251001",
    promptVersion: "v3",
    reason: "tier matched",
    languageConsidered: "lt",
    inputSource: "journal_entry",
    dataCategoriesSent: ["entry_text"],
    outputExcerpt: null,
    schemaValidation: "valid",
    confidence: "high",
    estimatedCostUsd: 0.01,
    actualCostUsd: 0.0035,
    usage: { inputTokens: 1000, outputTokens: 500 },
    latencyMs: 820,
    fallback: false,
    fallbackReason: null,
    escalation: false,
    blocked: null,
    humanReviewState: null,
    ...over,
  } as AiRoutingAuditRecord;
}

describe("a computed cost survives the whole chain into the row", () => {
  it("cost, tokens and model all land on the row", () => {
    const row = buildAiRunRow(liveRecord(), {
      profileId: "11111111-1111-1111-1111-111111111111",
      requestContext: "journal_suggestions",
    });
    expect(row.actual_cost_usd).toBe(0.0035);
    expect(row.estimated_cost_usd).toBe(0.01);
    expect(row.input_tokens).toBe(1000);
    expect(row.output_tokens).toBe(500);
  });

  it("the row carries the attribution the cost is useless without", () => {
    // Per-feature, per-model and per-user cost attribution are the four KPIs
    // the audit says are otherwise uncomputable. Each needs a column here.
    const row = buildAiRunRow(liveRecord(), {
      profileId: "11111111-1111-1111-1111-111111111111",
      requestContext: "journal_suggestions",
    });
    expect(row.model_id).toBe("claude-haiku-4-5-20251001"); // per-model
    expect(row.model_alias).toBe("fast");
    expect(row.tier).toBe("low_cost");
    expect(row.task_type).toBe("journal_suggestions"); // per-feature
    expect(row.request_context).toBe("journal_suggestions"); // per-operation
    expect(row.profile_id).toBe("11111111-1111-1111-1111-111111111111"); // per-user
  });

  it("an unknown/mock cost stays null — never a fabricated figure", () => {
    const row = buildAiRunRow(
      liveRecord({ actualCostUsd: null, estimatedCostUsd: null, usage: null }),
    );
    expect(row.actual_cost_usd).toBeNull();
    expect(row.estimated_cost_usd).toBeNull();
    expect(row.input_tokens).toBeNull();
    expect(row.output_tokens).toBeNull();
  });

  it("the cost is derived from real usage, never invented at the call site", () => {
    // `computeActualCostUsd` runs only for a non-mock provider WITH usage.
    expect(RUN_AGENT).toContain("computeActualCostUsd");
    expect(RUN_AGENT).toMatch(/result\.provider\s*!==\s*"mock"/);
  });
});

describe("a failed persist is never reported as a success", () => {
  it("persistAiRunAudit reports the outcome instead of swallowing it", () => {
    expect(AUDIT_STORE).toMatch(/Promise<boolean>/);
    expect(AUDIT_STORE).toMatch(/return\s+false/);
    expect(AUDIT_STORE).toMatch(/return\s+true/);
  });

  it("the caller no longer DISCARDS that boolean (the W14 P0-2 silent drop)", () => {
    // The defect in one line: `await persistAiRunAudit(...)` with the result
    // thrown away. If this regresses, an unattributed run goes quiet again.
    expect(RUN_AGENT_SERVER).toMatch(/const\s+persisted\s*=\s*await\s+persistAiRunAudit/);
    expect(RUN_AGENT_SERVER).toMatch(/if\s*\(!persisted\)/);
  });

  it("the lost attribution is announced under a stable, greppable marker", () => {
    expect(RUN_AGENT_SERVER).toContain("[ai/cost]");
    expect(RUN_AGENT_SERVER).toMatch(/hadActualCost/);
  });

  it("the warning leaks no payload, profile or prompt", () => {
    const warnBlock =
      RUN_AGENT_SERVER.slice(RUN_AGENT_SERVER.indexOf("if (!persisted)")) ?? "";
    expect(warnBlock).not.toMatch(/profileId/);
    expect(warnBlock).not.toMatch(/\binput\b/);
    expect(warnBlock).not.toMatch(/outputExcerpt/);
  });

  it("a persistence failure still never breaks the run", () => {
    // The whole point of best-effort: cost accounting must not take a
    // user-facing feature down with it.
    expect(AUDIT_STORE).toMatch(/NEVER throws/);
    expect(RUN_AGENT_SERVER).toMatch(/never blocks the outcome/);
    // The outcome is returned regardless of what persistence did.
    expect(RUN_AGENT_SERVER).toMatch(/return outcome;/);
  });
});

describe("only real runs are persisted", () => {
  it("mock and disabled runs are never written to the audit trail", () => {
    // A synthetic row in a cost log is worse than a missing one: it produces a
    // confident wrong number at month end.
    expect(RUN_AGENT_SERVER).toMatch(/cfg\.state === "live"/);
  });
});

describe("cost accounting has no billing side effect", () => {
  it("the write path touches no payment, credit or plan machinery", () => {
    for (const src of [RUN_AGENT_SERVER, AUDIT_STORE]) {
      for (const banned of [
        "stripe",
        "Stripe",
        "checkout",
        "invoice",
        "credit",
        "subscription",
        "plan_limit",
        "spending",
        "charge",
      ]) {
        expect(src, `billing surface "${banned}" reached the AI cost path`).not.toContain(
          banned,
        );
      }
    }
  });

  it("the log is append-only at the writer — no update, no delete", () => {
    expect(AUDIT_STORE).toMatch(/\.insert\(/);
    expect(AUDIT_STORE).not.toMatch(/\.update\(/);
    expect(AUDIT_STORE).not.toMatch(/\.delete\(/);
  });
});

describe("the production gate is stated, not assumed", () => {
  it("the ai_runs migration exists and is still declared human-gated", () => {
    const ledger = readFileSync(join(WEB, "..", "..", "docs", "APPLIED_LEDGER.md"), "utf8");
    expect(ledger).toContain("20260714150000_ai_runs_audit_v1.sql");
    // If this stops saying HUMAN GATE, someone applied it — and this guard,
    // plus the warning it protects, should be revisited in that PR.
    expect(ledger).toMatch(/20260714150000[\s\S]{0,400}HUMAN GATE/);
  });

  it("the app degrades honestly while the table is absent", () => {
    // Counter unavailable → proceed and log, never a silent zero that would
    // make AI_DAILY_RUN_BUDGET look satisfied.
    expect(AUDIT_STORE).toMatch(/returns null when the\s*\*?\s*count is unavailable/);
  });
});
