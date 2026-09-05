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
  ALL_AGENT_KEYS,
  getPromptEntry,
  hasPromptEntry,
} from "../ai/registry/registry";
import type { AiAgentKey } from "../ai/registry/types";

describe("prompt registry is the source of truth", () => {
  it("registers ALL thirteen product agents (12 → 13 on 2026-09-05: conversation_intent, the Gemini proposer)", () => {
    for (const key of ALL_AGENT_KEYS) {
      expect(REGISTERED_AGENTS, `${key} must be registered`).toContain(key);
      expect(hasPromptEntry(key)).toBe(true);
    }
    expect(REGISTERED_AGENTS.length).toBe(13);
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
    const bogus = "nonexistent_agent" as AiAgentKey;
    expect(() => getPromptEntry(bogus)).toThrow();
    expect(hasPromptEntry(bogus)).toBe(false);
  });

  it("every output schema is a strict suggestion envelope (rejects suggestion:false)", () => {
    for (const e of Object.values(AI_PROMPT_REGISTRY)) {
      if (!e) continue;
      expect(e.outputSchema.safeParse({ suggestion: false }).success).toBe(false);
    }
  });
});
