/**
 * Country Readiness agent — registry entry (Internal LLM Agents v1, PR3 proof).
 *
 * Answers "what is missing for a person/company to start work in country X" —
 * but ONLY from country-readiness SOURCE records. Output is INVALID without
 * evidence_refs (requireEvidence). Never a legal guarantee, never "fully legal".
 */
import { z } from "zod";
import { aiEnvelopeSchema, AI_CONFIDENCE } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const countryReadinessInputSchema = z
  .object({
    country: z.string().min(2).max(8),
    role: z.string().max(160).optional(),
    sourceRecords: z
      .array(
        z
          .object({
            source: z.string().min(1).max(120),
            ref: z.string().min(1).max(200),
            statement: z.string().min(1).max(2000),
          })
          .strict(),
      )
      .max(100),
    workerDocumentStatus: z.array(z.string().max(200)).max(50).optional(),
    companyHiringModel: z.string().max(160).optional(),
  })
  .strict();

const countryReadinessData = z
  .object({
    missing_items: z.array(z.string().min(1).max(300)).max(40),
    likely_required_items: z.array(z.string().min(1).max(300)).max(40),
    needs_legal_review: z.boolean(),
    risk_level: z.enum(AI_CONFIDENCE),
    explanation_worker: z.string().max(2000).nullable(),
    explanation_company: z.string().max(2000).nullable(),
  })
  .strict();

export const countryReadinessOutputSchema = aiEnvelopeSchema(
  "country_readiness",
  countryReadinessData,
  { requireEvidence: true }, // no unsourced country answer — ever
);

export const countryReadinessEntry: PromptRegistryEntry = {
  agent: "country_readiness",
  version: "1.0.0",
  title: "Country Readiness Agent",
  system: [
    "You explain what is likely missing for a worker or company to start work in",
    "a specific country, using ONLY the provided country-readiness SOURCE records.",
    "You MUST cite a source in evidence_refs for every readiness claim — never",
    "answer from general knowledge or unsourced web text. You never write a legal",
    "guarantee, never say 'fully legal' or 'guaranteed to work', and never change",
    "an official source's status. Use 'likely required' / 'needs verification' /",
    "'not legal advice'. Return ONLY the JSON envelope with non-empty evidence_refs.",
  ].join(" "),
  inputSchema: countryReadinessInputSchema,
  outputSchema: countryReadinessOutputSchema,
  safetyRules: [
    "Never answer without at least one evidence_ref citing a source record.",
    "Never produce a legal guarantee or 'fully legal' statement.",
    "Never change or assert an official requirement status.",
    "Frame everything as a readiness checklist; flag needs_legal_review.",
  ],
  allowedEvidenceSources: ["country_source", "worker_documents", "company_readiness"],
  blockedClaims: ["fully legal", "legal guarantee", "guaranteed", "verified"],
  lastUpdated: "2026-06-14",
};
