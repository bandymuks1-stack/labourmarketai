/**
 * Admin Risk / Control agent — registry entry (Internal LLM Agents v1, PR9).
 *
 * Builds a prioritized review queue of risky/incomplete/unverified cases for an
 * admin. NEVER auto-rejects or bans anyone, NEVER makes a discriminatory or
 * legal conclusion — every item is a suggested admin ACTION the human decides.
 */
import { z } from "zod";
import { aiEnvelopeSchema, AI_CONFIDENCE } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const adminRiskInputSchema = z
  .object({
    workersMissingDocs: z.array(z.string().max(200)).max(200).optional(),
    expiringDocs: z.array(z.string().max(200)).max(200).optional(),
    bookings: z.array(z.string().max(200)).max(200).optional(),
    companyReadiness: z.array(z.string().max(200)).max(100).optional(),
    countryRulesNeedingReview: z.array(z.string().max(200)).max(100).optional(),
    billingState: z.array(z.string().max(200)).max(50).optional(),
    suspiciousPatterns: z.array(z.string().max(300)).max(100).optional(),
  })
  .strict();

const adminRiskItem = z
  .object({
    item_ref: z.string().min(1).max(200),
    risk_reason: z.string().min(1).max(400),
    suggested_admin_action: z.string().min(1).max(400),
    severity: z.enum(AI_CONFIDENCE),
  })
  .strict();

const adminRiskData = z
  .object({
    queue: z.array(adminRiskItem).max(100),
  })
  .strict();

export const adminRiskOutputSchema = aiEnvelopeSchema("admin_risk", adminRiskData);

export const adminRiskEntry: PromptRegistryEntry = {
  agent: "admin_risk",
  version: "1.0.0",
  title: "Admin Risk / Control Agent",
  system: [
    "You build a prioritized review queue for an admin: risky, incomplete, or",
    "unverified cases, each with a risk reason, a SUGGESTED admin action, and a",
    "severity (low/medium/high). You NEVER auto-reject or ban anyone, NEVER make",
    "a discriminatory decision, and NEVER draw a legal conclusion. Every item is",
    "a suggestion the admin decides. Return ONLY the JSON envelope.",
  ].join(" "),
  inputSchema: adminRiskInputSchema,
  outputSchema: adminRiskOutputSchema,
  safetyRules: [
    "Never auto-reject, ban, or block anyone — suggest an action only.",
    "Never make a discriminatory decision or use protected attributes.",
    "Never draw a legal conclusion.",
    "Severity is advisory; the admin decides every case.",
  ],
  allowedEvidenceSources: ["worker_documents", "booking_requests", "company_readiness", "billing_subscriptions"],
  blockedClaims: ["auto-reject", "banned", "legal conclusion", "verified"],
  lastUpdated: "2026-06-14",
};
