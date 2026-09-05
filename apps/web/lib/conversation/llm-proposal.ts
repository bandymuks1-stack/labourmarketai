"use server";

import "server-only";

import { runAiAgent } from "@/lib/ai/run-agent-server";
import { CONVERSATION_INTENT_SENTENCE_MAX } from "@/lib/ai/registry/agents/conversation-intent";
import { rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

import { intentCatalogue } from "@/lib/conversation/intent-catalogue";
import { INTENT_REGISTRY, type RoutedIntent } from "@/lib/conversation/intent-registry";

/**
 * The Gemini PROPOSER for a sentence the deterministic router could not read
 * (owner approval 2026-09-05, "GEMINI CONVERSATION NLU EGRESS"; grant row in
 * `lib/ai/runtime/data-egress.ts`, task `propose_conversation_intent`).
 *
 * Order of authority, unchanged: the deterministic router is the floor and
 * runs first in the chat; this is asked ONLY for `unknown`. It returns an
 * EXISTING intent id or nothing — the answer is re-validated here against
 * `INTENT_REGISTRY`, so the model cannot invent, rename or combine an id.
 * The chat then runs the SAME handler the deterministic path would have
 * used: the handler asks for what is missing from real rows, and every
 * write still goes prepare → dispatcher (held roles, zod, token) → executor
 * → RPC. Nothing here writes, dispatches, or reads canonical state.
 *
 * What leaves the platform: the sentence, the locale, the coarse identity
 * and the intent catalogue (ids + hints). No profile id travels to the audit
 * row either — the run is attributed to the surface, not to the person.
 */
export type ConversationIntentProposal =
  | {
      readonly kind: "proposal";
      readonly intent: RoutedIntent;
      readonly confidence: "low" | "medium" | "high";
      readonly alternatives: readonly RoutedIntent[];
      /** Short slugs of what the sentence leaves open — never shown verbatim. */
      readonly missing: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "unauthenticated" | "empty" | "rate_limited" | "ai_unavailable" | "not_understood";
    };

const RATE_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 } as const;
const AI_LOCALES = new Set(["en", "lt", "ru"]);

function isRoutedIntent(v: unknown): v is RoutedIntent {
  return typeof v === "string" && v !== "unknown" && Object.prototype.hasOwnProperty.call(INTENT_REGISTRY, v);
}

export async function proposeConversationIntentAction(input: {
  sentence: string;
  locale: string;
  identity: "person" | "company";
}): Promise<ConversationIntentProposal> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "unavailable", reason: "unauthenticated" };

  const sentence = String(input.sentence ?? "").trim().slice(0, CONVERSATION_INTENT_SENTENCE_MAX);
  if (sentence.length < 2) return { kind: "unavailable", reason: "empty" };

  // Bounded per person: a chat is not a batch API, and every run is a paid
  // vendor call under the owner's grant.
  const limited = rateLimit({
    name: "conversation_intent_proposal",
    key: user.id,
    limit: RATE_LIMIT.limit,
    windowMs: RATE_LIMIT.windowMs,
  });
  if (limited.limited) return { kind: "unavailable", reason: "rate_limited" };

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
    if (outcome.status !== "suggestion") return { kind: "unavailable", reason: "ai_unavailable" };
    const envelope = outcome.value as {
      confidence?: "low" | "medium" | "high";
      missing_information?: unknown;
      data?: { intent?: unknown; alternatives?: unknown };
    };
    const proposed = envelope.data?.intent;
    // THE CONSTRAINT: only an id the product already has. Anything else —
    // a new name, a typo, a merged id — is "not understood", never a guess.
    if (!isRoutedIntent(proposed)) return { kind: "unavailable", reason: "not_understood" };
    const alternatives = (Array.isArray(envelope.data?.alternatives) ? envelope.data!.alternatives : [])
      .filter(isRoutedIntent)
      .filter((id) => id !== proposed)
      .slice(0, 2);
    const missing = (Array.isArray(envelope.missing_information) ? envelope.missing_information : [])
      .filter((m): m is string => typeof m === "string")
      .map((m) => m.trim().toLowerCase().slice(0, 40))
      .filter((m) => m.length > 0)
      .slice(0, 3);
    const confidence = envelope.confidence === "high" || envelope.confidence === "medium" ? envelope.confidence : "low";
    return { kind: "proposal", intent: proposed, confidence, alternatives, missing };
  } catch {
    return { kind: "unavailable", reason: "ai_unavailable" };
  }
}
