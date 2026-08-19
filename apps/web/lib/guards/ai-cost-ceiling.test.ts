import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AI_TASK_TYPES,
  TASK_POLICIES,
  resolveTaskRoute,
  type AiTaskType,
} from "@/lib/ai/runtime/task-routing";
import {
  estimateCostUsd,
  estimateTokensFromText,
} from "@/lib/ai/runtime/model-pricing";

/**
 * AI COST CEILING ENFORCEMENT (owner binding requirement 2026-08-19:
 * "Cost-aware routing yra privalomas").
 *
 * THE DEFECT THIS PINS. Every task policy declared a `maxEstimatedCostUsd`,
 * and the router checked it as:
 *
 *     ctx.estimatedCostUsd !== undefined && ctx.estimatedCostUsd > ceiling
 *
 * `estimatedCostUsd` was only ever read from the caller's `opts.route`. NO
 * production call site set it, and `model-pricing.ts` exported no pre-run
 * estimator at all — only post-run actual-cost helpers. So the ceiling could
 * not fire for ANY provider, Anthropic included: every declared budget was
 * decorative. The pre-existing `ai-cost-accounting` guard did not catch it
 * because it tests ACTUAL cost accounting after a run, never the ceiling.
 *
 * A second defect sat in the same check: it priced `policy.preferredTier`, but
 * escalation happened AFTER it, so a run could be cleared at the cheap tier
 * and then execute one tier up — past the budget it had just cleared.
 *
 * These tests fail if either regression returns.
 */
describe("every task policy can actually be costed before it runs", () => {
  it("declares an output-token budget — a ceiling with no expected size is uncheckable", () => {
    for (const task of AI_TASK_TYPES) {
      const p = TASK_POLICIES[task];
      expect(typeof p.expectedOutputTokens, task).toBe("number");
      expect(p.expectedOutputTokens, task).toBeGreaterThanOrEqual(0);
      // A task that spends money must expect to produce something.
      if (p.maxEstimatedCostUsd > 0) {
        expect(p.expectedOutputTokens, task).toBeGreaterThan(0);
      }
    }
  });

  it("the token estimate never under-counts — an under-estimate defeats the budget", () => {
    expect(estimateTokensFromText("")).toBe(0);
    // max(chars/4, utf8Bytes/3), rounded UP. For ASCII the byte term wins, so
    // plain text is costed ~1.33x above the familiar chars/4 ratio — the safe
    // direction, and deliberate: a budget can absorb over-counting, never
    // under-counting.
    expect(estimateTokensFromText("abcd")).toBe(2);
    expect(estimateTokensFromText("abcdef")).toBe(2);
    // Any non-empty text costs at least one token.
    expect(estimateTokensFromText("a")).toBe(1);
    // Never below the plain chars/4 reading, for any input.
    for (const sample of ["hello world", "фф", "🙂🙂", "日本語テキスト"]) {
      expect(
        estimateTokensFromText(sample),
        sample,
      ).toBeGreaterThanOrEqual(Math.ceil(sample.length / 4));
    }
  });

  it("an unpriced model yields null rather than a guessed price", () => {
    expect(estimateCostUsd("gpt-5", 1000, 1000)).toBeNull();
    expect(estimateCostUsd("claude-opus-4-8", 1_000_000, 0)).toBe(5);
  });
});

/** A task with a real ceiling, used as the subject below. */
const COSTED_TASK: AiTaskType = "extract_cv";

