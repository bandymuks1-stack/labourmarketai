"use server";

import "server-only";

import { runAiAgent } from "@/lib/ai/run-agent-server";
import { CONVERSATION_INTENT_SENTENCE_MAX } from "@/lib/ai/registry/agents/conversation-intent";
import { rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

import { intentCatalogue } from "@/lib/conversation/intent-catalogue";
import { INTENT_REGISTRY, type RoutedIntent } from "@/lib/conversation/intent-registry";
import type { Understanding } from "@/lib/conversation/utterance-understanding";

/**
 * THE MODEL HALF OF UNDERSTANDING (owner approval 2026-09-05 "GEMINI
 * CONVERSATION NLU EGRESS"; contract widened by owner approval 2026-09-10).
 *
 * ── What changed, and why it had to ───────────────────────────────────────
 * v1 could answer only with an OPERATIONAL INTENT ID. `INTENT_REGISTRY`
 * therefore defined the limit of what a human was allowed to MEAN: a
 * company's name, a question, a correction all had to come back as either a
 * wrong operation or `unknown`. This returns the same typed `Understanding`
 * union the deterministic layer produces, so a message can be understood as a
 * NAME, a QUESTION or a CORRECTION without an operation being invented for it.
 *
 * ── What did NOT change ───────────────────────────────────────────────────
 * The agent key, the task type and the prompt-registry entry keep their names
 * — the owner's egress grant is scoped to `tasks: ["propose_conversation_intent"]`,
 * and renaming it would silently widen a data-protection decision.
 *
 * Nor does the model gain any authority. `intent` is still re-validated
 * against `INTENT_REGISTRY` here, and it is READ ONLY FOR `kind: "action"` —
 * a model cannot smuggle an operation in behind a `question`. Every write
 * still goes prepare → dispatcher (held roles, zod, one-time token) →
 * executor → RPC. A `reference` resolves against the caller's own authorized
 * context in the product, never here. Nothing in this module writes,
 * dispatches or reads canonical state.
 *
 * ── Vendor neutrality ─────────────────────────────────────────────────────
 * This calls `runAiAgent`, which routes by TASK through the cost-aware chain
 * (`lib/ai/runtime/task-routing.ts` → `provider-chain.ts`): free-local first,
 * then free-tier, then paid, with the privacy veto applied before health.
 * No provider is named here and none may be. Which model answers is a
 * configuration and grant decision, not a property of this contract.
 *
 * ── What leaves the platform ──────────────────────────────────────────────
 * The sentence, the locale, the coarse identity and the intent catalogue
 * (ids + hints). No profile id travels to the audit row either — the run is
 * attributed to the surface, not to the person.
 */

const RATE_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 } as const;
const AI_LOCALES = new Set(["en", "lt", "ru"]);

function isRoutedIntent(v: unknown): v is RoutedIntent {
  return (
    typeof v === "string" &&
    v !== "unknown" &&
    Object.prototype.hasOwnProperty.call(INTENT_REGISTRY, v)
  );
}

/** A short, bounded span the model copied out of the person's own sentence. */
function cleanReference(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().slice(0, 80);
  return trimmed.length > 0 ? trimmed : null;
}

export async function proposeUnderstandingAction(input: {
  sentence: string;
  locale: string;
  identity: "person" | "company";
}): Promise<Understanding> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unsupported", reason: "unauthenticated", source: "model" };

  const sentence = String(input.sentence ?? "")
    .trim()
    .slice(0, CONVERSATION_INTENT_SENTENCE_MAX);
  if (sentence.length < 2) return { kind: "unsupported", reason: "empty", source: "model" };

  // Bounded per person: a chat is not a batch API, and every run is a vendor
  // call under the owner's grant.
  const limited = rateLimit({
    name: "conversation_intent_proposal",
    key: user.id,
    limit: RATE_LIMIT.limit,
    windowMs: RATE_LIMIT.windowMs,
  });
  if (limited.limited) return { kind: "unsupported", reason: "rate_limited", source: "model" };

  const locale = AI_LOCALES.has(input.locale) ? (input.locale as "en" | "lt" | "ru") : "en";
  const identity = input.identity === "company" ? "company" : "person";

  try {
    const outcome = await runAiAgent(
      "conversation_intent",
      { sentence, locale, identity, intents: intentCatalogue() },
      {
        locale,
        // A LABEL for the audit row — never the sentence, never the person.
        inputSource: "conversation_sentence",
        maxOutputTokens: 200,
      },
    );
    if (outcome.status !== "suggestion") {
      return { kind: "unsupported", reason: "ai_unavailable", source: "model" };
    }
    const envelope = outcome.value as {
      confidence?: "low" | "medium" | "high";
      data?: { kind?: unknown; intent?: unknown; reference?: unknown };
    };
    const kind = envelope.data?.kind;
    const reference = cleanReference(envelope.data?.reference);

    switch (kind) {
      case "action": {
        // THE CONSTRAINT, unchanged: only an id the product already has.
        // Anything else — a new name, a typo, a merged id — is "not
        // understood", never a guess.
        const proposed = envelope.data?.intent;
        if (!isRoutedIntent(proposed)) {
          return { kind: "unsupported", reason: "not_understood", source: "model" };
        }
        // Low confidence on an ACTION is not an action. An operation is the
        // one kind where being wrong costs the person something.
        if (envelope.confidence !== "high" && envelope.confidence !== "medium") {
          return { kind: "unsupported", reason: "not_understood", source: "model" };
        }
        return { kind: "intent", intent: proposed, score: 0, source: "model" };
      }
      case "reference":
        // A name. It is resolved against the caller's own world by the
        // product — the model's only job was to notice it is a name.
        return {
          kind: "reference",
          text: reference ?? sentence,
          score: 0,
          suppressed: null,
          source: "model",
        };
      case "question":
        return { kind: "question", text: sentence, reference, source: "model" };
      case "clarification":
        return { kind: "clarification", text: sentence, source: "model" };
      default:
        return { kind: "unsupported", reason: "not_understood", source: "model" };
    }
  } catch {
    return { kind: "unsupported", reason: "ai_unavailable", source: "model" };
  }
}
