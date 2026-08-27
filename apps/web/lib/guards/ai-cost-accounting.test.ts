import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { auditDispositionFor, buildAiRunRow } from "@/lib/ai/runtime/audit-store";
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
 * The chain is complete in code. What WAS missing is the TABLE — and it no
 * longer is: the owner approved the apply on 2026-08-03 and
 * `20260714150000_ai_runs_audit_v1.sql` is live in production (prod ledger
 * version `20260803061937`). Before that, the insert failed in production and —
 * until this slice — failed invisibly, because `run-agent-server.ts` awaited
 * `persistAiRunAudit` and DISCARDED its boolean. A run whose cost was never
 * recorded was indistinguishable from one that was. That silent drop is closed;
 * the table now exists, so a `[ai/cost]` warning is ACTIONABLE rather than the
 * expected steady state.
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
    modelId: "claude-haiku-4-5",
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
    expect(row.model_id).toBe("claude-haiku-4-5"); // per-model
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
  it("a MOCK run is never written to the audit trail", () => {
    // A synthetic row in a cost log is worse than a missing one: it produces a
    // confident wrong number at month end. Mock output is fabricated, so it is
    // the one disposition that must never reach a row.
    expect(auditDispositionFor("mock")).toBe("synthetic");
    expect(RUN_AGENT_SERVER).toMatch(/disposition !== "synthetic"/);
  });

  it("a VENDORLESS route is recorded rather than dropped", () => {
    // The defect this closes: persistence asked only "did a vendor answer?",
    // so on a stack with no provider configured NOTHING was ever recorded —
    // and an empty `ai_runs` read as "nobody wants AI" when it really meant
    // "we never wrote down that they did". A route decided without a vendor
    // still really happened.
    expect(auditDispositionFor("disabled")).toBe("vendorless_route");
    expect(auditDispositionFor("live")).toBe("vendor_run");
  });

  it("a vendorless row carries NO money — not a zero, not an estimate", () => {
    // No vendor was engaged, so there is nothing to pay. Keeping the pre-run
    // estimate would sum, at month end, into spend that never happened.
    const row = buildAiRunRow(liveRecord(), {
      requestContext: "journal_suggestions",
      disposition: "vendorless_route",
    });
    expect(row.actual_cost_usd).toBeNull();
    expect(row.estimated_cost_usd).toBeNull();
    // Everything that explains the ROUTE survives — only the money is dropped.
    expect(row.task_type).toBe("journal_suggestions");
    expect(row.tier).toBe("low_cost");
  });

  it("a vendorless row records no PERSON — it is counted, not attributed", () => {
    // No spend to allocate means no subject is needed. `ai_runs` is already
    // under retention/de-linking work; an operational counter must not enlarge
    // the index of who asked what.
    const row = buildAiRunRow(liveRecord(), {
      profileId: "11111111-1111-1111-1111-111111111111",
      requestContext: "journal_suggestions",
      disposition: "vendorless_route",
    });
    expect(row.profile_id).toBeNull();
    // …while a real vendor run still attributes its real money.
    expect(
      buildAiRunRow(liveRecord(), {
        profileId: "11111111-1111-1111-1111-111111111111",
        disposition: "vendor_run",
      }).profile_id,
    ).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("a vendor run still carries its real cost", () => {
    const row = buildAiRunRow(liveRecord(), { disposition: "vendor_run" });
    expect(row.actual_cost_usd).toBe(0.0035);
    expect(row.estimated_cost_usd).toBe(0.01);
  });

  it("the MONEY ledger stays vendor-only", () => {
    // `usage_cost_events` records spend and its own CHECKs forbid a fabricated
    // zero, so a vendorless route must not reach it.
    expect(RUN_AGENT_SERVER).toMatch(
      /if \(disposition === "vendor_run"\)[\s\S]{0,400}persistUsageCostEvent/,
    );
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
  /**
   * This block used to assert the ledger still said HUMAN GATE next to
   * `20260714150000` — "if this stops saying it, someone applied it, and this
   * guard should be revisited in that PR". Someone did: the owner approved the
   * apply on 2026-08-03 and it landed as prod ledger version `20260803061937`.
   *
   * So the rule MOVES rather than disappears. A closed gate needed one thing
   * pinned (that it was still closed). An OPEN one needs more, because the
   * table can now actually accumulate rows: the ledger must record the real
   * apply, and it must carry the two conditions the owner attached — those are
   * the only things standing between this table and indefinitely retained
   * model output about real people.
   */
  const ledger = readFileSync(join(WEB, "..", "..", "docs", "APPLIED_LEDGER.md"), "utf8");

  it("the ledger records the real production apply, not a plan to apply", () => {
    expect(ledger).toContain("20260714150000_ai_runs_audit_v1.sql");
    // The concrete prod ledger version — a date alone would let a future
    // "we applied it, trust me" edit pass.
    expect(ledger).toContain("20260803061937");
    expect(ledger).toMatch(/20260714150000_ai_runs_audit_v1[\s\S]{0,600}APPLIED TO PRODUCTION/);
  });

  it("the ledger still carries BOTH conditions the approval rode on", () => {
    // (1) the provider stays off until a separate decision, and (2) a 90-day
    // retention policy is a REQUIRED BLOCK before that decision. If either
    // sentence is ever quietly dropped, activation looks unconditional.
    expect(ledger).toMatch(/AI_PROVIDER_MODE[\s\S]{0,200}disabled/);
    expect(ledger).toMatch(/90[- ]day retention/i);
    expect(ledger).toMatch(/REQUIRED BLOCK/);
    expect(ledger).toMatch(/output_excerpt/);
  });

  it("the runtime default is still `disabled` — the doc is not the control", () => {
    // The ledger says the provider is off; this is the code that makes it so.
    // A ledger sentence with no enforcing default is a promise, not a gate.
    const env = read("lib/env.ts");
    expect(env).toMatch(
      /AI_PROVIDER_MODE:\s*z\.enum\(\["disabled",\s*"mock",\s*"live"\]\)\.default\("disabled"\)/,
    );
  });

  it("the app degrades honestly while the table is absent", () => {
    // Counter unavailable → proceed and log, never a silent zero that would
    // make AI_DAILY_RUN_BUDGET look satisfied.
    expect(AUDIT_STORE).toMatch(/returns null when the\s*\*?\s*count is unavailable/);
  });
});
