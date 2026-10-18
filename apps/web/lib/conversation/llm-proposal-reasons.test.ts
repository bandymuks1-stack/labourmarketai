import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE AI STATE IS NAMED, NOT COLLAPSED (owner program 2026-09-23, P1).
 *
 * Before this, every way the model half could fail — the assistant switched
 * off, no key, the allowance spent, a vendor timeout — came back as ONE
 * `ai_unavailable`, and the chat's default branch then answered all of them
 * with the generic "not understood" fallback. Here the runtime is mocked and
 * each outcome is driven through the REAL server action, so what is pinned is
 * the mapping the person ends up hearing.
 */

const runAiAgentMock = vi.fn();
vi.mock("@/lib/ai/run-agent-server", () => ({
  runAiAgent: (...args: unknown[]) => runAiAgentMock(...args),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } }, error: null }) },
  })),
}));
const limitedMock = vi.fn(() => ({ limited: false }));
vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: () => limitedMock(),
}));

import { proposeUnderstandingAction } from "./llm-proposal";
import {
  aiStateMessageKey,
  unsupportedReasonForAiOutcome,
  type UnsupportedReason,
} from "./utterance-understanding";

const ASK = { sentence: "Pervadink šią agentūrą", locale: "lt", identity: "company" as const };

beforeEach(() => {
  runAiAgentMock.mockReset();
  limitedMock.mockReset();
  limitedMock.mockReturnValue({ limited: false });
});

describe("the runtime outcome → the reason the person hears", () => {
  it("DISABLED (mode off, missing key, no provider) → ai_not_configured", async () => {
    for (const reason of ["mode_disabled", "missing_api_key", "unknown_provider", "missing_base_url"]) {
      runAiAgentMock.mockResolvedValueOnce({ status: "disabled", reason });
      expect(await proposeUnderstandingAction(ASK), reason).toEqual({
        kind: "unsupported",
        reason: "ai_not_configured",
        source: "model",
      });
    }
  });

  it("the ALLOWANCE (cost ceiling / daily run budget) → allowance_exhausted", async () => {
    runAiAgentMock.mockResolvedValueOnce({ status: "needs_review", reason: "budget_exceeded" });
    expect(await proposeUnderstandingAction(ASK)).toMatchObject({ reason: "allowance_exhausted" });
  });

  it("a vendor or runtime fault → ai_temporarily_unavailable — never 'not understood'", async () => {
    for (const reason of ["timeout", "provider_error", "malformed_output", "truncated", "schema_rejected"]) {
      runAiAgentMock.mockResolvedValueOnce({ status: "needs_review", reason });
      expect(await proposeUnderstandingAction(ASK), reason).toMatchObject({
        reason: "ai_temporarily_unavailable",
      });
    }
    runAiAgentMock.mockRejectedValueOnce(new Error("boom"));
    expect(await proposeUnderstandingAction(ASK)).toMatchObject({ reason: "ai_temporarily_unavailable" });
  });

  it("the per-person limiter keeps its own reason, and never spends a vendor call", async () => {
    limitedMock.mockReturnValue({ limited: true });
    expect(await proposeUnderstandingAction(ASK)).toMatchObject({ reason: "rate_limited" });
    expect(runAiAgentMock).not.toHaveBeenCalled();
  });

  it("NEGATIVE CONTROL — a real answer that is not actionable stays `not_understood`", async () => {
    runAiAgentMock.mockResolvedValueOnce({
      status: "suggestion",
      value: { confidence: "high", data: { kind: "unsupported" } },
    });
    expect(await proposeUnderstandingAction(ASK)).toMatchObject({ reason: "not_understood" });
    runAiAgentMock.mockResolvedValueOnce({
      status: "suggestion",
      value: { confidence: "high", data: { kind: "action", intent: "not-an-intent" } },
    });
    expect(await proposeUnderstandingAction(ASK)).toMatchObject({ reason: "not_understood" });
  });

  it("the model may now pick the rename id — it is in the registry the answer is re-validated against", async () => {
    runAiAgentMock.mockResolvedValueOnce({
      status: "suggestion",
      value: { confidence: "medium", data: { kind: "action", intent: "rename-organization" } },
    });
    expect(await proposeUnderstandingAction(ASK)).toEqual({
      kind: "intent",
      intent: "rename-organization",
      score: 0,
      source: "model",
    });
  });
});

describe("the pure mapping and the line the chat says", () => {
  it("unknown runtime shapes are OUR fault, never the sentence's", () => {
    expect(unsupportedReasonForAiOutcome({ status: "something_new" })).toBe("ai_temporarily_unavailable");
    expect(unsupportedReasonForAiOutcome({ status: "needs_review", reason: "no_api_key" })).toBe(
      "ai_not_configured",
    );
  });

  it("each AI state has its own distinct line; sentence reasons get the ordinary clarifying question", () => {
    const states: UnsupportedReason[] = [
      "ai_not_configured",
      "allowance_exhausted",
      "ai_temporarily_unavailable",
      "rate_limited",
    ];
    const keys = states.map(aiStateMessageKey);
    expect(keys.every((k) => k !== null)).toBe(true);
    expect(new Set(keys).size).toBe(states.length);
    for (const r of ["not_understood", "empty", "unauthenticated"] as const) {
      expect(aiStateMessageKey(r), r).toBeNull();
    }
  });

  it("every AI-state line exists, non-empty and distinct from the generic fallback, in all six active locales", () => {
    const root = join(__dirname, "..", "..", "messages");
    for (const locale of ["lt", "en", "ru", "nl", "de", "pl"]) {
      const chat = JSON.parse(readFileSync(join(root, `${locale}.json`), "utf8")).conversation.chat as Record<
        string,
        string
      >;
      for (const r of ["ai_not_configured", "allowance_exhausted", "ai_temporarily_unavailable", "rate_limited"] as const) {
        const key = aiStateMessageKey(r)!;
        expect(typeof chat[key], `${locale}:${key}`).toBe("string");
        expect(chat[key].trim().length, `${locale}:${key}`).toBeGreaterThan(20);
        expect(chat[key], `${locale}:${key} must not be the fallback`).not.toBe(chat.fallback);
        expect(chat[key], `${locale}:${key} must not be the not-understood line`).not.toBe(chat.notUnderstood);
      }
    }
  });
});
