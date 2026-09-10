import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  UNDERSTANDING_KINDS,
  conversationIntentOutputSchema,
  conversationIntentEntry,
} from "@/lib/ai/registry/agents/conversation-intent";
import { AI_PROVIDER_PROFILES, orderedCandidatesFor } from "@/lib/ai/runtime/provider-chain";
import { AI_EGRESS_GRANTS } from "@/lib/ai/runtime/data-egress";
import { INTENT_REGISTRY } from "@/lib/conversation/intent-registry";

/**
 * INTENT_REGISTRY MAY BE A REGISTRY OF KNOWN OPERATIONS. IT MAY NOT DEFINE
 * THE LIMIT OF WHAT A HUMAN IS ALLOWED TO MEAN.
 *
 * (Owner approval 2026-09-10 — understanding contract widening.)
 *
 * THE CEILING THIS REMOVES. The proposer could answer only with an
 * operational intent id, and `llm-proposal.ts` re-validated that id against
 * `INTENT_REGISTRY`. So a company's name, a question and a correction all had
 * to come back as either a WRONG OPERATION or `unknown`. Slice A had to keep
 * bare names away from the model entirely, because every answer the model
 * could give was an operation.
 *
 * What this guard defends is the SHAPE of the contract, not the wording:
 * meaning first, operations only when the meaning requires one — and
 * execution still gated by the registry and the domain.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const ACTION = read("lib/conversation/llm-proposal.ts");
const UNION = read("lib/conversation/utterance-understanding.ts");
const CHAT = read("components/app/conversation/chat/conversation-chat.tsx");

/** Executable code only — comments carry the owner's audit trail. */
const codeOf = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("a message may be something other than an operation", () => {
  it("the model contract can express a name, a question and a correction", () => {
    expect([...UNDERSTANDING_KINDS].sort()).toEqual(
      ["action", "clarification", "question", "reference", "unsupported"].sort(),
    );
  });

  it("each non-operational kind is representable in the OUTPUT schema", () => {
    const base = {
      suggestion: true,
      agent: "conversation_intent",
      confidence: "high",
      evidence_refs: [],
      missing_information: [],
      needs_human_review: false,
      blocked_claims: [],
    };
    for (const kind of UNDERSTANDING_KINDS) {
      const parsed = conversationIntentOutputSchema.safeParse({ ...base, data: { kind } });
      expect(parsed.success, `${kind} is not representable`).toBe(true);
    }
  });

  it("the prompt DESCRIBES every kind it is allowed to answer with", () => {
    // A schema that can express five kinds while the prompt explains one is a
    // widening on paper only — the model would keep answering v1-style.
    // Derived from UNDERSTANDING_KINDS, so a future kind cannot ship
    // representable-but-unexplained. Negative-controlled 2026-09-10: an
    // earlier draft asserted only the two rule sentences below, and stayed
    // GREEN when a kind's description was deleted.
    const system = conversationIntentEntry.system.toLowerCase();
    for (const kind of UNDERSTANDING_KINDS) {
      expect(system, `the prompt never explains \`${kind}\``).toMatch(
        new RegExp("`" + kind + "`\\s*[—-]"),
      );
    }
    // The two rules that were impossible to state under v1.
    expect(system).toMatch(/a name is never an action/);
    expect(system).toMatch(/do not force a question into an `action`/);
  });

  it("the version was bumped — a changed contract is not a silent edit", () => {
    expect(conversationIntentEntry.version).not.toBe("1.0.0");
  });
});

