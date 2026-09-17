import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    // 2026-09-05: exactly ONE row — the owner's dated, sourced, TASK-SCOPED
    // Gemini grant for the conversation intent proposer. Every other task is
    // refused for Gemini exactly as before (llm-proposal.test.ts pins it).
    // 2026-09-17 (RED-2, option 1): a SECOND task-scoped Gemini row for
    // message translation-on-read. Still one provider; still by task; the
    // `translate_message` section below pins what it opens and what it
    // does not.
    expect(AI_EGRESS_GRANTS).toHaveLength(2);
    expect(AI_EGRESS_GRANTS[0]).toMatchObject({ provider: "gemini", tasks: ["propose_conversation_intent"], grantedOn: "2026-09-05" });
    expect(AI_EGRESS_GRANTS[1]).toMatchObject({ provider: "gemini", tasks: ["translate_message"], maxSensitivity: "SENSITIVE_FREE_TEXT", grantedOn: "2026-09-17" });
    expect(new Set(AI_EGRESS_GRANTS.map((g) => g.provider))).toEqual(new Set(["gemini"]));
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

  it("so ONLY a PUBLIC task can leave the platform, and every other is refused", () => {
    // Until 2026-08-24 no task was classed PUBLIC, so the live consequence of
    // an empty grant table was "local, or nothing" for everything. One task is
    // PUBLIC now (`explain_market_demand` — aggregate advertisement counts, no
    // data subject), and that is the ENTIRE change in what may leave: the gate
    // itself is untouched, because an ungranted external provider has always
    // been permitted PUBLIC and nothing else.
    //
    // The assertion is therefore split rather than deleted. Deleting it would
    // have removed the only check that the other ten stay refused, which is the
    // half that matters.
    for (const task of AI_TASK_TYPES) {
      const s = sensitivityForTask(task);
      const expected = s === "PUBLIC";
      for (const p of AI_PROVIDER_PROFILES) {
        if (p.locality === "local") continue;
        expect(egressPermitted(p, s).permitted, `${task} → ${p.id}`).toBe(expected);
      }
    }
  });

  it("the tasks that carry a person are still refused by name", () => {
    // Named explicitly so a future reclassification of any ONE of them is a
    // red test rather than an arithmetic change in the loop above.
    const mustBeRefused = [
      "extract_cv",
      "normalize_work_scope",
      "normalize_external_profile",
      "explain_match",
      "draft_follow_up",
      "translate_message",
      "structure_future_work",
      "derive_workforce_requirements",
    ] as const;
    for (const task of mustBeRefused) {
      const s = sensitivityForTask(task);
      expect(s, task).not.toBe("PUBLIC");
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
    // data as public. So the PUBLIC set is an ALLOWLIST, not a count — a new
    // entry here is a red test until someone writes down why that payload
    // carries no data subject.
    //
    // `explain_market_demand` is on it as of 2026-08-24. Its reasoning is in
    // `data-sensitivity.ts`, its field list is in `TASK_POLICIES`, and the
    // payload assembler is pinned separately by
    // `public-market-facts-payload.test.ts`.
    const publicTasks = AI_TASK_TYPES.filter(
      (t) => TASK_SENSITIVITY[t] === "PUBLIC",
    ).sort();
    expect(
      publicTasks,
      "a task became PUBLIC — verify its payload really carries no project or personal data",
    ).toEqual(["explain_market_demand"]);
  });
});

