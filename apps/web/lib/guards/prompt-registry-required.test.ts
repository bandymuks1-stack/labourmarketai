/**
 * Guard — PROMPT REGISTRY REQUIRED (Internal LLM Agents v1, PR3).
 *
 * Prompts are defined in the central registry, not scattered across
 * components/routes. Every registered entry must be well-formed (versioned
 * system prompt + strict input/output schemas + safety rules + evidence sources
 * + audit date), and an unregistered agent must throw rather than run promptless.
 */
import { describe, it, expect } from "vitest";
import {
  AI_PROMPT_REGISTRY,
  REGISTERED_AGENTS,
  getPromptEntry,
  hasPromptEntry,
} from "../ai/registry/registry";

describe("prompt registry is the source of truth", () => {
  it("registers at least the two PR3 proof agents", () => {
    expect(REGISTERED_AGENTS).toContain("worker_profile");
    expect(REGISTERED_AGENTS).toContain("country_readiness");
  });

  it("every registered entry is well-formed", () => {
    const entries = Object.entries(AI_PROMPT_REGISTRY);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, e] of entries) {
      expect(e, key).toBeDefined();
      if (!e) continue;
      expect(e.agent).toBe(key);
      expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(e.system.length).toBeGreaterThan(40);
      expect(e.safetyRules.length).toBeGreaterThan(0);
      expect(e.allowedEvidenceSources.length).toBeGreaterThan(0);
      expect(e.blockedClaims.length).toBeGreaterThan(0);
      expect(e.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof e.inputSchema.safeParse).toBe("function");
      expect(typeof e.outputSchema.safeParse).toBe("function");
    }
  });

  it("getPromptEntry throws for an unregistered agent (no promptless run)", () => {
    expect(() => getPromptEntry("admin_risk")).toThrow();
    expect(hasPromptEntry("admin_risk")).toBe(false);
  });

  it("every output schema is a strict suggestion envelope (rejects suggestion:false)", () => {
    for (const e of Object.values(AI_PROMPT_REGISTRY)) {
      if (!e) continue;
      expect(e.outputSchema.safeParse({ suggestion: false }).success).toBe(false);
    }
  });
});