describe("the ceiling actually fires", () => {
  it("blocks a run whose derived estimate exceeds the ceiling", () => {
    const policy = TASK_POLICIES[COSTED_TASK];
    // Enough input to blow any per-run ceiling in the table.
    const d = resolveTaskRoute(COSTED_TASK, {
      attempt: 1,
      expectedInputTokens: 500_000_000,
    });
    expect(d.blocked).toBe("cost_ceiling");
    expect(d.preferredProvider).toBeNull();
    expect(d.reason).toContain("exceeds");
    expect(d.reason).toContain(policy.maxEstimatedCostUsd.toFixed(4));
  });

  it("lets an ordinary run through — the ceiling is a limit, not a wall", () => {
    const d = resolveTaskRoute(COSTED_TASK, {
      attempt: 1,
      expectedInputTokens: 2_000,
    });
    expect(d.blocked).toBeUndefined();
  });

  it("SIZE alone is enough — no call site has to know the model to be budgeted", () => {
    // The whole point: callers pass tokens, the router prices them. A route
    // resolved with only `expectedInputTokens` must still be cost-governed.
    const d = resolveTaskRoute(COSTED_TASK, {
      attempt: 1,
      expectedInputTokens: 500_000_000,
    });
    expect(d.blocked).toBe("cost_ceiling");
  });
});

describe("escalation cannot outrun the budget", () => {
  it("prices the tier that will ACTUALLY run, not the preferred one", () => {
    const policy = TASK_POLICIES[COSTED_TASK];
    // Sized to sit UNDER the ceiling on the preferred tier and OVER it one
    // tier up. If the check ran before escalation (the old position), the
    // escalated route would come back unblocked.
    // Fine geometric sweep: the window where the preferred tier is under the
    // ceiling and the escalated tier is over it is only ~1.8x wide (the
    // sonnet→opus price ratio), so a coarse step can jump clean over it and
    // report a false pass.
    let sawEscalatedBlock = false;
    for (let tokens = 1_000; tokens <= 40_000_000; tokens = Math.ceil(tokens * 1.05)) {
      const plain = resolveTaskRoute(COSTED_TASK, {
        attempt: 1,
        expectedInputTokens: tokens,
      });
      const escalated = resolveTaskRoute(COSTED_TASK, {
        attempt: 2,
        expectedInputTokens: tokens,
        previousFailure: policy.escalationConditions[0],
      });
      if (plain.blocked === undefined && escalated.blocked === "cost_ceiling") {
        sawEscalatedBlock = true;
        break;
      }
    }
    expect(
      sawEscalatedBlock,
      "no input size made escalation cross the ceiling while the preferred tier stayed under it — the check is not pricing the resolved tier",
    ).toBe(true);
  });
});

describe("an uncheckable ceiling blocks instead of spending", () => {
  it("a model with no owner-reviewed price is refused, not guessed at", () => {
    // Proven at the pricing layer: the non-anthropic candidates the adapters
    // can reach carry no reviewed price, so their cost cannot be bounded.
    for (const id of ["gpt-5", "gpt-5-mini", "gpt-5-nano"]) {
      expect(estimateCostUsd(id, 1000, 1000), id).toBeNull();
    }
  });

  it("an unpriced PROVIDER actually reaches the block — not just the price table", () => {
    // The regression this pins: pricing the tier ALIAS instead of the concrete
    // provider model. Aliases live in Anthropic's price table, so an alias
    // always resolves — `cost_unpriced` could never fire for the very
    // providers it exists to stop, and a GPT run got quoted Anthropic rates.
    for (const provider of ["openai", "gemini", "xai"] as const) {
      const d = resolveTaskRoute(COSTED_TASK, {
        attempt: 1,
        expectedInputTokens: 2_000,
        provider,
      });
      expect(d.blocked, provider).toBe("cost_unpriced");
      expect(d.reason, provider).toContain(provider);
    }
  });

  it("a self-hosted local run is free, never blocked on someone else's price", () => {
    const d = resolveTaskRoute(COSTED_TASK, {
      attempt: 1,
      expectedInputTokens: 5_000_000,
      provider: "local",
    });
    expect(d.blocked).toBeUndefined();
    expect(d.estimatedCostUsd).toBe(0);
  });

  it("deepl is unpriceable by tokens — it bills per character", () => {
    const d = resolveTaskRoute(COSTED_TASK, {
      attempt: 1,
      expectedInputTokens: 2_000,
      provider: "deepl",
    });
    expect(d.blocked).toBe("cost_unpriced");
  });

  it("`cost_unpriced` is a distinct outcome from `cost_ceiling`", () => {
    // Two different operator fixes: add a price vs. shrink the request. They
    // must never collapse into one reason string.
    const src = readFileSync(
      join(__dirname, "..", "ai", "runtime", "task-routing.ts"),
      "utf8",
    );
    expect(src).toContain('blocked: "cost_unpriced"');
    expect(src).toContain('blocked: "cost_ceiling"');
    expect(src).toContain("no owner-reviewed price");
  });
});

