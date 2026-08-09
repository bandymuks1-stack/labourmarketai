import { describe, expect, it } from "vitest";

import {
  AI_PROVIDER_PROFILES,
  mustDegrade,
  orderedCandidatesFor,
  profileFor,
  resolveProviderChain,
  type AiProviderState,
} from "./provider-chain";
import { resolveTaskRoute, type AiTaskType } from "./task-routing";

/**
 * FREE-FIRST PROVIDER CHAIN.
 *
 * Before this module the runtime had exactly one selectable provider and no
 * successor, so "Anthropic is unconfigured" and "the task cannot run" were the
 * same event. These tests pin the three things that fixes:
 *   1. cheapest-that-works ordering, local ahead of any cloud vendor;
 *   2. a keyless local provider is representable at all;
 *   3. degradation is a named outcome carrying WHY, never a throw or a
 *      silently empty result.
 */

const ready = (id: AiProviderState["id"]): AiProviderState => ({
  id,
  health: "ready",
});
const unconfigured = (
  id: AiProviderState["id"],
  reason?: string,
): AiProviderState => ({ id, health: "unconfigured", reason });

/** A real routed decision, so the chain is tested against the actual router. */
const decisionFor = (taskType: AiTaskType) =>
  resolveTaskRoute(taskType, { attempt: 1 });

describe("ordering is cheapest-class-first", () => {
  it("puts the local runtime ahead of every cloud vendor", () => {
    const ids = orderedCandidatesFor("explain_match").map((p) => p.id);
    expect(ids[0]).toBe("local");
  });

  it("never orders a paid provider ahead of a free one", () => {
    const ranks = { free_local: 0, free_tier: 1, paid: 2, disabled: 99 };
    const ordered = orderedCandidatesFor("explain_match");
    for (let i = 1; i < ordered.length; i++) {
      expect(ranks[ordered[i].costClass]).toBeGreaterThanOrEqual(
        ranks[ordered[i - 1].costClass],
      );
    }
  });

  it("drops providers that do not declare the task", () => {
    const ordered = orderedCandidatesFor("extract_cv", [
      {
        ...profileFor("local")!,
        capabilities: ["translate_message"],
      },
      profileFor("anthropic")!,
    ]);
    expect(ordered.map((p) => p.id)).toEqual(["anthropic"]);
  });
});

describe("a keyless local provider is representable", () => {
  it("local requires no api key and is not a cloud provider", () => {
    const local = profileFor("local");
    expect(local?.requiresKey).toBe(false);
    expect(local?.locality).toBe("local");
    expect(local?.costClass).toBe("free_local");
  });

  it("every cloud provider still requires a key", () => {
    for (const p of AI_PROVIDER_PROFILES.filter(
      (x) => x.locality === "cloud",
    )) {
      expect(p.requiresKey, p.id).toBe(true);
    }
  });
});

describe("selection", () => {
  it("picks the local runtime when it is ready, spending nothing", () => {
    const out = resolveProviderChain(decisionFor("explain_match"), [
      ready("local"),
      ready("anthropic"),
    ]);
    expect(out.kind).toBe("provider");
    if (out.kind !== "provider") return;
    expect(out.selected.id).toBe("local");
    expect(out.selected.costClass).toBe("free_local");
    expect(out.skipped).toEqual([]);
  });

  it("falls through to a cloud provider when local is not configured", () => {
    const out = resolveProviderChain(decisionFor("explain_match"), [
      unconfigured("local", "AI_LOCAL_BASE_URL is not set"),
      ready("anthropic"),
    ]);
    expect(out.kind).toBe("provider");
    if (out.kind !== "provider") return;
    expect(out.selected.id).toBe("anthropic");
    // Everything ranked ahead of the winner is reported with its own reason —
    // including providers that reported no state at all, which is why the list
    // is longer than the one provider the test configured.
    expect(out.skipped.map((s) => s.id)).toContain("local");
    expect(
      out.skipped.find((s) => s.id === "local")?.reason,
    ).toBe("AI_LOCAL_BASE_URL is not set");
    for (const s of out.skipped) expect(s.reason).not.toBe("");
  });

  it("hands back the rest of the chain so a failure can retry down it", () => {
    const out = resolveProviderChain(decisionFor("explain_match"), [
      ready("local"),
      ready("anthropic"),
      ready("openai"),
    ]);
    if (out.kind !== "provider") throw new Error("expected a provider");
    expect(out.remaining.length).toBeGreaterThan(0);
    expect(out.remaining.map((r) => r.id)).not.toContain("local");
  });

  it("a provider with no reported state is never selected", () => {
    const out = resolveProviderChain(decisionFor("explain_match"), []);
    expect(out.kind).toBe("unavailable");
  });
});

describe("degradation is honest and never a throw", () => {
  it("names every provider it skipped, and why", () => {
    const out = resolveProviderChain(decisionFor("explain_match"), [
      unconfigured("local", "no base URL"),
      unconfigured("anthropic", "no api key"),
    ]);
    expect(out.kind).toBe("unavailable");
    if (out.kind !== "unavailable") return;
    const reasons = Object.fromEntries(
      out.skipped.map((s) => [s.id, s.reason]),
    );
    expect(reasons.local).toBe("no base URL");
    expect(reasons.anthropic).toBe("no api key");
    expect(mustDegrade(out)).toBe(true);
  });

  it("a deterministic task is NOT reported as a missing provider", () => {
    const decision = decisionFor("derive_workforce_requirements");
    if (decision.tier !== "deterministic") return; // policy-dependent
    const out = resolveProviderChain(decision, []);
    expect(out.kind).toBe("deterministic");
    expect(mustDegrade(out)).toBe(false);
  });

  it("a blocked route is distinguishable from an unusable provider", () => {
    const blocked = {
      ...decisionFor("explain_match"),
      blocked: "cost_ceiling" as const,
    };
    const out = resolveProviderChain(blocked, [ready("local")]);
    expect(out.kind).toBe("unavailable");
    if (out.kind !== "unavailable") return;
    expect(out.reason).toContain("cost_ceiling");
    // Nothing was tried — the block is upstream of provider selection.
    expect(out.skipped).toEqual([]);
  });
});

describe("the profile table cannot silently start spending money", () => {
  it("no provider is free_tier without a verified current source", () => {
    // Placing a cloud vendor in `free_tier` is a claim about TODAY's terms.
    // Until each is verified against current documentation the honest default
    // is `paid`, so the chain never routes expecting a bill that isn't there.
    for (const p of AI_PROVIDER_PROFILES) {
      if (p.locality === "cloud") expect(p.costClass).toBe("paid");
    }
  });

  it("profile ids are unique", () => {
    const ids = AI_PROVIDER_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