describe("understanding is not authority", () => {
  it("an intent id is resolved ONLY inside the action branch", () => {
    const code = codeOf(ACTION);
    const actionCase = code.slice(code.indexOf('case "action"'), code.indexOf('case "reference"'));
    expect(actionCase).toContain("isRoutedIntent");
    // Registry re-validation still stands: the model cannot invent an id.
    expect(code).toContain("Object.prototype.hasOwnProperty.call(INTENT_REGISTRY, v)");
  });

  it("the understanding path writes nothing and dispatches nothing", () => {
    const code = codeOf(ACTION);
    for (const forbidden of [".insert(", ".update(", ".delete(", ".rpc(", ".from(", "dispatch"]) {
      expect(code, `${forbidden} in the understanding path`).not.toContain(forbidden);
    }
  });

  it("a reference from the MODEL is resolved and offered, never performed", () => {
    // Same handler slice A proved: resolve against the caller's own
    // workspaces, offer the membership-validated chip, never switch.
    const flow = CHAT.slice(CHAT.indexOf("proposeUnderstandingAction("));
    const body = flow.slice(0, 2200);
    expect(body).toContain("handleReference(res.text)");
    const handler = CHAT.slice(
      CHAT.indexOf("const handleReference = useCallback"),
      CHAT.indexOf("const handleQuestion = useCallback"),
    );
    expect(handler).not.toMatch(/performContextSwitch/);
  });

  it("a question never becomes a write, and is never answered from nothing", () => {
    const start = CHAT.indexOf("const handleQuestion = useCallback");
    const end = CHAT.indexOf("const startProjects", start);
    expect(start, "handleQuestion must exist").toBeGreaterThan(-1);
    expect(end, "handleQuestion must be followed by startProjects").toBeGreaterThan(start);
    const handler = CHAT.slice(start, end);
    expect(handler.length).toBeGreaterThan(100);
    for (const forbidden of ["dispatchIntent", "openForm(", "prepareAction", ".insert(", ".update("]) {
      expect(handler, `${forbidden} in a question handler`).not.toContain(forbidden);
    }
    // It answers from the session's own authorized read, or says it cannot.
    expect(handler).toContain("matchWorkspacesByName");
    expect(handler).toContain("questionUnanswered");
  });
});

describe("the router stays vendor-neutral", () => {
  it("no provider is named in the understanding code", () => {
    const code = codeOf(ACTION) + codeOf(UNION);
    for (const vendor of ["gemini", "openai", "anthropic", "claude", "grok", "qwen", "mistral", "groq"]) {
      expect(code.toLowerCase(), `understanding code names ${vendor}`).not.toContain(vendor);
    }
  });

  it("UNDERSTANDING IS NOT A ONE-VENDOR FEATURE — every provider may declare it", () => {
    // The audit finding: `propose_conversation_intent` was listed in gemini's
    // capabilities ALONE, so the chain excluded every other provider before
    // health, egress or cost were consulted. A vendor-neutral router with one
    // vendor written into it is not vendor-neutral.
    const candidates = orderedCandidatesFor("propose_conversation_intent").map((p) => p.id);
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates).toContain("local");
    // Cost order holds: the free local runtime is considered before any paid
    // cloud, which is what makes the FREE budget reachable at all.
    expect(candidates[0]).toBe("local");
  });

  it("declaring the capability CONNECTS nothing — the grant is still owner-scoped", () => {
    // Capability is not permission. A cloud provider still needs a key AND an
    // egress grant; the grant table names exactly one provider, by owner act.
    expect(AI_EGRESS_GRANTS).toHaveLength(1);
    expect(AI_EGRESS_GRANTS[0].tasks).toEqual(["propose_conversation_intent"]);
    const cloudWithoutGrant = AI_PROVIDER_PROFILES.filter(
      (p) => p.locality === "cloud" && p.id !== AI_EGRESS_GRANTS[0].provider,
    );
    expect(cloudWithoutGrant.length).toBeGreaterThan(0);
    for (const p of cloudWithoutGrant) {
      expect(p.requiresKey, `${p.id} must still require a key`).toBe(true);
    }
  });
});

describe("the deterministic fast path is unchanged", () => {
  it("the model is asked ONLY for a message the deterministic layer could not read", () => {
    const code = codeOf(CHAT);
    const propose = code.indexOf("proposeUnderstandingAction(");
    const gate = code.indexOf('if (intent !== "unknown") {');
    expect(gate).toBeGreaterThan(-1);
    expect(propose).toBeGreaterThan(gate);
    // A known command returns before the call — no model spend.
    const between = code.slice(gate, propose);
    expect(between).toContain("dispatchIntent(intent, handlers, withTyping, fallback)");
    expect(between).toContain("return;");
  });

  it("the registry still gates what may EXECUTE", () => {
    // The success condition: the registry remains the operation catalogue.
    expect(Object.keys(INTENT_REGISTRY).length).toBeGreaterThan(60);
  });
});
