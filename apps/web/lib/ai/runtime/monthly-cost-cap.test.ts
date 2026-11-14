/**
 * Monthly euro cap on AI vendor runs — pure helpers, ledger read, and core
 * enforcement (mock mode, no network, no DB).
 */

import { describe, it, expect, vi } from "vitest";
import {
  assessMonthlyCostCap,
  readMonthAiSpendEurBestEffort,
  resolveMonthlyCostCapEur,
  utcMonthWindow,
  type MonthSpendDb,
} from "./monthly-cost-cap";
import { resolveAiRuntimeConfig } from "./config-core";
import { runAiAgentCore } from "../run-agent";
import { matchingExplanationEntry } from "../registry/agents/matching-explanation";
import { buildUsageCostEventRow } from "@/lib/usage/usage-cost-store";

const MOCK = resolveAiRuntimeConfig({
  mode: "mock", provider: undefined, apiKey: undefined, model: undefined,
  timeoutMs: undefined, maxRetries: undefined, maxOutputTokens: undefined,
  dailyRunBudget: 10,
});

const input = {
  workerSkills: ["tiling", "bathroom finishing"],
  companyNeed: "Two tilers for a six-week bathroom renovation in Vilnius.",
};

const validMock = {
  suggestion: true,
  agent: "matching_explanation",
  confidence: "medium",
  evidence_refs: [{ source: "worker_skills", ref: "monthly-cap-test" }],
  missing_information: [],
  needs_human_review: true,
  blocked_claims: [],
  data: {
    fit_summary: "Skills align with the need.",
    strong_matches: ["tiling trade"],
    gaps: [],
    blockers: [],
    suggested_next_action: "Review documents.",
    explanation_company: "Good fit on paper.",
    explanation_worker: "You match this need.",
  },
};

type Row = { cost: Record<string, unknown> | null; status?: string };

/** Fake ledger: records the filters and serves `pages` in order, applying the
 *  `neq` filter like PostgREST would (so a dropped filter fails the tests). */
