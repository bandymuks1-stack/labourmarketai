/**
 * AI assist — runtime output SCHEMAS (structured, not prose).
 *
 * These zod schemas define the ONLY shape a future, owner-approved provider may
 * return. They are `strict` so a model can never smuggle a fabricated `total`,
 * `price`, `score`, `verified`, or any other record-like field into a
 * suggestion: unknown keys are rejected. `suggestion` is pinned to the literal
 * `true`. Numbers are deliberately absent from every result — AI produces
 * drafts and questions, never figures (the deterministic estimate engine owns
 * all numbers).
 *
 * Uses zod (already a dependency). NO LLM SDK, NO network. Pure validation.
 */
import { z } from "zod";

const localizedStringArray = z.array(z.string().min(1)).max(20);

export const demandDraftResultSchema = z
  .object({
    kind: z.literal("demand_draft"),
    suggestion: z.literal(true),
    draftDescription: z.string().max(4000).nullable(),
    clarifyingQuestions: localizedStringArray,
    notes: localizedStringArray,
  })
  .strict();

export const estimateClarifyResultSchema = z
  .object({
    kind: z.literal("estimate_clarify"),
    suggestion: z.literal(true),
    questions: localizedStringArray,
    // assumption PHRASINGS only — no numeric fields exist on this schema, so a
    // model can never return a total / price / figure through estimate-clarify.
    assumptionNotes: localizedStringArray,
  })
  .strict();

export const workerProfileDraftResultSchema = z
  .object({
    kind: z.literal("worker_profile_draft"),
    suggestion: z.literal(true),
    draftText: z.string().max(4000).nullable(),
    notes: localizedStringArray,
  })
  .strict();

export const aiSuggestionSchema = z.discriminatedUnion("kind", [
  demandDraftResultSchema,
  estimateClarifyResultSchema,
  workerProfileDraftResultSchema,
]);

export type ValidatedAiSuggestion = z.infer<typeof aiSuggestionSchema>;

/**
 * Validate a candidate AI output against the strict suggestion schema. Returns
 * the typed suggestion or `null` if it does not exactly match (e.g. it carried
 * a forbidden field like `total`/`verified`, or `suggestion !== true`). A real
 * provider MUST route its model output through this before anything is shown.
 */
export function parseAiSuggestion(value: unknown): ValidatedAiSuggestion | null {
  const r = aiSuggestionSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** Field names that must NEVER appear on an AI suggestion (record-like data).
 *  Exposed for the boundary guard to assert the schemas reject them. */
export const FORBIDDEN_AI_OUTPUT_FIELDS = [
  "total",
  "estimatedTotal",
  "price",
  "rate",
  "score",
  "ovr",
  "verified",
  "confirmed",
  "match",
  "matched",
] as const;