describe("the gate is on the PATH, not in an optional argument", () => {
  it("the legacy no-chain branch checks egress before dispatching", () => {
    // The hole this closes: the gate lived only in `ChainDispatchContext`, so
    // any caller that omitted a chain — `runtime/run.ts` among them — sent the
    // payload to a live cloud provider with no check at all. A boundary a
    // caller can skip by not passing an argument is not a boundary.
    const src = readFileSync(
      join(__dirname, "..", "ai", "runtime", "run-core.ts"),
      "utf8",
    );
    const legacy = src.slice(
      src.indexOf("if (!chain) {"),
      src.indexOf("// ── Chain path"),
    );
    expect(legacy).toContain("legacyEgressVerdict");
    expect(legacy).toContain("verdict.permitted");
  });

  it("DeepL is gated before its adapter is invoked, on BOTH paths", () => {
    // `tryPreferredSecondary` runs AHEAD of the chain's candidate loop, so the
    // chain veto never saw it. `translate_message` prefers DeepL and is the
    // only SENSITIVE_FREE_TEXT task there is — this was a direct route off the
    // platform for the most sensitive payload the runtime handles.
    const src = readFileSync(
      join(__dirname, "..", "ai", "runtime", "run-core.ts"),
      "utf8",
    );
    const secondary = src.slice(
      src.indexOf("function tryPreferredSecondary"),
      src.indexOf("const DEEPL_PROFILE"),
    );
    expect(secondary).toContain("egressPermitted");
    expect(secondary).toContain("DEEPL_PROFILE");
    // The refusal must happen BEFORE the adapter call, not after it.
    expect(secondary.indexOf("egressPermitted")).toBeLessThan(
      secondary.indexOf("deeplCompletionProvider.complete"),
    );
  });

  it("DeepL holds no grant, so translation cannot leave through it — with or without the task named", () => {
    // RED-2 (2026-09-17) opened translate_message for GEMINI only; DeepL
    // authorization is explicitly deferred, so the preferred-secondary path
    // still returns null before the adapter is called.
    const deepl = { id: "deepl", locality: "cloud" as const, costClass: "paid" };
    expect(
      egressPermitted(deepl, sensitivityForTask("translate_message")).permitted,
    ).toBe(false);
    expect(
      egressPermitted(deepl, sensitivityForTask("translate_message"), AI_EGRESS_GRANTS, "translate_message").permitted,
    ).toBe(false);
  });

  it("an unrecognised agent key is treated as the MOST restricted class", () => {
    // Fails closed: if an unknown agent yielded no sensitivity and that were
    // read as "nothing sensitive", an unrecognised agent would become the way
    // around the boundary.
    const src = readFileSync(
      join(__dirname, "..", "ai", "runtime", "run-core.ts"),
      "utf8",
    );
    const fn = src.slice(
      src.indexOf("function sensitivityForRequest"),
      src.indexOf("/** The gate for a single configured provider"),
    );
    expect(fn).toContain('"SENSITIVE_FREE_TEXT"');
  });
});