describe("the estimate bounds what the run may actually emit", () => {
  it("prices the permitted output, not merely the expected output", () => {
    const policy = TASK_POLICIES[COSTED_TASK];
    const generous = policy.expectedOutputTokens * 50;
    const modest = resolveTaskRoute(COSTED_TASK, {
      attempt: 1,
      expectedInputTokens: 1_000,
      provider: "anthropic",
    });
    const permissive = resolveTaskRoute(COSTED_TASK, {
      attempt: 1,
      expectedInputTokens: 1_000,
      provider: "anthropic",
      maxOutputTokens: generous,
    });
    // A run allowed far more output must be priced higher, or a provider can
    // legitimately generate its way past a ceiling priced for less.
    expect(permissive.estimatedCostUsd).toBeGreaterThan(
      modest.estimatedCostUsd ?? 0,
    );
  });

  it("a token-dense script is not under-counted", () => {
    // chars/4 alone under-counts Cyrillic, CJK and emoji — and an under-count
    // is the one error a budget cannot absorb.
    const ascii = "aaaaaaaaaaaaaaaa"; // 16 chars, 16 bytes
    const cyrillic = "фффффффффффффффф".slice(0, 16); // 16 chars, 32 bytes
    const emoji = "🙂".repeat(8); // 16 UTF-16 units, 32 bytes
    expect(estimateTokensFromText(cyrillic)).toBeGreaterThan(
      estimateTokensFromText(ascii),
    );
    expect(estimateTokensFromText(emoji)).toBeGreaterThan(
      estimateTokensFromText(ascii),
    );
  });
});

describe("the enforced estimate reaches the audit trail", () => {
  it("the decision carries the number the ceiling was judged on", () => {
    const d = resolveTaskRoute(COSTED_TASK, {
      attempt: 1,
      expectedInputTokens: 10_000,
      provider: "anthropic",
    });
    expect(d.estimatedCostUsd).toBeTypeOf("number");
    expect(d.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("run-agent records the DECISION's estimate, not the empty context one", () => {
    // Regression: auditBase read routeCtx.estimatedCostUsd, which is undefined
    // on the automatic-sizing path, so ai_runs stored null for every run the
    // router had just costed and enforced.
    const src = readFileSync(
      join(__dirname, "..", "ai", "run-agent.ts"),
      "utf8",
    );
    expect(src).toContain("decision.estimatedCostUsd");
  });
});

describe("the run path supplies the size automatically", () => {
  it("run-agent derives expectedInputTokens — not left to call sites", () => {
    const src = readFileSync(
      join(__dirname, "..", "ai", "run-agent.ts"),
      "utf8",
    );
    expect(src).toContain("expectedInputTokens");
    expect(src).toContain("estimateTokensFromText");
    // The provider must reach the router, or it prices the wrong vendor.
    expect(src).toContain("provider: costProvider");
    expect(src).toContain("maxOutputTokens:");
    // Both halves that go on the wire are counted.
    expect(src).toContain("entry.system");
  });

  it("a blocked-on-cost run is surfaced, never silently downgraded", () => {
    const src = readFileSync(
      join(__dirname, "..", "ai", "run-agent.ts"),
      "utf8",
    );
    expect(src).toContain('decision.blocked === "cost_unpriced"');
    expect(src).toContain('decision.blocked === "cost_ceiling"');
  });
});
