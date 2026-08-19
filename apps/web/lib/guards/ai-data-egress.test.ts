import { describe, expect, it } from "vitest";

import {
  AI_EGRESS_GRANTS,
  MAX_GRANTABLE_FOR_FREE_TIER,
  egressPermitted,
  maxPermittedSensitivity,
  type AiEgressGrant,
} from "@/lib/ai/runtime/data-egress";
import {
  AI_DATA_SENSITIVITY_CLASSES,
  TASK_SENSITIVITY,
  sensitivityForTask,
} from "@/lib/ai/runtime/data-sensitivity";
import { AI_TASK_TYPES } from "@/lib/ai/runtime/task-routing";
import { AI_PROVIDER_PROFILES } from "@/lib/ai/runtime/provider-chain";

/**
 * AI DATA BOUNDARY (owner decision 2026-08-19), as executable rules.
 *
 * "No external AI provider may receive labourmarket.ai internal, private or
 * user information unless that transfer is explicitly permitted." And: "EUR 0
 * never grants permission to send data."
 *
 * The previous rule sorted providers by PRICE — free tiers refused personal
 * data, paid cloud allowed it, because enabling a paid vendor was already an
 * owner decision. That conflated two different acts. Paying a vendor is not
 * permitting it to process a worker's journal entry. These pins keep the axis
 * on INTERNAL vs EXTERNAL, and keep permission explicit and default-deny.
 */
describe("the gate is closed by default", () => {
  it("ships with an EMPTY grant table — that is the state, not an omission", () => {
    // Adding a row here permits real user content to leave the platform. It is
    // an owner act. If this ever becomes non-empty without a deliberate,
    // reviewed decision, this test is where it should be noticed.
    expect(AI_EGRESS_GRANTS).toEqual([]);
  });

  it("an external provider with no grant may receive PUBLIC only", () => {
    for (const p of AI_PROVIDER_PROFILES) {
      if (p.locality === "local") continue;
      expect(maxPermittedSensitivity(p), p.id).toBe("PUBLIC");
    }
  });

  it("every non-public class is refused to every shipped external provider", () => {
    const nonPublic = AI_DATA_SENSITIVITY_CLASSES.filter((c) => c !== "PUBLIC");
    for (const p of AI_PROVIDER_PROFILES) {
      if (p.locality === "local") continue;
      for (const s of nonPublic) {
        expect(egressPermitted(p, s).permitted, `${p.id} ← ${s}`).toBe(false);
      }
    }
  });

  it("so no task can leave the platform today", () => {
    // No task is classed PUBLIC (a recorded finding in data-sensitivity.ts), so
    // the live consequence of an empty grant table is: local, or nothing.
    // BLOCK external → try local → otherwise fail safely.
    for (const task of AI_TASK_TYPES) {
      const s = sensitivityForTask(task);
      for (const p of AI_PROVIDER_PROFILES) {
        if (p.locality === "local") continue;
        expect(egressPermitted(p, s).permitted, `${task} → ${p.id}`).toBe(false);
      }
    }
  });
});

describe("EUR 0 grants nothing, and neither does an invoice", () => {
  it("cost class alone never changes the verdict", () => {
    const base = { id: "vendor", locality: "cloud" as const };
    for (const costClass of ["free_local", "free_tier", "paid"]) {
      expect(
        egressPermitted({ ...base, costClass }, "PERSONAL").permitted,
        costClass,
      ).toBe(false);
    }
  });

  it("a free tier cannot be granted personal data, whatever the grant says", () => {
    // Carried over from the free-provider matrix: when a service is free the
    // consideration is sometimes the content itself.
    const grants: AiEgressGrant[] = [
      {
        provider: "v",
        maxSensitivity: "SENSITIVE_FREE_TEXT",
        basis: "test",
        grantedOn: "2026-08-19",
      },
    ];
    const freeTier = { id: "v", locality: "cloud" as const, costClass: "free_tier" };
    expect(maxPermittedSensitivity(freeTier, grants)).toBe(
      MAX_GRANTABLE_FOR_FREE_TIER,
    );
    expect(egressPermitted(freeTier, "PERSONAL", grants).permitted).toBe(false);
  });
});

describe("local is the permitted path for internal data", () => {
  it("every class may run locally — no egress occurs", () => {
    const local = { id: "local", locality: "local" as const, costClass: "free_local" };
    for (const s of AI_DATA_SENSITIVITY_CLASSES) {
      expect(egressPermitted(local, s).permitted, s).toBe(true);
    }
  });

  it("the shipped profile table still has a local option at all", () => {
    // If this ever became false, "try local" would be unreachable and the
    // owner's fallback order would silently collapse to "fail safely".
    expect(
      AI_PROVIDER_PROFILES.some((p) => p.locality === "local"),
      "no local provider — internal data would have nowhere to run",
    ).toBe(true);
  });
});

describe("a grant is bounded, dated and per-provider", () => {
  const grant = (over: Partial<AiEgressGrant> = {}): AiEgressGrant[] => [
    {
      provider: "anthropic",
      maxSensitivity: "PERSONAL",
      basis: "test",
      grantedOn: "2026-08-19",
      ...over,
    },
  ];
  const anthropic = { id: "anthropic", locality: "cloud" as const, costClass: "paid" };
  const other = { id: "openai", locality: "cloud" as const, costClass: "paid" };

  it("permits up to its ceiling and no further", () => {
    expect(egressPermitted(anthropic, "PERSONAL", grant()).permitted).toBe(true);
    expect(
      egressPermitted(anthropic, "SENSITIVE_FREE_TEXT", grant()).permitted,
    ).toBe(false);
  });

  it("never leaks to another provider", () => {
    expect(egressPermitted(other, "PERSONAL", grant()).permitted).toBe(false);
  });

  it("every shipped grant carries a basis and a date", () => {
    // Empty today; this is the shape check for whenever it is not.
    for (const g of AI_EGRESS_GRANTS) {
      expect(g.basis.length, g.provider).toBeGreaterThan(0);
      expect(g.grantedOn, g.provider).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("the refusal says WHY, so an operator knows what to change", () => {
    const v = egressPermitted(anthropic, "PERSONAL");
    expect(v.permitted).toBe(false);
    expect(!v.permitted && v.reason).toMatch(/egress grant/i);
    expect(!v.permitted && v.reason).toContain("PERSONAL");
  });
});

describe("the classification the gate depends on stays honest", () => {
  it("every task is still classified", () => {
    for (const t of AI_TASK_TYPES) {
      expect(TASK_SENSITIVITY[t], t).toBeDefined();
    }
  });

  it("no task is quietly reclassified PUBLIC to slip past the gate", () => {
    // The one way to defeat this gate without touching it: relabel a task's
    // data as public. If a PUBLIC task ever appears it must be a deliberate,
    // reviewed change — this failing is the prompt to check it.
    const publicTasks = AI_TASK_TYPES.filter(
      (t) => TASK_SENSITIVITY[t] === "PUBLIC",
    );
    expect(
      publicTasks,
      "a task became PUBLIC — verify its payload really carries no project or personal data",
    ).toEqual([]);
  });
});