function fakeDb(
  pages: Array<Row[] | { error: string }>,
  calls: Array<Record<string, unknown>> = [],
): MonthSpendDb {
  let i = 0;
  return {
    from(table) {
      const call: Record<string, unknown> = { table };
      calls.push(call);
      return {
        select(cols) {
          call.select = cols;
          return {
            eq(col, v) {
              call[`eq:${col}`] = v;
              return {
                neq(colN, vN) {
                  call[`neq:${colN}`] = vN;
                  return {
                    gte(col2, v2) {
                      call[`gte:${col2}`] = v2;
                      return {
                        lt(col3, v3) {
                          call[`lt:${col3}`] = v3;
                          return {
                            order(col4) {
                              call.order = col4;
                              return {
                                range(from, to) {
                                  call.range = [from, to];
                                  const page = pages[i++] ?? [];
                                  if (!Array.isArray(page)) {
                                    return Promise.resolve({
                                      data: null,
                                      error: { message: page.error },
                                    });
                                  }
                                  const kept = page.filter(
                                    (r) => (r as Record<string, unknown>)[colN] !== vN,
                                  );
                                  return Promise.resolve({ data: kept, error: null });
                                },
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("AI_MONTHLY_COST_CAP_EUR parsing — unset/empty/invalid = OFF", () => {
  it("returns null (OFF) for unset, empty, garbage and negative values", () => {
    expect(resolveMonthlyCostCapEur(undefined)).toBeNull();
    expect(resolveMonthlyCostCapEur("")).toBeNull();
    expect(resolveMonthlyCostCapEur("   ")).toBeNull();
    expect(resolveMonthlyCostCapEur("twenty")).toBeNull();
    expect(resolveMonthlyCostCapEur("-5")).toBeNull();
    expect(resolveMonthlyCostCapEur("Infinity")).toBeNull();
  });

  it("parses euros, including decimals and an explicit 0", () => {
    expect(resolveMonthlyCostCapEur("20")).toBe(20);
    expect(resolveMonthlyCostCapEur(" 7.50 ")).toBe(7.5);
    expect(resolveMonthlyCostCapEur("0")).toBe(0);
  });

  it("reads process.env by default", () => {
    vi.stubEnv("AI_MONTHLY_COST_CAP_EUR", "");
    expect(resolveMonthlyCostCapEur()).toBeNull();
    vi.stubEnv("AI_MONTHLY_COST_CAP_EUR", "12");
    expect(resolveMonthlyCostCapEur()).toBe(12);
    vi.unstubAllEnvs();
  });
});

describe("assessMonthlyCostCap", () => {
  it("OFF cap never refuses, even with an unreadable spend", () => {
    expect(assessMonthlyCostCap(1_000_000, null)).toBe("ok");
    expect(assessMonthlyCostCap(null, null)).toBe("ok");
  });
  it("under cap runs; at or over cap refuses", () => {
    expect(assessMonthlyCostCap(19.99, 20)).toBe("ok");
    expect(assessMonthlyCostCap(20, 20)).toBe("budget_exceeded");
    expect(assessMonthlyCostCap(25, 20)).toBe("budget_exceeded");
    expect(assessMonthlyCostCap(0, 0)).toBe("budget_exceeded");
  });
  it("unreadable spend with a cap set refuses (fail-closed)", () => {
    expect(assessMonthlyCostCap(null, 20)).toBe("budget_exceeded");
  });
});

describe("month boundary (UTC calendar month)", () => {
  it("last instant of October belongs to October", () => {
    expect(utcMonthWindow(new Date("2026-10-31T23:59:59.999Z"))).toEqual({
      startIso: "2026-10-01T00:00:00.000Z",
      endIso: "2026-11-01T00:00:00.000Z",
    });
  });
  it("first instant of November starts a fresh window", () => {
    expect(utcMonthWindow(new Date("2026-11-01T00:00:00.000Z"))).toEqual({
      startIso: "2026-11-01T00:00:00.000Z",
      endIso: "2026-12-01T00:00:00.000Z",
    });
  });
  it("December rolls into January of the next year", () => {
    expect(utcMonthWindow(new Date("2026-12-15T12:00:00Z")).endIso).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
  it("the ledger read is bounded to the month containing `now`", async () => {
    const calls: Array<Record<string, unknown>> = [];
    await readMonthAiSpendEurBestEffort(fakeDb([[]], calls), new Date("2026-11-01T00:00:00Z"));
    expect(calls[0]).toMatchObject({
      table: "usage_cost_events",
      select: "cost",
      "eq:event_type": "usage",
      "neq:status": "rejected",
      "gte:occurred_at": "2026-11-01T00:00:00.000Z",
      "lt:occurred_at": "2026-12-01T00:00:00.000Z",
    });
  });
});

describe("readMonthAiSpendEurBestEffort — usage_cost_events sum", () => {
  it("sums actualCents, falls back to estimatedCents, ignores uncosted rows", async () => {
    const spend = await readMonthAiSpendEurBestEffort(
      fakeDb([
        [
          { cost: { actualCents: 150, estimatedCents: 999 } },
          { cost: { estimatedCents: 50 } },
          { cost: {} },
          { cost: null },
        ],
      ]),
    );
    expect(spend).toBeCloseTo(2, 10);
  });

  it("a cost-ceiling refusal row (rejected, estimate kept) never counts as spend", async () => {
    // A REAL pre-dispatch refusal, mapped by the real ledger writer.
    const refused = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock,
      route: { attempt: 1, estimatedCostUsd: 100 },
    });
    expect(refused.routing?.blocked).toBe("cost_ceiling");
    const row = buildUsageCostEventRow(refused.routing!);
    expect(row.status).toBe("rejected");
    // The writer keeps the pre-run estimate — exactly why the read must filter.
    expect(row.cost.estimatedCents).toBeGreaterThan(0);

    const calls: Array<Record<string, unknown>> = [];
    const spend = await readMonthAiSpendEurBestEffort(
      fakeDb(
        [[
          { status: row.status, cost: row.cost },
          { status: "success", cost: { actualCents: 120 } },
          { status: "error", cost: { estimatedCents: 30 } },
        ]],
        calls,
      ),
    );
    expect(calls[0]?.["neq:status"]).toBe("rejected");
    expect(spend).toBeCloseTo(1.5, 10);
    // …so a month of nothing but refusals leaves a cap of €1 untouched.
    const onlyRefusals = await readMonthAiSpendEurBestEffort(
      fakeDb([[{ status: row.status, cost: row.cost }]]),
    );
    expect(assessMonthlyCostCap(onlyRefusals, 1)).toBe("ok");
  });

  it("pages until a short page", async () => {
    const full = Array.from({ length: 1000 }, () => ({ cost: { actualCents: 1 } }));
    const calls: Array<Record<string, unknown>> = [];
    const spend = await readMonthAiSpendEurBestEffort(
      fakeDb([full, [{ cost: { actualCents: 100 } }]], calls),
    );
    expect(spend).toBeCloseTo(11, 10);
    expect(calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999]]);
  });

  it("an error or a throw reads as null (unreadable)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await readMonthAiSpendEurBestEffort(fakeDb([{ error: "boom" }]))).toBeNull();
    const throwing = {
      from() {
        throw new Error("no client");
      },
    } as unknown as MonthSpendDb;
    expect(await readMonthAiSpendEurBestEffort(throwing)).toBeNull();
    warn.mockRestore();
  });
});

describe("core enforcement (runAiAgentCore, mock mode)", () => {
  it("cap unset = OFF: the run proceeds exactly as before", async () => {
    const absent = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock,
    });
    expect(absent.status).toBe("suggestion");
    const off = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock, monthlyCostCapEur: null, monthAiSpendEur: null,
    });
    expect(off.status).toBe("suggestion");
  });

  it("under cap = run", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock, monthlyCostCapEur: 20, monthAiSpendEur: 3.2,
    });
    expect(out.status).toBe("suggestion");
  });

  it("at / over cap = honest budget_exceeded, provider never runs", async () => {
    for (const spend of [20, 42]) {
      const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
        locale: "en", mock: validMock, monthlyCostCapEur: 20, monthAiSpendEur: spend,
      });
      expect(out.status).toBe("needs_review");
      if (out.status === "needs_review") {
        expect(out.reason).toBe("budget_exceeded");
        expect(out.detail).toContain("monthly AI cost cap reached");
        expect(out.routing?.providerAdapter).toBe("none");
      }
    }
  });

  it("read failure with a cap set = refuse (fail-closed)", async () => {
    const out = await runAiAgentCore(matchingExplanationEntry, input, MOCK, {
      locale: "en", mock: validMock, monthlyCostCapEur: 20, monthAiSpendEur: null,
    });
    expect(out.status).toBe("needs_review");
    if (out.status === "needs_review") {
      expect(out.reason).toBe("budget_exceeded");
      expect(out.detail).toContain("fail-closed");
      expect(out.routing?.providerAdapter).toBe("none");
    }
  });
});
