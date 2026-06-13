/**
 * Matching Explanation agent — registry entry (Internal LLM Agents v1, PR7).
 *
 * Explains why a worker/team fits (or does not fit) a company need. NEVER hides
 * legal/doc blockers, NEVER says "ready to start" when readiness is incomplete,
 * NEVER leaks private documents, NEVER produces a score.
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const matchingExplanationInputSchema = z
  .object({
    workerSkills: z.array(z.string().max(120)).max(100),
    workEvidence: z.array(z.string().max(300)).max(100).optional(),
    availability: z.string().max(300).optional(),
    countryReadiness: z.array(z.string().max(300)).max(50).optional(),
    documentsSummary: z.array(z.string().max(200)).max(50).optional(),
    companyNeed: z.string().min(1).max(4000),
    bookingDates: z.string().max(120).optional(),
    accommodation: z.string().max(200).optional(),
    transport: z.string().max(200).optional(),
    language: z.string().max(160).optional(),
  })
  .strict();

const matchingExplanationData = z
  .object({
    fit_summary: z.string().max(2000).nullable(),
    strong_matches: z.array(z.string().min(1).max(300)).max(40),
    gaps: z.array(z.string().min(1).max(300)).max(40),
    blockers: z.array(z.string().min(1).max(300)).max(40),
    suggested_next_action: z.string().max(400).nullable(),
    explanation_company: z.string().max(2000).nullable(),
    explanation_worker: z.string().max(2000).nullable(),
  })
  .strict();

export const matchingExplanationOutputSchema = aiEnvelopeSchema(
  "matching_explanation",
  matchingExplanationData,
);

export const matchingExplanationEntry: PromptRegistryEntry = {
  agent: "matching_explanation",
  version: "1.0.0",
  title: "Matching Explanation Agent",
  system: [
    "You explain, in the viewer's language, why a worker/team may or may not fit a",
    "company need — strong matches, gaps, blockers, and a suggested next action.",
    "You NEVER hide a legal or document blocker, NEVER say 'ready to start' when",
    "readiness is incomplete, NEVER reveal private document contents, and NEVER",
    "produce a fit score or percentage. You never decide the match — that is a",
    "human decision in the workbench. Return ONLY the JSON envelope.",
  ].join(" "),
  inputSchema: matchingExplanationInputSchema,
  outputSchema: matchingExplanationOutputSchema,
  safetyRules: [
    "Never hide a legal or document blocker.",
    "Never say 'ready to start' when readiness is incomplete.",
    "Never reveal private document contents.",
    "Never produce a score/percentage; never decide the match.",
  ],
  allowedEvidenceSources: ["worker_skills", "journal_entries", "customer_requests", "worker_documents"],
  blockedClaims: ["ready to start", "match score", "guaranteed", "verified"],
  lastUpdated: "2026-06-14",
};
