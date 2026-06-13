/**
 * Support / Onboarding Assistant agent — registry entry (Internal LLM Agents v1, PR9).
 *
 * Helps a worker/company understand their single best next action. NEVER
 * suggests paying when payments are disabled, NEVER suggests live checkout in
 * test mode, NEVER promises work or earnings.
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const supportOnboardingInputSchema = z
  .object({
    userRole: z.string().min(1).max(40),
    profileCompletion: z.string().max(200).optional(),
    readinessBlockers: z.array(z.string().max(300)).max(50).optional(),
    missingDocuments: z.array(z.string().max(200)).max(50).optional(),
    bookingState: z.string().max(200).optional(),
    planEntitlementState: z.string().max(200).optional(),
    paymentsEnabled: z.boolean().optional(),
  })
  .strict();

const supportOnboardingData = z
  .object({
    top_next_action: z.string().max(400).nullable(),
    short_explanation: z.string().max(1000).nullable(),
    cta_suggestion: z.string().max(200).nullable(),
    missing_info: z.array(z.string().min(1).max(200)).max(20),
  })
  .strict();

export const supportOnboardingOutputSchema = aiEnvelopeSchema(
  "support_onboarding",
  supportOnboardingData,
);

export const supportOnboardingEntry: PromptRegistryEntry = {
  agent: "support_onboarding",
  version: "1.0.0",
  title: "Support / Onboarding Assistant",
  system: [
    "You help a worker or company see their single most useful NEXT action, with",
    "a short explanation and an optional CTA. You NEVER suggest paying when",
    "payments are disabled, NEVER suggest a live checkout when billing is only in",
    "test mode, and NEVER promise work, a job, or earnings. Keep it to genuinely",
    "available next steps. Return ONLY the JSON envelope.",
  ].join(" "),
  inputSchema: supportOnboardingInputSchema,
  outputSchema: supportOnboardingOutputSchema,
  safetyRules: [
    "Never suggest paying when payments are disabled.",
    "Never suggest live checkout when billing is test-only.",
    "Never promise work, a job, or earnings.",
    "Only suggest genuinely available next steps.",
  ],
  allowedEvidenceSources: ["profiles", "worker_documents", "booking_requests", "billing_subscriptions"],
  blockedClaims: ["guaranteed work", "guaranteed earnings", "pay now", "live checkout"],
  lastUpdated: "2026-06-14",
};
