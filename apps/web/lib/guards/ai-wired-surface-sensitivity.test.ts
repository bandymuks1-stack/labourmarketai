/**
 * The sensitivity facts the Gemini activation gate rests on.
 *
 * `docs/human-gates/gemini-provider-activation-gate.md` tells the owner that a
 * grant capped at `LOW_RISK_PROJECT_DATA` unlocks a first real provider run,
 * because the person-describing call sites all carry `PERSONAL` data. A gate
 * document is only as good as the facts under it, and those facts live in two
 * tables that a later edit could move without anyone re-reading the gate.
 *
 * HISTORY OF THIS FILE'S OWN HONESTY. It was written when the product had two
 * `runAiAgent` call sites and said so. By 2026-08-30 the product had SIX call
 * sites across FIVE agent keys — three carrying a person, one carrying a
 * business's own project data, one PUBLIC — and this guard still certified the
 * original two. A guard whose wired list is maintained by hand rots exactly
 * like a comment, so the list is now DERIVED: the scan below collects every
 * `runAiAgent("<key>"` literal in product code, and the map of pinned
 * classifications must cover precisely that set. A new wired surface is a red
 * test until someone classifies it here, on the record.
 *
 * What stays pinned by hand is the CLASSIFICATION — the thing the gate quotes
 * and the thing a quiet edit could walk past an egress ceiling. If this goes
 * red, the gate document is out of date. Re-read it before shipping the change
 * that made it red — particularly if the change moved a task DOWN a class,
 * which is the one edit that would quietly send a person's data to a provider
 * whose grant was issued on the strength of this file.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  AGENT_TASK_TYPES,
  TASK_POLICIES,
  taskTypeForAgent,
} from "@/lib/ai/runtime/task-routing";
import {
  TASK_SENSITIVITY,
  carriesPersonalData,
  sensitivityForTask,
  type AiDataSensitivity,
} from "@/lib/ai/runtime/data-sensitivity";
import { MAX_GRANTABLE_FOR_FREE_TIER } from "@/lib/ai/runtime/data-egress";
import type { AiAgentKey } from "@/lib/ai/registry/types";

/**
 * Every agent key the product invokes today, with the sensitivity class this
 * repo asserts for it. Call sites (all through `runAiAgent`):
 *
 *   worker_profile        lib/profile/cv-ai-structuring-actions.ts
 *                         lib/staffing/worker-intake-actions.ts
 *   work_journal          lib/journal/journal-ai-suggestions-actions.ts
 *   matching_explanation  lib/staffing/match-preview-actions.ts
 *   company_need          lib/staffing/company-need-actions.ts
 *   market_explanation    lib/market/market-explanation-actions.ts
 */
const WIRED_AGENT_SENSITIVITY = {
  worker_profile: "PERSONAL",
  work_journal: "PERSONAL",
  matching_explanation: "PERSONAL",
  // An employer's own future work — scope, headcount, timeframe. No person.
  company_need: "LOW_RISK_PROJECT_DATA",
  // Aggregate counts of published job ads — the ONE PUBLIC surface.
  market_explanation: "PUBLIC",
} as const satisfies Partial<Record<AiAgentKey, AiDataSensitivity>>;

// ── The wired list is derived from source, not maintained by hand ──────────

const APP_ROOT = join(__dirname, "..", "..");

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else if (/\.tsx?$/.test(abs)) acc.push(abs);
  }
  return acc;
}
const rel = (abs: string) => abs.slice(APP_ROOT.length + 1).replace(/\\/g, "/");
const isTest = (r: string) => /\.test\.tsx?$/.test(r) || r.startsWith("lib/guards/");

/** Agent-key string literals passed to `runAiAgent(` in one source. The `\s*`
 *  matters: two call sites put the key on its own line. `runAiAgentCore` does
 *  not match (the `\(` must follow immediately). */
function wiredKeysIn(src: string): string[] {
  return [...src.matchAll(/\brunAiAgent(?:<[^>]*>)?\(\s*"([a-z_]+)"/g)].map(
    (m) => m[1],
  );
}

function collectWiredKeys(): string[] {
  const keys = new Set<string>();
  for (const dir of ["lib", "app", "components"]) {
    for (const abs of walk(join(APP_ROOT, dir))) {
      const r = rel(abs);
      if (isTest(r)) continue;
      for (const k of wiredKeysIn(readFileSync(abs, "utf8"))) keys.add(k);
    }
  }
  return [...keys].sort();
}

describe("the wired set and its classification stay in lockstep", () => {
  it("the pinned map covers exactly the agent keys product code invokes", () => {
    expect(collectWiredKeys()).toEqual(Object.keys(WIRED_AGENT_SENSITIVITY).sort());
  });

  it.each(Object.entries(WIRED_AGENT_SENSITIVITY))(
    "%s carries %s",
    (agent, expected) => {
      const sensitivity = sensitivityForTask(taskTypeForAgent(agent as AiAgentKey));
      expect(sensitivity).toBe(expected);
    },
  );

  it("exactly three wired surfaces describe a person, and stay refused", () => {
    // This is the sentence the gate makes to the owner, expressed as a check:
    // the surfaces that read a person are refused by a free-tier ceiling —
    // and by any ungranted provider — by exactly the rule that refused them
    // before the PUBLIC task arrived.
    const personal = Object.entries(WIRED_AGENT_SENSITIVITY)
      .filter(([, s]) => carriesPersonalData(s))
      .map(([agent]) => agent)
      .sort();
    expect(personal).toEqual(["matching_explanation", "work_journal", "worker_profile"]);
    for (const agent of personal) {
      const sensitivity = sensitivityForTask(taskTypeForAgent(agent as AiAgentKey));
      expect(sensitivity).not.toBe(MAX_GRANTABLE_FOR_FREE_TIER);
      expect(sensitivity).not.toBe("PUBLIC");
    }
  });

  it("the wired-key detector is real (a guard that cannot fail is not a guard)", () => {
    expect(
      wiredKeysIn('await runAiAgent("worker_profile", input, { locale });'),
    ).toEqual(["worker_profile"]);
    // key on its own line — the market-explanation / match-preview shape
    expect(wiredKeysIn('runAiAgent(\n      "market_explanation",\n')).toEqual([
      "market_explanation",
    ]);
    expect(wiredKeysIn('runAiAgent<Foo>("company_need", x, o)')).toEqual([
      "company_need",
    ]);
    // the pure core entrypoint is NOT a wiring site
    expect(wiredKeysIn('runAiAgentCore("worker_profile", entry)')).toEqual([]);
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
