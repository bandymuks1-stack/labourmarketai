/**
 * Company Need agent — registry entry (Internal LLM Agents v1, PR6).
 *
 * Turns a company's freeform need into a normalized DRAFT worker request.
 * NEVER invents pay, NEVER claims the company is legally ready, NEVER
 * auto-publishes (missing critical fields → needs human review).
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const companyNeedInputSchema = z
  .object({
    companyFreeText: z.string().min(1).max(8000),
    country: z.string().max(8).optional(),
    city: z.string().max(120).optional(),
    startDate: z.string().max(60).optional(),
    duration: z.string().max(120).optional(),
    numberOfPeople: z.number().int().min(0).max(100000).optional(),
    languageRequirement: z.string().max(160).optional(),
    accommodation: z.string().max(200).optional(),
    transport: z.string().max(200).optional(),
    existingCompanyReadiness: z.array(z.string().max(200)).max(50).optional(),
  })
  .strict();

const companyNeedData = z
  .object({
    normalized_role: z.string().max(160).nullable(),
    required_skills: z.array(z.string().min(1).max(120)).max(40),
    required_documents: z.array(z.string().min(1).max(200)).max(40),
    country_readiness_blockers: z.array(z.string().min(1).max(300)).max(30),
    missing_fields: z.array(z.string().min(1).max(120)).max(30),
    risk_flags: z.array(z.string().min(1).max(300)).max(30),
    suggested_public_copy: z.string().max(4000).nullable(),
    internal_matching_criteria: z.array(z.string().min(1).max(300)).max(40),
  })
  .strict();

export const companyNeedOutputSchema = aiEnvelopeSchema("company_need", companyNeedData);

export const companyNeedEntry: PromptRegistryEntry = {
  agent: "company_need",
  version: "1.0.0",
  title: "Company Need Agent",
  system: [
    "You turn a company's freeform need into a normalized DRAFT worker request:",
    "role, required skills/documents, country-readiness blockers, missing fields,",
    "risk flags, suggested public-facing copy, and internal matching criteria.",
    "You NEVER invent a salary or pay rate, NEVER claim the company is legally",
    "ready to hire (readiness comes from records), and NEVER auto-publish — if",
    "critical fields are missing, set needs_human_review and list them. Return",
    "ONLY the JSON envelope.",
  ].join(" "),
  inputSchema: companyNeedInputSchema,
  outputSchema: companyNeedOutputSchema,
  safetyRules: [
    "Never invent pay rates or salaries.",
    "Never claim the company is legally ready to hire.",
    "Never auto-publish; missing critical fields → needs_human_review.",
    "Output is a draft the company reviews and confirms.",
  ],
  allowedEvidenceSources: ["company_free_text", "company_readiness", "customer_requests"],
  blockedClaims: ["legally ready", "guaranteed pay", "salary", "verified"],
  lastUpdated: "2026-06-14",
};
