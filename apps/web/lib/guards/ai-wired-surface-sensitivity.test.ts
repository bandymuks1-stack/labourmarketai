/**
 * The sensitivity facts the Gemini activation gate rests on.
 *
 * `docs/human-gates/gemini-provider-activation-gate.md` tells the owner that a
 * grant capped at `LOW_RISK_PROJECT_DATA` unlocks a first real provider run and
 * NO user-visible feature, because both of the product's AI call sites carry
 * `PERSONAL` data. A gate document is only as good as the facts under it, and
 * those facts live in two tables that a later edit could move without anyone
 * re-reading the gate.
 *
 * So this pins the CLASSIFICATION, not the caller graph. A test that greps for
 * call sites would be the kind of guard this repo has been burned by — it
 * certifies its own artefact and goes green on a rename. What matters here is
 * narrower and checkable: the two agent keys the product actually invokes must
 * keep describing a person, and the classes below `PERSONAL` must stay the ones
 * the gate names.
 *
 * If this goes red, the gate document is out of date. Re-read it before
 * shipping the change that made it red — particularly if the change moved a
 * task DOWN a class, which is the one edit that would quietly walk a person's
 * data past an egress ceiling that was granted on the strength of this file.
 */
import { describe, expect, it } from "vitest";

import {
  AGENT_TASK_TYPES,
  taskTypeForAgent,
} from "@/lib/ai/runtime/task-routing";
import {
  TASK_SENSITIVITY,
  carriesPersonalData,
  sensitivityForTask,
} from "@/lib/ai/runtime/data-sensitivity";
import { MAX_GRANTABLE_FOR_FREE_TIER } from "@/lib/ai/runtime/data-egress";

/** The agent keys the product invokes today — the two `runAiAgent` call sites:
 *  `lib/profile/cv-ai-structuring-actions.ts` and
 *  `lib/journal/journal-ai-suggestions-actions.ts`. */
const WIRED_AGENT_KEYS = ["worker_profile", "work_journal"] as const;

describe("every wired AI surface describes a person", () => {
  it.each(WIRED_AGENT_KEYS)("%s carries personal data", (agent) => {
    const sensitivity = sensitivityForTask(taskTypeForAgent(agent));
    expect(carriesPersonalData(sensitivity)).toBe(true);
  });

  it("so a free-tier ceiling cannot serve either of them", () => {
    // This is the sentence the gate makes to the owner, expressed as a check.
    for (const agent of WIRED_AGENT_KEYS) {
      const sensitivity = sensitivityForTask(taskTypeForAgent(agent));
      expect(sensitivity).not.toBe(MAX_GRANTABLE_FOR_FREE_TIER);
      expect(sensitivity).not.toBe("PUBLIC");
    }
  });
});

describe("the classes the gate names have not moved", () => {
  it("exactly two task types sit at LOW_RISK_PROJECT_DATA among LLM tasks", () => {
    // `detect_capacity_gap` / `detect_skill_gap` are also LOW_RISK but are
    // computed deterministically and never reach a provider, so the gate
    // counts the two that could.
    const grantable = Object.entries(TASK_SENSITIVITY)
      .filter(([task, s]) => s === "LOW_RISK_PROJECT_DATA" && !task.startsWith("detect_"))
      .map(([task]) => task)
      .sort();
    expect(grantable).toEqual([
      "derive_workforce_requirements",
      "structure_future_work",
    ]);
  });

  it("no task is PUBLIC — the reason a grant is needed at all", () => {
    expect(Object.values(TASK_SENSITIVITY)).not.toContain("PUBLIC");
  });

  it("the agent keys for those two tasks have the mapping the gate quotes", () => {
    expect(AGENT_TASK_TYPES.company_need).toBe("structure_future_work");
    expect(AGENT_TASK_TYPES.country_readiness).toBe(
      "derive_workforce_requirements",
    );
    expect(AGENT_TASK_TYPES.document_assistant).toBe(
      "derive_workforce_requirements",
    );
  });
});
