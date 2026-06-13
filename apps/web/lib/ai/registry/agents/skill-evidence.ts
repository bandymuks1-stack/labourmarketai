/**
 * Skill Evidence agent — registry entry (Internal LLM Agents v1, PR5).
 *
 * From real work evidence, suggests which skills MIGHT be supported and at what
 * candidate evidence level. The level enum STRUCTURALLY excludes
 * "manager_or_client_confirmed" — the model literally cannot return a confirmed
 * status. NEVER overwrites a verification status, NEVER creates fake skills.
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const skillEvidenceInputSchema = z
  .object({
    journalEntries: z.array(z.string().max(2000)).max(100),
    existingSkillTaxonomy: z.array(z.string().max(120)).max(300).optional(),
    /** Existing manager/client confirmation labels (read-only context). */
    confirmations: z.array(z.string().max(200)).max(50).optional(),
    documentSummary: z.array(z.string().max(200)).max(50).optional(),
  })
  .strict();

/** Candidate levels ONLY — "manager_or_client_confirmed" is intentionally absent. */
export const SKILL_EVIDENCE_LEVELS = [
  "self_declared_candidate",
  "journal_supported_candidate",
  "needs_confirmation",
] as const;

const skillEvidenceItem = z
  .object({
    skill_key: z.string().min(1).max(120),
    suggested_evidence_level: z.enum(SKILL_EVIDENCE_LEVELS),
    why_suggested: z.string().min(1).max(500),
    missing_confirmation: z.string().max(300).nullable(),
  })
  .strict();

const skillEvidenceData = z
  .object({
    skills: z.array(skillEvidenceItem).max(40),
  })
  .strict();

export const skillEvidenceOutputSchema = aiEnvelopeSchema("skill_evidence", skillEvidenceData);

export const skillEvidenceEntry: PromptRegistryEntry = {
  agent: "skill_evidence",
  version: "1.0.0",
  title: "Skill Evidence Agent",
  system: [
    "From a worker's real work journal + existing evidence, you suggest which",
    "skills MIGHT be supported and at what CANDIDATE evidence level:",
    "self_declared_candidate, journal_supported_candidate, or needs_confirmation.",
    "You can NEVER set a confirmed status — confirmation is a human/manager action",
    "recorded elsewhere; it is not one of your allowed levels. You never overwrite",
    "a verification status and never invent skills not grounded in the evidence.",
    "State what confirmation is still missing. Return ONLY the JSON envelope.",
  ].join(" "),
  inputSchema: skillEvidenceInputSchema,
  outputSchema: skillEvidenceOutputSchema,
  safetyRules: [
    "Never set manager_or_client_confirmed — it is not an allowed level.",
    "Never overwrite or assert a verification status.",
    "Never invent a skill not grounded in the provided evidence.",
    "Always state the missing confirmation for each suggested skill.",
  ],
  allowedEvidenceSources: ["journal_entries", "journal_entry_confirmations", "worker_documents_summary"],
  blockedClaims: ["manager_or_client_confirmed", "verified", "confirmed"],
  lastUpdated: "2026-06-14",
};
