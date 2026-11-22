/**
 * Worker-side agent evals (PR5) — Work Journal through the mock pipeline; real
 * outputs validate, unsafe outputs rejected. No env/key/network.
 *
 * Skill Evidence evals were removed with the agent (retired 2026-10-25, owner
 * decision on registry row 10.11 — see docs/ai/INTERNAL_LLM_AGENTS_V1.md §4.1).
 */
import { describe, it, expect } from "vitest";
import { runAgentEval } from "./harness";
import { workJournalEvals } from "./worker-agents.fixtures";
import { workJournalEntry } from "../registry/agents/work-journal";

describe("Work Journal evals", () => {
  it.each(workJournalEvals.map((c) => [c.name, c] as const))("%s", async (_n, c) => {
    const out = await runAgentEval(workJournalEntry, c);
    expect(out.status).toBe(c.expect.status);
    if (out.status === "suggestion") {
      const v = out.value as { agent: string; suggestion: boolean };
      expect(v.suggestion).toBe(true);
      expect(v.agent).toBe("work_journal");
    }
  });
});
