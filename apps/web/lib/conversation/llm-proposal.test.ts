import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { conversationIntentEntry, conversationIntentInputSchema, conversationIntentOutputSchema } from "@/lib/ai/registry/agents/conversation-intent";
import { AI_EGRESS_GRANTS, egressPermitted } from "@/lib/ai/runtime/data-egress";
import { TASK_SENSITIVITY } from "@/lib/ai/runtime/data-sensitivity";
import { AGENT_TASK_TYPES, TASK_POLICIES } from "@/lib/ai/runtime/task-routing";

import { INTENT_HINTS, intentCatalogue } from "./intent-catalogue";
import { INTENT_REGISTRY } from "./intent-registry";

/**
 * Owner approval 2026-09-05 — "GEMINI CONVERSATION NLU EGRESS". The
 * deterministic router stays the floor; Gemini may PROPOSE only an existing
 * canonical intent for a sentence the router could not read; the proposal
 * runs the same handler; authorization, dispatcher and executors are
 * untouched; the grant is dated, sourced, least-privilege (ONE task),
 * auditable and revocable (delete the row).
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");
const ACTION = read("lib/conversation/llm-proposal.ts");
const GEMINI = { id: "gemini", locality: "cloud", costClass: "paid" } as const;

describe("the proposer is confined to the product's existing intents", () => {
  it("every routed intent has exactly one hint, and the catalogue carries ids + hints only", () => {
    const ids = Object.keys(INTENT_REGISTRY).sort();
    expect(Object.keys(INTENT_HINTS).sort()).toEqual(ids);
    for (const row of intentCatalogue()) {
      expect(Object.keys(row).sort()).toEqual(["hint", "id"]);
      expect(row.hint.length).toBeGreaterThan(8);
      expect(row.hint).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    }
  });

  it("the input contract admits the sentence, locale, identity and catalogue — nothing else", () => {
    const ok = conversationIntentInputSchema.safeParse({ sentence: "kas dirba rytoj?", locale: "lt", identity: "company", intents: intentCatalogue() });
    expect(ok.success).toBe(true);
    const widened = conversationIntentInputSchema.safeParse({ sentence: "x y", locale: "lt", identity: "company", intents: intentCatalogue(), workerName: "Jonas" });
    expect(widened.success).toBe(false);
  });

  it("the output is one id (or unknown) plus up to two alternatives inside the standard envelope", () => {
    const base = { suggestion: true, agent: "conversation_intent", confidence: "high", evidence_refs: [], missing_information: ["project"], needs_human_review: false, blocked_claims: [] };
    expect(conversationIntentOutputSchema.safeParse({ ...base, data: { intent: "who-available", alternatives: [] } }).success).toBe(true);
    expect(conversationIntentOutputSchema.safeParse({ ...base, data: { intent: "who-available", alternatives: ["a", "b", "c"] } }).success).toBe(false);
    expect(conversationIntentOutputSchema.safeParse({ ...base, data: { intent: "who-available", alternatives: [], reply: "Done!" } }).success).toBe(false);
  });

  it("the server action re-validates against the registry, needs a signed-in user, is rate-limited, and never writes or dispatches", () => {
    expect(ACTION.startsWith('"use server";')).toBe(true);
    expect(ACTION).toContain("supabase.auth.getUser()");
    expect(ACTION).toContain('reason: "unauthenticated"');
    expect(ACTION).toContain('name: "conversation_intent_proposal"');
    expect(ACTION).toContain("Object.prototype.hasOwnProperty.call(INTENT_REGISTRY, v)");
    expect(ACTION).toContain('reason: "not_understood"');
    expect(ACTION).toContain('inputSource: "conversation_sentence"');
    expect(ACTION).not.toMatch(/profileId/);
    expect(ACTION).not.toMatch(/dispatchWorkerAction|prepareConfirmationAction|\.rpc\(|\.from\(|\.insert\(|\.update\(/);
  });
});

describe("the runtime side: one task, one grant, least privilege", () => {
  it("the agent is registered on its own task, classed as unbounded free text", () => {
    expect(AGENT_TASK_TYPES.conversation_intent).toBe("propose_conversation_intent");
    expect(TASK_SENSITIVITY.propose_conversation_intent).toBe("SENSITIVE_FREE_TEXT");
    const policy = TASK_POLICIES.propose_conversation_intent;
    expect(policy.allowedFields).toEqual(["sentence", "locale", "identity", "intent_catalogue"]);
    expect(policy.prohibitedFields).toEqual(expect.arrayContaining(["worker_profile", "journal_entry_text", "full_cv", "email", "phone"]));
    expect(policy.preferredTier).toBe("low_cost");
    expect(policy.maxEstimatedCostUsd).toBeLessThanOrEqual(0.01);
    expect(conversationIntentEntry.agent).toBe("conversation_intent");
  });

  it("the grant table holds exactly the owner's dated, sourced, task-scoped Gemini grant", () => {
    expect(AI_EGRESS_GRANTS).toHaveLength(1);
    const g = AI_EGRESS_GRANTS[0];
    expect(g.provider).toBe("gemini");
    expect(g.maxSensitivity).toBe("SENSITIVE_FREE_TEXT");
    expect(g.tasks).toEqual(["propose_conversation_intent"]);
    expect(g.grantedOn).toBe("2026-09-05");
    expect(g.basis).toMatch(/owner approval 2026-09-05/i);
    expect(g.basis).toMatch(/revocable/i);
  });

  it("the grant opens the gate for THAT task only — every other personal task stays refused for Gemini", () => {
    expect(egressPermitted(GEMINI, "SENSITIVE_FREE_TEXT", AI_EGRESS_GRANTS, "propose_conversation_intent").permitted).toBe(true);
    expect(egressPermitted(GEMINI, "PERSONAL", AI_EGRESS_GRANTS, "extract_cv").permitted).toBe(false);
    expect(egressPermitted(GEMINI, "PERSONAL", AI_EGRESS_GRANTS, "normalize_work_scope").permitted).toBe(false);
    expect(egressPermitted(GEMINI, "SENSITIVE_FREE_TEXT", AI_EGRESS_GRANTS, "translate_message").permitted).toBe(false);
    // a call that names no task gets no task-scoped grant (fail closed)
    expect(egressPermitted(GEMINI, "PERSONAL", AI_EGRESS_GRANTS).permitted).toBe(false);
    // PUBLIC never needed a grant and still does not
    expect(egressPermitted(GEMINI, "PUBLIC", AI_EGRESS_GRANTS, "explain_market_demand").permitted).toBe(true);
    // a free tier would still be capped, whatever the row says
    expect(egressPermitted({ ...GEMINI, costClass: "free_tier" }, "SENSITIVE_FREE_TEXT", AI_EGRESS_GRANTS, "propose_conversation_intent").permitted).toBe(false);
  });
});

describe("the chat: deterministic first, the proposer only for unknown, the same handlers, resolution in telemetry", () => {
  it("classifies deterministically, asks the proposer only when unknown, and runs the same dispatchIntent", () => {
    // The router reads the RAW sentence (`sent`), never the goal-composed one
    // — composing before classification would let an earlier turn's words
    // re-trigger an intent the person did not just state.
    const classify = CHAT.indexOf(
      "const { intent: routedIntent, score: routedScore } = classifyIntent(sent);",
    );
    const propose = CHAT.indexOf("proposeConversationIntentAction({ sentence: text, locale, identity })");
    expect(classify).toBeGreaterThan(-1);
    expect(propose).toBeGreaterThan(classify);
    // THREE TIERS, IN THIS ORDER (owner P0 §1, 2026-09-06). The router is
    // still the floor and still runs first; the ACTIVE GOAL is consulted
    // between it and the proposer, so a continuation ("Nuo spalio.") re-enters
    // the goal's own handler instead of spending a vendor call on a sentence
    // whose destination we already know.
    const goalAt = CHAT.indexOf("const turnKind = classifyTurn({");
    expect(goalAt).toBeGreaterThan(classify);
    expect(goalAt).toBeLessThan(propose);
    const flow = CHAT.slice(propose - 1200, propose + 1000);
    expect(flow).toContain('if (intent !== "unknown") {');
    expect(flow).toContain("dispatchIntent(intent, handlers, withTyping, fallback)");
    // low confidence is honestly "not understood", never a guess
    expect(flow).toContain('res.kind === "proposal" && res.confidence !== "low" ? res.intent : "unknown"');
    expect(flow).toContain("dispatchIntent(resolved, handlers, withTyping, fallback)");
    // never a second router, never a model call from the client
    expect(CHAT).not.toMatch(/from\s+["']@\/lib\/ai\//);
    expect(CHAT).not.toMatch(/runAiAgent/);
  });

  it("telemetry names the resolution (deterministic | goal | llm) and never the sentence", () => {
    // `goal` is its own value: a turn the router could not read but the
    // active goal could is a DIFFERENT event from one the router resolved,
    // and collapsing the two would hide how much work the goal layer does.
    expect(CHAT).toContain('trackResolution(intent, continuing ? "goal" : "deterministic")');
    expect(CHAT).toContain('res.kind === "proposal" ? "llm" : "deterministic"');
    const at = CHAT.indexOf("const trackResolution =");
    const body = CHAT.slice(at, at + 500);
    expect(body).toContain("role_context: roleContextNow, resolution");
    // the payload carries the id, the role and the resolution — no sentence field
    expect(body).not.toMatch(/\btext\s*[,}]|sentence\s*[:,]/);
  });
});
