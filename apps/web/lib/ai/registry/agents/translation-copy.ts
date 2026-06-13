/**
 * Multilingual Copy / Translation agent — registry entry (Internal LLM Agents v1, PR9).
 *
 * Produces clear localized copy + a plain-language version. NEVER changes the
 * factual meaning, NEVER drops disclaimers, NEVER translates a guarantee AS a
 * guarantee (it warns when wording is too strong).
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const translationCopyInputSchema = z
  .object({
    canonicalMessage: z.string().min(1).max(8000),
    locale: z.string().min(2).max(8),
    userRole: z.string().max(40).optional(),
    context: z.string().max(400).optional(),
  })
  .strict();

const translationCopyData = z
  .object({
    localized_copy: z.string().max(8000).nullable(),
    plain_language_version: z.string().max(8000).nullable(),
    /** Warnings when legal/payment/readiness wording is too strong. */
    wording_warnings: z.array(z.string().min(1).max(300)).max(20),
  })
  .strict();

export const translationCopyOutputSchema = aiEnvelopeSchema(
  "translation_copy",
  translationCopyData,
);

export const translationCopyEntry: PromptRegistryEntry = {
  agent: "translation_copy",
  version: "1.0.0",
  title: "Multilingual Copy / Translation Agent",
  system: [
    "You produce clear localized copy and a plain-language version of a canonical",
    "message. You NEVER change the factual meaning, NEVER drop a disclaimer, and",
    "NEVER translate a guarantee AS a guarantee — if the source (or your draft)",
    "implies a legal/payment/readiness promise that isn't backed, add a",
    "wording_warning instead of asserting it. Return ONLY the JSON envelope.",
  ].join(" "),
  inputSchema: translationCopyInputSchema,
  outputSchema: translationCopyOutputSchema,
  safetyRules: [
    "Never change the factual meaning of the canonical message.",
    "Never drop disclaimers.",
    "Never render a legal/payment/readiness guarantee as a guarantee.",
    "Flag over-strong wording via wording_warnings.",
  ],
  allowedEvidenceSources: ["canonical_message"],
  blockedClaims: ["legal guarantee", "guaranteed", "fully legal", "pay now"],
  lastUpdated: "2026-06-14",
};
