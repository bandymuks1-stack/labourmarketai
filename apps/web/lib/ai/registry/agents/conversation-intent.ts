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

/**
 * WHAT KIND OF THING THE MESSAGE IS (owner approval 2026-09-10, "understanding
 * contract widening").
 *
 * v1 could answer only with an operational intent id, so `INTENT_REGISTRY`
 * defined the limit of what a human was ALLOWED TO MEAN. Everything that was
 * not already an operation — a company's name, a question, a correction —
 * had to come back as either a wrong operation or `unknown`.
 *
 * These five kinds are the same conceptual classes the deterministic layer
 * already proves (`lib/conversation/utterance-understanding.ts`), so both
 * producers normalise onto ONE union. This is NOT a second registry: the only
 * NAMED things here are the five kinds, and `intent` still has to be an id
 * the product already owns.
 */
export const UNDERSTANDING_KINDS = [
  /** The person is asking for something the product already does. */
  "action",
  /** A name — an organisation, a person, a place. NOT an instruction. */
  "reference",
  /** A question about the world or about their own state. */
  "question",
  /** Understood as a message, but not yet as a request — ask. */
  "clarification",
  /** Understood as none of the above. Honest, and never an empty result. */
  "unsupported",
] as const;
export type UnderstandingKind = (typeof UNDERSTANDING_KINDS)[number];

const conversationIntentData = z
  .object({
    /** What KIND of thing was said — the widening. */
    kind: z.enum(UNDERSTANDING_KINDS),
    /**
     * An id from the supplied catalogue. Meaningful ONLY for `action`; the
     * server drops it for every other kind, so a model cannot smuggle an
     * operation in behind a `question`.
     */
    intent: z.string().min(1).max(60).optional(),
    /** Up to two other plausible catalogue ids, most likely first. */
    alternatives: z.array(z.string().min(1).max(60)).max(2).optional(),
    /**
     * For `reference` and `question`: the NAME the person used, copied
     * verbatim out of their own sentence. The model does not resolve it, look
     * it up, or say anything about it — resolution happens in the product,
     * against the caller's own authorized context.
     */
    reference: z.string().min(1).max(80).optional(),
  })
  .strict();

export const conversationIntentOutputSchema = aiEnvelopeSchema(
  "conversation_intent",
  conversationIntentData,
);

export const conversationIntentEntry: PromptRegistryEntry = {
  agent: "conversation_intent",
  version: "2.0.0",
  title: "Conversation Understanding Proposer",
  system: [
    "You read ONE message a signed-in user typed into a labour-market",
    "product's chat and say WHAT KIND OF THING IT IS. You are given the",
    "message, its language, the user's coarse identity (`person` = a worker",
    "or student; `company` = an employer, an agency or an education",
    "institution) and a CATALOGUE of the product's existing actions as",
    "`{id, hint}` rows.",
    "",
    "Set `data.kind` to exactly one of:",
    "`action` — they are asking for something the catalogue already does.",
    "`reference` — the message is a NAME (a company, a person, a place) and",
    "not an instruction. A name is never an action, however much one of its",
    "words resembles a catalogue hint.",
    "`question` — they are asking about something, rather than asking for it",
    "to be done. Questions are legitimate answers; do NOT force a question",
    "into an `action` just because a catalogue id sounds related.",
    "`clarification` — a real message you cannot yet turn into a request:",
    "a correction ('no, that is not my CV', 'I meant the company', 'not 8,",
    "12 people'), a fragment, or something genuinely ambiguous.",
    "`unsupported` — none of the above.",
    "",
    "Set `data.intent` ONLY when `kind` is `action`: exactly ONE `id` copied",
    "verbatim from the catalogue. Never invent an id, never rename one,",
    "never combine two. `data.alternatives` may list up to two other",
    "catalogue ids that could also fit, most likely first.",
    "",
    "Set `data.reference` when `kind` is `reference` or `question` AND the",
    "message names something: copy that name verbatim out of the message.",
    "Do not resolve it, look it up, expand it, translate it, or say anything",
    "about what it is — the product does that against the user's own data.",
    "",
    "The message may be in any language; the catalogue hints are English.",
    "For an `action`, prefer the id whose hint describes what the user wants",
    "over one that merely shares a word. A `company` identity asking about",
    "people, projects, candidates or demand means their own company's; a",
    "`person` asking about work, documents, skills or a card means their own.",
    "",
    "`missing_information`: short lowercase slugs of what is needed but not",
    "said (e.g. `project`, `person`, `date`, `country`) — only when",
    "relevant, never a question and never advice.",
    "",
    "Do not repeat, summarise, extract or guess anything about the person or",
    "any third party. Do not answer the question. Do not describe what the",
    "product should do. Return ONLY the JSON envelope.",
  ].join(" "),
  inputSchema: conversationIntentInputSchema,
  outputSchema: conversationIntentOutputSchema,
  safetyRules: [
    "Only an id from the supplied catalogue — never a new one, and only for `action`.",
    "A name is a `reference`, never an operation inferred from one of its words.",
    "A question is a `question` — never turned into a write because an action sounds related.",
    "Never resolve, look up or describe a `reference` — copy it verbatim and stop.",
    "Never repeat, extract or infer personal data from the sentence.",
    "Never answer the user's request itself — classification only.",
    "Never state that anything was done, saved or verified.",
  ],
  allowedEvidenceSources: ["conversation_sentence", "intent_catalogue"],
  blockedClaims: ["saved", "done", "verified", "confirmed", "guaranteed"],
  lastUpdated: "2026-09-05",
};
