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
    // 2026-09-17 (RED-2): two rows, both Gemini, both task-scoped.
    expect(AI_EGRESS_GRANTS).toHaveLength(2);
    expect(AI_EGRESS_GRANTS[0].tasks).toEqual(["propose_conversation_intent"]);
    expect(AI_EGRESS_GRANTS[1].tasks).toEqual(["translate_message"]);
    const granted = new Set(AI_EGRESS_GRANTS.map((g) => g.provider));
    const cloudWithoutGrant = AI_PROVIDER_PROFILES.filter(
      (p) => p.locality === "cloud" && !granted.has(p.id),
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

/**
 * A NOT-UNDERSTOOD ANSWER IS A QUESTION, NEVER THE GREETING ROW
 * (owner program 2026-09-23, P0 §10 / CASE 3, 4, 12).
 *
 * The owner asked an agency workspace to rename itself and read "Įkelti CV ·
 * Mano profilis · Ieškau darbo" — the greeting's starter row, attached to
 * every answer the product gave to a sentence it did not understand. The
 * contract now: ONE clarifying question tied to what was said, plus at most
 * ONE door — "what can I do here", derived from the active context when it is
 * tapped. This pins the SHAPE at all five not-understood sites, and the
 * negative control proves the check fails the moment `starterChips` returns
 * to any of them.
 */
function notUnderstoodViolations(src: string): string[] {
  const code = codeOf(src);
  const out: string[] = [];
  const between = (start: string, end: string): string => {
    const i = code.indexOf(start);
    const j = code.indexOf(end, i + 1);
    if (i < 0 || j < 0) {
      out.push(`anchor missing: ${start} … ${end}`);
      return "";
    }
    return code.slice(i, j);
  };

  // 1. The generic fallback (every `unknown` routed through dispatchIntent).
  const fallback = between("const fallback = () =>", "\n");
  if (/starterChips/.test(fallback)) out.push("fallback carries the greeting row");
  if (!/askToClarify\(t\("notUnderstood"\)\)/.test(fallback)) out.push("fallback is not the clarifying question");

  // 2. A bare name that resolves to nothing.
  const reference = between("const handleReference = useCallback", "const handleFileIntent");
  if (/starterChips/.test(reference)) out.push("handleReference carries the greeting row");
  if (!/askToClarify\(t\("refLooksLikeName"\)\)/.test(reference)) out.push("handleReference does not ask");

  // 3 + 4. A question with no answer, with and without a named subject.
  const question = between("const handleQuestion = useCallback", "const startProjects");
  if (/starterChips/.test(question)) out.push("handleQuestion carries the greeting row");
  if (!/askToClarify\(t\("questionUnansweredAbout"/.test(question)) out.push("questionUnansweredAbout does not ask");
  if (!/askToClarify\(t\("questionUnanswered"\)\)/.test(question)) out.push("questionUnanswered does not ask");

  // 5. The model's `clarification`.
  const proposer = code.slice(code.indexOf("proposeUnderstandingAction("));
  const clarification = proposer.slice(proposer.indexOf('case "clarification":'), proposer.indexOf("default:"));
  if (/starterChips/.test(clarification)) out.push("clarification carries the greeting row");
  if (!/askToClarify\(t\("understandClarify"\)\)/.test(clarification)) out.push("clarification does not ask");

  // The ONE door: exactly one chip, the capabilities answer.
  const door = between("const clarifyDoor", "const askToClarify");
  const chipIds = [...door.matchAll(/id: "([^"]+)"/g)].map((m) => m[1]);
  if (chipIds.join(",") !== "capabilities") out.push(`the door is not exactly [capabilities]: ${chipIds.join(",")}`);
  const ask = between("const askToClarify = useCallback", "\n  );");
  if (!/assistant\(line, clarifyDoor\)/.test(ask)) out.push("askToClarify does not attach the one door");
  return out;
}

describe("a not-understood answer is a clarifying question, never the greeting row", () => {
  it("all five not-understood sites ask ONE question and offer at most ONE context-derived door", () => {
    expect(notUnderstoodViolations(CHAT)).toEqual([]);
  });

  it("the door runs the capabilities answer, which is read from the ACTIVE context at tap time", () => {
    const code = codeOf(CHAT);
    const chip = code.slice(code.indexOf('case "capabilities":'), code.indexOf('case "agency-offers":'));
    expect(chip).toContain("startCapabilities()");
    expect(code).toContain("capabilities: () => startCapabilities()");
  });

  it("NEGATIVE CONTROL — the check fails when the greeting row returns to ANY site", () => {
    const mutations: Array<[string, string]> = [
      ['askToClarify(t("notUnderstood"))', "assistant(fallbackText, starterChips)"],
      ['askToClarify(t("refLooksLikeName"))', 'assistant(t("refLooksLikeName"), starterChips)'],
      ['askToClarify(t("questionUnanswered"))', 'assistant(t("questionUnanswered"), starterChips)'],
      ['askToClarify(t("understandClarify"))', 'assistant(t("understandClarify"), starterChips)'],
      ['[{ id: "capabilities", label: t("chipWhatCanIDo") }]', "starterChips"],
    ];
    for (const [from, to] of mutations) {
      expect(CHAT.includes(from), `mutation anchor present: ${from}`).toBe(true);
      const mutated = CHAT.replace(from, to);
      expect(notUnderstoodViolations(mutated).length, `undetected: ${to}`).toBeGreaterThan(0);
    }
  });

  it("the greeting keeps its starter row — only the NOT-UNDERSTOOD answers lost it", () => {
    expect(CHAT).toMatch(/chips: starterChips,?\s*\}\s*as ChatMessage/);
  });
});

/**
 * THE AI STATE IS SAID AS ITSELF (owner program 2026-09-23, P1). "Not switched
 * on", "allowance spent", "a vendor fault" and "too many requests" each have
 * their own line; none of them reaches the generic not-understood fallback.
 */
describe("the model half's own state is never rendered as 'I did not understand'", () => {
  it("the unsupported branch renders the honest AI-state line when there is one", () => {
    const code = codeOf(CHAT);
    const proposer = code.slice(code.indexOf("proposeUnderstandingAction("));
    const unsupported = proposer.slice(proposer.indexOf("default:"), proposer.indexOf(".catch("));
    expect(unsupported).toMatch(/aiStateMessageKey\(res\.reason\)/);
    expect(unsupported).toMatch(/if \(stateKey\) aiState\(stateKey\)/);
    // A thrown call is OUR fault — said as the assistant being unavailable.
    const caught = proposer.slice(proposer.indexOf(".catch("), proposer.indexOf(".catch(") + 300);
    expect(caught).toContain('aiState("aiTemporarilyUnavailable")');
    expect(caught).not.toContain("dispatchIntent(\"unknown\"");
  });

  it("the server action names the state instead of collapsing it", () => {
    const code = codeOf(ACTION);
    expect(code).toContain("unsupportedReasonForAiOutcome(outcome)");
    expect(code).not.toMatch(/reason: "ai_unavailable"/);
    const union = codeOf(UNION);
    for (const reason of ["ai_not_configured", "allowance_exhausted", "ai_temporarily_unavailable", "rate_limited"]) {
      expect(union, reason).toContain(`"${reason}"`);
    }
  });
});
