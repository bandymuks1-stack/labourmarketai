/**
 * Document Assistant agent — registry entry (Internal LLM Agents v1, PR6).
 *
 * Helps a worker understand which documents are missing / expiring / need
 * verification, from document METADATA only. NEVER reads file contents (no
 * extraction pipeline), NEVER says a document is real/genuine, NEVER verifies.
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const documentAssistantInputSchema = z
  .object({
    documentChecklist: z.array(z.string().max(200)).max(60),
    uploadedDocumentsMetadata: z.array(z.string().max(200)).max(60).optional(),
    expiryDates: z.array(z.string().max(60)).max(60).optional(),
    verificationStatus: z.array(z.string().max(60)).max(60).optional(),
    countryTarget: z.string().max(8).optional(),
  })
  .strict();

const documentAssistantData = z
  .object({
    missing_documents: z.array(z.string().min(1).max(200)).max(60),
    expiring_soon: z.array(z.string().min(1).max(200)).max(60),
    needs_verification: z.array(z.string().min(1).max(200)).max(60),
    worker_explanation: z.string().max(2000).nullable(),
    admin_notes_suggestion: z.string().max(2000).nullable(),
  })
  .strict();

export const documentAssistantOutputSchema = aiEnvelopeSchema(
  "document_assistant",
  documentAssistantData,
);

export const documentAssistantEntry: PromptRegistryEntry = {
  agent: "document_assistant",
  version: "1.0.0",
  title: "Document Assistant Agent",
  system: [
    "You help a worker understand which documents are missing, expiring soon, or",
    "still need verification — using ONLY the document checklist + metadata",
    "(filenames, expiry dates, verification status). You NEVER read a document's",
    "contents (there is no extraction pipeline), NEVER say a document is real or",
    "genuine, and NEVER set or imply a verification status. Verification is an",
    "admin action recorded in worker_documents. Return ONLY the JSON envelope.",
  ].join(" "),
  inputSchema: documentAssistantInputSchema,
  outputSchema: documentAssistantOutputSchema,
  safetyRules: [
    "Never read or infer document file contents.",
    "Never assert a document is real/genuine.",
    "Never set or imply a verification status (admin-only, in worker_documents).",
    "Only describe missing / expiring / needs-verification from metadata.",
  ],
  allowedEvidenceSources: ["worker_documents", "document_checklist", "country_source"],
  blockedClaims: ["document is real", "genuine", "verified", "confirmed"],
  lastUpdated: "2026-06-14",
};