describe("RED-2 (owner approval 2026-09-17, option 1): translate_message may leave for Gemini ONLY", () => {
  // The second owner grant. Everything it opens and everything it leaves shut,
  // asserted against the SHIPPED table — not an injected fixture — so a later
  // edit to the row (or a row for another vendor) is a red test here first.
  const task = "translate_message";
  const s = sensitivityForTask(task);
  const cloud = (id: string) => ({ id, locality: "cloud" as const, costClass: "paid" });

  it("the task is SENSITIVE_FREE_TEXT — the approved ceiling, which is also the top of the scale", () => {
    expect(s).toBe("SENSITIVE_FREE_TEXT");
    expect(AI_DATA_SENSITIVITY_CLASSES[AI_DATA_SENSITIVITY_CLASSES.length - 1]).toBe("SENSITIVE_FREE_TEXT");
    const row = AI_EGRESS_GRANTS.find((g) => g.tasks?.includes(task));
    expect(row?.maxSensitivity).toBe("SENSITIVE_FREE_TEXT");
  });

  it("1. translate_message + Gemini + SENSITIVE_FREE_TEXT: ALLOWED", () => {
    expect(egressPermitted(cloud("gemini"), s, AI_EGRESS_GRANTS, task).permitted).toBe(true);
    expect(maxPermittedSensitivity(cloud("gemini"), AI_EGRESS_GRANTS, task)).toBe("SENSITIVE_FREE_TEXT");
  });

  it("2. above the approved ceiling: REFUSED — a lower ceiling refuses the task, and a free tier is capped whatever the row says", () => {
    // No class ranks above SENSITIVE_FREE_TEXT, so "above the ceiling" is
    // proven from the other side: the same row with any lower ceiling
    // refuses this task, and the free-tier cap still overrides the row.
    const lowered = AI_EGRESS_GRANTS.map((g) =>
      g.tasks?.includes(task) ? { ...g, maxSensitivity: "PERSONAL" as const } : g,
    );
    expect(egressPermitted(cloud("gemini"), s, lowered, task).permitted).toBe(false);
    expect(
      egressPermitted({ ...cloud("gemini"), costClass: "free_tier" }, s, AI_EGRESS_GRANTS, task).permitted,
    ).toBe(false);
  });

  it("3–6. Anthropic, OpenAI, xAI and DeepL: REFUSED for translate_message — DeepL is deferred, not implied", () => {
    for (const id of ["anthropic", "openai", "xai", "deepl"]) {
      const v = egressPermitted(cloud(id), s, AI_EGRESS_GRANTS, task);
      expect(v.permitted, id).toBe(false);
      expect(!v.permitted && v.reason, id).toMatch(/holds no egress grant/i);
    }
    // and no shipped cloud profile other than gemini holds ANY grant
    for (const p of AI_PROVIDER_PROFILES) {
      if (p.locality === "local" || p.id === "gemini") continue;
      expect(maxPermittedSensitivity(p, AI_EGRESS_GRANTS, task), p.id).toBe("PUBLIC");
    }
  });

  it("the grant is by task: Gemini stays refused for every other personal task, and for a call that names none", () => {
    for (const other of AI_TASK_TYPES) {
      if (other === task || other === "propose_conversation_intent") continue;
      const os = sensitivityForTask(other);
      expect(egressPermitted(cloud("gemini"), os, AI_EGRESS_GRANTS, other).permitted, other).toBe(os === "PUBLIC");
    }
    expect(egressPermitted(cloud("gemini"), s, AI_EGRESS_GRANTS).permitted).toBe(false);
  });

  it("the 2026-09-05 intent row is untouched by the new one", () => {
    expect(AI_EGRESS_GRANTS[0]).toEqual(
      expect.objectContaining({ provider: "gemini", maxSensitivity: "SENSITIVE_FREE_TEXT", tasks: ["propose_conversation_intent"], grantedOn: "2026-09-05" }),
    );
  });

  it("11. the mechanism is generic — the grant names a TASK, never a language pair, and the payload policy names no language", () => {
    const row = AI_EGRESS_GRANTS.find((g) => g.tasks?.includes(task))!;
    expect(JSON.stringify(row)).not.toMatch(/\b(ka|uk|lt|en|ru|de|nl)\b.*→/);
    expect(Object.keys(row).sort()).toEqual(["basis", "grantedOn", "maxSensitivity", "provider", "tasks"]);
    // the task policy's data boundary stays the minimal translation payload
    const src = readFileSync(join(__dirname, "..", "ai", "runtime", "task-routing.ts"), "utf8");
    const policy = src.slice(src.indexOf("translate_message: {"), src.indexOf("languageRouting: { preferredProvider: \"deepl\" }"));
    expect(policy).toContain('allowedFields: ["source_text", "source_locale", "target_locale"]');
    expect(policy).toContain('prohibitedFields: ["full_cv", ...NEVER_NEEDED]');
  });

  it("revocation: remove the row and translation is refused again — no data to unwind", () => {
    const revoked = AI_EGRESS_GRANTS.filter((g) => !g.tasks?.includes(task));
    expect(revoked).toHaveLength(1);
    expect(egressPermitted(cloud("gemini"), s, revoked, task).permitted).toBe(false);
    // the intent grant is unaffected by revoking translation
    expect(egressPermitted(cloud("gemini"), "SENSITIVE_FREE_TEXT", revoked, "propose_conversation_intent").permitted).toBe(true);
  });
});
