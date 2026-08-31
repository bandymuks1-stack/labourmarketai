/**
 * Cost-ledger idempotency — both AI ledgers can never double-count one run.
 *
 * Debt recorded 2026-08-30: `usage_cost_events` got a fresh `randomUUID()`
 * per persist call and `ai_runs` was a bare insert under a DB-defaulted PK —
 * no idempotency key on either ledger, "safe" only because nothing retried.
 * Any retry layer (an HTTP retry wrapper, a queue redelivery, a hand-written
 * try-again) would have appended a SECOND row for the SAME run: double-counted
 * spend in the money ledger. The LMC ledger already carried idempotency keys;
 * these two did not.
 *
 * The fix, proven here against a scripted fake of the service-role client:
 *   1. `run-agent-server.ts` generates ONE deterministic `runId` per run and
 *      hands it to BOTH writers as the row PK (`ai_runs.id`,
 *      `usage_cost_events.event_id`);
 *   2. a unique violation (23505) on that supplied key resolves as
 *      already-persisted (`true`), never as a failure and never as a second
 *      row;
 *   3. WITHOUT a supplied key the stores keep their legacy non-idempotent
 *      behaviour and a 23505 stays an honest failure — the swallow is scoped
 *      to the deterministic-key path only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { persistAiRunAudit } from "@/lib/ai/runtime/audit-store";
import { persistUsageCostEvent } from "@/lib/usage/usage-cost-store";
import type { AiRoutingAuditRecord } from "@/lib/ai/runtime/task-routing";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeef";

const DUPLICATE_KEY = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "pkey"',
};

function liveRecord(): AiRoutingAuditRecord {
  return {
    taskType: "journal_suggestions",
    selectedTier: "low_cost",
    providerAdapter: "anthropic",
    modelAlias: "haiku",
    modelId: "claude-haiku-4-5",
    promptVersion: "v3",
    reason: "tier matched",
    languageConsidered: "lt",
    inputSource: "journal_entry",
    dataCategoriesSent: ["entry_text"],
    outputExcerpt: null,
    schemaValidation: "passed",
    confidence: "high",
    estimatedCostUsd: 0.01,
    actualCostUsd: 0.0035,
    usage: { inputTokens: 1000, outputTokens: 500 },
    latencyMs: 820,
    fallback: false,
    fallbackReason: null,
    escalation: false,
    blocked: null,
    humanReviewState: "not_required",
    preferredProvider: null,
  } as unknown as AiRoutingAuditRecord;
}

/** Scripted fake: records every inserted row, answers with the scripted
 *  error (or none). Only `.from(...).insert(...)` — all either store uses. */
function installFakeAdmin(
  error: { code?: string; message?: string } | null,
): Array<{ table: string; row: Record<string, unknown> }> {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  vi.mocked(createAdminClient).mockReturnValue({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve({ error });
      },
    }),
  } as unknown as ReturnType<typeof createAdminClient>);
  return inserts;
}

beforeEach(() => {
  vi.mocked(createAdminClient).mockReset();
});

describe("deterministic key reaches the row as its primary key", () => {
  it("ai_runs insert carries id = runId; usage_cost_events carries event_id = eventId", async () => {
    const inserts = installFakeAdmin(null);
    await persistAiRunAudit(liveRecord(), { runId: RUN_ID });
    await persistUsageCostEvent(liveRecord(), { eventId: RUN_ID });
    expect(inserts).toHaveLength(2);
    expect(inserts[0].table).toBe("ai_runs");
    expect(inserts[0].row.id).toBe(RUN_ID);
    expect(inserts[1].table).toBe("usage_cost_events");
    expect(inserts[1].row.event_id).toBe(RUN_ID);
  });
});

describe("a retried persist is an idempotent replay, never a double count", () => {
  it("ai_runs: 23505 under a supplied runId resolves true (already persisted)", async () => {
    installFakeAdmin(DUPLICATE_KEY);
    await expect(
      persistAiRunAudit(liveRecord(), { runId: RUN_ID }),
    ).resolves.toBe(true);
  });

  it("usage_cost_events: 23505 under a supplied eventId resolves true", async () => {
    installFakeAdmin(DUPLICATE_KEY);
    await expect(
      persistUsageCostEvent(liveRecord(), { eventId: RUN_ID }),
    ).resolves.toBe(true);
  });

  it("WITHOUT a supplied key a 23505 stays an honest failure (no scoped swallow leak)", async () => {
    installFakeAdmin(DUPLICATE_KEY);
    await expect(persistAiRunAudit(liveRecord())).resolves.toBe(false);
    await expect(persistUsageCostEvent(liveRecord())).resolves.toBe(false);
  });

  it("any OTHER insert error still resolves false — the swallow is 23505-only", async () => {
    installFakeAdmin({ code: "23514", message: "check violation" });
    await expect(
      persistAiRunAudit(liveRecord(), { runId: RUN_ID }),
    ).resolves.toBe(false);
    await expect(
      persistUsageCostEvent(liveRecord(), { eventId: RUN_ID }),
    ).resolves.toBe(false);
  });
});

describe("the server wrapper wires ONE shared runId into BOTH ledgers", () => {
  const source = readFileSync(
    join(__dirname, "..", "ai", "run-agent-server.ts"),
    "utf8",
  );

  it("generates a single deterministic id per run", () => {
    expect(source).toContain("const runId = randomUUID()");
  });

  it("hands it to the audit writer and the cost writer as their keys", () => {
    expect(source).toContain("runId,");
    expect(source).toContain("eventId: runId");
  });
});
