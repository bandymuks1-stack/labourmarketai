/**
 * Worker-side agent evals (PR5) — Work Journal + Skill Evidence through the mock
 * pipeline; real outputs validate, unsafe outputs rejected. No env/key/network.
 */
import { describe, it, expect } from "vitest";
import { runAgentEval } from "./harness";
import { workJournalEvals, skillEvidenceEvals } from "./worker-agents.fixtures";
import { workJournalEntry } from "../registry/agents/work-journal";
import { skillEvidenceEntry } from "../registry/agents/skill-evidence";

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

describe("Skill Evidence evals", () => {
  it.each(skillEvidenceEvals.map((c) => [c.name, c] as const))("%s", async (_n, c) => {
    const out = await runAgentEval(skillEvidenceEntry, c);
    expect(out.status).toBe(c.expect.status);
    if (out.status === "suggestion") {
      const v = out.value as {
        data: { skills: { suggested_evidence_level: string }[] };
      };
      // structural guarantee: no confirmed level can ever appear.
      for (const s of v.data.skills) {
        expect(s.suggested_evidence_level).not.toBe("manager_or_client_confirmed");
      }
    }
  });
});
