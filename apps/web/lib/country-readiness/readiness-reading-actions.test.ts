import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Registry row 10.11 (owner decision 2026-10-25) — the `country_readiness`
 * call site, driven through the REAL server action with the runtime mocked.
 *
 * What is pinned is what the reader ends up seeing for every runtime outcome,
 * above all the one production has today: AI_PROVIDER_MODE disabled → the
 * runtime answers `disabled` → the surface says "AI is switched off" (its own
 * reason, not a generic error), and the matrix above it is untouched.
 */

const runAiAgentMock = vi.fn();
vi.mock("@/lib/ai/run-agent-server", () => ({
  runAiAgent: (...args: unknown[]) => runAiAgentMock(...args),
}));
const getUserMock = vi.fn(async () => ({ data: { user: { id: "u-1" } }, error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: () => getUserMock() } })),
}));
const limitedMock = vi.fn(() => ({ limited: false }));
vi.mock("@/lib/security/rate-limit", () => ({
  rateLimit: () => limitedMock(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => `t:${key}`),
}));

import { explainCountryReadiness } from "./readiness-reading-actions";
import { buildCountryReadingPayload } from "./readiness-reading";

function validEnvelope() {
  const p = buildCountryReadingPayload("NL", "worker_posted", (k) => `t:explanation.${k}`)!;
  const refs = p.sourceRecords.map((r) => r.ref);
  return {
    suggestion: true,
    agent: "country_readiness",
    confidence: "medium",
    evidence_refs: refs.map((ref) => ({ source: "country_readiness_matrix", ref })),
    missing_information: [],
    needs_human_review: true,
    blocked_claims: [],
    data: {
      summary: "Posted to the Netherlands: the A1 comes first.",
      steps: refs.map((ref) => ({ ref, step: `do ${ref}` })),
      needs_legal_review: false,
      limitations: ["Not legal advice."],
    },
  };
}

beforeEach(() => {
  runAiAgentMock.mockReset();
  limitedMock.mockReset();
  limitedMock.mockReturnValue({ limited: false });
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
});

describe("the runtime outcome → what the reader sees", () => {
  it("AI OFF (production today): `disabled` is its own honest reason, never a generic error", async () => {
    for (const reason of ["mode_disabled", "missing_api_key", "unknown_provider"]) {
      runAiAgentMock.mockResolvedValueOnce({ status: "disabled", reason });
      expect(await explainCountryReadiness("NL", "worker_posted", "lt"), reason).toEqual({
        status: "off",
        reason: "ai_off",
      });
    }
  });

  it("the runtime answered but nothing usable came back → ai_unavailable", async () => {
    for (const reason of ["route_blocked", "schema_rejected", "budget_exceeded", "provider_error"]) {
      runAiAgentMock.mockResolvedValueOnce({ status: "needs_review", reason });
      expect(await explainCountryReadiness("NL", "worker_posted", "en"), reason).toEqual({
        status: "off",
        reason: "ai_unavailable",
      });
    }
    runAiAgentMock.mockRejectedValueOnce(new Error("socket hang up"));
    expect(await explainCountryReadiness("NL", "worker_posted", "en")).toEqual({
      status: "off",
      reason: "ai_unavailable",
    });
  });

  it("a cited requirement the matrix does not hold → unsourced, nothing shown", async () => {
    const env = validEnvelope();
    env.data.steps.push({ ref: "invented_permit", step: "made up" });
    runAiAgentMock.mockResolvedValueOnce({
      status: "suggestion",
      agent: "country_readiness",
      provider: "local",
      model: "m",
      value: env,
    });
    expect(await explainCountryReadiness("NL", "worker_posted", "en")).toEqual({
      status: "off",
      reason: "unsourced",
    });
  });

  it("a fully cited suggestion is returned with its author named", async () => {
    runAiAgentMock.mockResolvedValueOnce({
      status: "suggestion",
      agent: "country_readiness",
      provider: "local",
      model: "qwen",
      value: validEnvelope(),
    });
    const out = await explainCountryReadiness("NL", "worker_posted", "en");
    expect(out.status).toBe("ok");
    if (out.status !== "ok") return;
    expect(out.provider).toBe("local");
    expect(out.model).toBe("qwen");
    expect(out.reading.steps.length).toBeGreaterThan(0);
    // The matrix flags national detail for NL; the reading carries it.
    expect(out.reading.needsLegalCheck).toBe(true);
  });
});

describe("what leaves, and who may ask", () => {
  it("sends matrix rows only, under the agent key, with NO profile id and a label for a source", async () => {
    runAiAgentMock.mockResolvedValueOnce({ status: "disabled", reason: "mode_disabled" });
    await explainCountryReadiness("nl", "worker_posted", "lt");
    expect(runAiAgentMock).toHaveBeenCalledTimes(1);
    const [agent, input, opts] = runAiAgentMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(agent).toBe("country_readiness");
    expect(Object.keys(input).sort()).toEqual(["country", "scope", "sourceRecords"]);
    expect(input.country).toBe("NL");
    expect(opts.locale).toBe("lt");
    expect(opts.inputSource).toBe("country_readiness_matrix");
    expect("profileId" in opts).toBe(false);
    // The user id never travels in the payload.
    expect(JSON.stringify(input)).not.toContain("u-1");
  });

  it("an anonymous caller is refused before the runtime is touched", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null } as never);
    expect(await explainCountryReadiness("NL", "worker_posted", "en")).toEqual({
      status: "off",
      reason: "not_authenticated",
    });
    expect(runAiAgentMock).not.toHaveBeenCalled();
  });

  it("the per-user throttle refuses before the runtime is touched", async () => {
    limitedMock.mockReturnValueOnce({ limited: true });
    expect(await explainCountryReadiness("NL", "worker_posted", "en")).toEqual({
      status: "off",
      reason: "rate_limited",
    });
    expect(runAiAgentMock).not.toHaveBeenCalled();
  });

  it("an unresearched country or an unknown scope is no_research — never a guess", async () => {
    expect(await explainCountryReadiness("US", "worker_solo", "en")).toEqual({
      status: "off",
      reason: "no_research",
    });
    expect(await explainCountryReadiness("NL", "anything_else", "en")).toEqual({
      status: "off",
      reason: "no_research",
    });
    expect(runAiAgentMock).not.toHaveBeenCalled();
  });
});
