/**
 * Work Journal Structuring agent — registry entry (Internal LLM Agents v1, PR5).
 *
 * Helps extract STRUCTURE from a worker's freeform journal text. NEVER asserts
 * the work was done well/correctly (no confirmation exists), NEVER derives facts
 * from photos (no OCR/image pipeline), NEVER creates invoice facts. Output is a
 * draft the worker/manager confirms.
 */
import { z } from "zod";
import { aiEnvelopeSchema } from "../../schemas/envelope";
import type { PromptRegistryEntry } from "../types";

export const workJournalInputSchema = z
  .object({
    rawText: z.string().min(1).max(8000),
    date: z.string().max(40).optional(),
    projectContext: z.string().max(400).optional(),
    workerRole: z.string().max(160).optional(),
    /** Photo METADATA only (filename/time) — never image contents. */
    photosMetadata: z.array(z.string().max(200)).max(50).optional(),
  })
  .strict();

const workJournalData = z
  .object({
    tasks_performed: z.array(z.string().min(1).max(300)).max(40),
    tools_materials: z.array(z.string().min(1).max(160)).max(40),
    possible_skills: z.array(z.string().min(1).max(120)).max(30),
    safety_notes: z.array(z.string().min(1).max(300)).max(20),
    evidence_summary: z.string().max(2000).nullable(),
    unclear_points: z.array(z.string().min(1).max(300)).max(20),
    suggested_followup_question: z.string().max(300).nullable(),
  })
  .strict();

export const workJournalOutputSchema = aiEnvelopeSchema("work_journal", workJournalData);

export const workJournalEntry: PromptRegistryEntry = {
  agent: "work_journal",
  version: "1.0.0",
  title: "Work Journal Structuring Agent",
  system: [
    "You extract structure from a worker's OWN freeform journal text: tasks,",
    "tools/materials, possible skills, safety notes, an evidence summary, unclear",
    "points, and ONE follow-up question. You never claim the work was done well or",
    "correctly — no confirmation exists. You never derive facts from photos (there",
    "is no image/OCR pipeline; photo metadata is context only). You never create",
    "invoice or payment facts. 'Possible skills' are candidates for the Skill",
    "Evidence agent, not confirmed skills. Return ONLY the JSON envelope.",
  ].join(" "),
  inputSchema: workJournalInputSchema,
  outputSchema: workJournalOutputSchema,
  safetyRules: [
    "Never assert the work was done well/correctly — no confirmation exists.",
    "Never derive facts from photos; photo metadata is context only.",
    "Never create invoice/payment facts.",
    "Possible skills are candidates, never confirmed; nothing is persisted.",
  ],
  allowedEvidenceSources: ["journal_entries", "journal_entry_photos_metadata"],
  blockedClaims: ["done well", "verified", "invoice", "confirmed"],
  lastUpdated: "2026-06-14",
};
