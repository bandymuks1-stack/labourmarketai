/**
 * Agent evals — runs every fixture through the mock pipeline and asserts the
 * outcome (real outputs validate; unsafe outputs are rejected by the strict
 * schema). No env, key, or network.
 */
import { describe, it, expect } from "vitest";
import { runAgentEval } from "./harness";
import { workerProfileEvals, countryReadinessEvals } from "./fixtures";
import { workerProfileEntry } from "../registry/agents/worker-profile";
import { countryReadinessEntry } from "../registry/agents/country-readiness";

describe("Worker Profile evals", () => {
  it.each(workerProfileEvals.map((c) => [c.name, c] as const))(
    "%s",
    async (_name, c) => {
      const out = await runAgentEval(workerProfileEntry, c);
      expect(out.status).toBe(c.expect.status);
      if (c.expect.status === "needs_review" && out.status === "needs_review" && c.expect.reason) {
        expect(out.reason).toBe(c.expect.reason);
      }
      if (out.status === "suggestion") {
        // a real suggestion is always tagged + grounded, never raw prose.
        const v = out.value as { suggestion: boolean; agent: string };
        expect(v.suggestion).toBe(true);
        expect(v.agent).toBe("worker_profile");
      }
    },
  );
});

describe("Country Readiness evals", () => {
  it.each(countryReadinessEvals.map((c) => [c.name, c] as const))(
    "%s",
    async (_name, c) => {
      const out = await runAgentEval(countryReadinessEntry, c);
      expect(out.status).toBe(c.expect.status);
      if (out.status === "suggestion") {
        const v = out.value as { evidence_refs: unknown[] };
        // sourced answer invariant: never zero evidence refs.
        expect(v.evidence_refs.length).toBeGreaterThan(0);
      }
    },
  );
});
