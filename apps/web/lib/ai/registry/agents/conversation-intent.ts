/**
 * Conversation Intent agent — registry entry (owner approval 2026-09-05,
 * "GEMINI CONVERSATION NLU EGRESS").
 *
 * THE PROPOSER, NOT A ROUTER. The deterministic intent router
 * (`lib/conversation/intent-router.ts`) is the always-on floor and runs
 * first. This agent is asked ONLY about a sentence that router could not
 * read, and it may answer ONLY with an id from the catalogue it is handed —
 * the product's EXISTING conversation intents (`INTENT_REGISTRY`). The
 * server action that calls it re-validates the answer against that registry;
 * anything else becomes `unknown`. It never runs an action: the proposed id
 * goes to the SAME chat handler the deterministic path would have used, and
 * every write still passes authorization → dispatcher → executor → RPC.
 *
 * WHAT LEAVES THE PLATFORM. The sentence itself (unbounded human text —
 * `SENSITIVE_FREE_TEXT`), the locale, the coarse identity (person / company)
 * and the intent catalogue (ids + one-line hints, product vocabulary — no
 * data). No names, no rows, no ids of anything, no canonical facts. The task
 * policy (`propose_conversation_intent`) admits exactly those four fields.
 *
 * WHAT COMES BACK. One id (or `unknown`), up to two alternatives, and the
 * envelope's `missing_information` as short slugs of what the sentence
 * leaves open — NOT a question to show the user. The handler asks its own
 * question, in the product's own words, from real rows.
 */
import { z } from "zod";

import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const CONVERSATION_INTENT_SENTENCE_MAX = 500;
export const CONVERSATION_INTENT_CATALOGUE_MAX = 120;

const catalogueRowSchema = z
  .object({
    id: z.string().min(1).max(60),
    hint: z.string().min(1).max(200),
  })
  .strict();

/** `.strict()` is the enforcement: a caller that later tries to "just also
 *  pass the person's name" gets a schema failure, not a quiet widening. */
export const conversationIntentInputSchema = z
  .object({
    sentence: z.string().min(1).max(CONVERSATION_INTENT_SENTENCE_MAX),
    locale: z.enum(["en", "lt", "ru"]),
    identity: z.enum(["person", "company"]),
    intents: z.array(catalogueRowSchema).min(1).max(CONVERSATION_INTENT_CATALOGUE_MAX),
  })
  .strict();

const conversationIntentData = z
  .object({
    /** An id from the supplied catalogue, or the literal "unknown". */
    intent: z.string().min(1).max(60),
    /** Up to two other plausible catalogue ids, most likely first. */
    alternatives: z.array(z.string().min(1).max(60)).max(2),
  })
  .strict();

export const conversationIntentOutputSchema = aiEnvelopeSchema(
  "conversation_intent",
  conversationIntentData,
);

export const conversationIntentEntry: PromptRegistryEntry = {
  agent: "conversation_intent",
  version: "1.0.0",
  title: "Conversation Intent Proposer",
  system: [
    "You classify ONE sentence a signed-in user typed into a labour-market",
    "product's chat. You are given the sentence, its language, the user's",
    "coarse identity (`person` = a worker or student; `company` = an",
    "employer, an agency or an education institution) and a CATALOGUE of the",
    "product's existing intents as `{id, hint}` rows.",
    "",
    "Answer with `data.intent` = exactly ONE `id` copied verbatim from the",
    "catalogue, or the literal `unknown` when none fits. Never invent an id,",
    "never rename one, never combine two. `data.alternatives` may list up to",
    "two other catalogue ids that could also fit, most likely first.",
    "",
    "The sentence may be in any language; the catalogue hints are English.",
    "Prefer the intent whose hint describes the ACTION the user wants over",
    "one that merely shares a word. A `company` identity asking about",
    "people, projects, candidates or demand means their own company's; a",
    "`person` asking about work, documents, skills or a card means their own.",
    "",
    "`missing_information`: short lowercase slugs of what the intent needs",
    "but the sentence does not say (e.g. `project`, `person`, `date`,",
    "`country`) — only when relevant, never a question and never advice.",
    "",
    "Do not repeat, summarise, extract or guess anything about the person or",
    "any third party. Do not describe what the product should do. Return",
    "ONLY the JSON envelope.",
  ].join(" "),
  inputSchema: conversationIntentInputSchema,
  outputSchema: conversationIntentOutputSchema,
  safetyRules: [
    "Only an id from the supplied catalogue, or `unknown` — never a new one.",
    "Never repeat, extract or infer personal data from the sentence.",
    "Never answer the user's request itself — classification only.",
    "Never state that anything was done, saved or verified.",
  ],
  allowedEvidenceSources: ["conversation_sentence", "intent_catalogue"],
  blockedClaims: ["saved", "done", "verified", "confirmed", "guaranteed"],
  lastUpdated: "2026-09-05",
};
