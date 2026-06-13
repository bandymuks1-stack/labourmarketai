/**
 * Booking Risk agent — registry entry (Internal LLM Agents v1, PR8).
 *
 * Surfaces risks before a booking request. NEVER bypasses the booking-conflict
 * logic (it advises only), NEVER permits a double booking, NEVER says "safe to
 * start" when readiness is missing.
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const bookingRiskInputSchema = z
  .object({
    workerAvailability: z.array(z.string().max(300)).max(50).optional(),
    bookingDates: z.string().min(1).max(120),
    country: z.string().max(8).optional(),
    documentsReadiness: z.array(z.string().max(200)).max(50).optional(),
    existingBookings: z.array(z.string().max(200)).max(100).optional(),
    companyReadiness: z.array(z.string().max(200)).max(50).optional(),
  })
  .strict();

export const BOOKING_START_READINESS = ["ready", "not_ready", "unknown"] as const;

const bookingRiskData = z
  .object({
    risk_flags: z.array(z.string().min(1).max(300)).max(40),
    conflict_warnings: z.array(z.string().min(1).max(300)).max(40),
    missing_documents: z.array(z.string().min(1).max(200)).max(40),
    start_readiness: z.enum(BOOKING_START_READINESS),
    suggested_next_action: z.string().max(400).nullable(),
  })
  .strict();

export const bookingRiskOutputSchema = aiEnvelopeSchema("booking_risk", bookingRiskData);

export const bookingRiskEntry: PromptRegistryEntry = {
  agent: "booking_risk",
  version: "1.0.0",
  title: "Booking Risk Agent",
  system: [
    "Before a booking request you surface risks: schedule conflicts, missing",
    "documents, and start readiness. You ADVISE only — you never bypass the",
    "booking-conflict logic and never permit a double booking; the booking RPCs",
    "enforce that. You never say 'safe to start' when readiness is missing; use",
    "start_readiness = ready/not_ready/unknown honestly. Return ONLY the JSON",
    "envelope.",
  ].join(" "),
  inputSchema: bookingRiskInputSchema,
  outputSchema: bookingRiskOutputSchema,
  safetyRules: [
    "Never bypass booking-conflict logic (advice only; RPCs enforce).",
    "Never permit or imply a double booking is fine.",
    "Never say 'safe to start' when readiness is missing.",
    "start_readiness reflects the data honestly, including 'unknown'.",
  ],
  allowedEvidenceSources: ["booking_requests", "worker_availability", "worker_documents", "company_readiness"],
  blockedClaims: ["safe to start", "guaranteed", "double booking ok", "verified"],
  lastUpdated: "2026-06-14",
};
