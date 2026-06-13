/**
 * Worker Profile agent — registry entry (Internal LLM Agents v1, PR3 proof).
 *
 * Suggests a structured DRAFT profile from a worker's own free text + summaries.
 * NEVER verifies a skill, NEVER invents experience, NEVER writes "verified".
 * Output is a suggestion the worker accepts / edits / rejects.
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const workerProfileInputSchema = z
  .object({
    bio: z.string().max(8000).optional(),
    workJournalSummaries: z.array(z.string().max(2000)).max(50).optional(),
    selectedCountries: z.array(z.string().max(8)).max(20).optional(),
    languagePreferences: z.array(z.string().max(8)).max(20).optional(),
    existingSkills: z.array(z.string().max(120)).max(100).optional(),
    existingDocumentsSummary: z.array(z.string().max(200)).max(50).optional(),
  })
  .strict();

const workerProfileData = z
  .object({
    suggested_headline: z.string().max(160).nullable(),
    /** Skill LABELS as self-declared CANDIDATES only — never verified. */
    suggested_skill_claims: z.array(z.string().min(1).max(120)).max(40),
    suggested_roles: z.array(z.string().min(1).max(120)).max(20),
    experience_categories: z.array(z.string().min(1).max(120)).max(20),
    missing_profile_fields: z.array(z.string().min(1).max(120)).max(30),
    country_readiness_questions: z.array(z.string().min(1).max(300)).max(20),
  })
  .strict();

export const workerProfileOutputSchema = aiEnvelopeSchema(
  "worker_profile",
  workerProfileData,
);

export const workerProfileEntry: PromptRegistryEntry = {
  agent: "worker_profile",
  version: "1.0.0",
  title: "Worker Profile Agent",
  system: [
    "You help structure a worker's OWN words into a DRAFT profile suggestion.",
    "You SUGGEST only. You never verify, never invent experience the worker did",
    "not describe, and never write or imply 'verified'. Every skill you surface",
    "is a self-declared CANDIDATE the worker must confirm. Surface missing fields",
    "and country-readiness questions honestly. Return ONLY the JSON envelope:",
    "suggestion:true, confidence, evidence_refs (cite the input you used),",
    "missing_information, needs_human_review, blocked_claims, data.",
  ].join(" "),
  inputSchema: workerProfileInputSchema,
  outputSchema: workerProfileOutputSchema,
  safetyRules: [
    "Never mark a skill verified or raise any trust level.",
    "Never invent experience, employers, dates, or certifications.",
    "Every suggested skill is a self-declared candidate, pending worker confirm.",
    "The worker accepts / edits / rejects; nothing is persisted by the agent.",
  ],
  allowedEvidenceSources: [
    "worker_bio",
    "work_journal",
    "profile_skill_claims",
    "worker_documents_summary",
  ],
  blockedClaims: ["verified", "confirmed", "guaranteed", "score"],
  lastUpdated: "2026-06-14",
};
