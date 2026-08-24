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
  TASK_POLICIES,
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
    // It is unchanged by the arrival of a PUBLIC task: the two surfaces that
    // read a person are refused by exactly the rule that refused them before.
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

  it("the PUBLIC set is an allowlist of one, and the gate document says so", () => {
    // SUPERSEDES "no task is PUBLIC — the reason a grant is needed at all".
    //
    // That was true for the whole life of this file until 2026-08-24 and was
    // the load-bearing fact under the Gemini gate: with no PUBLIC task, an
    // ungranted external provider could receive nothing, so a grant row was
    // the only unblock. `explain_market_demand` changes the conclusion without
    // changing the rule — it is PUBLIC, so it needs no grant, and every other
    // task stays exactly as refused as it was.
    //
    // Kept as an ALLOWLIST rather than a count: the risk this guard exists to
    // catch is a SECOND task being quietly relabelled, and a count would go
    // green on a swap.
    const publicTasks = Object.entries(TASK_SENSITIVITY)
      .filter(([, s]) => s === "PUBLIC")
      .map(([task]) => task)
      .sort();
    expect(publicTasks).toEqual(["explain_market_demand"]);
  });

  it("the PUBLIC task's own policy admits nothing that describes a person", () => {
    // The classification is derived from the fields a policy admits, so this
    // is where the claim is actually checkable. Field NAMES only — no payload
    // is constructed here, and none needs to be.
    const policy = TASK_POLICIES.explain_market_demand;
    const personShaped = [
      "cv",
      "bio",
      "name",
      "email",
      "phone",
      "address",
      "profile",
      "journal",
      "document",
      "employer_name",
      "description",
      "title",
      "url",
      "coordinates",
    ];
    for (const field of policy.allowedFields) {
      for (const marker of personShaped) {
        expect(
          field.includes(marker),
          `explain_market_demand admits "${field}", which looks like "${marker}"`,
        ).toBe(false);
      }
    }
    // And the prohibitions are stated rather than merely implied by absence.
    for (const must of ["full_cv", "journal_entry_text", "employer_name"]) {
      expect(policy.prohibitedFields, must).toContain(must);
    }
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
